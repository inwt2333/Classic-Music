import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type {
  ConcertEvent,
  ManualReviewDecision,
  ProgramItem,
} from "../src/types";

const programItemSchema: z.ZodType<ProgramItem> = z.object({
  id: z.string().optional(),
  workId: z.string().optional(),
  composer: z.string().optional(),
  title: z.string().trim().min(1),
  alternateTitles: z.array(z.string().trim().min(1)).optional(),
  opus: z.string().optional(),
  movements: z.array(z.object({
    number: z.string().optional(),
    title: z.string().trim().min(1),
    alternateTitles: z.array(z.string().trim().min(1)).optional(),
  })).optional(),
  confidence: z.enum(["title-inferred", "official", "ocr", "ai", "manual"]),
});

export const manualReviewDecisionSchema: z.ZodType<ManualReviewDecision> = z.object({
  eventId: z.string().min(1),
  sourceRecordIds: z.array(z.string().min(1)),
  status: z.enum(["approved", "rejected"]),
  program: z.array(programItemSchema),
  note: z.string().trim().max(1000).optional(),
  reviewedAt: z.string().datetime(),
}).superRefine((decision, context) => {
  if (decision.status === "approved" && !decision.program.length) {
    context.addIssue({
      code: "custom",
      path: ["program"],
      message: "确认节目单时至少需要一首曲目",
    });
  }
});

const manualReviewFileSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string().datetime(),
  decisions: z.array(manualReviewDecisionSchema),
});

export type ManualReviewFile = z.infer<typeof manualReviewFileSchema>;

export async function loadManualReviews(path: string): Promise<ManualReviewFile> {
  try {
    return manualReviewFileSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (isMissingFile(error)) {
      return {
        schemaVersion: 1,
        updatedAt: new Date(0).toISOString(),
        decisions: [],
      };
    }
    throw error;
  }
}

export async function saveManualReview(
  path: string,
  input: ManualReviewDecision,
) {
  const decision = manualReviewDecisionSchema.parse(input);
  const current = await loadManualReviews(path);
  const decisions = current.decisions.filter(
    (item) =>
      item.eventId !== decision.eventId &&
      !item.sourceRecordIds.some((id) => decision.sourceRecordIds.includes(id)),
  );
  decisions.push(decision);
  const next: ManualReviewFile = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    decisions: decisions.sort((a, b) => a.eventId.localeCompare(b.eventId)),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function applyManualReviews(
  events: ConcertEvent[],
  decisions: ManualReviewDecision[],
) {
  return events.map((event) => {
    const sourceRecordIds = event.sources?.map((source) => source.sourceRecordId) ?? [];
    const decision = decisions.find(
      (item) =>
        item.eventId === event.id ||
        item.sourceRecordIds.some((id) => sourceRecordIds.includes(id)),
    );
    if (!decision) return event;

    if (decision.status === "approved") {
      return {
        ...event,
        program: decision.program.map(toManualProgramItem),
        dataQuality: "manual-reviewed" as const,
        extraction: event.extraction
          ? { ...event.extraction, reviewRequired: false }
          : undefined,
        review: {
          status: decision.status,
          reviewedAt: decision.reviewedAt,
          note: decision.note,
        },
      };
    }

    const officialProgram = event.dataQuality === "manual-reviewed"
      ? []
      : event.program.filter((item) => item.confidence === "official");
    return {
      ...event,
      program: officialProgram,
      dataQuality: officialProgram.length ? "scraped" as const : "needs-review" as const,
      extraction: event.extraction
        ? { ...event.extraction, reviewRequired: false }
        : undefined,
      review: {
        status: decision.status,
        reviewedAt: decision.reviewedAt,
        note: decision.note,
      },
    };
  });
}

function toManualProgramItem(item: ProgramItem): ProgramItem {
  return {
    composer: item.composer?.trim() || undefined,
    title: item.title.trim(),
    alternateTitles: item.alternateTitles?.map((title) => title.trim()).filter(Boolean),
    opus: item.opus?.trim() || undefined,
    movements: item.movements?.map((movement) => ({
      number: movement.number?.trim() || undefined,
      title: movement.title.trim(),
      alternateTitles: movement.alternateTitles?.map((title) => title.trim()).filter(Boolean),
    })),
    confidence: "manual",
  };
}

function isMissingFile(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
