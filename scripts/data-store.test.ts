import assert from "node:assert/strict";
import type { ConcertDataset, ConcertEvent } from "../src/types";
import {
  buildChanges,
  buildEntities,
  buildIndex,
  mergeCrossSourceEvents,
  restoreFailedSourceEvents,
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
assert.equal("description" in index.events[0], false);

const entities = buildEntities(dataset);
assert.equal(entities.entities.some((entity) => entity.type === "person" && entity.name === "余隆"), true);
assert.equal(entities.entities.some((entity) => entity.type === "work" && entity.name === "C小调第五交响曲"), true);

const nextDataset: ConcertDataset = {
  ...dataset,
  generatedAt: "2026-07-30T00:00:00.000Z",
  events: [{ ...merged[0], price: "¥100 - ¥680" }],
};
assert.deepEqual(buildChanges(dataset, nextDataset).changes.map((item) => item.type), ["price"]);

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
