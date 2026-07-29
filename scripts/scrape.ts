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
import {
  parseOrientalArtCenterContent,
  parseOrientalArtCenterOcrText,
  parseOrientalArtCenterPrices,
} from "./adapters/shanghai-oriental-art-center";
import {
  parseShanghaiConcertHallContent,
  parseShanghaiConcertHallPrices,
} from "./adapters/shanghai-concert-hall";
import {
  extractSuzhouSymphonyDates,
  parseSuzhouSymphonyContent,
  parseSuzhouSymphonyVenue,
} from "./adapters/suzhou-symphony";
import { formatChinaDateLabels, parseChinaDate } from "./china-time";
import { prepareAndPersistDataset } from "./data-store";
import { createLocalTesseract, type LocalOcr } from "./ocr/local-tesseract";

const sourceConfigSchema = z.object({
  city: z.string(),
  sources: z.array(
    z.discriminatedUnion("adapter", [
      z.object({
        id: z.string(),
        name: z.string(),
        adapter: z.literal("localhub-jsonld"),
        url: z.string().url(),
        city: z.string().default("上海"),
        venue: z.string(),
      }),
      z.object({
        id: z.string(),
        name: z.string(),
        adapter: z.literal("shsymphony-api"),
        url: z.string().url(),
        city: z.string().default("上海"),
        venue: z.string(),
        pageSize: z.number().int().positive().default(20),
      }),
      z.object({
        id: z.string(),
        name: z.string(),
        adapter: z.literal("shoac-api"),
        url: z.string().url(),
        city: z.string().default("上海"),
        venue: z.string(),
        pageSize: z.number().int().positive().max(100).default(100),
      }),
      z.object({
        id: z.string(),
        name: z.string(),
        adapter: z.literal("shanghai-concert-hall-api"),
        url: z.string().url(),
        apiBase: z.string().url(),
        city: z.string().default("上海"),
        venue: z.string(),
      }),
      z.object({
        id: z.string(),
        name: z.string(),
        adapter: z.literal("suzhou-symphony-api"),
        url: z.string().url(),
        city: z.string().default("苏州"),
        venue: z.string(),
        pageSize: z.number().int().positive().max(100).default(100),
        sections: z.array(
          z.object({
            slug: z.string(),
            index: z.number().int().nonnegative(),
          }),
        ),
      }),
    ]),
  ),
});

type SourceConfig = z.infer<typeof sourceConfigSchema>["sources"][number];

const useAi = process.argv.includes("--ai");
const useOcr = process.argv.includes("--ocr");
const root = process.cwd();
const sourceConfigPath = resolve(root, "sources/shanghai.sources.json");
const outputPath = resolve(root, "public/data/events.json");
const databasePath = resolve(root, "data/classic-music.db");
const snapshotDir = resolve(root, "data/snapshots");
const ocrCacheDir = resolve(root, "data/ocr-cache");

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
  ["舒伯特", "舒伯特"],
  ["Schubert", "舒伯特"],
  ["拉威尔", "拉威尔"],
  ["Ravel", "拉威尔"],
  ["德彪西", "德彪西"],
  ["Debussy", "德彪西"],
  ["李斯特", "李斯特"],
  ["Liszt", "李斯特"],
  ["瓦格纳", "瓦格纳"],
  ["Wagner", "瓦格纳"],
  ["斯特拉文斯基", "斯特拉文斯基"],
  ["Stravinsky", "斯特拉文斯基"],
  ["肖斯塔科维奇", "肖斯塔科维奇"],
  ["Shostakovich", "肖斯塔科维奇"],
  ["德沃夏克", "德沃夏克"],
  ["Dvořák", "德沃夏克"],
  ["格里格", "格里格"],
  ["Grieg", "格里格"],
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
      const { rawCount, events } = await scrapeSource(source, startedAt);

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

  dataset.events = sortEvents(dedupeEvents(dataset.events));
  dataset.stats.normalizedEvents = dataset.events.length;

  await mkdir(dirname(outputPath), { recursive: true });
  const prepared = await prepareAndPersistDataset(dataset, outputPath, databasePath);

  console.log(`Scraped ${prepared.dataset.events.length} events from ${dataset.sources.length} sources.`);
  if (dataset.stats.errors.length) {
    console.log(`Errors: ${dataset.stats.errors.join(" | ")}`);
  }
}

