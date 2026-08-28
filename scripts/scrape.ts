import "dotenv/config";
import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
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
  discoverSuzhouSymphonySeasonUrl,
  discoverSuzhouSymphonySections,
  extractSuzhouSymphonyDates,
  parseSuzhouSymphonyContent,
  parseSuzhouSymphonyVenue,
} from "./adapters/suzhou-symphony";
import {
  extractNcpaProgramEvidence,
  parseNcpaDetail,
  parseNcpaPriceTiers,
} from "./adapters/national-centre-performing-arts";
import { isProgramRoleLabel, stripPerformanceForceSuffix } from "./program-role-labels";
import { parseChinaNationalSymphonyDetail } from "./adapters/china-national-symphony";
import { parseChinaPhilharmonicDetail } from "./adapters/china-philharmonic";
import { parseShanghaiPhilharmonicDetail } from "./adapters/shanghai-philharmonic";
import {
  isShanghaiGrandTheatreClassical,
  parseShanghaiGrandTheatreDetail,
} from "./adapters/shanghai-grand-theatre";
import {
  isBeijingConcertHallClassical,
  parseBeijingConcertHallDetail,
} from "./adapters/beijing-concert-hall";
import {
  discoverGuangzhouSymphonySeasonUrls,
  discoverGuangzhouSymphonySupplementalUrls,
  parseGuangzhouSymphonyDetail,
} from "./adapters/guangzhou-symphony";
import {
  isXinghaiConcertHallClassical,
  parseXinghaiConcertHallDetail,
  parseXinghaiConcertHallProgramText,
} from "./adapters/xinghai-concert-hall";
import {
  parseShenzhenSymphonyDetail,
  parseShenzhenSymphonyList,
  parseShenzhenSymphonyProgramText,
} from "./adapters/shenzhen-symphony";
import {
  buildShenzhenConcertHallListUrl,
  discoverShenzhenConcertHallDetailUrls,
  isShenzhenConcertHallClassical,
  parseShenzhenConcertHallDetail,
  parseShenzhenConcertHallProgramText,
} from "./adapters/shenzhen-concert-hall";
import {
  isZhongshanMusicHallClassical,
  parseZhongshanMusicHallDetail,
  parseZhongshanMusicHallList,
  parseZhongshanMusicHallProgramText,
} from "./adapters/zhongshan-music-hall";
import {
  parseZhejiangSymphonyCalendar,
  parseZhejiangSymphonyProgram,
} from "./adapters/zhejiang-symphony";
import {
  isXianConcertHallClassical,
  parseXianConcertHallDetail,
  parseXianConcertHallProgramText,
} from "./adapters/xian-concert-hall";
import {
  getHarbinMaitixPriceTiers,
  parseHarbinMaitixDetail,
  parseHarbinMaitixSeedFile,
  type HarbinMaitixProject,
} from "./adapters/harbin-maitix";
import { formatChinaDateLabels, parseChinaDate } from "./china-time";
import { prepareAndPersistDataset } from "./data-store";
import { fetchWithRetry } from "./fetch-retry";
import { assertSourceCollectionHealthy } from "./source-health";
import { createLocalTesseract, type LocalOcr } from "./ocr/local-tesseract";
import { createHybridOcr } from "./ocr/hybrid-ocr";
import {
  evaluateOcrProgram,
  selectOcrProgramForDate,
  type OcrProgramExtraction,
} from "./ocr/program-extraction";
import { loadSjtuAiConfig } from "./ai/sjtu-client";
import {
  registerProgramEvidence,
  selectProgramReviewCandidates,
  verifyProgramWithAi,
} from "./ai/program-verifier";
import {
  extractGzdjyProgramLines,
  parseGzdjyProgramLine,
  parseGzdjyFirstShowTime,
  parseGzdjyListResponse,
  parseGzdjyPriceTiers,
  type GzdjyListRow,
} from "./adapters/guangzhou-grand-theatre";
import {
  extractPolytProgram,
  mapPolytTicketStatus,
  parsePolytRecommendList,
  parsePolytShowList,
  type PolytProduct,
} from "./adapters/poly-theatre";

const sourceConfigSchema = z.object({
  city: z.string(),
  sources: z.array(
    z.discriminatedUnion("adapter", [
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
      z.object({
        id: z.string(),
        name: z.string(),
        adapter: z.literal("ncpa-api"),
        url: z.string().url(),
        apiBase: z.string().url(),
        city: z.string().default("北京"),
        venue: z.string(),
        pageSize: z.number().int().positive().max(50).default(10),
      }),
      z.object({
        id: z.string(),
        name: z.string(),
        adapter: z.literal("china-national-symphony-html"),
        url: z.string().url(),
        city: z.string().default("北京"),
        venue: z.string(),
        maxPages: z.number().int().positive().max(50).default(12),
        seedUrls: z.array(z.string().url()).default([]),
      }),
      z.object({
        id: z.string(),
        name: z.string(),
        adapter: z.literal("china-philharmonic-html"),
        url: z.string().url(),
        city: z.string().default("北京"),
        venue: z.string(),
      }),
      z.object({
        id: z.string(),
        name: z.string(),
        adapter: z.literal("shanghai-philharmonic-html"),
        url: z.string().url(),
        city: z.string().default("上海"),
        venue: z.string(),
        maxPages: z.number().int().positive().max(30).default(10),
        seedUrls: z.array(z.string().url()).default([]),
      }),
      z.object({
        id: z.string(), name: z.string(), adapter: z.literal("shanghai-grand-theatre-api"),
        url: z.string().url(), city: z.string(), venue: z.string(), cmpAppKey: z.string(),
      }),
      z.object({
        id: z.string(), name: z.string(), adapter: z.literal("beijing-concert-hall-api"),
        url: z.string().url(), apiBase: z.string().url(), city: z.string(), venue: z.string(),
      }),
      z.object({
        id: z.string(), name: z.string(), adapter: z.literal("guangzhou-symphony-html"),
        url: z.string().url(), city: z.string(), venue: z.string(), seedUrls: z.array(z.string().url()).default([]),
        supplementalIndexUrls: z.array(z.string().url()).default([]),
      }),
      z.object({
        id: z.string(), name: z.string(), adapter: z.literal("xinghai-concert-hall-html"),
        url: z.string().url(), city: z.string(), venue: z.string(), seedUrls: z.array(z.string().url()).default([]),
      }),
      z.object({
        id: z.string(), name: z.string(), adapter: z.literal("shenzhen-symphony-html"),
        url: z.string().url(), city: z.string(), venue: z.string(), defaultTime: z.string().default("19:30"),
        supplementalIndexUrl: z.string().url().optional(), supplementalMaxPages: z.number().int().positive().max(20).default(4),
      }),
      z.object({
        id: z.string(), name: z.string(), adapter: z.literal("shenzhen-concert-hall-html"),
        url: z.string().url(), city: z.string(), venue: z.string(), seedUrls: z.array(z.string().url()).default([]),
        maxPages: z.number().int().positive().max(20).default(4),
      }),
      z.object({
        id: z.string(), name: z.string(), adapter: z.literal("zhongshan-music-hall-html"),
        url: z.string().url(), city: z.string(), venue: z.string(), seedUrls: z.array(z.string().url()).default([]),
      }),
      z.object({
        id: z.string(), name: z.string(), adapter: z.literal("zhejiang-symphony-ical"),
        url: z.string().url(), city: z.string(), venue: z.string(),
      }),
      z.object({
        id: z.string(), name: z.string(), adapter: z.literal("xian-concert-hall-api"),
        url: z.string().url(), city: z.string(), venue: z.string(), cmpAppKey: z.string(),
      }),
      z.object({
        id: z.string(), name: z.string(), adapter: z.literal("harbin-maitix-api"),
        url: z.string().url(), apiBase: z.string().url(), siteOrigin: z.string().url(),
        city: z.string(), venue: z.string(), pageSize: z.number().int().positive().max(100).default(50),
        projectIds: z.array(z.string()).default([]), seedFile: z.string().optional(),
        allowEmpty: z.boolean().default(true),
        detailUrlTemplate: z.string().optional(),
      }),
      z.object({
        id: z.string(), name: z.string(), adapter: z.literal("gzdjy-mservice"),
        url: z.string().url(), apiBase: z.string().url(),
        city: z.string().default("广州"), venue: z.string(),
        pageSize: z.number().int().positive().max(50).default(10),
      }),
      z.object({
        id: z.string(), name: z.string(), adapter: z.literal("polyt-pc-api"),
        url: z.string().url(), apiBase: z.string().url(),
        city: z.string(), venue: z.string(),
        pageSize: z.number().int().positive().max(100).default(100),
      }),
    ]),
  ),
});

type SourceConfig = z.infer<typeof sourceConfigSchema>["sources"][number];

const useAi = process.argv.includes("--ai");
const explicitOcr = process.argv.includes("--ocr");
const useOcr = !process.argv.includes("--no-ocr");
const probeMode = process.argv.includes("--probe");
const sourceFilterArg = process.argv.find((arg) => arg.startsWith("--source="))?.slice("--source=".length) ?? "";
const sourceFilterIds = sourceFilterArg
  ? new Set(sourceFilterArg.split(",").map((value) => value.trim()).filter(Boolean))
  : null;
const root = process.cwd();
const sourceConfigPath = resolve(root, "sources/shanghai.sources.json");
const outputPath = resolve(root, process.env.SCRAPE_OUTPUT_PATH || "public/data/events.json");
const databasePath = resolve(root, process.env.SCRAPE_DATABASE_PATH || "data/classic-music.db");
const snapshotDir = resolve(root, process.env.SCRAPE_SNAPSHOT_DIR || "data/snapshots");
const ocrCacheDir = resolve(root, "data/ocr-cache");
const ocrInspectDir = resolve(root, "data/ocr-inspect");
const aiProgramCacheDir = resolve(root, "data/ai-cache/program-verification");
const configuredAi = loadSjtuAiConfig();
const aiConfig = useAi ? configuredAi : undefined;
const visionAiConfig = process.env.SJTU_AI_API_KEY?.trim() ? configuredAi : undefined;

