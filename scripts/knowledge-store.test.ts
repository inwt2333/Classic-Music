import assert from "node:assert/strict";
import { resolve } from "node:path";
import type { ConcertDataset, ProgramItem } from "../src/types";
import {
  loadKnowledgeRegistry,
  mapProgramItemToKnowledge,
  prepareKnowledge,
} from "./knowledge-store";
import { classifyKnowledgeGenre, classifyKnowledgePeriod } from "../src/knowledge/taxonomy";

async function main() {
const root = resolve(process.cwd());
const registry = await loadKnowledgeRegistry(root);

assert.ok(registry.composers.length >= 12);
assert.ok(registry.works.length >= 36);
assert.ok(registry.mappings.length >= 36);
assert.equal(registry.works.some((work) => work.id === "work_000001"), true);

const official: ProgramItem = {
  composer: "贝多芬",
  title: "C小调第五交响曲",
  opus: "Op.67",
  confidence: "official",
};
const mapped = mapProgramItemToKnowledge(official, registry);
assert.equal(mapped.knowledgeWorkId, "work_000001");
assert.equal(mapped.knowledgeMapping?.ruleId, "mapping_beethoven_5_zh");

assert.equal(mapProgramItemToKnowledge({
  composer: "Ludwig van Beethoven",
  title: "Symphony No. 5 in C Minor",
  opus: "Opus 67",
  confidence: "manual",
}, registry).knowledgeWorkId, "work_000001");

assert.equal(mapProgramItemToKnowledge({
  composer: "贝多芬",
  title: "命运交响曲",
  confidence: "official",
}, registry).knowledgeWorkId, "work_000001");

for (const confidence of ["ocr", "ai", "title-inferred"] as const) {
  assert.deepEqual(mapProgramItemToKnowledge({ ...official, confidence }, registry), {});
}
assert.deepEqual(mapProgramItemToKnowledge({
  composer: "贝多芬",
  title: "第七交响曲",
  confidence: "official",
}, registry), {});
assert.deepEqual(mapProgramItemToKnowledge({
  composer: "马勒",
  title: "第五交响曲",
  confidence: "official",
}, registry), {});
assert.equal(mapProgramItemToKnowledge({
  composer: "柴科夫斯基",
  title: "第一号钢琴协奏曲",
  confidence: "official",
}, registry).knowledgeWorkId, "work_000017");
assert.equal(mapProgramItemToKnowledge({
  composer: "约翰内斯·勃拉姆斯",
  title: "D小调第一钢琴协奏曲",
  opus: "Op.15",
  confidence: "official",
}, registry).knowledgeWorkId, "work_000026");
assert.equal(mapProgramItemToKnowledge({
  composer: "门德尔松",
  title: "《仲夏夜之梦》组曲",
  confidence: "manual",
}, registry).knowledgeWorkId, "work_000029");
assert.equal(mapProgramItemToKnowledge({
  composer: "肖斯塔科维奇",
  title: "f小调第一交响曲，作品10",
  opus: "作品10",
  confidence: "official",
}, registry).knowledgeWorkId, "work_auto_51ce39034f97cc91");

const eventId = "perf_0000000000000001";
const dataset: ConcertDataset = {
  schemaVersion: 2,
  generatedAt: "2026-08-07T00:00:00.000Z",
  city: "全国",
  events: [{
    id: eventId,
    title: "贝多芬第五交响曲",
    city: "上海",
    venue: "测试音乐厅",
    startTime: "2026-09-01T11:30:00.000Z",
    weekday: "周二",
    dateLabel: "09/01",
    timeLabel: "19:30",
    status: "scheduled",
    sourceName: "测试来源",
    sourceUrl: "https://example.com/event",
    scrapedAt: "2026-08-07T00:00:00.000Z",
    performers: [],
    composers: ["贝多芬"],
    program: [{ ...official, knowledgeWorkId: "work_000001" }],
    tags: [],
    dataQuality: "scraped",
  }],
  sources: [],
  stats: { rawEvents: 1, normalizedEvents: 1, aiEnhancedEvents: 0, errors: [] },
};

const prepared = prepareKnowledge(registry, dataset);
assert.equal(prepared.works.length, registry.works.filter((work) => work.status === "published").length);
assert.equal(prepared.composers.length, registry.composers.filter((composer) => composer.status === "published").length);
assert.deepEqual(prepared.works.find((work) => work.id === "work_000001")?.upcomingEventIds, [eventId]);
assert.equal(prepared.index.works.find((work) => work.id === "work_000001")?.upcomingEventCount, 1);
assert.equal(prepared.composers.find((composer) => composer.id === "composer_000001")?.works.length, 3);
assert.deepEqual(prepared.composers.find((composer) => composer.id === "composer_000001")?.upcomingEventIds, [eventId]);
assert.equal(prepared.index.composers.find((composer) => composer.id === "composer_000001")?.workCount, 3);
assert.equal(prepared.index.composers.find((composer) => composer.id === "composer_000001")?.periodKey, "classical");
assert.equal(prepared.index.works.find((work) => work.id === "work_000001")?.genreFamily, "orchestral");
assert.equal(prepared.index.works.find((work) => work.id === "work_000002")?.genreFamily, "orchestral");
assert.equal(prepared.index.works.find((work) => work.id === "work_000009")?.genreFamily, "solo");
assert.equal(prepared.index.works.find((work) => work.id === "work_000003")?.genreFamily, "concerto");
assert.equal(prepared.index.works.find((work) => work.id === "work_000029")?.genreFamily, "stage");
assert.equal(classifyKnowledgePeriod("二十世纪早期"), "modern");
assert.equal(classifyKnowledgePeriod("古典主义至浪漫主义过渡时期", 1797), "romantic");
assert.equal(classifyKnowledgeGenre({ title: "F 大调弦乐四重奏", genre: "弦乐四重奏", tags: [], instrumentation: undefined }), "chamber");

const empty = prepareKnowledge(registry, { ...dataset, events: [] });
assert.equal(empty.works.length, prepared.works.length);
assert.equal(empty.works.find((work) => work.id === "work_000001")?.upcomingEventCount, 0);
assert.deepEqual(empty.works.find((work) => work.id === "work_000001")?.upcomingEventIds, []);

console.log("knowledge-store tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
