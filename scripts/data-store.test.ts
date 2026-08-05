import assert from "node:assert/strict";
import type { ConcertDataset, ConcertEvent } from "../src/types";
import {
  buildChanges,
  buildChangeEventSnapshot,
  buildEntities,
  buildIndex,
  mergeChangeHistory,
  mergeCrossSourceEvents,
  normalizeProgramItemCredits,
  restoreFailedSourceEvents,
  toPublishedDataset,
} from "./data-store";

const baseEvent: ConcertEvent = {
  id: "source-a-1",
  title: "余隆与上海交响乐团演绎贝多芬第五交响曲",
  city: "上海",
  venue: "捷豹上海交响音乐厅",
  hall: "主厅",
  startTime: "2026-09-11T11:30:00.000Z",
  weekday: "周五",
  dateLabel: "09/11",
  timeLabel: "19:30",
  price: "¥80 - ¥580",
  priceTiers: [80, 180, 380, 580],
  status: "scheduled",
  ticketUrl: "https://example.com/a",
  sourceName: "来源 A",
  sourceUrl: "https://example.com/a",
  scrapedAt: "2026-07-29T00:00:00.000Z",
  ensemble: "上海交响乐团",
  conductor: "余隆",
  performers: ["余隆"],
  composers: ["贝多芬"],
  program: [{
    composer: "贝多芬",
    title: "C小调第五交响曲",
    alternateTitles: ["Symphony No. 5 in C Minor"],
    opus: "Op.67",
    confidence: "official",
  }],
  tags: ["贝多芬", "交响"],
  dataQuality: "scraped",
};

const duplicate: ConcertEvent = {
  ...baseEvent,
  id: "source-b-9",
  title: "余隆与上海交响乐团演绎贝多芬第五交响曲",
  sourceName: "来源 B",
  sourceUrl: "https://example.com/b",
  ticketUrl: "https://example.com/b",
  description: "来自场馆官网的完整演出简介。",
};

const sources: ConcertDataset["sources"] = [
  { id: "source-a", name: "来源 A", url: "https://example.com/a", ok: true, eventCount: 1 },
  { id: "source-b", name: "来源 B", url: "https://example.com/b", ok: true, eventCount: 1 },
];

const merged = mergeCrossSourceEvents([baseEvent, duplicate], sources);
assert.equal(merged.length, 1);
assert.match(merged[0].id, /^perf_[a-f0-9]{16}$/);
assert.match(merged[0].projectId || "", /^event_[a-f0-9]{16}$/);
assert.equal(merged[0].sources?.length, 2);
assert.equal(merged[0].description, duplicate.description);
assert.equal(merged[0].program[0].workId?.startsWith("work_"), true);

const stableAgain = mergeCrossSourceEvents([duplicate, baseEvent], sources);
assert.equal(stableAgain[0].id, merged[0].id);

const unrelated = mergeCrossSourceEvents([
  baseEvent,
  { ...duplicate, id: "other", title: "同日另一场完全不同的室内乐音乐会" },
], sources);
assert.equal(unrelated.length, 2);

const ncpaListing: ConcertEvent = {
  ...baseEvent,
  id: "ncpa-1",
  title: "2026漫步经典闭幕：“少年的号角”俞峰、李晶晶与国家大剧院管弦乐团演绎马勒第四交响曲音乐会",
  venue: "国家大剧院",
  hall: "音乐厅",
  conductor: "俞峰",
  performers: ["李晶晶"],
  composers: ["马勒"],
  program: [{ composer: "马勒", title: "G大调第四号交响曲", confidence: "official" }],
};
const orchestraListing: ConcertEvent = {
  ...ncpaListing,
  id: "orchestra-1",
  title: "“少年的号角”俞峰、李晶晶与国家大剧院管弦乐团音乐会",
  venue: "国家大剧院音乐厅",
  hall: undefined,
  sourceName: "来源 B",
  sourceUrl: "https://example.com/orchestra",
  program: [{
    composer: "马勒",
    title: "G大调第四交响曲，作品第四号",
    alternateTitles: ["Mahler: Symphony No. 4 in G Major"],
    confidence: "official",
  }],
};
const crossSourceDuplicate = mergeCrossSourceEvents([ncpaListing, orchestraListing], sources);
assert.equal(crossSourceDuplicate.length, 1);
assert.equal(crossSourceDuplicate[0].sources?.length, 2);
assert.equal(crossSourceDuplicate[0].program.length, 1);

