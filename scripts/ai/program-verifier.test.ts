import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConcertEvent } from "../../src/types";
import { isProgramReviewCandidate, programReviewPriority, registerProgramEvidence, verifyProgramWithAi } from "./program-verifier";
import type { SjtuAiConfig } from "./sjtu-client";

async function main() {
const config: SjtuAiConfig = {
  apiKey: "test",
  baseUrl: "https://models.example/api/v1",
  knowledgeModel: "deepseek-reasoner",
  programModel: "deepseek-chat",
  visionModel: "qwen3.6-27b",
};
const cacheDirectory = await mkdtemp(join(tmpdir(), "classic-music-program-ai-"));

function event(id: string): ConcertEvent {
  return {
    id,
    title: "Test concert",
    city: "Shanghai",
    venue: "Test Hall",
    startTime: "2026-09-01T11:30:00.000Z",
    weekday: "Tue",
    dateLabel: "09/01",
    timeLabel: "19:30",
    status: "scheduled",
    sourceName: "Official site",
    sourceUrl: "https://example.com/event",
    scrapedAt: "2026-08-11T00:00:00.000Z",
    performers: [],
    composers: [],
    program: [{ title: "\u4e0a\u534a\u573a", confidence: "official" }],
    tags: [],
    dataQuality: "scraped",
  };
}

const corrected = registerProgramEvidence(event("corrected"), [
  "\u66f2\u76ee",
  "\u8d1d\u591a\u82ac\uff1aC\u5927\u8c03\u7b2c\u4e00\u4ea4\u54cd\u66f2\uff0c\u4f5c\u54c121",
].join("\n"));
const correctedResult = await verifyProgramWithAi({
  event: corrected,
  config,
  cacheDirectory,
  fetchImpl: (async () => Response.json({ choices: [{ message: { content: JSON.stringify({
    decision: "replace",
    confidence: 0.94,
    issues: ["heading parsed as work"],
    program: [{ composer: "\u8d1d\u591a\u82ac", title: "C\u5927\u8c03\u7b2c\u4e00\u4ea4\u54cd\u66f2", alternateTitles: [], opus: "\u4f5c\u54c121", movements: [], evidenceLineIds: [2] }],
  }) } }] })) as typeof fetch,
});
assert.equal(correctedResult.changed, true);
assert.equal(corrected.program[0]?.title, "C\u5927\u8c03\u7b2c\u4e00\u4ea4\u54cd\u66f2");
assert.equal(corrected.program[0]?.confidence, "ai");

const rejected = registerProgramEvidence(event("rejected"), "\u66f2\u76ee\n\u83ab\u624e\u7279\uff1aA\u5927\u8c03\u5355\u7c27\u7ba1\u534f\u594f\u66f2\uff0cK. 622\n\u6f14\u51fa\u66f2\u76ee\u4ee5\u73b0\u573a\u4e3a\u51c6");
const rejectedResult = await verifyProgramWithAi({
  event: rejected,
  config,
  cacheDirectory,
  fetchImpl: (async () => Response.json({ choices: [{ message: { content: JSON.stringify({
    decision: "replace",
    confidence: 0.99,
    issues: [],
    program: [{ composer: "\u83ab\u624e\u7279", title: "\u4e0d\u5b58\u5728\u7684\u4ea4\u54cd\u66f2", alternateTitles: [], movements: [], evidenceLineIds: [2] }],
  }) } }] })) as typeof fetch,
});
assert.equal(rejectedResult.changed, false);
assert.equal(rejectedResult.reason, "invalid-evidence");
assert.equal(rejected.program[0]?.title, "\u4e0a\u534a\u573a");

const ambiguous = registerProgramEvidence({
  ...event("ambiguous-bilingual"),
  program: [
    { title: "派对动物", alternateTitles: ["lemon"], confidence: "official" },
    { title: "圣诞快乐，劳伦斯先生", confidence: "official" },
  ],
}, "曲目\n派对动物\nlemon\n圣诞快乐，劳伦斯先生\n* 曲目以演出现场为准");
assert.equal(isProgramReviewCandidate(ambiguous), true);
assert.equal(programReviewPriority(ambiguous), 120);
const ambiguousResult = await verifyProgramWithAi({
  event: ambiguous,
  config,
  cacheDirectory,
  fetchImpl: (async () => Response.json({ choices: [{ message: { content: JSON.stringify({
    decision: "replace",
    confidence: 0.96,
    issues: ["unrelated works merged as bilingual titles"],
    program: [
      { title: "派对动物", alternateTitles: [], movements: [], evidenceLineIds: [2] },
      { title: "lemon", alternateTitles: [], movements: [], evidenceLineIds: [3] },
      { title: "圣诞快乐，劳伦斯先生", alternateTitles: [], movements: [], evidenceLineIds: [4] },
    ],
  }) } }] })) as typeof fetch,
});
assert.equal(ambiguousResult.changed, true);
assert.deepEqual(ambiguous.program.map((item) => item.title), ["派对动物", "lemon", "圣诞快乐，劳伦斯先生"]);

console.log("Program verifier tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
