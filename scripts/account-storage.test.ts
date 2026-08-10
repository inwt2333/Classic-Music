import assert from "node:assert/strict";
import {
  makeFollowTarget,
  readFollows,
  toggleFollow,
} from "../src/discovery-features";
import {
  readPersonalEventSnapshots,
  readPersonalEvents,
  setPersonalEventStatus,
} from "../src/product-features";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  },
});

const target = makeFollowTarget("composer", "贝多芬", "composer_000001");
toggleFollow({}, target, "user-a");

assert.equal(Boolean(readFollows("user-a")[target.key]), true);
assert.deepEqual(readFollows("user-b"), {});
assert.deepEqual(readFollows(), {});

setPersonalEventStatus({}, "event-a", "interested", "user-a");
setPersonalEventStatus({}, "event-b", "attended", "user-b", {
  id: "event-b",
  title: "测试音乐会",
  city: "上海",
  venue: "测试音乐厅",
  hall: "交响厅",
  startTime: "2026-08-10T19:30:00+08:00",
  weekday: "周一",
  dateLabel: "08/10",
  timeLabel: "19:30",
  price: "80-380元",
  status: "scheduled",
  ensemble: "测试乐团",
  mainPerson: "测试指挥",
  genres: ["交响"],
  dataQuality: "scraped",
  detailPath: "events/event-b.json",
  hasProgram: true,
  programPreview: [{ composer: "贝多芬", title: "第五交响曲" }],
  searchText: "测试音乐会 贝多芬",
  sourceCount: 1,
});

assert.deepEqual(readPersonalEvents("user-a"), { "event-a": "interested" });
assert.deepEqual(readPersonalEvents("user-b"), { "event-b": "attended" });
assert.deepEqual(readPersonalEvents(), {});
assert.equal(readPersonalEventSnapshots("user-b")["event-b"].title, "测试音乐会");
assert.equal(readPersonalEventSnapshots("user-b")["event-b"].programPreview[0].title, "第五交响曲");
assert.deepEqual(readPersonalEventSnapshots("user-a"), {});

setPersonalEventStatus(readPersonalEvents("user-b"), "event-b", null, "user-b");
assert.equal(readPersonalEventSnapshots("user-b")["event-b"], undefined);

delete (globalThis as { window?: unknown }).window;
console.log("Account storage isolation tests passed.");
