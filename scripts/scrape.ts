import "dotenv/config";
import * as cheerio from "cheerio";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { ConcertDataset, ConcertEvent, ProgramItem } from "../src/types";
import {
  parseShanghaiSymphonyCast,
  parseShanghaiSymphonyContent,
  parseShanghaiSymphonyPrices,
} from "./adapters/shanghai-symphony";

const sourceConfigSchema = z.object({
  city: z.string(),
  sources: z.array(
    z.discriminatedUnion("adapter", [
      z.object({
        id: z.string(),
        name: z.string(),
        adapter: z.literal("localhub-jsonld"),
        url: z.string().url(),
        venue: z.string(),
      }),
      z.object({
        id: z.string(),
        name: z.string(),
        adapter: z.literal("shsymphony-api"),
        url: z.string().url(),
        venue: z.string(),
        pageSize: z.number().int().positive().default(20),
      }),
    ]),
  ),
});

type SourceConfig = z.infer<typeof sourceConfigSchema>["sources"][number];

const useAi = process.argv.includes("--ai");
const root = process.cwd();
const sourceConfigPath = resolve(root, "sources/shanghai.sources.json");
const outputPath = resolve(root, "public/data/events.json");
const snapshotDir = resolve(root, "data/snapshots");

const classicalKeywords = [
  "交响",
  "管弦",
  "室内乐",
  "音乐会",
  "钢琴",
  "小提琴",
  "大提琴",
  "独奏",
  "协奏",
  "合唱",
  "歌剧",
  "芭蕾",
  "马勒",
  "贝多芬",
  "莫扎特",
  "布鲁克纳",
  "勃拉姆斯",
  "柴科夫斯基",
  "拉赫玛尼诺夫",
  "肖邦",
  "舒曼",
  "维也纳爱乐",
  "伦敦交响",
];

const composerMap = [
  ["贝多芬", "贝多芬"],
  ["Beethoven", "贝多芬"],
  ["莫扎特", "莫扎特"],
  ["Mozart", "莫扎特"],
  ["马勒", "马勒"],
  ["Mahler", "马勒"],
  ["柴科夫斯基", "柴科夫斯基"],
  ["Tchaikovsky", "柴科夫斯基"],
  ["拉赫玛尼诺夫", "拉赫玛尼诺夫"],
  ["Rachmaninoff", "拉赫玛尼诺夫"],
  ["勃拉姆斯", "勃拉姆斯"],
  ["Brahms", "勃拉姆斯"],
  ["布鲁克纳", "布鲁克纳"],
  ["Bruckner", "布鲁克纳"],
  ["肖邦", "肖邦"],
  ["Chopin", "肖邦"],
  ["舒曼", "舒曼"],
  ["Schumann", "舒曼"],
  ["梁祝", "何占豪/陈钢"],
  ["久石让", "久石让"],
];

