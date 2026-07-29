import assert from "node:assert/strict";
import { parseOrientalArtCenterOcrText } from "../adapters/shanghai-oriental-art-center";
import {
  evaluateOcrProgram,
  normalizeOcrText,
  type OcrPageResult,
} from "./program-extraction";

function page(text: string, confidence = 90): OcrPageResult {
  return {
    url: "https://example.com/program.jpg",
    text,
    confidence,
    imageHash: "image-hash",
    cacheHit: false,
  };
}

const accepted = evaluateOcrProgram(
  [
    page(
      `音乐会精选曲目 Programme
Wellerman;
Be What You Wanna Be;
披头士乐队曲目串烧;
爱之初体验;
甜蜜蜜;
我的小绿仙人掌`,
    ),
  ],
  parseOrientalArtCenterOcrText,
);
assert.equal(accepted.accepted, true);
assert.equal(accepted.program.length, 6);
assert.equal(accepted.confidence, 90);

const lowConfidence = evaluateOcrProgram(
  [page("曲目\n贝多芬：第五交响曲\n莫扎特：第四十交响曲", 42)],
  parseOrientalArtCenterOcrText,
);
assert.equal(lowConfidence.accepted, false);
assert.match(lowConfidence.reasons.join(" "), /置信度/);

const missingHeading = evaluateOcrProgram(
  [page("贝多芬：第五交响曲\n莫扎特：第四十交响曲")],
  parseOrientalArtCenterOcrText,
);
assert.equal(missingHeading.accepted, false);
assert.match(missingHeading.reasons.join(" "), /节目单标题/);

const tooFewItems = evaluateOcrProgram(
  [page("节目单\n贝多芬：第五交响曲")],
  parseOrientalArtCenterOcrText,
);
assert.equal(tooFewItems.accepted, false);
assert.match(tooFewItems.reasons.join(" "), /可信节目项/);

assert.equal(
  normalizeOcrText("节 目 单\n曲 目 ；  贝多芬"),
  "节目单\n曲目; 贝多芬",
);

console.log("OCR extraction quality-gate tests passed.");