type OcrRunBudget = {
  newProjects: number;
  maxNewProjects: number;
};

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
  const parsedConfig = sourceConfigSchema.parse(JSON.parse(await readFile(sourceConfigPath, "utf8")));
  const sourceFilter = sourceFilterIds ?? (probeMode ? new Set(parsedConfig.sources.map((source) => source.id)) : null);
  const config = {
    ...parsedConfig,
    sources: sourceFilter
      ? parsedConfig.sources.filter((source) => sourceFilter.has(source.id))
      : parsedConfig.sources,
  };
  if (sourceFilterIds && !config.sources.length) {
    throw new Error(`--source=${sourceFilterArg} 未匹配到任何来源，可用 id 见 sources/shanghai.sources.json`);
  }
  const dataset: ConcertDataset = {
    generatedAt: startedAt,
    city: config.city,
    events: [],
    sources: [],
    stats: { rawEvents: 0, normalizedEvents: 0, aiEnhancedEvents: 0, errors: [] },
  };

  await mkdir(snapshotDir, { recursive: true });

  for (const source of config.sources) {
    let rawCount: number | undefined;
    let normalizedCount: number | undefined;
    try {
      const result = await scrapeSource(source, startedAt);
      rawCount = result.rawCount;
      normalizedCount = result.events.length;
      assertSourceCollectionHealthy({
        sourceName: source.name,
        rawCount,
        normalizedCount,
        allowEmpty: "allowEmpty" in source ? source.allowEmpty : false,
      });
      const events = result.events;

      dataset.events.push(...events);
      dataset.stats.rawEvents += rawCount;
      dataset.sources.push({
        id: source.id,
        name: source.name,
        url: source.url,
        ok: true,
        eventCount: events.length,
        rawCount,
        normalizedCount,
      });
      console.log(`[source] ${source.name}: discovered ${rawCount}, normalized ${normalizedCount}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dataset.stats.errors.push(`${source.name}: ${message}`);
      dataset.sources.push({
        id: source.id,
        name: source.name,
        url: source.url,
        ok: false,
        eventCount: 0,
        rawCount,
        normalizedCount,
        message,
      });
      console.error(`[source] ${source.name}: failed - ${message}`);
    }
  }

  if (aiConfig && !sourceFilter) {
    dataset.stats.aiEnhancedEvents += await reviewProgramsWithAi(dataset.events, aiConfig);
  }

  if (sourceFilter) {
    // 单源探针/金丝雀模式：只重新采集指定来源并输出对比信息，不落库、不导出、不写健康快照。
    // PROBE_KNOWN_FAILED 列出已知长期故障的来源（如星海 SPA 改版待重建），它们的失败不算事故。
    const knownFailed = new Set(
      (process.env.PROBE_KNOWN_FAILED ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    );
    for (const source of dataset.sources) {
      const tolerated = !source.ok && knownFailed.has(source.id) ? "（已知故障，容忍）" : "";
      console.log(
        `[probe] ${source.id}: ok=${source.ok} discovered=${source.rawCount ?? "-"} normalized=${source.normalizedCount ?? "-"}${tolerated}`,
      );
    }
    console.log(`[probe] ${dataset.sources.length} 个来源采集完成（未持久化）。示例事件：`);
    for (const event of dataset.events.slice(0, 5)) {
      console.log(`  ${event.dateLabel} ${event.timeLabel} | ${event.title.slice(0, 40)} | 曲目 ${event.program.length} 条`);
    }
    const unexpected = dataset.sources.filter((source) => !source.ok && !knownFailed.has(source.id));
    if (unexpected.length) {
      console.error(`[probe] ${unexpected.length} 个非已知故障来源失败：${unexpected.map((source) => source.id).join(", ")}`);
      process.exitCode = 1;
    }
    return;
  }

  await writeFile(
    resolve(snapshotDir, "source-health.json"),
    JSON.stringify({ generatedAt: startedAt, sources: dataset.sources }, null, 2),
    "utf8",
  );

  dataset.events = sortEvents(dedupeEvents(dataset.events));
  dataset.stats.normalizedEvents = dataset.events.length;

  await mkdir(dirname(outputPath), { recursive: true });
  const prepared = await prepareAndPersistDataset(dataset, outputPath, databasePath);

  console.log(`Scraped ${prepared.dataset.events.length} events from ${dataset.sources.length} sources.`);
  if (dataset.stats.errors.length) {
    console.log(`Errors: ${dataset.stats.errors.join(" | ")}`);
  }
}

async function reviewProgramsWithAi(events: ConcertEvent[], config: NonNullable<typeof aiConfig>) {
  const requestedIds = new Set(
    (process.env.PROGRAM_AI_EVENT_IDS || "").split(",").map((value) => value.trim()).filter(Boolean),
  );
  const limit = requestedIds.size
    ? requestedIds.size
    : Math.max(0, Number(process.env.PROGRAM_AI_MAX_REVIEWS ?? 60));
  const eligibleEvents = events.filter((event) => !requestedIds.size || Array.from(requestedIds).some(
      (selector) => event.id === selector || event.sourceUrl.includes(selector),
    ));
  const candidates = selectProgramReviewCandidates(eligibleEvents, limit);
  let enhanced = 0;
  let consecutiveTransientFailures = 0;
  for (const { event } of candidates) {
    try {
      const reviewed = await verifyProgramWithAi({ event, config, cacheDirectory: aiProgramCacheDir });
      console.log(`[ai] ${event.id}: ${reviewed.reason}`);
      consecutiveTransientFailures = 0;
      if (reviewed.changed) enhanced += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/SJTU AI HTTP|fetch failed|timeout|aborted/i.test(message)) {
        consecutiveTransientFailures += 1;
        console.warn(`[ai] ${event.id}: request failed; keeping deterministic result (${consecutiveTransientFailures}/3): ${message}`);
        if (consecutiveTransientFailures >= 3) {
          console.warn("[ai] Program review stopped after three consecutive request failures.");
          break;
        }
        continue;
      }
      console.warn(`[ai] ${event.id}: invalid model output; keeping deterministic result: ${message}`);
    }
  }
  return enhanced;
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
    case "ncpa-api":
      return scrapeNationalCentreForPerformingArts(source, scrapedAt);
    case "china-national-symphony-html":
      return scrapeChinaNationalSymphony(source, scrapedAt);
    case "china-philharmonic-html":
      return scrapeChinaPhilharmonic(source, scrapedAt);
    case "shanghai-philharmonic-html":
      return scrapeShanghaiPhilharmonic(source, scrapedAt);
    case "shanghai-grand-theatre-api":
      return scrapeShanghaiGrandTheatre(source, scrapedAt);
    case "beijing-concert-hall-api":
      return scrapeBeijingConcertHall(source, scrapedAt);
    case "guangzhou-symphony-html":
      return scrapeGuangzhouSymphony(source, scrapedAt);
    case "xinghai-concert-hall-html":
      return scrapeXinghaiConcertHall(source, scrapedAt);
    case "shenzhen-symphony-html":
      return scrapeShenzhenSymphony(source, scrapedAt);
    case "shenzhen-concert-hall-html":
      return scrapeShenzhenConcertHall(source, scrapedAt);
    case "zhongshan-music-hall-html":
      return scrapeZhongshanMusicHall(source, scrapedAt);
    case "zhejiang-symphony-ical":
      return scrapeZhejiangSymphony(source, scrapedAt);
    case "xian-concert-hall-api":
      return scrapeXianConcertHall(source, scrapedAt);
    case "harbin-maitix-api":
      return scrapeHarbinMaitix(source, scrapedAt);
    case "gzdjy-mservice":
      return scrapeGuangzhouGrandTheatre(source, scrapedAt);
    case "polyt-pc-api":
      return scrapePolyTheatre(source, scrapedAt);
  }
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
  const response = await fetchWithRetry(`https://www.shsymphony.cn${path}`, {
    method: "POST",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 ClassicMusicCalendar/1.0",
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
  const response = await fetchWithRetry(`${source.apiBase}${path}`, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 ClassicMusicCalendar/1.0",
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
  const parsed = parseShanghaiConcertHallContent(project.detail || project.content || "", { showDate: start });
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

  return registerProgramEvidence({
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
  }, project.detail || project.content || "");
}

async function scrapeSuzhouSymphony(
  source: Extract<SourceConfig, { adapter: "suzhou-symphony-api" }>,
  scrapedAt: string,
) {
  const itemsById = new Map<string, Record<string, any>>();
  const homeResponse = await fetchWithRetry(source.url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 ClassicMusicCalendar/1.0",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!homeResponse.ok) throw new Error(`Suzhou Symphony home page HTTP ${homeResponse.status}`);
  const homeHtml = await homeResponse.text();
  const seasonUrl = discoverSuzhouSymphonySeasonUrl(homeHtml, source.url) || source.url;
  const seasonResponse = seasonUrl === source.url ? undefined : await fetchWithRetry(seasonUrl);
  if (seasonResponse && !seasonResponse.ok) {
    throw new Error(`Suzhou Symphony season page HTTP ${seasonResponse.status}`);
  }
  const seasonHtml = seasonResponse ? await seasonResponse.text() : homeHtml;
  const discoveredSections = discoverSuzhouSymphonySections(seasonHtml);
  const sections = discoveredSections.length ? discoveredSections : source.sections;

  for (const section of sections) {
    const firstPage = await requestSuzhouSymphonyPage(source, section, 0, seasonUrl);
    const totalPages = Math.max(1, Number(firstPage.totalPages ?? 1));
    for (const item of Array.isArray(firstPage.content) ? firstPage.content : []) {
      itemsById.set(String(item.id), { ...item, _discoveredSectionSlug: section.slug });
    }
    for (let pageNum = 1; pageNum < totalPages; pageNum += 1) {
      const page = await requestSuzhouSymphonyPage(source, section, pageNum, seasonUrl);
      for (const item of Array.isArray(page.content) ? page.content : []) {
        itemsById.set(String(item.id), { ...item, _discoveredSectionSlug: section.slug });
      }
    }
  }

  const listItems = Array.from(itemsById.values());
  if (!listItems.length && discoveredSections.length) {
    throw new Error(`Suzhou Symphony returned 0 items from ${discoveredSections.length} discovered sections`);
  }
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
  referer: string,
) {
  const endpoint = `/api/getMusicData/${encodeURIComponent(section.slug)}/${section.index}?pageNum=${pageNum}&pageSize=${
    source.pageSize
  }`;
  const response = await fetchWithRetry(new URL(endpoint, source.url), {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 ClassicMusicCalendar/1.0",
      accept: "application/json, text/plain, */*",
      referer,
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
  const detailSection = item.sectionName || item._discoveredSectionSlug || "music-season";
  const detailUrl = new URL(`/${detailSection}/${item.id}.html`, source.url).href;
  const composers = Array.from(
    new Set([
      ...inferComposers(title),
      ...parsed.program.map((programItem) => programItem.composer).filter(Boolean),
    ]),
  ) as string[];

  return registerProgramEvidence({
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
  }, item.content || "");
}

async function scrapeOrientalArtCenter(
  source: Extract<SourceConfig, { adapter: "shoac-api" }>,
  scrapedAt: string,
) {
  const localOcr = useOcr ? await createConfiguredOcr() : undefined;
  const configuredProjects = configuredOcrProjectIds();
  const configuredBudget = process.env.SHOAC_OCR_MAX_NEW_PROJECTS;
  const ocrBudget: OcrRunBudget = {
    newProjects: 0,
    maxNewProjects: configuredProjects.length
      ? Number.POSITIVE_INFINITY
      : configuredBudget === undefined || configuredBudget === ""
        ? Number.POSITIVE_INFINITY
        : Math.max(0, Number(configuredBudget)),
  };
  try {
    return await scrapeOrientalArtCenterProjects(source, scrapedAt, localOcr, ocrBudget);
  } finally {
    await localOcr?.terminate();
  }
}

async function scrapeOrientalArtCenterProjects(
  source: Extract<SourceConfig, { adapter: "shoac-api" }>,
  scrapedAt: string,
  localOcr?: LocalOcr,
  ocrBudget?: OcrRunBudget,
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
    const ocrExtraction =
      localOcr && !textProgram.length && shouldOcrOrientalArtCenterProject(projectId)
        ? await recognizeOrientalArtCenterImages(projectId, html, localOcr, ocrBudget!).catch((error) => {
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
          ocrExtraction,
        ),
      );
    }
  }

  return { rawCount: listItems.length, events };
}

function shouldOcrOrientalArtCenterProject(projectId: string) {
  const configured = configuredOcrProjectIds();
  return !configured.length || configured.includes(projectId);
}

function configuredOcrProjectIds() {
  return (
    process.env.SHOAC_OCR_PROJECT_IDS
    ?.split(",")
    .map((value) => value.trim())
      .filter(Boolean) ?? []
  );
}

async function recognizeOrientalArtCenterImages(
  projectId: string,
  html: string,
  localOcr: LocalOcr,
  budget: OcrRunBudget,
) {
  const imageUrls = parseOrientalArtCenterContent(html).imageUrls;
  const maxImages = Math.max(
    1,
    Number(process.env.SHOAC_OCR_MAX_IMAGES || (explicitOcr ? 8 : 3)),
  );
  const selectedUrls = imageUrls.slice(0, maxImages);
  if (!selectedUrls.length) return undefined;

  const cached = await readOcrProjectCache(projectId, selectedUrls);
  if (cached) return cached;
  if (budget.newProjects >= budget.maxNewProjects) return undefined;
  budget.newProjects += 1;

  const pages: OcrProgramExtraction["pages"] = [];
  let best: OcrProgramExtraction | undefined;

  for (const url of selectedUrls) {
    console.log(`OCR SHOAC ${projectId}: ${pages.length + 1}/${selectedUrls.length}`);
    const result = await localOcr.recognizeUrl(url);
    pages.push(result);
    const candidate = evaluateOcrProgram(pages, parseOrientalArtCenterOcrText, {
      minConfidence: Math.max(0, Number(process.env.SHOAC_OCR_MIN_CONFIDENCE ?? 55)),
      minProgramItems: Math.max(1, Number(process.env.SHOAC_OCR_MIN_PROGRAM_ITEMS ?? 2)),
    });
    if (isBetterOcrExtraction(candidate, best)) best = candidate;
    if (candidate.accepted && candidate.program.length >= 4 && candidate.confidence >= 70) break;
  }

  if (!best) return undefined;
  await writeOcrProjectCache(projectId, selectedUrls, best);
  return best;
}

type OcrProjectCache = {
  schemaVersion: 7;
  projectId: string;
  imageSignature: string;
  createdAt: string;
  extraction: OcrProgramExtraction;
};

async function readOcrProjectCache(projectId: string, imageUrls: string[]) {
  const cachePath = resolve(ocrCacheDir, "projects", `${projectId}.json`);
  try {
    const cached = JSON.parse(await readFile(cachePath, "utf8")) as OcrProjectCache;
    const maxAgeDays = Math.max(
      0,
      Number(process.env.SHOAC_OCR_CACHE_MAX_AGE_DAYS ?? 7),
    );
    const age = Date.now() - Date.parse(cached.createdAt);
    const fresh = Number.isFinite(age) && age <= maxAgeDays * 24 * 60 * 60 * 1000;
    if (
      cached.schemaVersion === 7 &&
      cached.projectId === projectId &&
      cached.imageSignature === ocrImageSignature(imageUrls) &&
      isCompatibleOcrProvider(cached.extraction) &&
      fresh
    ) {
      return {
        ...cached.extraction,
        programSections: cached.extraction.programSections ?? [],
        pages: cached.extraction.pages.map((page) => ({
          ...page,
          programSections: page.programSections ?? [],
        })),
      };
    }
  } catch {
    // A missing or incompatible project cache is expected during OCR backfill.
  }
  return undefined;
}

async function writeOcrProjectCache(
  projectId: string,
  imageUrls: string[],
  extraction: OcrProgramExtraction,
) {
  const cache: OcrProjectCache = {
    schemaVersion: 7,
    projectId,
    imageSignature: ocrImageSignature(imageUrls),
    createdAt: new Date().toISOString(),
    extraction,
  };
  const projectCacheDirectory = resolve(ocrCacheDir, "projects");
  await mkdir(projectCacheDirectory, { recursive: true });
  await mkdir(ocrInspectDir, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(projectCacheDirectory, `${projectId}.json`),
      JSON.stringify(cache, null, 2),
      "utf8",
    ),
    writeFile(
      resolve(ocrInspectDir, `${projectId}.json`),
      JSON.stringify(cache, null, 2),
      "utf8",
    ),
  ]);
}

function ocrImageSignature(imageUrls: string[]) {
  return createHash("sha256")
    .update(JSON.stringify({
      parserVersion: 6,
      provider: visionAiConfig?.visionModel ?? "tesseract",
      imageUrls,
      minConfidence: Number(process.env.SHOAC_OCR_MIN_CONFIDENCE ?? 55),
      minProgramItems: Number(process.env.SHOAC_OCR_MIN_PROGRAM_ITEMS ?? 2),
    }))
    .digest("hex");
}

function isCompatibleOcrProvider(extraction: OcrProgramExtraction) {
  if (!visionAiConfig) return true;
  return extraction.pages.length > 0
    && extraction.pages.every((page) => page.provider === visionAiConfig.visionModel);
}

function isBetterOcrExtraction(
  candidate: OcrProgramExtraction,
  current?: OcrProgramExtraction,
) {
  if (!current) return true;
  if (candidate.accepted !== current.accepted) return candidate.accepted;
  if (candidate.program.length !== current.program.length) {
    return candidate.program.length > current.program.length;
  }
  return candidate.confidence > current.confidence;
}

async function requestOrientalArtCenterApi(
  path: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
) {
  const response = await fetchWithRetry(`https://www.shoac.com.cn/platform-backend${path}`, {
    method: options.method ?? "GET",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 ClassicMusicCalendar/1.0",
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

async function scrapeNationalCentreForPerformingArts(
  source: Extract<SourceConfig, { adapter: "ncpa-api" }>,
  scrapedAt: string,
) {
  const firstPage = await requestNcpaApi(source, 1);
  const pageCount = Math.max(1, Number(firstPage.data?.pages ?? 1));
  const listItems = [...(firstPage.data?.records ?? [])];
  for (let pageNo = 2; pageNo <= pageCount; pageNo += 1) {
    const page = await requestNcpaApi(source, pageNo);
    listItems.push(...(page.data?.records ?? []));
  }

  const classicalItems = listItems.filter(
    (item) =>
      /音乐厅/.test(String(item.venueName ?? "")) &&
      !/放映|公开排练|讲座|导赏|工作坊/.test(String(item.productName ?? "")),
  );
  await writeFile(
    resolve(snapshotDir, `${source.id}.list.json`),
    JSON.stringify(classicalItems, null, 2),
    "utf8",
  );

  const events: ConcertEvent[] = [];
  for (const listItem of classicalItems) {
    const productId = String(listItem.productId);
    const response = await fetchWithRetry(
      `${source.apiBase}/product/detail?productId=${encodeURIComponent(productId)}&channel=pc`,
      {
        headers: {
          "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 ClassicMusicCalendar/1.0",
          accept: "application/json, text/plain, */*",
          referer: `https://wticket.chncpa.org/product.html?id=${productId}`,
        },
      },
    );
    if (!response.ok) throw new Error(`NCPA product ${productId} HTTP ${response.status}`);
    const detailResponse = await response.json();
    if (detailResponse.code !== "0" || !detailResponse.data) continue;
    await writeFile(
      resolve(snapshotDir, `${source.id}.${productId}.json`),
      JSON.stringify(detailResponse.data, null, 2),
      "utf8",
    );
    const detail = detailResponse.data as Record<string, any>;
    const sessions = Array.isArray(detail.calendar) ? detail.calendar : [];
    for (const session of sessions) {
      const normalized = normalizeNcpaEvent(detail, session, source, scrapedAt);
      if (normalized) events.push(normalized);
    }
  }

  return { rawCount: classicalItems.length, events };
}

async function requestNcpaApi(
  source: Extract<SourceConfig, { adapter: "ncpa-api" }>,
  pageNo: number,
) {
  const url = `${source.apiBase}/product/list?pageNo=${pageNo}&pageSize=${source.pageSize}`;
  const response = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 ClassicMusicCalendar/1.0",
      accept: "application/json, text/plain, */*",
      "content-type": "application/json",
      referer: source.url,
    },
    body: "{}",
  });
  if (!response.ok) throw new Error(`NCPA product list HTTP ${response.status}`);
  const data = await response.json();
  if (data.code !== "0") throw new Error(`NCPA product list: ${data.message ?? data.code}`);
  return data;
}

function normalizeNcpaEvent(
  detail: Record<string, any>,
  session: Record<string, any>,
  source: Extract<SourceConfig, { adapter: "ncpa-api" }>,
  scrapedAt: string,
): ConcertEvent | undefined {
  const sessionMatch = String(session.sessionDate ?? "").match(
    /(20\d{2})-(\d{1,2})-(\d{1,2}).*?(\d{1,2}):(\d{2})/,
  );
  if (!sessionMatch) return undefined;
  const start = parseChinaDate(
    `${sessionMatch[1]}-${sessionMatch[2]}-${sessionMatch[3]} ${sessionMatch[4]}:${sessionMatch[5]}:00`,
  );
  const labels = formatChinaDateLabels(start);
  const title = cleanText(detail.productName || "未命名演出");
  const parsed = parseNcpaDetail(detail, String(session.sessionDate ?? ""));
  const place = splitVenueAndHall(detail.venueName || source.venue, source.venue);
  const priceTiers = parseNcpaPriceTiers(session);
  const program = parsed.program.map((item) => ({
    ...item,
    composer: isProgramRoleLabel(item.composer)
      ? undefined
      : item.composer || inferComposers(`${title} ${item.title}`)[0],
  }));
  const composers = uniqueStrings([
    ...inferComposers(title),
    ...program.map((item) => item.composer).filter(Boolean),
  ]).filter((composer) => !isProgramRoleLabel(composer));
  const detailUrl = `https://wticket.chncpa.org/product.html?id=${detail.productId}`;
  const inferredTitlePerformers = inferPerformers(title).filter(
    (name) => inferComposers(name).length === 0,
  );

  return registerProgramEvidence({
    id: `ncpa_${detail.productId}_${session.sessionId ?? start.getTime()}`,
    title,
    city: source.city,
    venue: place.venue,
    hall: place.hall,
    startTime: start.toISOString(),
    weekday: labels.weekday,
    dateLabel: labels.dateLabel,
    timeLabel: labels.timeLabel,
    price: priceLabel(priceTiers),
    priceTiers,
    description: parsed.description,
    status: /取消/.test(String(session.sessionSaleStatus ?? "")) ? "cancelled" : "scheduled",
    ticketStatus: mapNcpaSaleStatus(String(detail.productSaleStatus ?? "")),
    ticketUrl: detailUrl,
    sourceName: source.name,
    sourceUrl: detailUrl,
    scrapedAt,
    ensemble: inferEnsemble(title),
    conductor: parsed.conductor,
    performers: uniqueStrings([...parsed.performers, ...inferredTitlePerformers]),
    composers,
    program,
    tags: inferTags(title, composers),
    dataQuality: program.length ? "scraped" : "needs-review",
  }, extractNcpaProgramEvidence(detail, String(session.sessionDate ?? "")));
}

async function scrapeGuangzhouGrandTheatre(
  source: Extract<SourceConfig, { adapter: "gzdjy-mservice" }>,
  scrapedAt: string,
) {
  const rows: GzdjyListRow[] = [];
  let total = 0;
  for (let pageIndex = 1; pageIndex <= 20; pageIndex += 1) {
    const response = await fetchWithRetry(`${source.apiBase}/MService.asmx/searchV5`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 ClassicMusicCalendar/1.0",
        accept: "application/json",
        referer: source.url,
      },
      body: JSON.stringify({
        jsondata: JSON.stringify({
          OrgId: "86",
          SiteId: "36",
          TicketParentId: "0",
          TicketChildId: "0",
          DateIndex: "0",
          Key: "",
          MinPrice: "0",
          MaxPrice: "0",
          PageIndex: String(pageIndex),
          PageSize: String(source.pageSize),
          PlaceId: "0",
          DetailTime: "",
          IsHistory: "0",
          TicketStatusId: "0",
        }),
      }),
    });
    if (!response.ok) throw new Error(`广州大剧院列表 HTTP ${response.status}`);
    const page = parseGzdjyListResponse(await response.text());
    total = page.total;
    rows.push(...page.rows);
    if (!page.rows.length || rows.length >= total) break;
  }

  const classicalRows = rows.filter((row) => row.category === "音乐会" || isClassicalish(row.name));
  await writeFile(
    resolve(snapshotDir, `${source.id}.list.json`),
    JSON.stringify(classicalRows, null, 2),
    "utf8",
  );

  const events: ConcertEvent[] = [];
  for (const row of classicalRows) {
    const detailUrl = `${source.apiBase}${row.link.split("?")[0]}`;
    const html = await fetchText(detailUrl);
    await writeFile(resolve(snapshotDir, `${source.id}.${row.id}.html`), html, "utf8");
    const normalized = normalizeGzdjyEvent(row, html, source, scrapedAt);
    if (normalized) events.push(normalized);
  }

  return { rawCount: classicalRows.length, events };
}

