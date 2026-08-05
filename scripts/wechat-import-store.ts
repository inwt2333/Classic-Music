import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type {
  ProgramItem,
  WechatImportCandidate,
  WechatImportEventDraft,
  WechatImportRecord,
} from "../src/types";

const programItemSchema: z.ZodType<ProgramItem> = z.object({
  id: z.string().optional(),
  workId: z.string().optional(),
  composer: z.string().trim().optional(),
  title: z.string().trim().min(1),
  alternateTitles: z.array(z.string().trim().min(1)).optional(),
  opus: z.string().trim().optional(),
  credits: z.array(z.object({ name: z.string().trim().min(1), role: z.string().trim().min(1) })).optional(),
  movements: z.array(z.object({
    number: z.string().trim().optional(),
    title: z.string().trim().min(1),
    alternateTitles: z.array(z.string().trim().min(1)).optional(),
  })).optional(),
  confidence: z.enum(["title-inferred", "official", "ocr", "ai", "manual"]),
});

export const wechatImportEventDraftSchema: z.ZodType<WechatImportEventDraft> = z.object({
  title: z.string().trim(),
  city: z.string().trim(),
  venue: z.string().trim(),
  hall: z.string().trim().optional(),
  startTime: z.string().trim(),
  endTime: z.string().trim().optional(),
  price: z.string().trim().optional(),
  ticketUrl: z.string().url().optional().or(z.literal("")),
  description: z.string().trim().max(5000).optional(),
  ensemble: z.string().trim().optional(),
  conductor: z.string().trim().optional(),
  performers: z.array(z.string().trim().min(1)),
  program: z.array(programItemSchema),
  tags: z.array(z.string().trim().min(1)),
});

const candidateSchema: z.ZodType<WechatImportCandidate> = z.object({
  id: z.string().min(1),
  status: z.enum(["pending", "approved", "rejected"]),
  event: wechatImportEventDraftSchema,
  reasons: z.array(z.string()),
  reviewedAt: z.string().datetime().optional(),
});

const recordSchema: z.ZodType<WechatImportRecord> = z.object({
  id: z.string().min(1),
  articleUrl: z.string().url().optional(),
  articleTitle: z.string().optional(),
  accountName: z.string().optional(),
  publishedAt: z.string().optional(),
  rawText: z.string().max(300_000),
  importedAt: z.string().datetime(),
  extractionMethod: z.enum(["rules", "deepseek"]),
  candidates: z.array(candidateSchema).min(1),
});

const inboxSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string().datetime(),
  imports: z.array(recordSchema),
});

export type WechatInbox = z.infer<typeof inboxSchema>;

export async function loadWechatInbox(path: string): Promise<WechatInbox> {
  try {
    return inboxSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (isMissingFile(error)) {
      return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), imports: [] };
    }
    throw error;
  }
}

export async function saveWechatImport(path: string, record: WechatImportRecord) {
  const parsed = recordSchema.parse(record);
  const current = await loadWechatInbox(path);
  const existing = current.imports.find((item) => item.id === parsed.id);
  const merged = existing ? {
    ...parsed,
    candidates: parsed.candidates.map((candidate) => {
      const previous = existing.candidates.find((item) => item.id === candidate.id);
      return previous?.status === "approved" || previous?.status === "rejected"
        ? previous
        : candidate;
    }),
  } : parsed;
  const imports = [merged, ...current.imports.filter((item) => item.id !== parsed.id)]
    .slice(0, 100);
  return writeInbox(path, imports);
}

export async function updateWechatCandidate(
  path: string,
  importId: string,
  candidateId: string,
  update: Pick<WechatImportCandidate, "status" | "event" | "reviewedAt">,
) {
  const current = await loadWechatInbox(path);
  let found = false;
  const imports = current.imports.map((record) => {
    if (record.id !== importId) return record;
    return {
      ...record,
      candidates: record.candidates.map((candidate) => {
        if (candidate.id !== candidateId) return candidate;
        found = true;
        return candidateSchema.parse({ ...candidate, ...update });
      }),
    };
  });
  if (!found) throw new Error("导入候选不存在，请刷新页面");
  return writeInbox(path, imports);
}

async function writeInbox(path: string, imports: WechatImportRecord[]) {
  const next: WechatInbox = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    imports,
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function isMissingFile(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
