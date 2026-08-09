import assert from "node:assert/strict";
import type { ConcertEvent } from "../../src/types";
import { attachOcrEvidence } from "./evidence";

const event: ConcertEvent = {
  id: "event-1",
  title: "图片节目单音乐会",
  city: "上海",
  venue: "上海东方艺术中心",
  startTime: "2026-09-01T11:30:00.000Z",
  weekday: "周二",
  dateLabel: "09/01",
  timeLabel: "19:30",
  status: "scheduled",
  sourceName: "上海东方艺术中心官网",
  sourceUrl: "https://www.shoac.com.cn/#/detail?projectId=123456",
  scrapedAt: "2026-08-09T00:00:00.000Z",
  sources: [{
    sourceId: "shoac-official",
    sourceName: "上海东方艺术中心官网",
    sourceRecordId: "shoac_123456_789",
    sourceUrl: "https://www.shoac.com.cn/#/detail?projectId=123456",
    scrapedAt: "2026-08-09T00:00:00.000Z",
  }],
  performers: [],
  composers: [],
  program: [],
  tags: [],
  dataQuality: "needs-review",
};

const attached = attachOcrEvidence([event], new Map([[
  "123456",
  {
    projectId: "123456",
    extraction: {
      accepted: false,
      provider: "tesseract",
      confidence: 61,
      reasons: ["节目项不足"],
      pages: [
        { url: "https://cdn.example.com/program.jpg", confidence: 61 },
        { url: "https://cdn.example.com/program.jpg", confidence: 61 },
      ],
    },
  },
]]));

assert.equal(attached[0].extraction?.images?.length, 1);
assert.equal(attached[0].extraction?.accepted, false);
assert.equal(attached[0].dataQuality, "needs-review");

const official = attachOcrEvidence(
  [{ ...event, dataQuality: "scraped", program: [{ title: "第五交响曲", confidence: "official" }] }],
  new Map([["123456", { projectId: "123456", extraction: { accepted: false, pages: [{ url: "https://cdn.example.com/program.jpg" }] } }]]),
);
assert.equal(official[0].extraction, undefined);

console.log("OCR evidence tests passed.");