function normalizeGzdjyEvent(
  row: GzdjyListRow,
  detailHtml: string,
  source: Extract<SourceConfig, { adapter: "gzdjy-mservice" }>,
  scrapedAt: string,
): ConcertEvent | undefined {
  const start = parseGzdjyFirstShowTime(row.dateText);
  // 列表行可能包含连演多天/多场次，这里只取首场，其余场次待官网提供结构化数据后再拆分。
  if (!start || start.getTime() <= Date.now()) return undefined;
  const labels = formatChinaDateLabels(start);
  const title = cleanText(row.name);
  const place = splitVenueAndHall(row.place, source.venue);
  const priceTiers = parseGzdjyPriceTiers(row.priceText);
  const programLines = extractGzdjyProgramLines(detailHtml);
  const program = programLines
    .map((line) => parseGzdjyProgramLine(line))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({
      composer: item.composer && !isProgramRoleLabel(item.composer) ? item.composer : undefined,
      title: item.title,
      alternateTitles: item.alternateTitles,
      movements: item.movements,
      confidence: "official" as const,
    }));
  const composers = uniqueStrings(program.map((item) => item.composer)) as string[];
  const detailUrl = `${source.apiBase}${row.link.split("?")[0]}`;

  return registerProgramEvidence({
    id: `gzdjy_${row.id}`,
    title,
    city: source.city,
    venue: place.venue,
    hall: place.hall,
    startTime: start.toISOString(),
    weekday: labels.weekday,
    dateLabel: labels.dateLabel,
    timeLabel: labels.timeLabel,
    price: priceTiers.length ? `¥${priceTiers[0]} 起` : undefined,
    priceTiers: priceTiers.length ? priceTiers : undefined,
    status: "scheduled",
    ticketUrl: detailUrl,
    sourceName: source.name,
    sourceUrl: detailUrl,
    scrapedAt,
    ensemble: inferEnsemble(title),
    performers: inferPerformers(title),
    composers,
    program,
    tags: inferTags(title, composers),
    dataQuality: program.length ? "scraped" : "needs-review",
  }, programLines.join("\n"));
}