function scrapeSource(source: SourceConfig, scrapedAt: string) {
  switch (source.adapter) {
    case "shsymphony-api":
      return scrapeShanghaiSymphony(source, scrapedAt);
    case "shoac-api":
      return scrapeOrientalArtCenter(source, scrapedAt);
    case "shanghai-concert-hall-api":
      return scrapeShanghaiConcertHall(source, scrapedAt);
    case "suzhou-symphony-api":
      return scrapeSuzhouSymphony(source, scrapedAt);
    case "localhub-jsonld":
      return scrapeLocalHub(source, scrapedAt);
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

async function scrapeShanghaiConcertHall(
  source: Extract<SourceConfig, { adapter: "shanghai-concert-hall-api" }>,
  scrapedAt: string,
) {
  const calendarResponse = await requestShanghaiConcertHallApi(source, "/api/project/month_all");
  const groups = Array.isArray(calendarResponse.data?.pcMonthProjectDTOS)
    ? calendarResponse.data.pcMonthProjectDTOS
    : [];
  const projectsById = new Map<string, Record<string, any>>();
  for (const group of groups) {
    for (const project of Array.isArray(group.projects) ? group.projects : []) {
      if (Number(project.category) === 0) projectsById.set(String(project.id), project);
    }
  }
  const listItems = Array.from(projectsById.values());
  await writeFile(resolve(snapshotDir, `${source.id}.list.json`), JSON.stringify(listItems, null, 2), "utf8");

  const events: ConcertEvent[] = [];
  for (const listItem of listItems) {
    const projectId = String(listItem.id);
    const detailResponse = await requestShanghaiConcertHallApi(source, `/api/project/${projectId}/detail`);
    const project = detailResponse.data?.project;
    if (!project) continue;
    await writeFile(
      resolve(snapshotDir, `${source.id}.${projectId}.json`),
      JSON.stringify(detailResponse.data, null, 2),
      "utf8",
    );

    const eventRows =
      Array.isArray(detailResponse.data.eventDTOS) && detailResponse.data.eventDTOS.length
        ? detailResponse.data.eventDTOS
        : [{ startTime: project.startTime, endTime: project.endTime, eventPrices: [] }];
    for (const eventRow of eventRows) {
      events.push(normalizeShanghaiConcertHallEvent(project, eventRow, source, scrapedAt));
    }
  }

  return { rawCount: listItems.length, events };
}

async function requestShanghaiConcertHallApi(
  source: Extract<SourceConfig, { adapter: "shanghai-concert-hall-api" }>,
  path: string,
) {
  const response = await fetch(`${source.apiBase}${path}`, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 ClassicMusicDemo/0.1",
      accept: "application/json, text/plain, */*",
      language: "zh-CN",
      referer: source.url,
    },
  });
  if (!response.ok) throw new Error(`Shanghai Concert Hall API ${path} HTTP ${response.status}`);
  const data = await response.json();
  if (data.code !== 20000) {
    throw new Error(`Shanghai Concert Hall API ${path}: ${data.msg ?? data.code ?? "failed"}`);
  }
  return data;
}

