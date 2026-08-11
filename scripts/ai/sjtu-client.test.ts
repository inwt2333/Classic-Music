import assert from "node:assert/strict";
import { loadSjtuAiConfig, parseJsonContent, requestSjtuChat } from "./sjtu-client";

async function main() {
const config = loadSjtuAiConfig({
  SJTU_AI_API_KEY: "test-key",
  SJTU_AI_BASE_URL: "https://models.example/api/v1/",
  SJTU_KNOWLEDGE_MODEL: "reasoner",
  SJTU_PROGRAM_MODEL: "chat",
  SJTU_VISION_MODEL: "vision",
  DEEPSEEK_BASE_URL: "https://legacy.example/v1",
  DEEPSEEK_MODEL: "legacy-model",
} as NodeJS.ProcessEnv);
assert.ok(config);
assert.equal(config.baseUrl, "https://models.example/api/v1");
assert.equal(config.knowledgeModel, "reasoner");
assert.equal(config.programModel, "chat");
assert.deepEqual(parseJsonContent("```json\n{\"ok\":true}\n```"), { ok: true });

let requestBody: Record<string, unknown> | undefined;
const content = await requestSjtuChat({
  config,
  model: config.programModel,
  messages: [{ role: "user", content: "test" }],
  retryDelayMs: 0,
  fetchImpl: (async (url, init) => {
    assert.equal(url, "https://models.example/api/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-key");
    requestBody = JSON.parse(String(init?.body));
    return Response.json({ choices: [{ message: { content: "{\"ok\":true}" } }] });
  }) as typeof fetch,
});
assert.equal(content, "{\"ok\":true}");
assert.equal(requestBody?.model, "chat");
assert.ok(!("response_format" in (requestBody ?? {})));

let unauthorizedCalls = 0;
await assert.rejects(() => requestSjtuChat({
  config,
  model: config.programModel,
  messages: [{ role: "user", content: "test" }],
  retryDelayMs: 0,
  fetchImpl: (async () => {
    unauthorizedCalls += 1;
    return new Response("unauthorized", { status: 401 });
  }) as typeof fetch,
}), /401/);
assert.equal(unauthorizedCalls, 1);

console.log("SJTU AI client tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
