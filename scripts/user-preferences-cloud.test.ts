import assert from "node:assert/strict";
import type { FollowNotification, SavedFilter } from "../src/discovery-features";
import {
  mergeLegacyPreferences,
  rowToState,
  type UserPreferencesState,
} from "../src/user-preferences-cloud";

const filter = (id: string, createdAt: string): SavedFilter => ({
  id,
  name: id,
  createdAt,
  query: "",
  datePreset: "all",
  city: "全部城市",
  venue: "全部场馆",
  ensemble: "全部乐团",
  genre: "全部类型",
  hasProgram: false,
  sortMode: "time",
});

const notification = (id: string): FollowNotification => ({
  id,
  change: {
    id,
    eventId: `event-${id}`,
    type: "price",
    detectedAt: "2026-08-10T10:00:00Z",
    summary: "票价变化",
  },
  targets: [{ key: "venue:test", type: "venue", name: "测试音乐厅", createdAt: "2026-08-01T00:00:00Z" }],
  read: false,
});

const local: UserPreferencesState = {
  follows: {
    "venue:test": { key: "venue:test", type: "venue", name: "本地名称", createdAt: "2026-08-01T00:00:00Z" },
  },
  savedFilters: [filter("local-filter", "2026-08-01T00:00:00Z")],
  notificationHistory: [notification("dismissed"), notification("retained")],
  readNotificationIds: ["retained"],
  dismissedNotificationIds: [],
};
const cloud: UserPreferencesState = {
  follows: {
    "venue:test": { key: "venue:test", type: "venue", name: "云端名称", createdAt: "2026-08-02T00:00:00Z" },
    "city:shanghai": { key: "city:shanghai", type: "city", name: "上海", createdAt: "2026-08-02T00:00:00Z" },
  },
  savedFilters: [filter("cloud-filter", "2026-08-02T00:00:00Z")],
  notificationHistory: [notification("cloud")],
  readNotificationIds: ["cloud"],
  dismissedNotificationIds: ["dismissed"],
};

const merged = mergeLegacyPreferences(local, cloud);
assert.equal(merged.follows["venue:test"].name, "云端名称");
assert.equal(Object.keys(merged.follows).length, 2);
assert.deepEqual(merged.savedFilters.map((item) => item.id), ["local-filter", "cloud-filter"]);
assert.deepEqual(merged.readNotificationIds.sort(), ["cloud", "retained"]);
assert.deepEqual(merged.dismissedNotificationIds, ["dismissed"]);
assert.deepEqual(merged.notificationHistory.map((item) => item.id).sort(), ["cloud", "retained"]);
assert.equal(merged.notificationHistory.find((item) => item.id === "retained")?.read, true);

const parsed = rowToState({
  user_id: "user-a",
  follows: merged.follows,
  saved_filters: merged.savedFilters,
  notification_history: merged.notificationHistory,
  read_notification_ids: ["cloud", 123],
  dismissed_notification_ids: "invalid",
});
assert.equal(Object.keys(parsed.follows).length, 2);
assert.deepEqual(parsed.readNotificationIds, ["cloud"]);
assert.deepEqual(parsed.dismissedNotificationIds, []);

console.log("User preference cloud migration tests passed.");