async function fetchPolytJson(
  source: Extract<SourceConfig, { adapter: "polyt-pc-api" }>,
  path: string,
  params: Record<string, string> = {},
) {
  const url = new URL(`${source.apiBase.replace(/\/$/, "")}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetchWithRetry(url, () => ({
    headers: {
      // 保利 PC 网关强制要求 Channel 头标识站点，缺失时报「未查询到分销渠道」。
      channel: "theatre_pc",
      accept: "application/json",
      "user-agent": "Mozilla/5.0 ClassicMusicCalendar/1.0",
      origin: source.url.replace(/\/$/, ""),
      referer: source.url,
    },
    signal: AbortSignal.timeout(30_000),
  }));
  if (!response.ok) throw new Error(`保利接口 HTTP ${response.status}`);
  const data = await response.json() as Record<string, any>;
  if (String(data.code) !== "200") {
    throw new Error(`保利接口 ${data.code ?? "unknown"}：${data.errors?.[0] ?? "请求失败"}`);
  }
  return data;
}

async function scrapePolyTheatre(
  source: Extract<SourceConfig, { adapter: "polyt-pc-api" }>,
  scrapedAt: string,
) {
  const products: PolytProduct[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const listResponse = await fetchPolytJson(source, "/good/recommends", {
      page: String(page),
      size: String(source.pageSize),
      sort: "RECENTLY_PERFORMANCE",
    });
    const pageData = parsePolytRecommendList(JSON.stringify(listResponse));
    products.push(...pageData.products);
    if (!pageData.products.length || products.length >= pageData.total) break;
  }

  const classicalProducts = products.filter((product) => {
    // 保利把流行演唱会/音乐节也归入「音乐会」大类，先按子分类排除再走古典关键词。
    if (/音乐节|演唱会/.test(product.subCategory)) return false;
    return product.category === "音乐会" || isClassicalish(product.name);
  });
  await writeFile(
    resolve(snapshotDir, `${source.id}.list.json`),
    JSON.stringify(classicalProducts, null, 2),
    "utf8",
  );

  const events: ConcertEvent[] = [];
  for (const product of classicalProducts) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 300));
    let detail: Record<string, any> | null = null;
    let showsRaw: Record<string, any> | null = null;
    try {
      detail = (await fetchPolytJson(source, `/good/project/detail/${product.productId}`)).data ?? null;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
      showsRaw = await fetchPolytJson(source, `/good/shows/${product.productId}`);
    } catch (error) {
      console.warn(
        `[source] ${source.name}: 项目 ${product.productId} 请求失败，跳过：${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    await writeFile(resolve(snapshotDir, `${source.id}.${product.productId}.json`), JSON.stringify({ detail, shows: showsRaw?.data ?? null }, null, 2), "utf8");

    const program = detail ? extractPolytProgram(detail) : [];
    const description = cleanText(String(detail?.projectDesp ?? "").replace(/<[^>]+>/g, " ")).slice(0, 400) || undefined;
    const shows = showsRaw ? parsePolytShowList(JSON.stringify(showsRaw)) : [];
    const detailUrl = `${source.url.replace(/\/$/, "")}/#/detail?productId=${product.productId}`;

    for (const show of shows) {
      if (show.happenAt.getTime() <= Date.now()) continue;
      const event = createSimpleEvent({
        source,
        scrapedAt,
        sourceRecordId: show.showId,
        projectId: product.productId,
        title: product.name,
        start: show.happenAt,
        venue: product.place || source.venue,
        hall: show.venueName,
        priceTiers: show.priceTiers,
        description,
        program,
        performers: [],
        sourceUrl: detailUrl,
        ticketUrl: detailUrl,
        evidenceText: String(detail?.projectDesp ?? ""),
      });
      event.ticketStatus = mapPolytTicketStatus(show);
      events.push(event);
    }
  }

  return { rawCount: classicalProducts.length, events };
}

function mapNcpaSaleStatus(value: string): ConcertEvent["ticketStatus"] {
  const normalized = value.trim();
  if (normalized === "售卖中" || normalized === "售卖") return "on-sale";
  if (normalized === "即将开票" || normalized === "预售" || normalized === "未开售") return "pre-sale";
  if (normalized === "售罄" || normalized === "已售罄") return "sold-out";
  if (normalized === "停售" || normalized === "下架" || normalized === "已结束") return "off-sale";
  return undefined;
}

async function scrapeChinaNationalSymphony(
  source: Extract<SourceConfig, { adapter: "china-national-symphony-html" }>,
  scrapedAt: string,
) {
  const discoveredUrls = new Set<string>();
  const detailUrls = new Set(source.seedUrls);
  for (let page = 1; page <= source.maxPages; page += 1) {
    const pageUrl =
      page === 1 ? source.url : source.url.replace(/ycrc(?:_\d+)?\.shtml$/, `ycrc_${page}.shtml`);
    const html = await fetchText(pageUrl);
    const $ = cheerio.load(html);
    $('a[href*="/zgjxyt/ycrc/"][href$=".shtml"]').each((_, element) => {
      const href = $(element).attr("href");
      if (href && /\/ycrc\/20\d{4}\//.test(href)) {
        const detailUrl = new URL(href, source.url).href;
        discoveredUrls.add(detailUrl);
        detailUrls.add(detailUrl);
      }
    });
  }
  await writeFile(
    resolve(snapshotDir, `${source.id}.list.json`),
    JSON.stringify(Array.from(detailUrls), null, 2),
    "utf8",
  );

  const events: ConcertEvent[] = [];
  for (const detailUrl of detailUrls) {
    const html = await fetchText(detailUrl);
    const parsed = parseChinaNationalSymphonyDetail(html);
    if (!parsed.startTime || !parsed.title || !isBeijingVenue(parsed.venue)) continue;
    await writeFile(
      resolve(snapshotDir, `${source.id}.${detailUrl.split("/").at(-1)}`),
      html,
      "utf8",
    );
    const start = parseChinaDate(`${parsed.startTime}:00`);
    const labels = formatChinaDateLabels(start);
    const place = splitVenueAndHall(parsed.venue, source.venue);
    const program = parsed.program.map((item) => ({
      ...item,
      composer: item.composer || inferComposers(`${parsed.title} ${item.title}`)[0],
    }));
    const composers = uniqueStrings([
      ...inferComposers(parsed.title),
      ...program.map((item) => item.composer).filter(Boolean),
    ]);

    events.push(registerProgramEvidence({
      id: stableId(`${source.id}:${detailUrl}:${start.toISOString()}`),
      title: parsed.title,
      city: source.city,
      venue: place.venue,
      hall: place.hall,
      startTime: start.toISOString(),
      weekday: labels.weekday,
      dateLabel: labels.dateLabel,
      timeLabel: labels.timeLabel,
      status: "scheduled",
      sourceName: source.name,
      sourceUrl: detailUrl,
      scrapedAt,
      ensemble:
        parsed.ensemble && !/^CNSO$/i.test(parsed.ensemble)
          ? parsed.ensemble
          : inferEnsemble(parsed.title) || "中国交响乐团",
      conductor: parsed.conductor,
      performers: parsed.performers,
      composers,
      program,
      tags: inferTags(parsed.title, composers),
      dataQuality: program.length ? "scraped" : "needs-review",
    }, html));
  }
  return { rawCount: discoveredUrls.size, events };
}

async function scrapeChinaPhilharmonic(
  source: Extract<SourceConfig, { adapter: "china-philharmonic-html" }>,
  scrapedAt: string,
) {
  const params = new URLSearchParams({
    strSelectID: "6529",
    i_columnid: "1701",
    field: "field_6529:1",
    initKind: "FieldForm",
    currentplace: "",
    splitflag: "",
    fullpath: "0",
    field_6529: "",
  });
  const searchUrl = new URL(`/module/search/index.jsp?${params}`, source.url).href;
  const searchHtml = await fetchText(searchUrl);
  const $ = cheerio.load(searchHtml);
  const detailUrls = new Set<string>();
  $('a[href*="art_1701_"][href$=".html"]').each((_, element) => {
    const href = $(element).attr("href");
    if (href) detailUrls.add(new URL(href, searchUrl).href);
  });
  await writeFile(
    resolve(snapshotDir, `${source.id}.list.json`),
    JSON.stringify(Array.from(detailUrls), null, 2),
    "utf8",
  );

  const events: ConcertEvent[] = [];
  for (const detailUrl of detailUrls) {
    const html = await fetchText(detailUrl);
    const parsed = parseChinaPhilharmonicDetail(html);
    if (!parsed.title || !parsed.dateTime) continue;
    const start = parseFlexibleChinaDate(parsed.dateTime);
    if (!start || !isBeijingVenue(parsed.venue)) continue;
    await writeFile(
      resolve(snapshotDir, `${source.id}.${detailUrl.split("/").at(-1)}`),
      html,
      "utf8",
    );
    const labels = formatChinaDateLabels(start);
    const place = splitVenueAndHall(parsed.venue, source.venue);
    const program = parsed.program.map((item) => ({
      ...item,
      composer: item.composer || inferComposers(`${parsed.title} ${item.title}`)[0],
    }));
    const composers = uniqueStrings([
      ...inferComposers(parsed.title),
      ...program.map((item) => item.composer).filter(Boolean),
    ]);
    events.push(registerProgramEvidence({
      id: stableId(`${source.id}:${detailUrl}:${start.toISOString()}`),
      title: parsed.title,
      city: source.city,
      venue: place.venue,
      hall: place.hall,
      startTime: start.toISOString(),
      weekday: labels.weekday,
      dateLabel: labels.dateLabel,
      timeLabel: labels.timeLabel,
      description: parsed.description,
      status: "scheduled",
      sourceName: source.name,
      sourceUrl: detailUrl,
      scrapedAt,
      ensemble: "中国爱乐乐团",
      conductor: parsed.conductor,
      performers: parsed.performers,
      composers,
      program,
      tags: inferTags(parsed.title, composers),
      dataQuality: program.length ? "scraped" : "needs-review",
    }, html));
  }
  return { rawCount: detailUrls.size, events };
}

async function scrapeShanghaiPhilharmonic(
  source: Extract<SourceConfig, { adapter: "shanghai-philharmonic-html" }>,
  scrapedAt: string,
) {
  const firstPage = await fetchText(source.url);
  const first$ = cheerio.load(firstPage);
  const totalItems = Number(
    first$("script")
      .map((_, element) => first$(element).text().match(/\.pagination\(\s*"(\d+)"/)?.[1])
      .get()
      .find(Boolean) ?? 0,
  );
  const pageCount = Math.min(source.maxPages, Math.max(1, Math.ceil(totalItems / 4)));
  const detailUrls = new Set(source.seedUrls);
  const discoveredUrls = new Set<string>();

  for (let page = 1; page <= pageCount; page += 1) {
    const html = page === 1 ? firstPage : await fetchText(`${source.url}?page=${page}`);
    const $ = cheerio.load(html);
    $('a[href^="/activity/"]').each((_, element) => {
      const href = $(element).attr("href");
      if (href) {
        const detailUrl = new URL(href, source.url).href;
        discoveredUrls.add(detailUrl);
        detailUrls.add(detailUrl);
      }
    });
  }
  await writeFile(
    resolve(snapshotDir, `${source.id}.list.json`),
    JSON.stringify(Array.from(detailUrls), null, 2),
    "utf8",
  );

  const events: ConcertEvent[] = [];
  for (const detailUrl of detailUrls) {
    const html = await fetchText(detailUrl);
    const parsed = parseShanghaiPhilharmonicDetail(html);
    if (!parsed.title || !parsed.dateTime) continue;
    const start = parseChinaDate(`${parsed.dateTime}:00`);
    const labels = formatChinaDateLabels(start);
    const place = splitVenueAndHall(parsed.venue, source.venue);
    const program = parsed.program.map((item) => ({
      ...item,
      composer: item.composer || inferComposers(`${parsed.title} ${item.title}`)[0],
    }));
    const composers = uniqueStrings([
      ...inferComposers(parsed.title),
      ...program.map((item) => item.composer).filter(Boolean),
    ]);
    await writeFile(
      resolve(snapshotDir, `${source.id}.${detailUrl.split("/").at(-1)?.split("?")[0]}.html`),
      html,
      "utf8",
    );
    events.push(registerProgramEvidence({
      id: stableId(`${source.id}:${detailUrl}:${start.toISOString()}`),
      title: parsed.title,
      city: source.city,
      venue: place.venue,
      hall: place.hall,
      startTime: start.toISOString(),
      weekday: labels.weekday,
      dateLabel: labels.dateLabel,
      timeLabel: labels.timeLabel,
      price: parsed.price,
      priceTiers: parsed.priceTiers,
      status: "scheduled",
      ticketUrl: detailUrl,
      sourceName: source.name,
      sourceUrl: detailUrl,
      scrapedAt,
      ensemble: parsed.ensembles[0] || "上海爱乐乐团",
      conductor: parsed.conductor,
      performers: parsed.performers,
      composers,
      program,
      tags: inferTags(parsed.title, composers),
      dataQuality: program.length ? "scraped" : "needs-review",
    }, html));
  }
  return { rawCount: discoveredUrls.size, events };
}

async function scrapeShanghaiGrandTheatre(
  source: Extract<SourceConfig, { adapter: "shanghai-grand-theatre-api" }>,
  scrapedAt: string,
) {
  const response = await postTheatreVendor(source.url, source.cmpAppKey, "program/getHotProgramList.xhtml", { showSite: "pclist" });
  const items = (response.data ?? []) as Array<Record<string, any>>;
  await writeFile(resolve(snapshotDir, `${source.id}.list.json`), JSON.stringify(items, null, 2), "utf8");
  const events: ConcertEvent[] = [];
  for (const item of items.filter(isShanghaiGrandTheatreClassical)) {
    const detailResponse = await postTheatreVendor(source.url, source.cmpAppKey, "program/getProgramById.xhtml", { programId: item.id });
    const detail = detailResponse.data;
    if (!detail) continue;
    const parsed = parseShanghaiGrandTheatreDetail(detail.programInfo || detail.showContent || "");
    const schedules = await getTheatreVendorSchedules(source.url, source.cmpAppKey, detail);
    const pricing = [Number(detail.minPrice), Number(detail.maxPrice)].filter((value) => Number.isFinite(value) && value > 0);
    const detailUrl = `${source.url.replace(/\/$/, "")}/shtheatre/index.html#/ticket/detail/${item.id}`;
    for (const schedule of schedules) {
      const start = parseChinaDate(schedule.playTime || detail.startTime);
      events.push(createSimpleEvent({
        source, scrapedAt, sourceRecordId: `${item.id}:${schedule.id ?? start.getTime()}`,
        title: cleanText(detail.fullCnName || detail.cnName), start,
        end: schedule.playEndTime ? parseChinaDate(schedule.playEndTime) : undefined,
        venue: detail.stadiumName || source.venue, hall: schedule.venueName || detail.venueName,
        priceTiers: unique(pricing).sort((a, b) => a - b), description: parsed.description,
        program: parsed.program, performers: inferPerformers(detail.fullCnName || ""),
        sourceUrl: detailUrl, ticketUrl: detailUrl,
        evidenceText: detail.programInfo || detail.showContent || "",
      }));
    }
  }
  return { rawCount: items.length, events };
}

async function scrapeXianConcertHall(
  source: Extract<SourceConfig, { adapter: "xian-concert-hall-api" }>,
  scrapedAt: string,
) {
  const response = await postTheatreVendor(source.url, source.cmpAppKey, "program/getHotProgramList.xhtml", { showSite: "pclist" });
  const items = (response.data ?? []) as Array<Record<string, any>>;
  await writeFile(resolve(snapshotDir, `${source.id}.list.json`), JSON.stringify(items, null, 2), "utf8");
  const localOcr = useOcr ? await createConfiguredOcr() : undefined;
  const events: ConcertEvent[] = [];
  try {
    for (const item of items.filter(isXianConcertHallClassical)) {
      const detailResponse = await postTheatreVendor(source.url, source.cmpAppKey, "program/getProgramById.xhtml", { programId: item.id });
      const detail = detailResponse.data;
      if (!detail) continue;
      const parsed = parseXianConcertHallDetail(detail.programInfo || detail.showContent || "");
      const schedules = await getTheatreVendorSchedules(source.url, source.cmpAppKey, detail);
      const scheduleStarts = schedules.map((schedule) => parseChinaDate(schedule.playTime || detail.startTime));
      const extraction = !parsed.program.length && parsed.imageUrls.length && localOcr
        ? await recognizeSourceImages(
            `xian_${item.id}`,
            absolutizeImages(parsed.imageUrls, source.url),
            localOcr,
            parseXianConcertHallProgramText,
            {
              maxImages: schedules.length > 1 ? Math.min(20, Math.max(6, schedules.length * 3)) : undefined,
              targetDates: scheduleStarts,
            },
          )
        : undefined;
      const pricing = unique([Number(detail.minPrice), Number(detail.maxPrice)].filter((value) => Number.isFinite(value) && value > 0)).sort((a, b) => a - b);
      const detailUrl = `${source.url.replace(/\/$/, "")}/sxtheatre/#/ticket/detail/${item.id}`;
      for (const [scheduleIndex, schedule] of schedules.entries()) {
        const start = scheduleStarts[scheduleIndex];
        const program = parsed.program.length
          ? parsed.program
          : extraction?.accepted
            ? selectOcrProgramForDate(extraction, start)
            : [];
        events.push(createSimpleEvent({
          source, scrapedAt, sourceRecordId: `${item.id}:${schedule.id ?? start.getTime()}`, projectId: `xian_${item.id}`,
          title: cleanText(detail.fullCnName || detail.cnName), start,
          end: schedule.playEndTime ? parseChinaDate(schedule.playEndTime) : undefined,
          venue: detail.stadiumName || source.venue, hall: schedule.venueName || detail.venueName,
          priceTiers: pricing, description: parsed.description, program,
          performers: inferPerformers(detail.fullCnName || ""), sourceUrl: detailUrl, ticketUrl: detailUrl,
          extraction,
          evidenceText: detail.programInfo || detail.showContent || "",
        }));
      }
    }
  } finally { await localOcr?.terminate(); }
  return { rawCount: items.length, events };
}

async function scrapeBeijingConcertHall(
  source: Extract<SourceConfig, { adapter: "beijing-concert-hall-api" }>,
  scrapedAt: string,
) {
  const list = await fetchJson(`${source.apiBase.replace(/\/$/, "")}/api/event/list?projectId=&firstClassId=&secondClassId=&yyyyMM=&date=`);
  const items = (list.data ?? []) as Array<Record<string, any>>;
  const details = new Map<string, Record<string, any>>();
  const events: ConcertEvent[] = [];
  for (const item of items) {
    let project: Record<string, any>;
    try { project = typeof item.projectId === "string" ? JSON.parse(item.projectId) : item.projectId; } catch { continue; }
    if (!project?.projectId || !isBeijingConcertHallClassical(project.firstClassName || "", project.projectName || "")) continue;
    let detail = details.get(String(project.projectId));
    if (!detail) {
      const response = await fetchJson(`${source.apiBase.replace(/\/$/, "")}/api/project/detail?projectId=${project.projectId}`);
      detail = response.data;
      if (!detail) continue;
      details.set(String(project.projectId), detail);
    }
    const parsed = parseBeijingConcertHallDetail(detail.projectIntroduce || "");
    const priceTiers = unique<number>((item.priceList ?? []).filter((price: any) => price.priceType === 1).map((price: any) => Number(price.priceMoneyFen) / 100)).sort((a, b) => a - b);
    const start = parseChinaDate(`${item.eventStartTime}:00`);
    const detailUrl = `${source.url}?type=pc&projectId=${project.projectId}&eventId=${item.eventId}`;
    events.push(createSimpleEvent({
      source, scrapedAt, sourceRecordId: String(item.eventId), title: project.projectName, start,
      end: item.eventEndTime ? parseChinaDate(`${item.eventEndTime}:00`) : undefined,
      venue: source.venue, hall: undefined, priceTiers, program: parsed.program,
      ensemble: inferEnsemble(project.projectName), performers: inferPerformers(project.projectName),
      sourceUrl: detailUrl, ticketUrl: detailUrl,
      evidenceText: detail.projectIntroduce || "",
    }));
  }
  await writeFile(resolve(snapshotDir, `${source.id}.list.json`), JSON.stringify(items, null, 2), "utf8");
  return { rawCount: items.length, events };
}

async function scrapeGuangzhouSymphony(
  source: Extract<SourceConfig, { adapter: "guangzhou-symphony-html" }>,
  scrapedAt: string,
) {
  const detailUrls = new Set(source.seedUrls);
  const discoveredUrls = new Set<string>();
  const homeHtml = await fetchText(source.url);
  const indexUrls = [source.url, ...discoverGuangzhouSymphonySeasonUrls(homeHtml, source.url)];
  for (const indexUrl of indexUrls) {
    const html = indexUrl === source.url ? homeHtml : await fetchText(indexUrl).catch(() => "");
    const $ = cheerio.load(html);
    $('a[href*="/portfolio/concert-"]').each((_, element) => {
      const href = $(element).attr("href");
      if (!href) return;
      const detailUrl = new URL(href, indexUrl).href;
      discoveredUrls.add(detailUrl);
      detailUrls.add(detailUrl);
    });
  }
  const supplementalUrls = new Set<string>();
  for (const indexUrl of source.supplementalIndexUrls) {
    // 补充索引挂在星海旧站（concerthall.com.cn）上，该站已改版下线；
    // 拉取失败时降级为空，主站索引照常发现演出，不能让死链拖垮整个来源。
    const html = await fetchLegacyChineseText(indexUrl).catch((error) => {
      console.warn(
        `[source] ${source.name}: 补充索引不可用（${indexUrl}）：${error instanceof Error ? error.message : String(error)}`,
      );
      return "";
    });
    for (const detailUrl of discoverGuangzhouSymphonySupplementalUrls(html, indexUrl)) {
      supplementalUrls.add(detailUrl);
    }
  }
  const events: ConcertEvent[] = [];
  for (const detailUrl of detailUrls) {
    const html = await fetchText(detailUrl);
    const parsed = parseGuangzhouSymphonyDetail(html);
    const start = parsed.dateTime ? parseFlexibleChinaDate(parsed.dateTime) : undefined;
    if (!start || !parsed.title) continue;
    events.push(createSimpleEvent({ source, scrapedAt, sourceRecordId: detailUrl, title: parsed.title, start,
      venue: parsed.venue || source.venue, priceTiers: parsed.priceTiers, program: parsed.program,
      ensemble: "广州交响乐团", performers: inferPerformers(parsed.title), sourceUrl: detailUrl, ticketUrl: detailUrl,
      evidenceText: html }));
  }
  for (const detailUrl of supplementalUrls) {
    const html = await fetchLegacyChineseText(detailUrl).catch(() => "");
    const parsed = parseXinghaiConcertHallDetail(html, detailUrl);
    const start = parsed.dateTime ? parseFlexibleChinaDate(parsed.dateTime) : undefined;
    if (!start || !/广州交响乐团|广交/.test(parsed.title)) continue;
    discoveredUrls.add(detailUrl);
      events.push(createSimpleEvent({
        source, scrapedAt, sourceRecordId: detailUrl,
        projectId: `gso_xinghai_${detailUrl.match(/[?&]id=(\d+)/)?.[1] ?? stableId(detailUrl)}`,
        title: parsed.title, start, venue: parsed.venue || source.venue, hall: parsed.hall,
        priceTiers: parsed.priceTiers, program: parsed.program, ensemble: "广州交响乐团",
        conductor: parsed.conductor,
        performers: uniqueStrings([...parsed.performers, ...inferPerformers(parsed.title)]),
        sourceUrl: detailUrl, ticketUrl: detailUrl,
        evidenceText: html,
      }));
  }
  return { rawCount: discoveredUrls.size, events: dedupeEvents(events) };
}

async function scrapeXinghaiConcertHall(
  source: Extract<SourceConfig, { adapter: "xinghai-concert-hall-html" }>,
  scrapedAt: string,
) {
  const listHtml = await fetchLegacyChineseText(source.url);
  const $ = cheerio.load(listHtml);
  const detailUrls = new Set(source.seedUrls);
  const discoveredUrls = new Set<string>();
  $('a[href*="neweventdetail.php?id="]').each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    const detailUrl = new URL(href, source.url).href;
    discoveredUrls.add(detailUrl);
    detailUrls.add(detailUrl);
  });
  const localOcr = useOcr ? await createConfiguredOcr() : undefined;
  const events: ConcertEvent[] = [];
  try {
    for (const detailUrl of detailUrls) {
      const html = await fetchLegacyChineseText(detailUrl);
      const parsed = parseXinghaiConcertHallDetail(html, detailUrl);
      if (!isXinghaiConcertHallClassical(parsed.title)) continue;
      const key = `xinghai_${detailUrl.match(/[?&]id=(\d+)/)?.[1] ?? stableId(detailUrl)}`;
      const extraction = !parsed.program.length && parsed.imageUrls.length && localOcr
        ? await recognizeSourceImages(key, parsed.imageUrls, localOcr, parseXinghaiConcertHallProgramText)
        : undefined;
      const program = parsed.program.length ? parsed.program : extraction?.accepted ? extraction.program : [];
      const start = parsed.dateTime ? parseFlexibleChinaDate(parsed.dateTime) : undefined;
      if (!start) continue;
      events.push(createSimpleEvent({ source, scrapedAt, sourceRecordId: detailUrl, projectId: key, title: parsed.title, start,
        venue: parsed.venue || source.venue, hall: parsed.hall, priceTiers: parsed.priceTiers, program,
        conductor: parsed.conductor,
        performers: uniqueStrings([...parsed.performers, ...inferPerformers(parsed.title)]),
        sourceUrl: detailUrl, ticketUrl: detailUrl, extraction, evidenceText: html }));
    }
  } finally { await localOcr?.terminate(); }
  return { rawCount: discoveredUrls.size, events };
}