const sameHallDifferentConcert = mergeCrossSourceEvents([
  ncpaListing,
  {
    ...orchestraListing,
    id: "different-program",
    title: "另一场贝多芬室内乐音乐会",
    conductor: "另一位指挥",
    performers: ["另一位独奏家"],
    composers: ["贝多芬"],
    program: [{ composer: "贝多芬", title: "第七交响曲", confidence: "official" }],
  },
], sources);
assert.equal(sameHallDifferentConcert.length, 2);

const ocrEvent: ConcertEvent = {
  ...baseEvent,
  id: "ocr-event",
  program: [{
    composer: "贝多芬",
    title: "第五交响曲",
    confidence: "ocr",
  }],
  dataQuality: "ocr-assisted",
  extraction: {
    method: "ocr",
    provider: "tesseract",
    confidence: 88,
    imageCount: 1,
    reviewRequired: true,
  },
};
const mergedOcr = mergeCrossSourceEvents([ocrEvent], sources);
assert.equal(mergedOcr[0].dataQuality, "ocr-assisted");
assert.equal(mergedOcr[0].extraction?.confidence, 88);

const officialAndOcr = mergeCrossSourceEvents(
  [
    ocrEvent,
    {
      ...baseEvent,
      id: "official-event",
      program: [{
        composer: "贝多芬",
        title: "第五交响曲",
        confidence: "official",
      }],
    },
  ],
  sources,
);
assert.equal(officialAndOcr.length, 1);
assert.equal(officialAndOcr[0].dataQuality, "scraped");
assert.equal(officialAndOcr[0].extraction, undefined);

const dataset: ConcertDataset = {
  schemaVersion: 2,
  generatedAt: "2026-07-29T00:00:00.000Z",
  city: "上海",
  events: merged,
  sources,
  stats: { rawEvents: 2, normalizedEvents: 1, aiEnhancedEvents: 0, errors: [] },
};
const index = buildIndex(dataset);
assert.equal(index.events.length, 1);
assert.equal(index.events[0].hasProgram, true);
assert.equal(index.events[0].programPreview[0].title, "C小调第五交响曲");
assert.deepEqual(index.events[0].programPreview[0].alternateTitles, ["Symphony No. 5 in C Minor"]);
assert.match(index.events[0].searchText, /symphony no\. 5 in c minor/);
assert.equal("description" in index.events[0], false);

const folkArrangement = normalizeProgramItemCredits({
  title: "青春舞曲 新疆民歌 王世光 编曲 杨鸿年 改编童声合唱 赵琳 编配钢琴四手联弹",
  confidence: "official",
});
assert.equal(folkArrangement.title, "青春舞曲");
assert.deepEqual(folkArrangement.credits, [
  { name: "新疆民歌", role: "来源" },
  { name: "王世光", role: "编曲" },
  { name: "杨鸿年", role: "改编童声合唱" },
  { name: "赵琳", role: "编配钢琴四手联弹" },
]);

const arrangedOverture = normalizeProgramItemCredits({
  composer: "莫扎特",
  title: "魔笛序曲 【德】莫扎特 曲 阿卡迪·瑟佩尔 改编",
  confidence: "official",
});
assert.equal(arrangedOverture.title, "魔笛序曲");
assert.equal(arrangedOverture.composer, "莫扎特");
assert.deepEqual(arrangedOverture.credits, [{ name: "阿卡迪·瑟佩尔", role: "改编" }]);

const entities = buildEntities(dataset);
assert.equal(entities.entities.some((entity) => entity.type === "person" && entity.name === "余隆"), true);
assert.equal(entities.entities.some((entity) => entity.type === "work" && entity.name === "C小调第五交响曲"), true);
assert.deepEqual(
  entities.entities.find((entity) => entity.type === "work" && entity.name === "C小调第五交响曲")?.aliases,
  ["Symphony No. 5 in C Minor"],
);