async function main() {
  const startedAt = new Date().toISOString();
  const config = sourceConfigSchema.parse(JSON.parse(await readFile(sourceConfigPath, "utf8")));
  const dataset: ConcertDataset = {
    generatedAt: startedAt,
    city: config.city,
    events: [],
    sources: [],
    stats: { rawEvents: 0, normalizedEvents: 0, aiEnhancedEvents: 0, errors: [] },
  };

  await mkdir(snapshotDir, { recursive: true });

  for (const source of config.sources) {
    try {
      const { rawCount, events } =
        source.adapter === "shsymphony-api"
          ? await scrapeShanghaiSymphony(source, startedAt)
          : await scrapeLocalHub(source, startedAt);

      if (useAi && process.env.DEEPSEEK_API_KEY) {
        for (const event of events) {
          const enhanced = await enhanceWithDeepSeek(event).catch(() => null);
          if (enhanced) {
            event.program = enhanced.program;
            event.performers = Array.from(new Set([...event.performers, ...enhanced.performers]));
            event.composers = Array.from(new Set([...event.composers, ...enhanced.composers]));
            event.dataQuality = "ai-enhanced";
            dataset.stats.aiEnhancedEvents += 1;
          }
        }
      }

      dataset.events.push(...events);
      dataset.stats.rawEvents += rawCount;
      dataset.sources.push({
        id: source.id,
        name: source.name,
        url: source.url,
        ok: true,
        eventCount: events.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dataset.stats.errors.push(`${source.name}: ${message}`);
      dataset.sources.push({
        id: source.id,
        name: source.name,
        url: source.url,
        ok: false,
        eventCount: 0,
        message,
      });
    }
  }

  dataset.events = dedupeEvents(dataset.events).sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  dataset.stats.normalizedEvents = dataset.events.length;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");

  console.log(`Scraped ${dataset.events.length} events from ${dataset.sources.length} sources.`);
  if (dataset.stats.errors.length) {
    console.log(`Errors: ${dataset.stats.errors.join(" | ")}`);
  }
}

async function scrapeLocalHub(
  source: Extract<SourceConfig, { adapter: "localhub-jsonld" }>,
  scrapedAt: string,
) {
  const html = await fetchText(source.url);
  await writeFile(resolve(snapshotDir, `${source.id}.html`), html, "utf8");
  const rawEvents = extractLocalHubEvents(html);
  const events = rawEvents
    .filter((event) => isClassicalish(event.name ?? ""))
    .map((event) => normalizeLocalHubEvent(event, source, scrapedAt));

  return { rawCount: rawEvents.length, events };
}

async function scrapeShanghaiSymphony(
  source: Extract<SourceConfig, { adapter: "shsymphony-api" }>,
  scrapedAt: string,
) {
  const pageSize = source.pageSize;
  const firstPage = await postShanghaiSymphonyApi("/thvendor/symphony/program/homeProgramList.xhtml", {
    showSite: "pcList",
    pageNo: "1",
    pageSize: String(pageSize),
    dynamicValueList: "[]",
  });
  const rowTotal = Number(firstPage.data?.page?.rowTotal ?? firstPage.data?.resultList?.length ?? 0);
  const pageCount = Math.max(1, Math.ceil(rowTotal / pageSize));
  const listItems = [...(firstPage.data?.resultList ?? [])];

  for (let pageNo = 2; pageNo <= pageCount; pageNo += 1) {
    const page = await postShanghaiSymphonyApi("/thvendor/symphony/program/homeProgramList.xhtml", {
      showSite: "pcList",
      pageNo: String(pageNo),
      pageSize: String(pageSize),
      dynamicValueList: "[]",
    });
    listItems.push(...(page.data?.resultList ?? []));
  }

  await writeFile(resolve(snapshotDir, `${source.id}.list.json`), JSON.stringify(listItems, null, 2), "utf8");

  const events: ConcertEvent[] = [];
  for (const item of listItems) {
    const detail = await postShanghaiSymphonyApi("/thvendor/symphony/program/getById.xhtml", {
      programId: String(item.id),
      supportSeat: item.supportSeat || "Y",
      notCover: "Y",
    });
    if (!detail.success || !detail.data) continue;
    await writeFile(resolve(snapshotDir, `${source.id}.${item.id}.json`), JSON.stringify(detail.data, null, 2), "utf8");
    const prices = await postShanghaiSymphonyApi("/thvendor/symphony/program/getTicketPriceList.xhtml", {
      programId: String(item.id),
    });
    await writeFile(
      resolve(snapshotDir, `${source.id}.${item.id}.prices.json`),
      JSON.stringify(prices.data ?? [], null, 2),
      "utf8",
    );
    events.push(normalizeShanghaiSymphonyEvent(detail.data, prices.data, source, scrapedAt));
  }

  return { rawCount: listItems.length, events };
}

async function postShanghaiSymphonyApi(path: string, body: Record<string, string>) {
  const response = await fetch(`https://www.shsymphony.cn${path}`, {
    method: "POST",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 ClassicMusicDemo/0.1",
      accept: "application/json, text/plain, */*",
      "content-type": "application/x-www-form-urlencoded",
      cmpappkey: "shsymphonyPC",
      lang: "zh-CN",
      sourcepage: "/symphonypc/index.html#/zh-CN/pc/musicale",
    },
    body: new URLSearchParams(body),
  });
  if (!response.ok) {
    throw new Error(`Shanghai Symphony API ${path} HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 ClassicMusicDemo/0.1",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

function extractLocalHubEvents(html: string) {
  const $ = cheerio.load(html);
  const events: Array<Record<string, any>> = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text().trim();
    if (!raw) return;
    try {
      const json = JSON.parse(raw);
      const jsonEvents = Array.isArray(json.event) ? json.event : [];
      for (const event of jsonEvents) {
        if (event?.["@type"] === "MusicEvent" || event?.name) {
          events.push(event);
        }
      }
    } catch {
      // Ignore malformed metadata from upstream pages.
    }
  });

  return events;
}

function normalizeLocalHubEvent(
  raw: Record<string, any>,
  source: { id: string; name: string; url: string; venue: string },
  scrapedAt: string,
): ConcertEvent {
  const start = new Date(raw.startDate);
  const title = cleanText(raw.name ?? "未命名演出");
  const composers = inferComposers(title);
  const program = inferProgram(title, composers);
  const performers = inferPerformers(title);
  const tags = inferTags(title, composers);
  const venue = cleanText(raw.location?.name ?? source.venue);

  return {
    id: stableId(`${source.id}:${raw.url ?? title}:${raw.startDate}`),
    title,
    city: "上海",
    venue,
    startTime: start.toISOString(),
    endTime: raw.endDate ? new Date(raw.endDate).toISOString() : undefined,
    weekday: weekday(start),
    dateLabel: `${String(start.getMonth() + 1).padStart(2, "0")}/${String(start.getDate()).padStart(2, "0")}`,
    timeLabel: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
    price: raw.offers?.price ? `¥${raw.offers.price} 起` : undefined,
    status: raw.eventStatus?.includes("Cancelled") ? "cancelled" : "scheduled",
    ticketUrl: raw.url ?? raw.offers?.url,
    sourceName: source.name,
    sourceUrl: source.url,
    scrapedAt,
    ensemble: inferEnsemble(title),
    performers,
    composers,
    program,
    tags,
    dataQuality: program.length ? "scraped" : "needs-review",
  };
}

function normalizeShanghaiSymphonyEvent(
  raw: Record<string, any>,
  priceRows: unknown,
  source: Extract<SourceConfig, { adapter: "shsymphony-api" }>,
  scrapedAt: string,
): ConcertEvent {
  const title = cleanText(raw.fullCnName || raw.cnName || raw.briefName || "未命名演出");
  const start = parseChinaDate(raw.startTime);
  const end = raw.endTime ? parseChinaDate(raw.endTime) : undefined;
  const cast = parseShanghaiSymphonyCast(raw.castList || "");
  const content = parseShanghaiSymphonyContent(raw.programInfo || "", raw.showContent);
  const program = content.program;
  const pricing = parseShanghaiSymphonyPrices(raw, priceRows);
  const composerSet = new Set([...inferComposers(title), ...program.map((item) => item.composer).filter(Boolean)]);
  const composers = Array.from(composerSet) as string[];
  const performers = Array.from(new Set([...cast.performers, ...inferPerformers(title)]));
  const detailUrl = `https://shsymphony.cn/symphonypc/index.html#/zh-CN/pc/musicale-detail?id=${raw.id}&supportSeat=${
    raw.supportSeat || "Y"
  }`;

  return {
    id: `shsymphony_${raw.id}`,
    title,
    city: "上海",
    venue: cleanText(raw.stadiumName || source.venue),
    hall: raw.venueName ? cleanText(raw.venueName) : undefined,
    startTime: start.toISOString(),
    endTime: end?.toISOString(),
    weekday: weekday(start),
    dateLabel: `${String(start.getMonth() + 1).padStart(2, "0")}/${String(start.getDate()).padStart(2, "0")}`,
    timeLabel: `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
    price: pricing.price,
    priceTiers: pricing.priceTiers,
    description: content.description,
    status: raw.status === "Y" && raw.closed !== "Y" ? "scheduled" : "unknown",
    ticketUrl: detailUrl,
    sourceName: source.name,
    sourceUrl: detailUrl,
    scrapedAt,
    ensemble: inferEnsemble(title) || inferEnsemble(raw.castList || "") || "上海交响乐团",
    conductor: cast.conductor,
    performers,
    composers,
    program,
    tags: inferTags(title, composers),
    dataQuality: program.length ? "scraped" : "needs-review",
  };
}

function inferProgram(title: string, composers: string[]): ProgramItem[] {
  const program: ProgramItem[] = [];
  const quoted = Array.from(title.matchAll(/[《「“"]([^《》「」“”"]{2,48})[》」”"]/g)).map((match) => match[1]);
  for (const item of quoted) {
    program.push({
      title: cleanText(item),
      composer: composers[0],
      confidence: "title-inferred",
    });
  }

  if (/第九交响曲|九交|Symphony No\.?\s*9/i.test(title)) {
    program.push({ title: "第九交响曲", composer: composers[0] ?? "马勒", confidence: "title-inferred" });
  }
  if (/梁祝/.test(title) && !program.some((item) => item.title.includes("梁祝"))) {
    program.push({ title: "梁山伯与祝英台小提琴协奏曲", composer: "何占豪/陈钢", confidence: "title-inferred" });
  }
  if (/拉赫玛尼诺夫.*钢琴/.test(title)) {
    program.push({ title: "钢琴作品/协奏曲选段", composer: "拉赫玛尼诺夫", confidence: "title-inferred" });
  }

  return dedupeBy(program, (item) => `${item.composer ?? ""}:${item.title}`);
}

function inferComposers(title: string) {
  const composers = composerMap
    .filter(([needle]) => title.toLowerCase().includes(needle.toLowerCase()))
    .map(([, composer]) => composer);
  return Array.from(new Set(composers));
}

function inferPerformers(title: string) {
  const names = Array.from(title.matchAll(/([\u4e00-\u9fa5·]{2,8})[与和]/g)).map((match) => match[1]);
  const western = Array.from(title.matchAll(/([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,3})/g)).map((match) => match[1]);
  return Array.from(new Set([...names, ...western])).slice(0, 6);
}

function inferEnsemble(title: string) {
  const match = title.match(/([\u4e00-\u9fa5A-Za-z·\s]+(?:乐团|合唱团|管弦乐团|交响乐团|爱乐乐团))/);
  return match ? cleanText(match[1]) : undefined;
}

function inferTags(title: string, composers: string[]) {
  const tags = classicalKeywords.filter((keyword) => title.includes(keyword));
  return Array.from(new Set([...composers, ...tags])).slice(0, 8);
}

function isClassicalish(title: string) {
  return classicalKeywords.some((keyword) => title.includes(keyword));
}

async function enhanceWithDeepSeek(event: ConcertEvent) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;

  const prompt = `请从下面的上海音乐会标题中抽取古典音乐结构化信息。只返回 JSON，不要 Markdown。
Schema:
{"program":[{"composer":"作曲家或空字符串","title":"作品名","opus":"作品号或空字符串","movements":[{"number":"乐章编号或空字符串","title":"乐章名"}],"confidence":"ai"}],"performers":["人物"],"composers":["作曲家"]}
标题：${event.title}
场馆：${event.venue}`;

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) return null;
  const parsed = JSON.parse(text);

  return {
    program: Array.isArray(parsed.program)
      ? parsed.program.map((item: any) => ({
          composer: item.composer || undefined,
          title: item.title,
          opus: item.opus || undefined,
          movements: Array.isArray(item.movements)
            ? item.movements
                .filter((movement: any) => movement?.title)
                .map((movement: any) => ({
                  number: movement.number || undefined,
                  title: movement.title,
                }))
            : undefined,
          confidence: "ai" as const,
        }))
      : event.program,
    performers: Array.isArray(parsed.performers) ? parsed.performers.filter(Boolean) : [],
    composers: Array.isArray(parsed.composers) ? parsed.composers.filter(Boolean) : [],
  };
}

function dedupeEvents(events: ConcertEvent[]) {
  const seen = new Map<string, ConcertEvent>();
  for (const event of events) {
    const key = `${event.title}:${event.startTime}:${event.venue}`;
    if (!seen.has(key)) {
      seen.set(key, event);
    }
  }
  return Array.from(seen.values());
}

function dedupeBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseChinaDate(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return new Date(`${normalized}+08:00`);
}

function weekday(date: Date) {
  return `周${["日", "一", "二", "三", "四", "五", "六"][date.getDay()]}`;
}

function stableId(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return `evt_${Math.abs(hash).toString(36)}`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
