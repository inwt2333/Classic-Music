import assert from "node:assert/strict";
import type { ConcertDataset, ConcertEvent } from "../src/types";
import {
  buildChanges,
  buildChangeEventSnapshot,
  buildEntities,
  buildIndex,
  mergeChangeHistory,
  mergeCrossSourceEvents,
  normalizeKnownSourceEvent,
  normalizeProgramItemCredits,
  preserveTrustedPreviousPrograms,
  restoreFailedSourceEvents,
  restoreUnavailableSourceEvents,
  sanitizeKnownSourceProgram,
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

const numberedWorks = mergeCrossSourceEvents([{
  ...baseEvent,
  id: "numbered-works",
  program: [
    { title: "夜的钢琴曲五", confidence: "official" },
    { title: "夜的钢琴曲六", confidence: "official" },
  ],
}], sources);
assert.deepEqual(numberedWorks[0].program.map((item) => item.title), ["夜的钢琴曲五", "夜的钢琴曲六"]);

const sharedAlternateArias = mergeCrossSourceEvents([{
  ...baseEvent,
  id: "shared-alternate-arias",
  program: [
    { composer: "朱塞佩·威尔第", title: "女儿！我的父亲！……啊，姑娘，请守护这朵花", alternateTitles: ["from Rigoletto"], confidence: "ocr" },
    { composer: "朱塞佩·威尔第", title: "那可恶的老东西诅咒我……", alternateTitles: ["from Rigoletto"], confidence: "ocr" },
    { composer: "沃尔夫冈·莫扎特", title: "第一小提琴协奏曲", alternateTitles: ["Wolfgang Mozart", "Violin Concerto No. 1"], confidence: "ocr" },
    { composer: "沃尔夫冈·莫扎特", title: "单簧管协奏曲", alternateTitles: ["Wolfgang Mozart", "Clarinet Concerto"], confidence: "ocr" },
  ],
}], sources);
assert.equal(sharedAlternateArias[0].program.length, 4);
assert.deepEqual(
  sharedAlternateArias[0].program.map((item) => item.title),
  ["女儿！我的父亲！……啊，姑娘，请守护这朵花", "那可恶的老东西诅咒我……", "第一小提琴协奏曲", "单簧管协奏曲"],
);

const mainTitleVersusAlternateStillMerges = mergeCrossSourceEvents(
  [
    { ...baseEvent, id: "alt-main-a", program: [{ composer: "里亚多夫", title: "魔湖", confidence: "official" }] },
    { ...baseEvent, id: "alt-main-b", program: [{ composer: "里亚多夫", title: "The Enchanted Lake", alternateTitles: ["魔湖"], confidence: "official" }] },
  ],
  sources,
);
assert.equal(mainTitleVersusAlternateStillMerges.length, 1);
assert.equal(mainTitleVersusAlternateStillMerges[0].program.length, 1);

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

const degradedOcrEvent: ConcertEvent = {
  ...ocrEvent,
  program: [],
  composers: [],
  tags: ["交响"],
  dataQuality: "needs-review",
  extraction: {
    method: "ocr",
    provider: "tesseract",
    confidence: 82,
    accepted: false,
    reviewRequired: true,
  },
};
const preservedOcr = preserveTrustedPreviousPrograms([degradedOcrEvent], [{
  ...ocrEvent,
  extraction: { ...ocrEvent.extraction!, accepted: true },
}]);
assert.equal(preservedOcr[0].program.length, 1);
assert.equal(preservedOcr[0].extraction?.provider, "tesseract");
assert.equal(preservedOcr[0].extraction?.accepted, true);
assert.deepEqual(preservedOcr[0].composers, ["贝多芬"]);

const rejectedOcr = preserveTrustedPreviousPrograms([degradedOcrEvent], [ocrEvent]);
assert.equal(rejectedOcr[0].program.length, 0);

const freshProgram = preserveTrustedPreviousPrograms([baseEvent], [{
  ...baseEvent,
  program: [{ composer: "贝多芬", title: "第七交响曲", confidence: "official" }],
}]);
assert.equal(freshProgram[0].program[0].title, "C小调第五交响曲");

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

const sanitizedNcpa = sanitizeKnownSourceProgram({
  ...baseEvent,
  sourceName: "国家大剧院官网",
  program: [
    ...baseEvent.program,
    { composer: "贝多芬", title: "注：本场将省略其中一个乐章。", confidence: "official" },
  ],
});
assert.equal(sanitizedNcpa.program.length, 1);
assert.deepEqual(sanitizedNcpa.composers, ["贝多芬"]);

const sanitizedPersonnel = sanitizeKnownSourceProgram({
  ...baseEvent,
  sourceName: "深圳音乐厅官网",
  composers: ["演出", "伴奏"],
  tags: ["演出", "伴奏", "合唱"],
  program: [
    { composer: "演出", title: "某童声合唱团", confidence: "official" },
    { composer: "伴奏", title: "某钢琴家", confidence: "official" },
  ],
});
assert.deepEqual(sanitizedPersonnel.program, []);
assert.deepEqual(sanitizedPersonnel.composers, []);
assert.deepEqual(sanitizedPersonnel.tags, ["合唱"]);
assert.equal(sanitizedPersonnel.dataQuality, "needs-review");

const sanitizedXinghai = sanitizeKnownSourceProgram({
  ...baseEvent,
  sourceName: "星海音乐厅官网",
  composers: ["如果有，那一定少不了石进的", "推荐演出"],
  program: [
    {
      composer: "如果有，那一定少不了石进的",
      title: "夜的钢琴曲五，这首旋律没有华丽的技巧，却凭借纯粹的温柔成为许多人的深夜陪伴。",
      confidence: "official",
    },
    { composer: "推荐演出", title: "四季[2026-11-13 20:00]", confidence: "official" },
  ],
});
assert.deepEqual(sanitizedXinghai.program, []);

const normalizedXinghaiVenue = normalizeKnownSourceEvent({
  ...baseEvent,
  title: "广州交响乐团音乐会---星海音乐厅",
  venue: "交响乐演奏大厅",
  hall: undefined,
  sourceName: "广州交响乐团官网",
  sourceUrl: "https://www.concerthall.com.cn/events/neweventdetail.php?id=5083",
});
assert.equal(normalizedXinghaiVenue.title, "广州交响乐团音乐会");
assert.equal(normalizedXinghaiVenue.venue, "星海音乐厅");
assert.equal(normalizedXinghaiVenue.hall, "交响乐演奏大厅");

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
const personnelOnlyDataset: ConcertDataset = {
  ...dataset,
  generatedAt: "2026-07-30T01:00:00.000Z",
  events: [{ ...merged[0], performers: ["OCR 识别出的另一位演奏者"] }],
};
assert.deepEqual(buildChanges(dataset, personnelOnlyDataset).changes, []);
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
assert.deepEqual(buildChanges(dataset, creditChangeDataset).changes, []);

const distinctOperaExcerpts = mergeCrossSourceEvents([{
  ...baseEvent,
  program: [
    { composer: "罗西尼", title: "序曲选自《塞维利亚的理发师》", confidence: "official" },
    { composer: "罗西尼", title: "快给大忙人让路选自《塞维利亚的理发师》", confidence: "official" },
  ],
}], sources);
assert.equal(distinctOperaExcerpts[0].program.length, 2);

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

const creditLayoutBefore: ConcertDataset = {
  ...formattingOnlyBefore,
  events: [{
    ...formattingOnlyBefore.events[0],
    program: [{
      title: "合奏红色娘子军组曲 集体 创作",
      confidence: "official",
    }],
  }],
};
const creditLayoutAfter: ConcertDataset = {
  ...formattingOnlyAfter,
  events: [{
    ...formattingOnlyAfter.events[0],
    program: [{
      title: "合奏红色娘子军组曲；",
      credits: [{ name: "集体", role: "（创作）" }],
      confidence: "official",
    }],
  }],
};
assert.deepEqual(buildChanges(creditLayoutBefore, creditLayoutAfter).changes, []);

const substantiveProgramChange: ConcertDataset = {
  ...formattingOnlyAfter,
  events: [{
    ...formattingOnlyAfter.events[0],
    program: [{ ...formattingOnlyAfter.events[0].program[0], title: "蒂尔·艾伦施皮格尔的恶作剧, Op.29" }],
  }],
};
assert.deepEqual(
  buildChanges(formattingOnlyBefore, substantiveProgramChange).changes.map((item) => item.type),
  [],
);
const bilingualPeople = buildEntities({
  ...dataset,
  events: [
    { ...merged[0], id: "cai-zh", conductor: undefined, performers: ["蔡珂宜"] },
    { ...merged[0], id: "cai-bilingual", conductor: undefined, performers: ["小提琴：蔡珂宜 Chloe Chua", "新加坡交响乐团 Singapore Symphony Orchestra"] },
  ],
});
const caiKeyiEntity = bilingualPeople.entities.find((entity) => entity.type === "person" && entity.name === "蔡珂宜");
assert.deepEqual(caiKeyiEntity?.eventIds.sort(), ["cai-bilingual", "cai-zh"]);
assert.ok(caiKeyiEntity?.aliases.includes("Chloe Chua"));
assert.equal(bilingualPeople.entities.filter((entity) => entity.type === "person" && entity.name.includes("蔡珂宜")).length, 1);
assert.equal(bilingualPeople.entities.some((entity) => entity.type === "person" && entity.name.includes("新加坡交响乐团")), false);

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
  [],
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

const creditLayoutHistoryChange = {
  id: "credit-layout-only-program-change",
  eventId: merged[0].id,
  type: "program" as const,
  detectedAt: "2026-07-30T00:00:00.000Z",
  summary: "节目单变化",
  before: buildChangeEventSnapshot(creditLayoutBefore.events[0]),
  after: buildChangeEventSnapshot(creditLayoutAfter.events[0]),
};
const cleanedCreditLayoutHistory = mergeChangeHistory({
  schemaVersion: 2,
  generatedAt: creditLayoutHistoryChange.detectedAt,
  latestChangeIds: [creditLayoutHistoryChange.id],
  runs: [{ generatedAt: creditLayoutHistoryChange.detectedAt, changeIds: [creditLayoutHistoryChange.id] }],
  changes: [creditLayoutHistoryChange],
}, { generatedAt: "2026-08-01T00:00:00.000Z", changes: [] });
assert.deepEqual(cleanedCreditLayoutHistory.changes, []);

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
assert.deepEqual(changeHistory.changes.map((item) => item.id), [priceChanges.changes[0].id]);
assert.equal(changeHistory.runs?.length, 1);
assert.equal(mergeChangeHistory(changeHistory, priceChanges).changes.length, 1);

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

const harbinSource = {
  id: "harbin-music-hall-maitix",
  name: "哈尔滨音乐厅票务（麦座）",
  url: "https://hrbso.maitix.com/h5",
  ok: true,
  eventCount: 0,
};
const previousHarbinDataset: ConcertDataset = {
  ...dataset,
  sources: [harbinSource],
  events: [{
    ...baseEvent,
    id: "previous-harbin-event",
    title: "四重奏回响：贝多芬与舒曼",
    city: "哈尔滨",
    venue: "哈尔滨音乐厅",
    startTime: "2026-09-20T11:00:00.000Z",
    sourceName: harbinSource.name,
    sourceUrl: harbinSource.url,
    sources: [{
      sourceId: harbinSource.id,
      sourceName: harbinSource.name,
      sourceRecordId: "harbin-event-1",
      sourceUrl: harbinSource.url,
      scrapedAt: "2026-08-08T00:00:00.000Z",
    }],
  }],
};
const retainedHarbin = restoreUnavailableSourceEvents({
  ...previousHarbinDataset,
  events: [],
  sources: [harbinSource],
}, previousHarbinDataset, [harbinSource.id], new Date("2026-08-09T00:00:00.000Z").getTime());
assert.equal(retainedHarbin.events.length, 1);
assert.equal(retainedHarbin.sources[0].eventCount, 1);
assert.match(retainedHarbin.sources[0].message || "", /此前已发现/);

const noDuplicateHarbin = restoreUnavailableSourceEvents({
  ...previousHarbinDataset,
  events: [{ ...previousHarbinDataset.events[0], id: "fresh-harbin-event", sources: undefined }],
  sources: [{ ...harbinSource, eventCount: 1 }],
}, previousHarbinDataset, [harbinSource.id], new Date("2026-08-09T00:00:00.000Z").getTime());
assert.equal(noDuplicateHarbin.events.length, 1);
assert.equal(noDuplicateHarbin.sources[0].eventCount, 1);

console.log("Data store tests passed.");