function normalizeShanghaiConcertHallEvent(
  project: Record<string, any>,
  eventRow: Record<string, any>,
  source: Extract<SourceConfig, { adapter: "shanghai-concert-hall-api" }>,
  scrapedAt: string,
): ConcertEvent {
  const title = cleanText(project.mainTitle || project.projectName || "未命名演出");
  const start = new Date(Number(eventRow.startTime || project.startTime));
  const labels = formatChinaDateLabels(start);
  const endTimestamp = Number(eventRow.endTime || project.endTime);
  const parsed = parseShanghaiConcertHallContent(project.detail || project.content || "");
  const pricing = parseShanghaiConcertHallPrices(project, eventRow);
  const titleComposers = inferComposers(title);
  const program = parsed.program.map((item) => ({
    ...item,
    composer: item.composer || (titleComposers.length === 1 ? titleComposers[0] : undefined),
  }));
  const composers = Array.from(
    new Set([
      ...titleComposers,
      ...program.map((item) => item.composer).filter(Boolean),
    ]),
  ) as string[];
  const performers = Array.from(
    new Set([...parsed.performers, ...inferShanghaiConcertHallTitlePerformers(title)]),
  );
  const detailUrl = `https://www.shanghaiconcerthall.com.cn/showDetails?id=${project.id}&activeType=0`;

  return {
    id: `shch_${project.id}_${start.getTime()}`,
    title,
    city: source.city,
    venue: source.venue,
    hall: cleanText(project.venueName || "") || undefined,
    startTime: start.toISOString(),
    endTime: Number.isFinite(endTimestamp) && endTimestamp > 0 ? new Date(endTimestamp).toISOString() : undefined,
    weekday: labels.weekday,
    dateLabel: labels.dateLabel,
    timeLabel: labels.timeLabel,
    price: pricing.price,
    priceTiers: pricing.priceTiers,
    description: parsed.description,
    status: project.enabled === 0 ? "unknown" : "scheduled",
    ticketUrl: detailUrl,
    sourceName: source.name,
    sourceUrl: detailUrl,
    scrapedAt,
    ensemble: inferEnsemble(title),
    conductor: parsed.conductor,
    performers,
    composers,
    program,
    tags: inferTags(title, composers),
    dataQuality: program.length ? "scraped" : "needs-review",
  };
}

async function scrapeSuzhouSymphony(
  source: Extract<SourceConfig, { adapter: "suzhou-symphony-api" }>,
  scrapedAt: string,
) {
  const itemsById = new Map<string, Record<string, any>>();

  for (const section of source.sections) {
    const firstPage = await requestSuzhouSymphonyPage(source, section, 0);
    const totalPages = Math.max(1, Number(firstPage.totalPages ?? 1));
    for (const item of Array.isArray(firstPage.content) ? firstPage.content : []) {
      itemsById.set(String(item.id), item);
    }
    for (let pageNum = 1; pageNum < totalPages; pageNum += 1) {
      const page = await requestSuzhouSymphonyPage(source, section, pageNum);
      for (const item of Array.isArray(page.content) ? page.content : []) {
        itemsById.set(String(item.id), item);
      }
    }
  }

  const listItems = Array.from(itemsById.values());
  await writeFile(resolve(snapshotDir, `${source.id}.list.json`), JSON.stringify(listItems, null, 2), "utf8");

  const events = listItems.flatMap((item) => {
    const fallbackTime = item.attributeMapMult?.time?.[0]?.value || item.attributeMapSingle?.time?.value;
    const dates = extractSuzhouSymphonyDates(item.content || "", fallbackTime);
    return dates.map((dateValue) => normalizeSuzhouSymphonyEvent(item, dateValue, source, scrapedAt));
  });

  return { rawCount: listItems.length, events };
}

async function requestSuzhouSymphonyPage(
  source: Extract<SourceConfig, { adapter: "suzhou-symphony-api" }>,
  section: { slug: string; index: number },
  pageNum: number,
) {
  const endpoint = `/api/getMusicData/${encodeURIComponent(section.slug)}/${section.index}?pageNum=${pageNum}&pageSize=${
    source.pageSize
  }`;
  const response = await fetch(new URL(endpoint, source.url), {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 ClassicMusicDemo/0.1",
      accept: "application/json, text/plain, */*",
      referer: source.url,
    },
  });
  if (!response.ok) throw new Error(`Suzhou Symphony API ${endpoint} HTTP ${response.status}`);
  return response.json();
}

