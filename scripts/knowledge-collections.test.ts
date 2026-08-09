import assert from "node:assert/strict";
import { buildKnowledgeCollections, isKnowledgeCollectionKey } from "../src/knowledge/collections";
import type { KnowledgeIndex } from "../src/knowledge/types";
import type { ConcertEventSummary } from "../src/types";

const event = (id: string, price: string): ConcertEventSummary => ({
  id,
  title: id,
  city: "上海",
  venue: "测试音乐厅",
  startTime: "2026-09-01T19:30:00+08:00",
  weekday: "周二",
  dateLabel: "09/01",
  timeLabel: "19:30",
  price,
  status: "scheduled",
  genres: ["古典音乐"],
  dataQuality: "scraped",
  detailPath: `data/events/${id}.json`,
  hasProgram: true,
  programPreview: [],
  searchText: id,
  sourceCount: 1,
});

const work = (id: string, genreFamily: "orchestral" | "concerto", eventId: string) => ({
  id,
  composerId: "composer_1",
  composerName: "测试作曲家",
  title: id,
  aliases: [],
  genre: genreFamily === "orchestral" ? "交响曲" : "协奏曲",
  periodKey: "romantic" as const,
  genreFamily,
  difficulty: "第一次听" as const,
  tags: [],
  summary: "测试作品",
  upcomingEventIds: [eventId],
  upcomingEventCount: 1,
});

const index: KnowledgeIndex = {
  schemaVersion: 1,
  generatedAt: "2026-08-09T00:00:00+08:00",
  composers: [],
  works: [work("work_a", "orchestral", "event_a"), work("work_b", "concerto", "event_b")],
};

const collections = buildKnowledgeCollections(index, [event("event_a", "¥80 - ¥280"), event("event_b", "¥380")]);
assert.ok(collections.find((item) => item.key === "live-classics")?.works.length === 2);
assert.ok(collections.find((item) => item.key === "first-listen")?.works.length === 2);
assert.deepEqual(collections.find((item) => item.key === "orchestral-stage")?.events.map((item) => item.id), ["event_a"]);
assert.deepEqual(collections.find((item) => item.key === "concerto-focus")?.events.map((item) => item.id), ["event_b"]);
assert.deepEqual(collections.find((item) => item.key === "budget-classics")?.events.map((item) => item.id), ["event_a"]);
assert.equal(isKnowledgeCollectionKey("first-listen"), true);
assert.equal(isKnowledgeCollectionKey("unknown"), false);

console.log("Knowledge collection tests passed.");