const publishedDataset = toPublishedDataset({
  ...dataset,
  events: [
    { ...merged[0], id: "past", startTime: "2026-01-01T11:30:00.000Z" },
    { ...merged[0], id: "future", startTime: "2026-09-11T11:30:00.000Z" },
  ],
}, new Date("2026-07-31T00:00:00.000Z").getTime());
assert.deepEqual(publishedDataset.events.map((event) => event.id), ["future"]);
assert.equal(publishedDataset.stats.normalizedEvents, 1);

const nextDataset: ConcertDataset = {
  ...dataset,
  generatedAt: "2026-07-30T00:00:00.000Z",
  events: [{ ...merged[0], price: "¥100 - ¥680" }],
};
const priceChanges = buildChanges(dataset, nextDataset);
assert.deepEqual(priceChanges.changes.map((item) => item.type), ["price"]);
assert.equal(priceChanges.changes[0].before?.price, merged[0].price);
assert.equal(priceChanges.changes[0].after?.price, "¥100 - ¥680");
assert.equal(priceChanges.changes[0].after?.programPreview.length, 1);
assert.equal(buildChangeEventSnapshot({
  ...merged[0],
  program: Array.from({ length: 12 }, (_, index) => ({ title: `Work ${index + 1}`, confidence: "official" as const })),
}).programPreview.length, 12);
const creditChangeDataset: ConcertDataset = {
  ...dataset,
  generatedAt: "2026-07-31T00:00:00.000Z",
  events: [{
    ...merged[0],
    program: [{ ...merged[0].program[0], credits: [{ name: "Test Arranger", role: "改编" }] }],
  }],
};
assert.deepEqual(buildChanges(dataset, creditChangeDataset).changes.map((item) => item.type), ["program"]);

const formattingOnlyBefore: ConcertDataset = {
  ...dataset,
  events: [{
    ...merged[0],
    program: [{
      composer: "理查德 · 施特劳斯",
      title: "《蒂尔·艾伦施皮格尔的恶作剧》，Op. 28",
      opus: "Op. 28",
      alternateTitles: ["Till Eulenspiegel's Merry Pranks", "Till Eulenspiegels lustige Streiche"],
      credits: [{ name: "理查德·施特劳斯", role: "作 曲" }],
      movements: [{ number: "Ⅰ.", title: "Sehr lebhaft  und lustig" }],
      confidence: "ocr",
    }],
  }],
};
const formattingOnlyAfter: ConcertDataset = {
  ...formattingOnlyBefore,
  generatedAt: "2026-08-01T00:00:00.000Z",
  events: [{
    ...formattingOnlyBefore.events[0],
    program: [{
      composer: "理查德·施特劳斯",
      title: "蒂尔·艾伦施皮格尔的恶作剧, Op.28",
      opus: "Op.28",
      alternateTitles: ["Till Eulenspiegels lustige Streiche", "Till Eulenspiegels Merry Pranks"],
      credits: [{ name: "理查德 · 施特劳斯", role: "作曲" }],
      movements: [{ number: "I", title: "Sehr lebhaft und lustig" }],
      confidence: "official",
    }],
  }],
};
assert.deepEqual(buildChanges(formattingOnlyBefore, formattingOnlyAfter).changes, []);

const substantiveProgramChange: ConcertDataset = {
  ...formattingOnlyAfter,
  events: [{
    ...formattingOnlyAfter.events[0],
    program: [{ ...formattingOnlyAfter.events[0].program[0], title: "蒂尔·艾伦施皮格尔的恶作剧, Op.29" }],
  }],
};
assert.deepEqual(
  buildChanges(formattingOnlyBefore, substantiveProgramChange).changes.map((item) => item.type),
  ["program"],
);

const numericRangeChange: ConcertDataset = {
  ...formattingOnlyAfter,
  events: [{
    ...formattingOnlyAfter.events[0],
    program: [{ ...formattingOnlyAfter.events[0].program[0], title: "交响曲第13乐章" }],
  }],
};
const numericRangeBefore: ConcertDataset = {
  ...formattingOnlyBefore,
  events: [{
    ...formattingOnlyBefore.events[0],
    program: [{ ...formattingOnlyBefore.events[0].program[0], title: "交响曲第1-3乐章" }],
  }],
};
assert.deepEqual(
  buildChanges(numericRangeBefore, numericRangeChange).changes.map((item) => item.type),
  ["program"],
);