function normalizeSuzhouSymphonyEvent(
  item: Record<string, any>,
  dateValue: string,
  source: Extract<SourceConfig, { adapter: "suzhou-symphony-api" }>,
  scrapedAt: string,
): ConcertEvent {
  const title = cleanText(item.title || "未命名演出").replace(/^[\u200b\u200c\u200d\ufeff]+/, "");
  const start = parseChinaDate(`${dateValue}:00`);
  const labels = formatChinaDateLabels(start);
  const parsed = parseSuzhouSymphonyContent(item.content || "");
  const address =
    item.attributeMapMult?.address?.[0]?.value || item.attributeMapSingle?.address?.value || source.venue;
  const place = parseSuzhouSymphonyVenue(address, item.content || "");
  const ticketUrl =
    item.attributeMapMult?.buyTickets?.[0]?.value || item.attributeMapSingle?.buyTickets?.value || undefined;
  const detailUrl = new URL(`/${item.sectionName || "2025-26-music-season"}/${item.id}.html`, source.url).href;
  const composers = Array.from(
    new Set([
      ...inferComposers(title),
      ...parsed.program.map((programItem) => programItem.composer).filter(Boolean),
    ]),
  ) as string[];

  return {
    id: `szsorch_${item.id}_${start.getTime()}`,
    title,
    city: source.city,
    venue: place.venue,
    hall: place.hall,
    startTime: start.toISOString(),
    weekday: labels.weekday,
    dateLabel: labels.dateLabel,
    timeLabel: labels.timeLabel,
    description: parsed.description,
    status: "scheduled",
    ticketUrl,
    sourceName: source.name,
    sourceUrl: detailUrl,
    scrapedAt,
    ensemble: parsed.ensemble || "苏州交响乐团",
    conductor: parsed.conductor,
    performers: parsed.performers,
    composers,
    program: parsed.program,
    tags: inferTags(title, composers),
    dataQuality: parsed.program.length ? "scraped" : "needs-review",
  };
}

async function scrapeOrientalArtCenter(
  source: Extract<SourceConfig, { adapter: "shoac-api" }>,
  scrapedAt: string,
) {
  const localOcr = useOcr ? await createLocalTesseract(ocrCacheDir) : undefined;
  try {
    return await scrapeOrientalArtCenterProjects(source, scrapedAt, localOcr);
  } finally {
    await localOcr?.terminate();
  }
}

async function scrapeOrientalArtCenterProjects(
  source: Extract<SourceConfig, { adapter: "shoac-api" }>,
  scrapedAt: string,
  localOcr?: LocalOcr,
) {
  const firstPage = await requestOrientalArtCenterApi("/good/theater/dongyi-products", {
    method: "POST",
    body: {
      page: 1,
      size: source.pageSize,
      calendar: false,
      timeSort: false,
      venueId: "",
    },
  });
  const total = Number(firstPage.data?.total ?? firstPage.data?.records?.length ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / source.pageSize));
  const listItems = [...(firstPage.data?.records ?? [])];

  for (let page = 2; page <= pageCount; page += 1) {
    const response = await requestOrientalArtCenterApi("/good/theater/dongyi-products", {
      method: "POST",
      body: {
        page,
        size: source.pageSize,
        calendar: false,
        timeSort: false,
        venueId: "",
      },
    });
    listItems.push(...(response.data?.records ?? []));
  }

  await writeFile(resolve(snapshotDir, `${source.id}.list.json`), JSON.stringify(listItems, null, 2), "utf8");

  const musicProjects = listItems.filter((item) => item.categoryName === "音乐会");
  const events: ConcertEvent[] = [];
  for (const item of musicProjects) {
    const projectId = String(item.projectId);
    const detailResponse = await requestOrientalArtCenterApi(`/good/project/detail/old/${projectId}`);
    const showsResponse = await requestOrientalArtCenterApi(`/good/shows/old/${projectId}`);
    if (!detailResponse.data || !Array.isArray(showsResponse.data?.showInfoDetailList)) continue;

    await writeFile(
      resolve(snapshotDir, `${source.id}.${projectId}.json`),
      JSON.stringify(detailResponse.data, null, 2),
      "utf8",
    );
    await writeFile(
      resolve(snapshotDir, `${source.id}.${projectId}.shows.json`),
      JSON.stringify(showsResponse.data, null, 2),
      "utf8",
    );

    const shows = showsResponse.data.showInfoDetailList as Array<Record<string, any>>;
    const html = detailResponse.data.projectDesp || detailResponse.data.showDesc || "";
    const textProgram = parseOrientalArtCenterContent(html).program;
    const ocrText =
      localOcr && !textProgram.length && shouldOcrOrientalArtCenterProject(projectId)
        ? await recognizeOrientalArtCenterImages(projectId, html, localOcr).catch((error) => {
            console.warn(`OCR failed for SHOAC ${projectId}: ${error instanceof Error ? error.message : error}`);
            return undefined;
          })
        : undefined;
    for (const show of shows) {
      events.push(
        normalizeOrientalArtCenterEvent(
          projectId,
          detailResponse.data,
          show,
          shows,
          source,
          scrapedAt,
          ocrText,
        ),
      );
    }
  }

  return { rawCount: listItems.length, events };
}

