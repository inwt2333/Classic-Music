import assert from "node:assert/strict";
import {
  buildLegacyMigrationRows,
  rowsToState,
  type PersonalEventRow,
} from "../src/personal-events-cloud";
import { createPersonalEventSnapshot } from "../src/product-features";
import type { ConcertEventSummary } from "../src/types";

const event = {
  id: "event-a",
  title: "云端快照测试音乐会",
  city: "上海",
  venue: "测试音乐厅",
  startTime: "2026-08-10T19:30:00+08:00",
  weekday: "周一",
  dateLabel: "08/10",
  timeLabel: "19:30",
  status: "scheduled",
  genres: ["交响"],
  dataQuality: "scraped",
  detailPath: "events/event-a.json",
  hasProgram: true,
  programPreview: [{ composer: "贝多芬", title: "第五交响曲" }],
  searchText: "云端快照测试音乐会",
  sourceCount: 1,
} satisfies ConcertEventSummary;
const snapshot = createPersonalEventSnapshot(event);

const cloudRows: PersonalEventRow[] = [{
  user_id: "user-a",
  event_id: "event-a",
  status: "attended",
  snapshot: null,
}];
const migrationRows = buildLegacyMigrationRows(
  "user-a",
  { "event-a": "interested", "event-b": "attended" },
  { "event-a": snapshot },
  cloudRows,
);

assert.equal(migrationRows.length, 2);
assert.equal(migrationRows.find((row) => row.event_id === "event-a")?.status, "attended");
assert.equal(migrationRows.find((row) => row.event_id === "event-a")?.snapshot, snapshot);
assert.equal(migrationRows.find((row) => row.event_id === "event-b")?.snapshot, null);

assert.deepEqual(buildLegacyMigrationRows(
  "user-a",
  { "event-a": "interested" },
  { "event-a": snapshot },
  [{ ...cloudRows[0], snapshot }],
), []);

const state = rowsToState([
  { ...cloudRows[0], snapshot },
  { user_id: "user-a", event_id: "event-b", status: "interested", snapshot: null },
]);
assert.deepEqual(state.events, { "event-a": "attended", "event-b": "interested" });
assert.equal(state.snapshots["event-a"].title, "云端快照测试音乐会");
assert.equal(state.snapshots["event-b"], undefined);

console.log("Personal event cloud migration tests passed.");
