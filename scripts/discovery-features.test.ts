import assert from "node:assert/strict";
import {
  buildFollowNotifications,
  detectDataIssues,
  mergeFollowNotificationHistory,
  recentChangeLabel,
  sortConcerts,
  type FollowMap,
} from "../src/discovery-features";
import type { ChangeDataset, ConcertEventSummary, DatasetChange } from "../src/types";

function summary(overrides: Partial<ConcertEventSummary>): ConcertEventSummary {
  return {
    id: "event-default",
    title: "测试音乐会",
    city: "上海",
    venue: "测试音乐厅",
    startTime: "2026-09-01T11:30:00.000Z",
    weekday: "周二",
    dateLabel: "09/01",
    timeLabel: "19:30",
    status: "scheduled",
    genres: [],
    dataQuality: "scraped",
    detailPath: "events/event-default.json",
    hasProgram: false,
    programPreview: [],
    searchText: "测试音乐会",
    sourceCount: 1,
    ...overrides,
  };
}

const events = [
  summary({ id: "unknown", price: undefined, startTime: "2026-09-01T11:30:00.000Z" }),
  summary({ id: "paid", price: "¥80 - ¥480", startTime: "2026-09-02T11:30:00.000Z" }),
  summary({ id: "free", price: "免费", startTime: "2026-09-03T11:30:00.000Z" }),
];
assert.deepEqual(sortConcerts(events, "price", new Map()).map((event) => event.id), ["free", "paid", "unknown"]);

const programEvents = [
  summary({ id: "empty", hasProgram: false }),
  summary({ id: "complete", hasProgram: true, programPreview: [{ title: "第五交响曲" }] }),
];
assert.equal(sortConcerts(programEvents, "program", new Map())[0].id, "complete");

const programChange: DatasetChange = {
  id: "change-program",
  eventId: "followed-event",
  type: "program",
  detectedAt: "2026-08-03T10:00:00.000Z",
  summary: "节目单变化",
};
assert.equal(recentChangeLabel(programChange, "2026-08-05T10:00:00.000Z"), "曲目更新");
assert.equal(recentChangeLabel(programChange, "2026-09-05T10:00:00.000Z"), undefined);

const followedEvent = summary({
  id: "followed-event",
  ensemble: "指挥与示例交响乐团",
  programPreview: [{ workId: "work-beethoven-5", knowledgeWorkId: "work_000001", composer: "贝多芬", title: "第五交响曲" }],
});
const follows: FollowMap = {
  "ensemble:example": {
    key: "ensemble:example",
    type: "ensemble",
    name: "示例交响乐团",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  "work:beethoven-5": {
    key: "work:beethoven-5",
    type: "work",
    name: "第五交响曲",
    entityId: "work-beethoven-5",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
};
const changeDataset: ChangeDataset = {
  generatedAt: "2026-08-03T10:00:00.000Z",
  changes: [programChange],
};
const notifications = buildFollowNotifications(changeDataset, [followedEvent], follows, []);
assert.equal(notifications.length, 1);
assert.deepEqual(notifications[0].targets.map((target) => target.type).sort(), ["ensemble", "work"]);

const knowledgeFollows: FollowMap = {
  "work:work_000001": {
    key: "work:work_000001",
    type: "work",
    name: "C 小调第五交响曲",
    entityId: "work_000001",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  "composer:composer_000001": {
    key: "composer:composer_000001",
    type: "composer",
    name: "路德维希·凡·贝多芬",
    entityId: "composer_000001",
    aliases: ["贝多芬"],
    createdAt: "2026-08-01T00:00:00.000Z",
  },
};
const knowledgeNotifications = buildFollowNotifications(changeDataset, [followedEvent], knowledgeFollows, []);
assert.deepEqual(knowledgeNotifications[0].targets.map((target) => target.type).sort(), ["composer", "work"]);

const retainedNotifications = mergeFollowNotificationHistory(notifications, [], [], []);
assert.equal(retainedNotifications.length, 1, "unfollowing must not remove notification history");
assert.equal(mergeFollowNotificationHistory(notifications, [], [programChange.id], [])[0].read, true);
assert.equal(mergeFollowNotificationHistory(notifications, notifications, [], [programChange.id]).length, 0);

const issues = detectDataIssues(summary({
  dataQuality: "needs-review",
  venue: "深圳音乐厅、某某文化有限公司",
  ensemble: "美乐四重奏演绎法式浪漫与印象丨上海交响乐团音乐季",
}));
assert.equal(issues.length, 3);
assert.ok(issues.some((issue) => issue.includes("待补充")));
assert.ok(issues.some((issue) => issue.includes("场馆")));
assert.ok(issues.some((issue) => issue.includes("乐团")));

console.log("Discovery feature tests passed.");