async function scrapeShenzhenSymphony(
  source: Extract<SourceConfig, { adapter: "shenzhen-symphony-html" }>,
  scrapedAt: string,
) {
  const listHtml = await fetchText(source.url);
  const items = parseShenzhenSymphonyList(listHtml, source.url);
  const supplementalUrls = source.supplementalIndexUrl
    ? await discoverShenzhenConcertHallPages(source.supplementalIndexUrl, source.supplementalMaxPages)
    : [];
  const localOcr = useOcr ? await createConfiguredOcr() : undefined;
  const events: ConcertEvent[] = [];
  try {
    for (const detailUrl of supplementalUrls) {
      const html = await fetchText(detailUrl);
      const parsed = parseShenzhenConcertHallDetail(html, detailUrl);
      if (!/深圳交响乐团|深交/.test(parsed.title)) continue;
      const start = parsed.dateTime ? parseFlexibleChinaDate(parsed.dateTime) : undefined;
      if (!start) continue;
      events.push(createSimpleEvent({
        source, scrapedAt, sourceRecordId: detailUrl,
        projectId: `sso_szyyt_${detailUrl.match(/show_(\d+)/)?.[1] ?? stableId(detailUrl)}`,
        title: parsed.title, start, venue: parsed.venue || source.venue, hall: parsed.hall,
        priceTiers: parsed.priceTiers, program: parsed.program, ensemble: "深圳交响乐团",
        performers: uniqueStrings([...parsed.performers, ...inferPerformers(parsed.title)]),
        sourceUrl: detailUrl, ticketUrl: detailUrl,
        evidenceText: html,
      }));
    }
    const supplementalDates = new Set(events.map((event) => event.startTime.slice(0, 10)));
    for (const item of items) {
      const html = await fetchText(item.url);
      const parsed = parseShenzhenSymphonyDetail(html, item.url);
      const key = `sso_sz_${stableId(item.url).replace("perf_", "")}`;
      const extraction = !parsed.program.length && parsed.imageUrls.length && localOcr
        ? await recognizeSourceImages(key, parsed.imageUrls, localOcr, parseShenzhenSymphonyProgramText)
        : undefined;
      const program = parsed.program.length ? parsed.program : extraction?.accepted ? extraction.program : [];
      const start = parseFlexibleChinaDate(`${item.date} ${parsed.time || source.defaultTime}`);
      if (!start) continue;
      if (supplementalDates.has(start.toISOString().slice(0, 10))) continue;
      events.push(createSimpleEvent({ source, scrapedAt, sourceRecordId: item.url, projectId: key, title: item.title, start,
        venue: source.venue, program, ensemble: "深圳交响乐团", sourceUrl: item.url, ticketUrl: item.url, extraction,
        evidenceText: html }));
    }
  } finally { await localOcr?.terminate(); }
  return { rawCount: items.length + supplementalUrls.length, events: dedupeEvents(events) };
}

