import { setTimeout as sleep } from "node:timers/promises";

export const SJTU_AI_DEFAULT_BASE_URL = "https://models.sjtu.edu.cn/api/v1";

export type SjtuAiConfig = {
  apiKey: string;
  baseUrl: string;
  knowledgeModel: string;
  programModel: string;
  visionModel: string;
};

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
};

class NonRetryableAiError extends Error {}

export function loadSjtuAiConfig(env: NodeJS.ProcessEnv = process.env): SjtuAiConfig | undefined {
  const sjtuApiKey = env.SJTU_AI_API_KEY?.trim();
  const legacyApiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!sjtuApiKey && !legacyApiKey) return undefined;
  if (sjtuApiKey) {
    return {
      apiKey: sjtuApiKey,
      baseUrl: (env.SJTU_AI_BASE_URL?.trim() || SJTU_AI_DEFAULT_BASE_URL).replace(/\/$/, ""),
      knowledgeModel: env.SJTU_KNOWLEDGE_MODEL?.trim() || "deepseek-reasoner",
      programModel: env.SJTU_PROGRAM_MODEL?.trim() || "deepseek-chat",
      visionModel: env.SJTU_VISION_MODEL?.trim() || "qwen3.6-27b",
    };
  }
  return {
    apiKey: legacyApiKey!,
    baseUrl: (env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com").replace(/\/$/, ""),
    knowledgeModel: env.DEEPSEEK_MODEL?.trim() || "deepseek-reasoner",
    programModel: env.DEEPSEEK_MODEL?.trim() || "deepseek-chat",
    visionModel: env.SJTU_VISION_MODEL?.trim() || "qwen3.6-27b",
  };
}

export async function requestSjtuChat(input: {
  config: SjtuAiConfig;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
}) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const endpoint = `${input.config.baseUrl}/chat/completions`;
  const maxAttempts = 2;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: input.model,
          messages: input.messages,
          temperature: 0,
          max_tokens: input.maxTokens,
        }),
        signal: AbortSignal.timeout(input.timeoutMs ?? 180_000),
      });
      if (response.ok) {
        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        };
        const content = data.choices?.[0]?.message?.content?.trim();
        if (!content) throw new Error(`AI returned no content (${data.choices?.[0]?.finish_reason ?? "unknown"})`);
        return content;
      }

      const body = (await response.text()).slice(0, 500);
      const error = new Error(`SJTU AI HTTP ${response.status}${body ? `: ${body}` : ""}`);
      if (response.status !== 429 && response.status < 500) throw new NonRetryableAiError(error.message);
      lastError = error;
    } catch (error) {
      if (error instanceof NonRetryableAiError) throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    if (attempt + 1 < maxAttempts) {
      await sleep(input.retryDelayMs ?? 60_000);
    }
  }

  throw lastError ?? new Error("SJTU AI request failed");
}

export async function requestSjtuJson<T>(input: Parameters<typeof requestSjtuChat>[0] & {
  parse: (value: unknown) => T;
}) {
  const content = await requestSjtuChat(input);
  return input.parse(parseJsonContent(content));
}

export function parseJsonContent(content: string): unknown {
  const unfenced = content
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const objectStart = unfenced.indexOf("{");
    const objectEnd = unfenced.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(unfenced.slice(objectStart, objectEnd + 1));
    }
    throw new Error("AI response is not valid JSON");
  }
}
