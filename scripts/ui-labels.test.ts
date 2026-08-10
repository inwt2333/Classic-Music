import assert from "node:assert/strict";
import { formatEventVenue, normalizeEnsembleName, normalizeVenueName } from "../src/utils";

assert.equal(normalizeVenueName("Beijing Concert Hall"), "北京音乐厅");
assert.equal(normalizeVenueName("Concert Hall of National Centre for the Performing Arts"), "国家大剧院");
assert.equal(
  formatEventVenue({ venue: "Concert Hall of National Centre for the Performing Arts", hall: "音乐厅" }),
  "国家大剧院 · 音乐厅",
);
assert.equal(normalizeEnsembleName("年国家艺术院团演出演播季 中国交响乐团"), "中国交响乐团");
assert.equal(normalizeEnsembleName("蔡珂宜与新加坡交响乐团丨上海交响乐团"), "新加坡交响乐团");
assert.equal(normalizeEnsembleName("音乐嘉年华·万里山河同心曲 爱乐男声合唱团"), "爱乐男声合唱团");

console.log("UI label normalization tests passed.");