async function scrapeShenzhenConcertHall(
  source: Extract<SourceConfig, { adapter: "shenzhen-concert-hall-html" }>,
  scrapedAt: string,
) {
  const detailUrls = new Set(source.seedUrls);
  const discoveredUrls = new Set(await discoverShenzhenConcertHallPages(source.url, source.maxPages));
  for (const detailUrl of discoveredUrls) detailUrls.add(detailUrl);
  const localOcr = useOcr ? await createConfiguredOcr() : undefined;
  const events: ConcertEvent[] = [];
  try {
    for (const detailUrl of detailUrls) {
      const html = await fetchText(detailUrl);
      const parsed = parseShenzhenConcertHallDetail(html, detailUrl);
      if (!isShenzhenConcertHallClassical(parsed.title, parsed.program)) continue;
      const key = `szyyt_${detailUrl.match(/show_(\d+)/)?.[1] ?? stableId(detailUrl)}`;
      const extraction = !parsed.program.length && parsed.imageUrls.length && localOcr
        ? await recognizeSourceImages(key, parsed.imageUrls, localOcr, parseShenzhenConcertHallProgramText)
        : undefined;
      const program = parsed.program.length ? parsed.program : extraction?.accepted ? extraction.program : [];
      const start = parsed.dateTime ? parseFlexibleChinaDate(parsed.dateTime) : undefined;
      if (!start) continue;
      events.push(createSimpleEvent({ source, scrapedAt, sourceRecordId: detailUrl, projectId: key, title: parsed.title, start,
        venue: parsed.venue || source.venue, hall: parsed.hall, priceTiers: parsed.priceTiers, program,
        performers: uniqueStrings([...parsed.performers, ...inferPerformers(parsed.title)]),
        sourceUrl: detailUrl, ticketUrl: detailUrl, extraction, evidenceText: html }));
    }
  } finally { await localOcr?.terminate(); }
  return { rawCount: discoveredUrls.size, events };
}

