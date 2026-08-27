import assert from "node:assert/strict";
import {
  buildFollowNotifications,
  buildSavedFilterNotifications,
  detectDataIssues,
  isFollowTargetActive,
  makeFollowTarget,
  mergeFollowNotificationHistory,
  recentChangeLabel,
  sortConcerts,
  toggleFollow,
  type FollowMap,
  type SavedFilter,
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
assert.equal(recentChangeLabel(programChange, "2026-08-05T10:00:00.000Z"), undefined);
assert.equal(recentChangeLabel(programChange, "2026-09-05T10:00:00.000Z"), undefined);

const priceChange: DatasetChange = {
  id: "change-price",
  eventId: "followed-event",
  type: "price",
  detectedAt: "2026-08-03T11:00:00.000Z",
  summary: "票价变化",
};

const lineupChange: DatasetChange = {
  id: "change-lineup",
  eventId: "followed-event",
  type: "lineup",
  detectedAt: "2026-08-03T10:30:00.000Z",
  summary: "演出人员变化",
};
assert.equal(recentChangeLabel(lineupChange, "2026-08-05T10:00:00.000Z"), undefined);

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
  changes: [programChange, lineupChange, priceChange],
};
const notifications = buildFollowNotifications(changeDataset, [followedEvent], follows, []);
assert.equal(notifications.length, 1);
assert.equal(notifications[0].id, priceChange.id);
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

const caiKeyiFollow: FollowMap = {
  "person:legacy-cai-keyi": {
    key: "person:legacy-cai-keyi",
    type: "person",
    name: "蔡珂宜",
    entityId: "person_legacy",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
};
const bilingualCaiKeyi = makeFollowTarget("person", "蔡珂宜 Chloe Chua", "person_bilingual");
assert.equal(bilingualCaiKeyi.name, "蔡珂宜");
assert.deepEqual(bilingualCaiKeyi.aliases, ["蔡珂宜 Chloe Chua", "Chloe Chua"]);
assert.equal(isFollowTargetActive(caiKeyiFollow, bilingualCaiKeyi), true);
assert.deepEqual(toggleFollow(caiKeyiFollow, bilingualCaiKeyi), {});

const caiKeyiChange: DatasetChange = {
  id: "change-cai-keyi",
  eventId: "cai-keyi-event",
  type: "added",
  detectedAt: "2026-08-04T10:00:00.000Z",
  summary: "新增演出：汉努·林图 × 蔡珂宜 新加坡交响乐团",
  after: {
    title: "汉努·林图 × 蔡珂宜 新加坡交响乐团",
    city: "广州",
    venue: "星海音乐厅",
    startTime: "2026-10-21T12:00:00.000Z",
    status: "scheduled",
    conductor: "汉努·林图 Hannu Lintu",
    performers: ["蔡珂宜 Chloe Chua", "新加坡交响乐团 Singapore Symphony Orchestra"],
    sourceName: "星海音乐厅官网",
    programPreview: [],
  },
};
const caiKeyiEvent = summary({
  id: "cai-keyi-event",
  title: "汉努·林图 × 蔡珂宜 新加坡交响乐团",
  mainPerson: "汉努·林图 Hannu Lintu",
});
assert.equal(buildFollowNotifications({ generatedAt: caiKeyiChange.detectedAt, changes: [caiKeyiChange] }, [caiKeyiEvent], caiKeyiFollow, []).length, 1);

const retainedNotifications = mergeFollowNotificationHistory(notifications, [], [], []);
assert.equal(retainedNotifications.length, 1, "unfollowing must not remove notification history");
assert.equal(mergeFollowNotificationHistory([{
  id: programChange.id,
  change: programChange,
  event: followedEvent,
  targets: Object.values(follows),
  read: false,
}], [], [], []).length, 0, "stored program notifications must be removed");
assert.equal(mergeFollowNotificationHistory(notifications, [], [priceChange.id], [])[0].read, true);
assert.equal(mergeFollowNotificationHistory(notifications, notifications, [], [priceChange.id]).length, 0);

const addedChange: DatasetChange = {
  id: "change-added-xinghai",
  eventId: "new-guangzhou-event",
  type: "added",
  detectedAt: "2026-08-04T11:00:00.000Z",
  summary: "新增演出：广州交响乐团音乐季",
};
const guangzhouEvent = summary({ id: "new-guangzhou-event", city: "广州", ensemble: "广州交响乐团" });
const savedFilters: SavedFilter[] = [
  {
    id: "filter-gz",
    name: "广州音乐会",
    createdAt: "2026-08-01T00:00:00.000Z",
    query: "",
    datePreset: "all",
    city: "广州",
    venue: "全部场馆",
    ensemble: "全部乐团",
    genre: "全部类型",
    hasProgram: false,
    sortMode: "time",
  },
  {
    id: "filter-beijing",
    name: "北京室内乐",
    createdAt: "2026-08-01T00:00:00.000Z",
    query: "室内乐",
    datePreset: "all",
    city: "北京",
    venue: "全部场馆",
    ensemble: "全部乐团",
    genre: "全部类型",
    hasProgram: false,
    sortMode: "time",
  },
];
const filterNotifications = buildSavedFilterNotifications(
  { generatedAt: addedChange.detectedAt, changes: [addedChange] },
  [guangzhouEvent],
  savedFilters,
  [],
);
assert.equal(filterNotifications.length, 1);
assert.equal(filterNotifications[0].targets[0].type, "filter");
assert.ok(filterNotifications[0].id.includes("filter-gz"));
assert.equal(
  buildSavedFilterNotifications(
    { generatedAt: addedChange.detectedAt, changes: [addedChange] },
    [guangzhouEvent],
    savedFilters,
    [filterNotifications[0].id],
  )[0].read,
  true,
);

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