function shouldOcrOrientalArtCenterProject(projectId: string) {
  const configured = process.env.SHOAC_OCR_PROJECT_IDS
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return !configured?.length || configured.includes(projectId);
}

async function recognizeOrientalArtCenterImages(
  projectId: string,
  html: string,
  localOcr: LocalOcr,
) {
  const imageUrls = parseOrientalArtCenterContent(html).imageUrls;
  const maxImages = Math.max(1, Number(process.env.SHOAC_OCR_MAX_IMAGES || 8));
  const recognized: string[] = [];

  for (const url of imageUrls.slice(0, maxImages)) {
    console.log(`OCR SHOAC ${projectId}: ${recognized.length + 1}/${Math.min(imageUrls.length, maxImages)}`);
    const result = await localOcr.recognizeUrl(url);
    if (result.text) recognized.push(result.text);
    const combined = recognized.join("\n");
    if (parseOrientalArtCenterOcrText(combined).length >= 2) return combined;
  }

  return recognized.length ? recognized.join("\n") : undefined;
}

async function requestOrientalArtCenterApi(
  path: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
) {
  const response = await fetch(`https://www.shoac.com.cn/platform-backend${path}`, {
    method: options.method ?? "GET",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 ClassicMusicDemo/0.1",
      accept: "application/json, text/plain, */*",
      channel: "theatre_pc",
      location: "121.458563,31.250315",
      authorization: "",
      theater: "1323",
      "flagship-store": "true",
      referer: "https://www.shoac.com.cn/",
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Shanghai Oriental Art Center API ${path} HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.state !== "SUCCESS") {
    throw new Error(`Shanghai Oriental Art Center API ${path}: ${data.errors?.[0] ?? data.code ?? "failed"}`);
  }
  return data;
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
  source: { id: string; name: string; url: string; city: string; venue: string },
  scrapedAt: string,
): ConcertEvent {
  const start = new Date(raw.startDate);
  const labels = formatChinaDateLabels(start);
  const title = cleanText(raw.name ?? "未命名演出");
  const composers = inferComposers(title);
  const program = inferProgram(title, composers);
  const performers = inferPerformers(title);
  const tags = inferTags(title, composers);
  const venue = cleanText(raw.location?.name ?? source.venue);

  return {
    id: stableId(`${source.id}:${raw.url ?? title}:${raw.startDate}`),
    title,
    city: source.city,
    venue,
    startTime: start.toISOString(),
    endTime: raw.endDate ? new Date(raw.endDate).toISOString() : undefined,
    weekday: labels.weekday,
    dateLabel: labels.dateLabel,
    timeLabel: labels.timeLabel,
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
  const labels = formatChinaDateLabels(start);
  const end = raw.endTime ? parseChinaDate(raw.endTime) : undefined;
  const cast = parseShanghaiSymphonyCast(raw.castList || "");
  const content = parseShanghaiSymphonyContent(raw.programInfo || "", raw.showContent);
  const program = content.program;
  const pricing = parseShanghaiSymphonyPrices(raw, priceRows);
  const composerSet = new Set([
    ...inferComposers(title),
    ...content.composers,
    ...program.map((item) => item.composer).filter(Boolean),
  ]);
  const composers = Array.from(composerSet) as string[];
  const performers = Array.from(new Set([...cast.performers, ...inferPerformers(title)]));
  const detailUrl = `https://shsymphony.cn/symphonypc/index.html#/zh-CN/pc/musicale-detail?id=${raw.id}&supportSeat=${
    raw.supportSeat || "Y"
  }`;

  return {
    id: `shsymphony_${raw.id}`,
    title,
    city: source.city,
    venue: cleanText(raw.stadiumName || source.venue),
    hall: raw.venueName ? cleanText(raw.venueName) : undefined,
    startTime: start.toISOString(),
    endTime: end?.toISOString(),
    weekday: labels.weekday,
    dateLabel: labels.dateLabel,
    timeLabel: labels.timeLabel,
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

function normalizeOrientalArtCenterEvent(
  projectId: string,
  detail: Record<string, any>,
  show: Record<string, any>,
  allShows: Array<Record<string, any>>,
  source: Extract<SourceConfig, { adapter: "shoac-api" }>,
  scrapedAt: string,
  ocrText?: string,
): ConcertEvent {
  const title = cleanText(detail.productName || "未命名演出");
  const start = orientalArtCenterShowDate(show);
  const labels = formatChinaDateLabels(start);
  const parsed = parseOrientalArtCenterContent(detail.projectDesp || detail.showDesc || "", {
    showDate: start,
  });
  const ocrProgram = parsed.program.length || !ocrText
    ? []
    : parseOrientalArtCenterOcrText(ocrText, { showDate: start });
  const inferredComposers = inferComposers(title);
  const program = parsed.program.length
    ? parsed.program
    : ocrProgram.length
      ? ocrProgram
      : [];
  const composers = Array.from(
    new Set([...inferredComposers, ...program.map((item) => item.composer).filter(Boolean)]),
  ) as string[];
  const performers = parsed.performers;
  const pricing = parseOrientalArtCenterPrices(allShows, detail);
  const detailUrl = `https://www.shoac.com.cn/#/detail?projectId=${projectId}`;
  const showStatus = cleanText(show.showStatusName || "");

  return {
    id: `shoac_${projectId}_${show.showId ?? start.getTime()}`,
    title,
    city: source.city,
    venue: source.venue,
    hall: cleanText(show.venueName || detail.showPlaceName || "") || undefined,
    startTime: start.toISOString(),
    weekday: labels.weekday,
    dateLabel: labels.dateLabel,
    timeLabel: labels.timeLabel,
    price: pricing.price,
    priceTiers: pricing.priceTiers,
    description: parsed.description,
    status: /取消/.test(showStatus) ? "cancelled" : "scheduled",
    ticketUrl: detailUrl,
    sourceName: source.name,
    sourceUrl: detailUrl,
    scrapedAt,
    ensemble: parsed.ensemble || inferEnsemble(title),
    conductor: parsed.conductor,
    performers,
    composers,
    program,
    tags: inferTags(`${title} ${detail.productSubtypeName || ""}`, composers),
    dataQuality: parsed.program.length || ocrProgram.length ? "scraped" : "needs-review",
  };
}

function orientalArtCenterShowDate(show: Record<string, any>) {
  const timestamp = Number(show.happenTime);
  if (Number.isFinite(timestamp) && timestamp > 0) return new Date(timestamp);

  const match = String(show.showTime || "").match(
    /(\d{4})[./-](\d{1,2})[./-](\d{1,2}).*?(\d{1,2}):(\d{2})/,
  );
  if (!match) throw new Error(`Invalid Oriental Art Center show time: ${show.showTime || "missing"}`);
  return parseChinaDate(`${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:00`);
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

function inferShanghaiConcertHallTitlePerformers(title: string) {
  const subject = title.split("——").at(-1) || title;
  if (!/演绎/.test(subject)) return [];
  const match = subject.match(
    /^(.{2,36}?)[与和](.{2,36}?)(?=演绎|大提琴|钢琴|小提琴|吉他|音乐会|作品|主题)/,
  );
  if (!match) return [];
  return [match[1], match[2]]
    .map((name) => cleanText(name).replace(/^(?:经典室内乐|民族印象)[：:\s]*/, ""))
    .filter((name) => name.length >= 2 && name.length <= 36);
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

function sortEvents(events: ConcertEvent[]) {
  const now = Date.now();
  return events.sort((a, b) => {
    const aTime = new Date(a.startTime).getTime();
    const bTime = new Date(b.startTime).getTime();
    const aPast = aTime < now;
    const bPast = bTime < now;
    if (aPast !== bPast) return aPast ? 1 : -1;
    return aPast ? bTime - aTime : aTime - bTime;
  });
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
