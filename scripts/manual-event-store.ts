import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type {
  ConcertDataset,
  ConcertEvent,
  WechatImportCandidate,
  WechatImportRecord,
} from "../src/types";
import { formatChinaDateLabels } from "./china-time";
import { wechatImportEventDraftSchema } from "./wechat-import-store";

const manualEventFileSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string().datetime(),
  events: z.array(z.custom<ConcertEvent>((value) =>
    typeof value === "object" && value !== null && "id" in value && "startTime" in value,
  )),
});

export type ManualEventFile = z.infer<typeof manualEventFileSchema>;

export async function loadManualEvents(path: string): Promise<ManualEventFile> {
  try {
    return manualEventFileSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (isMissingFile(error)) {
      return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), events: [] };
    }
    throw error;
  }
}

export async function saveManualEvent(path: string, event: ConcertEvent) {
  const current = await loadManualEvents(path);
  const sourceRecordIds = new Set(event.sources?.map((source) => source.sourceRecordId) ?? []);
  const events = current.events.filter((item) =>
    item.id !== event.id &&
    !(item.sources ?? []).some((source) => sourceRecordIds.has(source.sourceRecordId)),
  );
  events.push(event);
  const next: ManualEventFile = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    events: events.sort((a, b) => a.startTime.localeCompare(b.startTime)),
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function addManualEventsToDataset(
  dataset: ConcertDataset,
  manualEvents: ConcertEvent[],
): ConcertDataset {
  if (!manualEvents.length) return dataset;
  const existingRecordIds = new Set(
    dataset.events.flatMap((event) => event.sources?.map((source) => source.sourceRecordId) ?? []),
  );
  const sourcesById = new Map(dataset.sources.map((source) => [source.id, source]));
  const manualCountBySource = new Map<string, number>();
  for (const event of manualEvents) {
    for (const source of event.sources ?? []) {
      manualCountBySource.set(source.sourceId, (manualCountBySource.get(source.sourceId) ?? 0) + 1);
      if (!sourcesById.has(source.sourceId)) {
        sourcesById.set(source.sourceId, {
          id: source.sourceId,
          name: source.sourceName,
          url: source.sourceUrl,
          ok: true,
          eventCount: 0,
        });
      }
    }
  }
  for (const [sourceId, eventCount] of manualCountBySource) {
    const source = sourcesById.get(sourceId);
    if (source) sourcesById.set(sourceId, { ...source, ok: true, eventCount });
  }
  const newManualCount = manualEvents.filter((event) =>
    !(event.sources ?? []).some((source) => existingRecordIds.has(source.sourceRecordId)),
  ).length;
  return {
    ...dataset,
    events: [...manualEvents, ...dataset.events],
    sources: Array.from(sourcesById.values()),
    stats: {
      ...dataset.stats,
      rawEvents: dataset.stats.rawEvents + newManualCount,
    },
  };
}

export function buildWechatManualEvent(
  record: WechatImportRecord,
  candidate: WechatImportCandidate,
  reviewedAt: string,
): ConcertEvent {
  if (!record.articleUrl) throw new Error("确认前需要填写公众号文章链接");
  const draft = wechatImportEventDraftSchema.parse(candidate.event);
  if (!draft.title || !draft.city || !draft.venue) {
    throw new Error("确认前需要填写标题、城市和场馆");
  }
  const startDate = new Date(draft.startTime);
  if (Number.isNaN(startDate.getTime())) throw new Error("演出时间格式无效");
  if (!draft.program.length) throw new Error("确认前至少需要填写一首曲目");

  const labels = formatChinaDateLabels(startDate);
  const accountLabel = record.accountName?.trim();
  const sourceName = accountLabel
    ? `${accountLabel}（公众号人工导入）`
    : "微信公众号（人工导入）";
  const sourceId = `wechat_${hash(accountLabel || "unknown").slice(0, 12)}`;
  const sourceRecordId = `wechat_${hash(`${record.id}:${candidate.id}`)}`;
  const priceTiers = Array.from(new Set(
    (draft.price?.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((value) => value >= 0),
  )).sort((a, b) => a - b);
  const program = draft.program.map((item) => ({
    composer: item.composer?.trim() || undefined,
    title: item.title.trim(),
    alternateTitles: item.alternateTitles?.map((title) => title.trim()).filter(Boolean),
    opus: item.opus?.trim() || undefined,
    credits: item.credits,
    movements: item.movements,
    confidence: "manual" as const,
  }));

  return {
    id: `perf_${hash(`${sourceRecordId}:${draft.startTime}`)}`,
    title: draft.title,
    city: draft.city,
    venue: draft.venue,
    hall: draft.hall || undefined,
    startTime: startDate.toISOString(),
    endTime: draft.endTime ? new Date(draft.endTime).toISOString() : undefined,
    weekday: labels.weekday,
    dateLabel: labels.dateLabel,
    timeLabel: labels.timeLabel,
    price: draft.price || undefined,
    priceTiers: priceTiers.length ? priceTiers : undefined,
    description: draft.description || undefined,
    status: "scheduled",
    ticketUrl: draft.ticketUrl || undefined,
    sourceName,
    sourceUrl: record.articleUrl,
    scrapedAt: reviewedAt,
    sources: [{
      sourceId,
      sourceName,
      sourceRecordId,
      sourceUrl: record.articleUrl,
      ticketUrl: draft.ticketUrl || undefined,
      scrapedAt: reviewedAt,
    }],
    ensemble: draft.ensemble || undefined,
    conductor: draft.conductor || undefined,
    performers: unique(draft.performers),
    composers: unique(program.map((item) => item.composer).filter((value): value is string => Boolean(value))),
    program,
    tags: unique(draft.tags),
    dataQuality: "manual-reviewed",
    review: {
      status: "approved",
      reviewedAt,
      note: `由公众号文章半自动导入并人工确认${record.articleTitle ? `：${record.articleTitle}` : ""}`,
    },
  };
}

function hash(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isMissingFile(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
