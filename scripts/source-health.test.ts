import assert from "node:assert/strict";
import { assertSourceCollectionHealthy } from "./source-health";

assert.doesNotThrow(() =>
  assertSourceCollectionHealthy({ sourceName: "测试来源", rawCount: 3, normalizedCount: 2 }),
);
assert.doesNotThrow(() =>
  assertSourceCollectionHealthy({
    sourceName: "公众号补录来源",
    rawCount: 0,
    normalizedCount: 0,
    allowEmpty: true,
  }),
);
assert.throws(
  () => assertSourceCollectionHealthy({ sourceName: "测试来源", rawCount: 0, normalizedCount: 0 }),
  /discovery returned 0 records/,
);
assert.throws(
  () => assertSourceCollectionHealthy({ sourceName: "测试来源", rawCount: 4, normalizedCount: 0 }),
  /discovered 4 records but normalized 0 events/,
);

console.log("Source health tests passed.");
