import assert from "node:assert/strict";
import {
  makeFollowTarget,
  readFollows,
  toggleFollow,
} from "../src/discovery-features";
import {
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
setPersonalEventStatus({}, "event-b", "attended", "user-b");

assert.deepEqual(readPersonalEvents("user-a"), { "event-a": "interested" });
assert.deepEqual(readPersonalEvents("user-b"), { "event-b": "attended" });
assert.deepEqual(readPersonalEvents(), {});

delete (globalThis as { window?: unknown }).window;
console.log("Account storage isolation tests passed.");
