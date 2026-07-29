import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { ConcertDataset, ConcertEvent, ReviewQueueItem } from "../src/types";
import { parseOrientalArtCenterOcrText } from "./adapters/shanghai-oriental-art-center";
import { reapplyManualReviewsAndPersist } from "./data-store";
import {
  manualReviewDecisionSchema,
  saveManualReview,
} from "./review-store";

type OcrInspectFile = {
  projectId: string;
  extraction: {
    accepted: boolean;
    confidence: number;
    rawText: string;
    reasons: string[];
    pages: Array<{ url: string }>;
    program: ConcertEvent["program"];
  };
};

export function reviewApiPlugin(root = process.cwd()): Plugin {
  let writeQueue = Promise.resolve();
  return {
    name: "classic-music-review-api",
    configureServer(server) {
      server.middlewares.use("/api/reviews", async (request, response) => {
        try {
          if (request.method === "GET") {
            return sendJson(response, 200, await readReviewQueue(root));
          }
          if (request.method === "POST") {
            const body = await readJsonBody(request);
            const parsed = manualReviewDecisionSchema.parse({
              ...body,
              reviewedAt: new Date().toISOString(),
            });
            const currentQueue = await readReviewQueue(root);
            const queueItem = currentQueue.find(
              (item) => item.event.id === parsed.eventId,
            );
            if (!queueItem) throw new Error("该演出已不在待审核队列中，请刷新页面");
            const decision = {
              ...parsed,
              sourceRecordIds: queueItem.sourceRecordIds,
            };
            writeQueue = writeQueue.catch(() => undefined).then(async () => {
              await saveManualReview(
                resolve(root, "data/manual-reviews.json"),
                decision,
              );
              await reapplyManualReviewsAndPersist(
                resolve(root, "public/data/events.json"),
                resolve(root, "data/classic-music.db"),
              );
            });
            await writeQueue;
            return sendJson(response, 200, {
              ok: true,
              queue: await readReviewQueue(root),
            });
          }
          response.setHeader("allow", "GET, POST");
          return sendJson(response, 405, { error: "不支持的请求方法" });
        } catch (error) {
          return sendJson(response, 400, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    },
  };
}

export async function readReviewQueue(root: string): Promise<ReviewQueueItem[]> {
  const dataset = JSON.parse(
    await readFile(resolve(root, "public/data/events.json"), "utf8"),
  ) as ConcertDataset;
  const pending = dataset.events.filter(
    (event) =>
      !event.review &&
      (
        event.dataQuality === "needs-review" ||
        event.dataQuality === "ocr-assisted" ||
        event.dataQuality === "ai-enhanced"
      ),
  );
  const ungrouped = await Promise.all(
    pending.map(async (event) => ({
      event,
      reason: reviewReason(event),
      sourceRecordIds:
        event.sources?.map((source) => source.sourceRecordId) ?? [event.id],
      ocr: await readOcrInspect(root, event),
    })),
  );
  const grouped = new Map<string, ReviewQueueItem>();
  for (const item of ungrouped) {
    const key = reviewGroupKey(item);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, item);
      continue;
    }
    current.sourceRecordIds = Array.from(
      new Set([...current.sourceRecordIds, ...item.sourceRecordIds]),
    );
  }
  const items = Array.from(grouped.values());
  return items.sort(
    (a, b) =>
      Number(Boolean(b.ocr)) - Number(Boolean(a.ocr)) ||
      new Date(a.event.startTime).getTime() - new Date(b.event.startTime).getTime(),
  );
}

async function readOcrInspect(root: string, event: ConcertEvent) {
  const projectId = orientalArtCenterProjectId(event);
  if (!projectId) return undefined;
  try {
    const inspect = JSON.parse(
      await readFile(
        resolve(root, "data/ocr-inspect", `${projectId}.json`),
        "utf8",
      ),
    ) as OcrInspectFile;
    const eventProgram = parseOrientalArtCenterOcrText(
      inspect.extraction.rawText,
      { showDate: new Date(event.startTime) },
    );
    return {
      projectId,
      rawText: inspect.extraction.rawText,
      reasons: inspect.extraction.reasons,
      images: inspect.extraction.pages.map((page) => page.url),
      confidence: inspect.extraction.confidence,
      accepted: inspect.extraction.accepted,
      program: eventProgram.length ? eventProgram : inspect.extraction.program,
    };
  } catch {
    return undefined;
  }
}

function reviewGroupKey(item: ReviewQueueItem) {
  if (!item.ocr) return item.event.id;
  const programSignature = item.ocr.program
    .map((program) => `${program.composer ?? ""}:${program.title}:${program.opus ?? ""}`)
    .join("|");
  return `${item.ocr.projectId}:${programSignature}`;
}

function orientalArtCenterProjectId(event: ConcertEvent) {
  for (const source of event.sources ?? []) {
    const urlId = source.sourceUrl.match(/[?&]projectId=(\d+)/)?.[1];
    if (urlId) return urlId;
    const recordId = source.sourceRecordId.match(/^shoac_(\d+)_/)?.[1];
    if (recordId) return recordId;
  }
  return event.sourceUrl.match(/[?&]projectId=(\d+)/)?.[1];
}

function reviewReason(event: ConcertEvent) {
  if (event.dataQuality === "ocr-assisted") {
    return `OCR 节目单待确认${event.extraction?.confidence !== undefined
      ? `，置信度 ${event.extraction.confidence}`
      : ""}`;
  }
  if (event.extraction?.method === "ocr") {
    if (event.extraction.accepted) {
      return `OCR 候选待人工确认${event.extraction.confidence !== undefined
        ? `，置信度 ${event.extraction.confidence}`
        : ""}`;
    }
    return `OCR 未通过自动门槛：${event.extraction.reasons?.join("；") || "未解析出可信节目单"}`;
  }
  if (event.dataQuality === "ai-enhanced") return "AI 辅助节目单待确认";
  return "官网缺少可确认的文字节目单";
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 2 * 1024 * 1024) throw new Error("审核内容超过 2 MB");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}
