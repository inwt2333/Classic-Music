import assert from "node:assert/strict";
import { formatChinaDateLabels, parseChinaDate } from "./china-time";

const evening = parseChinaDate("2026-07-30 19:30:00");
assert.equal(evening.toISOString(), "2026-07-30T11:30:00.000Z");
assert.deepEqual(formatChinaDateLabels(evening), {
  weekday: "周四",
  dateLabel: "07/30",
  timeLabel: "19:30",
});

const afterMidnight = new Date("2026-07-30T16:30:00.000Z");
assert.deepEqual(formatChinaDateLabels(afterMidnight), {
  weekday: "周五",
  dateLabel: "07/31",
  timeLabel: "00:30",
});

console.log("China time tests passed.");
