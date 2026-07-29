import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { ConcertEvent, ManualReviewDecision } from "../src/types";
import {
  applyManualReviews,
  loadManualReviews,
  manualReviewDecisionSchema,
  saveManualReview,
} from "./review-store";

const event: ConcertEvent = {
  id: "perf_review_test",
  title: "测试音乐会",
  city: "上海",
  venue: "上海东方艺术中心",
  startTime: "2026-08-01T11:30:00.000Z",
  weekday: "周六",
  dateLabel: "08/01",
  timeLabel: "19:30",
  status: "scheduled",
  sourceName: "上海东方艺术中心官网",
  sourceUrl: "https://www.shoac.com.cn/#/detail?projectId=1",
  scrapedAt: "2026-07-29T00:00:00.000Z",
  sources: [{
    sourceId: "shoac",
    sourceName: "上海东方艺术中心官网",
    sourceRecordId: "shoac_1_2",
    sourceUrl: "https://www.shoac.com.cn/#/detail?projectId=1",
    scrapedAt: "2026-07-29T00:00:00.000Z",
  }],
  performers: [],
  composers: [],
  program: [{ title: "OCR 曲目", confidence: "ocr" }],
  tags: [],
  dataQuality: "ocr-assisted",
  extraction: {
    method: "ocr",
    provider: "tesseract",
    confidence: 82,
    imageCount: 1,
    accepted: true,
    reasons: [],
    reviewRequired: true,
  },
};

const approved: ManualReviewDecision = manualReviewDecisionSchema.parse({
  eventId: "old-event-id",
  sourceRecordIds: ["shoac_1_2"],
  status: "approved",
  program: [{
    composer: "贝多芬",
    title: "第五交响曲",
    confidence: "manual",
  }],
  note: "对照官网图片确认",
  reviewedAt: "2026-07-29T01:00:00.000Z",
});
const approvedEvents = applyManualReviews([event], [approved]);
assert.equal(approvedEvents[0].dataQuality, "manual-reviewed");
assert.equal(approvedEvents[0].program[0].confidence, "manual");
assert.equal(approvedEvents[0].program[0].title, "第五交响曲");
assert.equal(approvedEvents[0].extraction?.reviewRequired, false);
assert.equal(approvedEvents[0].review?.status, "approved");

const rejected: ManualReviewDecision = manualReviewDecisionSchema.parse({
  ...approved,
  status: "rejected",
  program: [],
});
const rejectedEvents = applyManualReviews(approvedEvents, [rejected]);
assert.equal(rejectedEvents[0].dataQuality, "needs-review");
assert.equal(rejectedEvents[0].program.length, 0);
assert.equal(rejectedEvents[0].review?.status, "rejected");

assert.throws(
  () => manualReviewDecisionSchema.parse({
    ...approved,
    program: [],
  }),
  /至少需要一首曲目/,
);

async function testPersistence() {
  const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "classic-music-review-"));
  try {
    const reviewPath = resolve(temporaryDirectory, "manual-reviews.json");
    await saveManualReview(reviewPath, approved);
    const stored = await loadManualReviews(reviewPath);
    assert.equal(stored.decisions.length, 1);
    assert.equal(stored.decisions[0].program[0].title, "第五交响曲");
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

testPersistence()
  .then(() => console.log("Manual review store tests passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