async function discoverShenzhenConcertHallPages(indexUrl: string, maxPages: number) {
  const detailUrls = new Set<string>();
  for (let page = 1; page <= maxPages; page += 1) {
    const pageUrl = buildShenzhenConcertHallListUrl(indexUrl, page);
    const html = await fetchText(pageUrl);
    const pageUrls = discoverShenzhenConcertHallDetailUrls(html, pageUrl);
    if (!pageUrls.length) break;
    const sizeBefore = detailUrls.size;
    for (const detailUrl of pageUrls) detailUrls.add(detailUrl);
    if (page > 1 && detailUrls.size === sizeBefore) break;
  }
  return Array.from(detailUrls);
}

async function scrapeZhongshanMusicHall(
  source: Extract<SourceConfig, { adapter: "zhongshan-music-hall-html" }>,
  scrapedAt: string,
) {
  const listHtml = await fetchText(source.url);
  const items = parseZhongshanMusicHallList(listHtml, source.url);
  const detailUrls = new Set([...source.seedUrls, ...items.map((item) => item.url)]);
  const localOcr = useOcr ? await createConfiguredOcr() : undefined;
  const events: ConcertEvent[] = [];
  try {
    for (const detailUrl of detailUrls) {
      const html = await fetchText(detailUrl);
      const parsed = parseZhongshanMusicHallDetail(html, detailUrl);
      if (!isZhongshanMusicHallClassical(parsed.title)) continue;
      const key = `zsyyt_${detailUrl.match(/t(\d+)/)?.[1] ?? stableId(detailUrl)}`;
      const extraction = !parsed.program.length && parsed.imageUrls.length && localOcr
        ? await recognizeSourceImages(key, parsed.imageUrls, localOcr, parseZhongshanMusicHallProgramText)
        : undefined;
      const program = parsed.program.length ? parsed.program : extraction?.accepted ? extraction.program : [];
      const start = parsed.dateTime ? parseFlexibleChinaDate(parsed.dateTime) : undefined;
      if (!start) continue;
      events.push(createSimpleEvent({ source, scrapedAt, sourceRecordId: detailUrl, projectId: key, title: parsed.title, start,
        venue: parsed.venue || source.venue, priceTiers: parsed.priceTiers, program,
        performers: uniqueStrings([...parsed.performers, ...inferPerformers(parsed.title)]),
        ensemble: parsed.ensemble, sourceUrl: detailUrl, ticketUrl: detailUrl, extraction,
        evidenceText: html }));
    }
  } finally { await localOcr?.terminate(); }
  return { rawCount: items.length, events };
}

async function scrapeZhejiangSymphony(
  source: Extract<SourceConfig, { adapter: "zhejiang-symphony-ical" }>,
  scrapedAt: string,
) {
  const calendar = parseZhejiangSymphonyCalendar(await fetchText(source.url));
  const events = calendar.map((item) => {
    const start = parseIcalChinaDate(item.start);
    const end = item.end ? parseIcalChinaDate(item.end) : undefined;
    return createSimpleEvent({ source, scrapedAt, sourceRecordId: item.uid, title: item.title, start, end,
      venue: item.location.split(",")[0] || source.venue, description: item.description,
      program: parseZhejiangSymphonyProgram(item.description), ensemble: "浙江交响乐团",
      sourceUrl: item.url || source.url, ticketUrl: item.url || source.url, evidenceText: item.description });
  });
  return { rawCount: calendar.length, events };
}

async function scrapeHarbinMaitix(
  source: Extract<SourceConfig, { adapter: "harbin-maitix-api" }>,
  scrapedAt: string,
) {
  const projects = new Map<string, Record<string, any>>();
  const seedProjects = new Map<string, HarbinMaitixProject>(await loadMaitixSeedProjects(source));
  let page = 1;
  let totalPages = 1;
  do {
    const list = await fetchHarbinMaitixJson(source, "/api/pro/projects", {
      page: String(page),
      pageSize: String(source.pageSize),
    });
    const data = list.data || {};
    for (const item of Array.isArray(data.dataList) ? data.dataList : []) {
      if (!item?.projectToken) continue;
      // 综合性剧院（如江苏大剧院）的列表里舞剧、放映、音乐剧占多数，
      // 用场地和标题先做保守预筛（只排除明显非古典的项目），避免上百次无谓的详情请求。
      if (maitixProjectWorthDetail(item)) {
        projects.set(String(item.projectToken), item);
      }
    }
    totalPages = Math.max(1, Math.min(20, Number(data.totalPage) || 1));
    page += 1;
  } while (page <= totalPages);

  for (const projectId of source.projectIds) {
    if (!projects.has(projectId)) projects.set(projectId, { projectToken: projectId, manuallySeeded: true });
  }
  for (const projectId of seedProjects.keys()) {
    if (!projects.has(projectId)) projects.set(projectId, { projectToken: projectId, snapshotSeeded: true });
  }

  const events: ConcertEvent[] = [];
  const activeProjects: HarbinMaitixProject[] = [];
  for (const [projectId] of projects) {
    // 麦座对连续详情请求有限流，串行加间隔并对单次失败做一次退避重试。
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 400));
    let detailResponse: Record<string, any> | null = null;
    for (let attempt = 0; attempt < 2 && !detailResponse; attempt += 1) {
      try {
        detailResponse = await fetchHarbinMaitixJson(source, "/api/pro/project", {
          projectToken: projectId,
          reqType: "1",
        });
      } catch (error) {
        if (attempt === 0) {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 2000));
          continue;
        }
        // 单个项目详情失败（下架、接口限流等）不应拖垮整个来源。
        console.warn(
          `[source] ${source.name}: 项目 ${projectId} 详情请求失败，跳过：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (!detailResponse) continue;
    const detail = (detailResponse.data as HarbinMaitixProject | null) ?? seedProjects.get(projectId) ?? null;
    if (!detail) continue;
    activeProjects.push(detail);
    const parsed = parseHarbinMaitixDetail(detail);
    if (!isHarbinMaitixClassical(parsed.title, parsed.program)) continue;
    const detailUrl = source.detailUrlTemplate
      ? source.detailUrlTemplate.replace("{id}", encodeURIComponent(projectId))
      : `${source.url.replace(/#.*$/, "")}#/pages-order/projectDetail/index?projectId=${encodeURIComponent(projectId)}`;

    for (const event of parsed.events) {
      const showTime = Number(event.showTime);
      if (!Number.isFinite(showTime) || showTime <= 0) continue;
      const start = new Date(showTime);
      const endTime = Number(event.showEndTime);
      events.push(createSimpleEvent({
        source,
        scrapedAt,
        sourceRecordId: String(event.eventToken || `${projectId}:${showTime}`),
        projectId,
        title: parsed.title,
        start,
        end: Number.isFinite(endTime) && endTime > 0 ? new Date(endTime) : undefined,
        venue: source.venue,
        hall: cleanHarbinHall(event.siteName || detail.siteName, source.venue),
        priceTiers: getHarbinMaitixPriceTiers(event),
        description: parsed.description,
        program: parsed.program,
        ensemble: parsed.ensemble || inferEnsemble(`${parsed.title} ${detail.projectDetail || ""}`),
        conductor: parsed.conductor,
        performers: uniqueStrings(parsed.performers),
        sourceUrl: detailUrl,
        ticketUrl: detailUrl,
        evidenceText: detail.projectDetail || detail,
      }));
    }
  }

  await writeFile(
    resolve(snapshotDir, `${source.id}.list.json`),
    JSON.stringify({ discovered: Array.from(projects.values()), activeProjects }, null, 2),
    "utf8",
  );
  const discoveredActiveCount = activeProjects.length;
  return { rawCount: discoveredActiveCount, events };
}

async function loadMaitixSeedProjects(
  source: Extract<SourceConfig, { adapter: "harbin-maitix-api" }>,
): Promise<Array<[string, HarbinMaitixProject]>> {
  if (!source.seedFile) return [];
  try {
    const seeds = parseHarbinMaitixSeedFile(JSON.parse(await readFile(resolve(root, source.seedFile), "utf8")));
    return seeds.map((project) => [String(project.projectToken), project]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw error;
  }
}

async function fetchHarbinMaitixJson(
  source: Extract<SourceConfig, { adapter: "harbin-maitix-api" }>,
  path: string,
  params: Record<string, string>,
) {
  const url = new URL(path, source.apiBase);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("__sr", source.siteOrigin);
  const response = await fetchWithRetry(url, () => ({
    headers: {
      "user-agent": "Mozilla/5.0 ClassicMusicCalendar/1.0",
      accept: "application/json",
      origin: source.siteOrigin.replace(/\/$/, ""),
      referer: source.siteOrigin,
    },
    signal: AbortSignal.timeout(30_000),
  }));
  if (!response.ok) throw new Error(`Harbin Maitix HTTP ${response.status}`);
  const data = await response.json() as Record<string, any>;
  if (String(data.code) !== "200" || data.fail === true) {
    throw new Error(`Harbin Maitix API ${data.code || "unknown"}: ${data.msg || data.detailMsg || "request failed"}`);
  }
  return data;
}

function isHarbinMaitixClassical(title: string, program: ProgramItem[]) {
  if (program.length) return true;
  if (/音乐剧|话剧|儿童剧|相声|脱口秀|演唱会|舞蹈|杂技|魔术/.test(title)) return false;
  return /交响|管弦|室内乐|独奏|重奏|钢琴|小提琴|大提琴|古典|协奏曲|奏鸣曲/.test(title);
}

function maitixProjectWorthDetail(item: Record<string, any>) {
  const title = String(item.projectName ?? item.aliasName ?? "");
  const siteName = String(item.siteName ?? "");
  if (siteName.includes("音乐厅")) return true;
  if (/放映|影像|音乐剧|话剧|儿童|亲子|脱口秀|相声|演唱会|舞剧|舞蹈|芭蕾|戏曲|京剧|喜剧|马戏|魔术|体验|展览|生日/.test(title)) {
    return false;
  }
  return /交响|管弦|室内乐|独奏|重奏|钢琴|小提琴|大提琴|中提琴|古典|协奏|奏鸣曲|四重奏|乐团|合唱|歌剧|音乐会/.test(title);
}

function cleanHarbinHall(value: string | undefined, venue: string) {
  const normalized = cleanText(value || "");
  if (!normalized || normalized === venue) return undefined;
  return normalized.replace(new RegExp(`^${venue}`), "").trim() || undefined;
}

type SimpleEventInput = {
  source: { id: string; name: string; city: string; venue: string };
  scrapedAt: string; sourceRecordId: string; projectId?: string; title: string; start: Date; end?: Date;
  venue: string; hall?: string; priceTiers?: number[]; description?: string; program: ProgramItem[];
  ensemble?: string; conductor?: string; performers?: string[]; sourceUrl: string; ticketUrl?: string;
  extraction?: OcrProgramExtraction;
  evidenceText?: unknown;
};

function createSimpleEvent(input: SimpleEventInput): ConcertEvent {
  const labels = formatChinaDateLabels(input.start);
  const program = input.program.map((item) => ({ ...item, composer: item.composer || inferComposers(`${input.title} ${item.title}`)[0] }));
  const composers = uniqueStrings([...inferComposers(input.title), ...program.map((item) => item.composer)]);
  const tiers = unique(input.priceTiers ?? []).sort((a, b) => a - b);
  const event: ConcertEvent = {
    id: stableId(`${input.source.id}:${input.sourceRecordId}:${input.start.toISOString()}`), projectId: input.projectId,
    title: cleanText(input.title), city: input.source.city, venue: cleanText(input.venue || input.source.venue), hall: input.hall,
    startTime: input.start.toISOString(), endTime: input.end?.toISOString(), weekday: labels.weekday,
    dateLabel: labels.dateLabel, timeLabel: labels.timeLabel, price: priceLabel(tiers), priceTiers: tiers.length ? tiers : undefined,
    description: input.description, status: "scheduled", ticketUrl: input.ticketUrl,
    sourceName: input.source.name, sourceUrl: input.sourceUrl, scrapedAt: input.scrapedAt,
    ensemble: input.ensemble || inferEnsemble(input.title), conductor: input.conductor,
    performers: uniqueStrings(input.performers ?? []), composers, program, tags: inferTags(input.title, composers),
    dataQuality: program.length ? (input.extraction ? "ocr-assisted" : "scraped") : "needs-review",
    extraction: input.extraction ? {
      method: "ocr", provider: input.extraction.provider, confidence: input.extraction.confidence,
      imageCount: input.extraction.imageCount, accepted: input.extraction.accepted,
      reasons: input.extraction.reasons, reviewRequired: true,
      images: input.extraction.pages.map((page) => ({ url: page.url, confidence: page.confidence })),
    } : undefined,
  };
  return registerProgramEvidence(event, input.evidenceText);
}

async function postTheatreVendor(baseUrl: string, cmpAppKey: string, path: string, body: Record<string, unknown>) {
  const response = await fetchWithRetry(`${baseUrl.replace(/\/$/, "")}/thvendor/ticket/${path}`, () => ({
    method: "POST",
    headers: { cmpappkey: cmpAppKey, "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0 ClassicMusicCalendar/1.0" },
    body: new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)])),
    signal: AbortSignal.timeout(30_000),
  }));
  if (!response.ok) throw new Error(`Theatre vendor HTTP ${response.status}`);
  return response.json() as Promise<Record<string, any>>;
}

