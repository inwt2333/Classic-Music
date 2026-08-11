import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SjtuAiConfig } from "../ai/sjtu-client";
import { createHybridOcr } from "./hybrid-ocr";
import type { LocalOcr } from "./local-tesseract";

async function main() {
const config: SjtuAiConfig = {
  apiKey: "test",
  baseUrl: "https://models.example/api/v1",
  knowledgeModel: "deepseek-reasoner",
  programModel: "deepseek-chat",
  visionModel: "qwen3.6-27b",
};
const image = new Uint8Array([137, 80, 78, 71]);
const successful = await createHybridOcr(await mkdtemp(join(tmpdir(), "classic-music-vision-ai-")), config, {
  fetchImpl: (async (url) => String(url).includes("chat/completions")
    ? Response.json({ choices: [{ message: { content: JSON.stringify({
        containsProgram: true,
        rawText: "\u66f2\u76ee\n4/21\n\u83ab\u624e\u7279\uff1a\u4ea4\u54cd\u66f2",
        programSections: [{
          date: "4/21",
          time: "19:45",
          program: [{
            composer: "\u83ab\u624e\u7279 | Mozart",
            title: "A\u5927\u8c03\u5355\u7c27\u7ba1\u4e94\u91cd\u594f",
            alternateTitles: ["Clarinet Quintet in A Major"],
            opus: "K. 581",
            movements: [{ number: "I", title: "\u5feb\u677f", alternateTitles: ["Allegro"] }],
          }],
        }],
        confidence: 0.91,
      }) } }] })
    : new Response(image, { headers: { "content-type": "image/png" } })) as typeof fetch,
});
const page = await successful.recognizeUrl("https://example.com/poster.png");
assert.equal(page.provider, "qwen3.6-27b");
assert.equal(page.confidence, 91);
assert.match(page.text, /\u83ab\u624e\u7279/);
assert.equal(page.programSections?.[0].date, "4/21");
assert.equal(page.programSections?.[0].program[0].composer, "\u83ab\u624e\u7279");
assert.equal(page.programSections?.[0].program[0].movements?.[0].title, "\u5feb\u677f");

let fallbackCalls = 0;
const fallback: LocalOcr = {
  recognizeUrl: async (url) => {
    fallbackCalls += 1;
    return { url, text: "fallback", confidence: 60, imageHash: "fallback", cacheHit: false, provider: "tesseract" };
  },
  terminate: async () => undefined,
};
const failed = await createHybridOcr(await mkdtemp(join(tmpdir(), "classic-music-vision-fallback-")), config, {
  fetchImpl: (async (url) => String(url).includes("chat/completions")
    ? new Response("unauthorized", { status: 401 })
    : new Response(image, { headers: { "content-type": "image/png" } })) as typeof fetch,
  localFactory: async () => fallback,
});
assert.equal((await failed.recognizeUrl("https://example.com/one.png")).provider, "tesseract");
assert.equal((await failed.recognizeUrl("https://example.com/two.png")).provider, "tesseract");
assert.equal(fallbackCalls, 2);

let imageDownloads = 0;
let visionCalls = 0;
const isolatedImageFailure = await createHybridOcr(
  await mkdtemp(join(tmpdir(), "classic-music-image-failure-")),
  config,
  {
    fetchImpl: (async (url) => {
      if (String(url).includes("chat/completions")) {
        visionCalls += 1;
        return Response.json({ choices: [{ message: { content: JSON.stringify({
          containsProgram: false,
          rawText: "",
          programSections: [],
          confidence: 1,
        }) } }] });
      }
      imageDownloads += 1;
      if (String(url).includes("unavailable")) {
        const error = new Error("poster download aborted");
        error.name = "AbortError";
        throw error;
      }
      return new Response(image, { headers: { "content-type": "image/png" } });
    }) as typeof fetch,
    localFactory: async () => fallback,
  },
);
assert.equal((await isolatedImageFailure.recognizeUrl("https://example.com/unavailable.png")).provider, "tesseract");
assert.equal((await isolatedImageFailure.recognizeUrl("https://example.com/available.png")).provider, "qwen3.6-27b");
assert.equal(imageDownloads, 2);
assert.equal(visionCalls, 1);

let timedOutVisionCalls = 0;
const timedOutVision = await createHybridOcr(
  await mkdtemp(join(tmpdir(), "classic-music-vision-timeout-")),
  config,
  {
    fetchImpl: (async (url) => {
      if (String(url).includes("chat/completions")) {
        timedOutVisionCalls += 1;
        const error = new Error("The operation was aborted due to timeout");
        error.name = "TimeoutError";
        throw error;
      }
      return new Response(image, { headers: { "content-type": "image/png" } });
    }) as typeof fetch,
    localFactory: async () => fallback,
  },
);
assert.equal((await timedOutVision.recognizeUrl("https://example.com/timeout-one.png")).provider, "tesseract");
assert.equal((await timedOutVision.recognizeUrl("https://example.com/timeout-two.png")).provider, "tesseract");
assert.equal(timedOutVisionCalls, 1);

console.log("Hybrid OCR tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