const formattingOnlyHistoryChange = {
  id: "formatting-only-program-change",
  eventId: merged[0].id,
  type: "program" as const,
  detectedAt: "2026-07-30T00:00:00.000Z",
  summary: "节目单变化",
  before: buildChangeEventSnapshot(formattingOnlyBefore.events[0]),
  after: buildChangeEventSnapshot(formattingOnlyAfter.events[0]),
};
const cleanedFormattingHistory = mergeChangeHistory({
  schemaVersion: 2,
  generatedAt: formattingOnlyHistoryChange.detectedAt,
  latestChangeIds: [formattingOnlyHistoryChange.id],
  runs: [{ generatedAt: formattingOnlyHistoryChange.detectedAt, changeIds: [formattingOnlyHistoryChange.id] }],
  changes: [formattingOnlyHistoryChange],
}, { generatedAt: "2026-08-01T00:00:00.000Z", changes: [] });
assert.deepEqual(cleanedFormattingHistory.changes, []);
assert.deepEqual(cleanedFormattingHistory.runs?.[1]?.changeIds, []);

const rescheduledDataset: ConcertDataset = {
  ...dataset,
  generatedAt: "2026-08-01T00:00:00.000Z",
  events: [{
    ...merged[0],
    id: "new-performance-id",
    startTime: "2026-09-12T11:30:00.000Z",
  }],
};
const rescheduledChanges = buildChanges(dataset, rescheduledDataset).changes;
assert.deepEqual(rescheduledChanges.map((item) => item.type), ["rescheduled"]);
assert.equal(rescheduledChanges[0].before?.startTime, merged[0].startTime);
assert.equal(rescheduledChanges[0].after?.startTime, "2026-09-12T11:30:00.000Z");

const legacyHistory = {
  generatedAt: "2026-07-29T12:00:00.000Z",
  changes: [{
    id: "legacy-change",
    eventId: merged[0].id,
    type: "program" as const,
    detectedAt: "2026-07-29T12:00:00.000Z",
    summary: "节目单变化",
  }],
};
const changeHistory = mergeChangeHistory(legacyHistory, priceChanges);
assert.equal(changeHistory.schemaVersion, 2);
assert.deepEqual(changeHistory.latestChangeIds, [priceChanges.changes[0].id]);
assert.deepEqual(changeHistory.changes.map((item) => item.id), [priceChanges.changes[0].id, "legacy-change"]);
assert.equal(changeHistory.runs?.length, 2);
assert.equal(mergeChangeHistory(changeHistory, priceChanges).changes.length, 2);

const failedDataset: ConcertDataset = {
  ...nextDataset,
  events: [],
  sources: sources.map((source) =>
    source.id === "source-a" ? { ...source, ok: false, eventCount: 0, message: "timeout" } : source,
  ),
  stats: { ...nextDataset.stats, errors: ["来源 A: timeout"] },
};
assert.equal(buildChanges(dataset, failedDataset).changes.some((item) => item.type === "removed"), false);

const recoveredDataset = restoreFailedSourceEvents(failedDataset, dataset);
assert.equal(recoveredDataset.events.length, 1);
assert.equal(recoveredDataset.sources.find((source) => source.id === "source-a")?.eventCount, 1);
assert.equal(recoveredDataset.sources.find((source) => source.id === "source-a")?.ok, false);
assert.deepEqual(
  recoveredDataset.events[0].sources?.map((source) => source.sourceId),
  ["source-a"],
);

const recoveredMerged = mergeCrossSourceEvents(recoveredDataset.events, recoveredDataset.sources);
assert.equal(recoveredMerged.length, 1);
assert.equal(recoveredMerged[0].dateLabel, "09/11");
assert.equal(recoveredMerged[0].weekday, "周五");
assert.equal(recoveredMerged[0].timeLabel, "19:30");
assert.deepEqual(
  recoveredMerged[0].sources?.map((source) => source.sourceId),
  ["source-a"],
);

console.log("Data store tests passed.");