async function getTheatreVendorSchedules(baseUrl: string, cmpAppKey: string, detail: Record<string, any>) {
  if (!detail.programKey) return [{ id: detail.id, playTime: detail.startTime, playEndTime: detail.endTime, venueName: detail.venueName }];
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/thvendor/ticket/listScheduleByDate.xhtml`);
  url.search = new URLSearchParams({ programId: String(detail.id), date: "", action: "commit" }).toString();
  const response = await fetchWithRetry(url, () => ({ headers: { cmpappkey: cmpAppKey, programkey: detail.programKey, "user-agent": "Mozilla/5.0 ClassicMusicCalendar/1.0" }, signal: AbortSignal.timeout(30_000) }));
  const data = await response.json() as Record<string, any>;
  return Array.isArray(data.data) && data.data.length ? data.data : [{ id: detail.id, playTime: detail.startTime, playEndTime: detail.endTime, venueName: detail.venueName }];
}

async function recognizeSourceImages(
  projectId: string, imageUrls: string[], localOcr: LocalOcr,
  parser: (text: string, confidence?: ProgramItem["confidence"]) => ProgramItem[],
  options: { maxImages?: number; targetDates?: Date[] } = {},
) {
  const selected = imageUrls.slice(0, Math.max(
    1,
    options.maxImages ?? Number(process.env.OCR_MAX_IMAGES || (explicitOcr ? 8 : 3)),
  ));
  const cached = await readOcrProjectCache(projectId, selected);
  if (cached) return cached;
  const pages: OcrProgramExtraction["pages"] = [];
  for (const url of selected) {
    pages.push(await localOcr.recognizeUrl(url));
  }
  const extraction = evaluateOcrProgram(pages, (text) => parser(text, "ocr"), {
    targetDates: options.targetDates,
  });
  await writeOcrProjectCache(projectId, selected, extraction);
  return extraction;
}

async function fetchJson(url: string) {
  const response = await fetchWithRetry(url, () => ({ headers: { "user-agent": "Mozilla/5.0 ClassicMusicCalendar/1.0", accept: "application/json" }, signal: AbortSignal.timeout(30_000) }));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<Record<string, any>>;
}

async function fetchLegacyChineseText(url: string) {
  const response = await fetchWithRetry(url, () => ({ headers: { "user-agent": "Mozilla/5.0 ClassicMusicCalendar/1.0" }, signal: AbortSignal.timeout(30_000) }));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new TextDecoder("gb18030").decode(await response.arrayBuffer());
}

function parseIcalChinaDate(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!match) throw new Error(`Invalid iCalendar date: ${value}`);
  return parseChinaDate(`${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:00`);
}

function absolutizeImages(urls: string[], baseUrl: string) { return urls.map((url) => new URL(url, baseUrl).href); }

async function fetchText(url: string) {
  const response = await fetchWithRetry(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36 ClassicMusicCalendar/1.0",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
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

  return registerProgramEvidence({
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
    ticketStatus: raw.saleType === "sale" && raw.status === "Y" && raw.closed !== "Y" ? "on-sale" : undefined,
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
  }, `${raw.programInfo || ""}\n${raw.showContent || ""}`);
}

function normalizeOrientalArtCenterEvent(
  projectId: string,
  detail: Record<string, any>,
  show: Record<string, any>,
  allShows: Array<Record<string, any>>,
  source: Extract<SourceConfig, { adapter: "shoac-api" }>,
  scrapedAt: string,
  ocrExtraction?: OcrProgramExtraction,
): ConcertEvent {
  const title = cleanText(detail.productName || "未命名演出");
  const start = orientalArtCenterShowDate(show);
  const labels = formatChinaDateLabels(start);
  const parsed = parseOrientalArtCenterContent(detail.projectDesp || detail.showDesc || "", {
    showDate: start,
  });
  const ocrProgram = parsed.program.length || !ocrExtraction?.accepted
    ? []
    : ocrExtraction.programSections.length
      ? selectOcrProgramForDate(ocrExtraction, start)
      : parseOrientalArtCenterOcrText(ocrExtraction.rawText, { showDate: start });
  const inferredComposers = inferComposers(title);
  const program = parsed.program.length ? parsed.program : ocrProgram;
  const composers = Array.from(
    new Set([...inferredComposers, ...program.map((item) => item.composer).filter(Boolean)]),
  ) as string[];
  const performers = parsed.performers;
  const pricing = parseOrientalArtCenterPrices(allShows, detail);
  const detailUrl = `https://www.shoac.com.cn/#/detail?projectId=${projectId}`;
  const showStatus = cleanText(show.showStatusName || "");

  return registerProgramEvidence({
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
    dataQuality: parsed.program.length ? "scraped" : program.length ? "ocr-assisted" : "needs-review",
    extraction: !parsed.program.length && ocrExtraction
      ? {
          method: "ocr",
          provider: ocrExtraction.provider,
          confidence: ocrExtraction.confidence,
          imageCount: ocrExtraction.imageCount,
          accepted: Boolean(ocrProgram.length && ocrExtraction.accepted),
          reasons: ocrProgram.length
            ? []
            : ocrExtraction.accepted
              ? ["当前场次未匹配到可确认的节目单"]
              : ocrExtraction.reasons,
          reviewRequired: true,
        }
      : undefined,
  }, detail.projectDesp || detail.showDesc || "");
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
  const names = Array.from(title.matchAll(/([\u4e00-\u9fa5·]{2,8})[与和]/g))
    .map((match) => stripPerformanceForceSuffix(match[1]))
    .filter((name) => name.length >= 2)
    .filter((name) => !/的$/.test(name))
    .filter((name) => !/^(?:钢琴|小提琴|中提琴|大提琴|长笛|双簧管|单簧管|管风琴|乐团|合唱团|乐圣|师徒|芭比)$/.test(name));
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

function parseFlexibleChinaDate(value: string) {
  const normalized = value
    .replace(/星期[一二三四五六日天]/g, "")
    .replace(/年/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, " ")
    .replace(/\s*([./-])\s*/g, "$1");
  const match = normalized.match(
    /(20\d{2})-(\d{1,2})-(\d{1,2}).*?(\d{1,2}):(\d{2})/,
  );
  if (!match) return undefined;
  return parseChinaDate(
    `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(
      2,
      "0",
    )} ${String(Number(match[4])).padStart(2, "0")}:${match[5]}:00`,
  );
}

function splitVenueAndHall(value: string, fallbackVenue: string) {
  const normalized = cleanText(value || fallbackVenue)
    .replace(/\s*-\s*/g, "·")
    .replace(/•/g, "·");
  const knownHall = normalized.match(
    /^(国家大剧院|北京艺术中心|上海东方艺术中心|捷豹上海交响音乐厅|上海交响音乐厅|苏州文化艺术中心)·?(音乐厅|歌剧院|戏剧场|小剧场|主厅|演奏厅|金鸡湖音乐厅)$/,
  );
  if (knownHall) return { venue: knownHall[1], hall: knownHall[2] };

  const separated = normalized.match(/^(.+?)·(音乐厅|歌剧院|戏剧场|小剧场|主厅|演奏厅)$/);
  if (separated) return { venue: separated[1], hall: separated[2] };
  return { venue: normalized || fallbackVenue, hall: undefined };
}

function isBeijingVenue(value: string) {
  return /北京|国家大剧院|中央歌剧院|中山公园音乐堂|保利剧院|中央音乐学院|清华大学|北京大学|Beijing|National Centre for the Performing Arts|\bNCPA\b|Central Conservatory|Tsinghua|Peking University|Poly Theatre/i.test(
    value,
  );
}

function priceLabel(prices: number[]) {
  if (!prices.length) return undefined;
  if (prices.length === 1) return `¥${prices[0]}`;
  return `¥${prices[0]} - ¥${prices.at(-1)}`;
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

async function createConfiguredOcr() {
  return visionAiConfig
    ? createHybridOcr(ocrCacheDir, visionAiConfig)
    : createLocalTesseract(ocrCacheDir);
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
