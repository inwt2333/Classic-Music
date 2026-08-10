import assert from "node:assert/strict";
import {
  countPersonalEvents,
  followTargetHref,
  groupFollowTargets,
  savedFilterHref,
} from "../src/personal-profile";
import type { FollowMap, SavedFilter } from "../src/discovery-features";

const follows: FollowMap = {
  "work:work_1": { key: "work:work_1", type: "work", name: "作品一", entityId: "work_1", createdAt: "2026-08-01T00:00:00Z" },
  "person:person_1": { key: "person:person_1", type: "person", name: "演奏家", entityId: "person_1", createdAt: "2026-08-02T00:00:00Z" },
};

assert.equal(groupFollowTargets(follows).get("work")?.length, 1);
assert.equal(groupFollowTargets(follows).get("person")?.[0].name, "演奏家");
assert.equal(followTargetHref(follows["work:work_1"], new Set(["work_1"])), "?work=work_1");
assert.equal(followTargetHref(follows["work:work_1"]), "?entity=work_1");
assert.equal(followTargetHref({ ...follows["person:person_1"], entityId: undefined }), "?q=%E6%BC%94%E5%A5%8F%E5%AE%B6");

const filter: SavedFilter = {
  id: "filter_1",
  name: "上海周末",
  createdAt: "2026-08-01T00:00:00Z",
  query: "贝多芬",
  datePreset: "weekend",
  city: "上海",
  venue: "全部场馆",
  ensemble: "全部乐团",
  genre: "交响",
  hasProgram: true,
  sortMode: "time",
};
assert.equal(savedFilterHref(filter), "?q=%E8%B4%9D%E5%A4%9A%E8%8A%AC&date=weekend&city=%E4%B8%8A%E6%B5%B7&genre=%E4%BA%A4%E5%93%8D&program=1");
assert.deepEqual(countPersonalEvents({ a: "interested", b: "attended", c: "interested" }), { interested: 2, attended: 1 });

console.log("Personal profile tests passed.");
