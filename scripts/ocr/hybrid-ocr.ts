import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { loadSjtuAiConfig, requestSjtuJson, type SjtuAiConfig } from "../ai/sjtu-client";
import { fetchWithRetry } from "../fetch-retry";
import { createLocalTesseract, type LocalOcr, type OcrPage } from "./local-tesseract";

const VISION_PROMPT_VERSION = 4;
const movementSchema = z.object({
  number: z.string().max(20).optional().nullable(),
  title: z.string().min(1).max(180),
  alternateTitles: z.array(z.string().min(1).max(300)).max(6).default([]),
}).strict();
const programItemSchema = z.object({
  composer: z.string().max(120).optional().nullable(),
  title: z.string().min(1).max(180),
  alternateTitles: z.array(z.string().min(1).max(300)).max(6).default([]),
  opus: z.string().max(80).optional().nullable(),
  movements: z.array(movementSchema).max(30).default([]),
}).strict();
const programSectionSchema = z.object({
  date: z.string().max(30).optional().nullable(),
  time: z.string().max(20).optional().nullable(),
  program: z.array(programItemSchema).max(45),
}).strict();
const visionSchema = z.object({
  containsProgram: z.boolean(),
  rawText: z.string().max(30_000),
  programSections: z.array(programSectionSchema).max(20).default([]),
  confidence: z.number().min(0).max(1),
}).strict();

export async function createOcrEngine(cacheDirectory: string, options: {
  config?: SjtuAiConfig;
  fetchImpl?: typeof fetch;
  localFactory?: (cacheDirectory: string) => Promise<LocalOcr>;
} = {}): Promise<LocalOcr> {
  const config = options.config ?? loadSjtuAiConfig();
  if (!config) return createLocalTesseract(cacheDirectory);
  return createHybridOcr(cacheDirectory, config, options);
}

export async function createHybridOcr(
  cacheDirectory: string,
  config: SjtuAiConfig,
  options: {
    fetchImpl?: typeof fetch;
    localFactory?: (cacheDirectory: string) => Promise<LocalOcr>;
  } = {},
): Promise<LocalOcr> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const visionCacheDirectory = resolve(cacheDirectory, "vision");
  await mkdir(visionCacheDirectory, { recursive: true });
  let fallback: LocalOcr | undefined;
  let visionAvailable = true;

  async function getFallback() {
    fallback ??= await (options.localFactory ?? createLocalTesseract)(cacheDirectory);
    return fallback;
  }

  return {
    async recognizeUrl(url: string) {
      if (!visionAvailable) return (await getFallback()).recognizeUrl(url);
      try {
        const imageResponse = await fetchWithRetry(url, () => ({
          headers: {
            "user-agent": "Mozilla/5.0 ClassicMusicCalendar/1.0",
            accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(30_000),
        }), { fetchImpl });
        if (!imageResponse.ok) throw new Error(`OCR image HTTP ${imageResponse.status}`);
        const image = Buffer.from(await imageResponse.arrayBuffer());
        const imageHash = createHash("sha256").update(image).digest("hex");
        const cacheKey = createHash("sha256").update(JSON.stringify({
          imageHash,
          model: config.visionModel,
          promptVersion: VISION_PROMPT_VERSION,
        })).digest("hex");
        const cachePath = resolve(visionCacheDirectory, `${cacheKey}.json`);
        try {
          const cached = JSON.parse(await readFile(cachePath, "utf8")) as OcrPage;
          return { ...cached, url, imageHash, cacheHit: true, provider: config.visionModel };
        } catch {
          // A cache miss is expected for a newly discovered poster.
        }

        const contentType = imageResponse.headers.get("content-type")?.split(";")[0] || "image/jpeg";
        const result = await requestSjtuJson({
          config,
          model: config.visionModel,
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${contentType};base64,${image.toString("base64")}` } },
              {
                type: "text",
                text: [
                  "Read this concert image and extract only its published program list.",
                  "Return JSON only with this exact shape:",
                  '{"containsProgram":true,"rawText":"relevant text","programSections":[{"date":"date exactly as printed","time":"time exactly as printed","program":[{"composer":"","title":"","alternateTitles":[],"opus":"","movements":[{"number":"","title":"","alternateTitles":[]}]}]}],"confidence":0.0}.',
                  "Create the formatted program directly from the image; do not merely split OCR lines.",
                  "A schedule overview listing concert names is not a program. Only set containsProgram=true when the image presents identifiable musical works, normally under 曲目, 节目单, PROGRAM or an equivalent heading.",
                  "Keep each work as one program item. Put movements inside that work's movements array, never as separate works.",
                  "Use the Chinese or primary printed work name as title and put complete foreign-language equivalents in alternateTitles.",
                  "Use only the Chinese or primary composer name in composer; do not join bilingual composer names with a separator.",
                  "Separate composer names from work titles. Do not put performer roles, dates, movement labels or prose in composer.",
                  "If there are multiple dated programs, create one programSections item per date and never merge them.",
                  "Copy date and time exactly as printed. If the image shows 4/21, return 4/21; never invent a year.",
                  "Join text wrapped across visual lines and preserve catalog/opus numbers.",
                  "Exclude performers, non-date headings, encore placeholders, disclaimers, biographies, work introductions, prose descriptions and captions.",
                  "Exclude concert/session titles ending in 音乐会; they are not musical works.",
                  "Do not turn sentence fragments or every visual line into separate works. Do not infer obscured or unstated text.",
                  "If the image has descriptions but no identifiable program list, set containsProgram=false, rawText to an empty string and programSections to an empty array.",
                ].join("\n"),
              },
            ],
          }],
          maxTokens: 8_000,
          fetchImpl,
          parse: (value) => visionSchema.parse(value),
        });
        const page: OcrPage = {
          url,
          text: result.containsProgram ? result.rawText.trim() : "",
          confidence: Math.round(result.confidence * 100),
          imageHash,
          cacheHit: false,
          provider: config.visionModel,
          programSections: (result.containsProgram ? result.programSections : []).map((section) => ({
            date: cleanOptional(section.date),
            time: cleanOptional(section.time),
            program: section.program.map((item) => ({
              composer: cleanComposer(item.composer),
              title: item.title.trim(),
              alternateTitles: item.alternateTitles.map((title) => title.trim()).filter(Boolean),
              opus: cleanOptional(item.opus),
              movements: item.movements.map((movement) => ({
                number: cleanOptional(movement.number),
                title: movement.title.trim(),
                alternateTitles: movement.alternateTitles.map((title) => title.trim()).filter(Boolean),
              })),
              confidence: "ocr",
            })),
          })),
        };
        await writeFile(cachePath, JSON.stringify(page, null, 2), "utf8");
        return page;
      } catch (error) {
        if (isVisionServiceFailure(error)) visionAvailable = false;
        console.warn(`Vision OCR failed for one image; using Tesseract: ${error instanceof Error ? error.message : error}`);
        return (await getFallback()).recognizeUrl(url);
      }
    },
    async terminate() {
      await fallback?.terminate();
    },
  };
}

function isVisionServiceFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /(?:SJTU AI HTTP (?:401|403|404|429|5\d\d)|fetch failed|network|ECONN|ETIMEDOUT|AbortError)/i.test(message);
}

function cleanOptional(value: string | null | undefined) {
  return value?.trim() || undefined;
}

function cleanComposer(value: string | null | undefined) {
  const normalized = cleanOptional(value);
  if (!normalized) return undefined;
  const parts = normalized.split(/\s*[|｜]\s*/).map((part) => part.trim()).filter(Boolean);
  return parts.find((part) => /[\u3400-\u9fff]/.test(part)) ?? parts[0];
}
