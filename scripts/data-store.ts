import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ChangeDataset,
  ConcertDataset,
  ConcertEvent,
  ConcertEventSummary,
  ConcertIndexDataset,
  DatasetChange,
  EntityDataset,
  EntityRecord,
  EventSourceReference,
  ProgramCredit,
  ProgramItem,
} from "../src/types";
import { formatChinaDateLabels } from "./china-time";
import { addManualEventsToDataset, loadManualEvents } from "./manual-event-store";
import { normalizeIdentity } from "./identity";
import { canonicalPersonName, isEnsembleName, personNameVariants } from "../src/person-identity";
import {
  loadKnowledgeRegistry,
  mapProgramItemToKnowledge,
  prepareKnowledge,
  type KnowledgeRegistry,
  type PreparedKnowledge,
} from "./knowledge-store";
import { applyManualReviews, loadManualReviews } from "./review-store";
import { attachOcrEvidence, loadOcrEvidence } from "./ocr/evidence";
import { mergeXinghaiProgramTranslations } from "./adapters/xinghai-concert-hall";

type PreparedData = {
  dataset: ConcertDataset;
  index: ConcertIndexDataset;
  entities: EntityDataset;
  changes: ChangeDataset;
  eventRedirects: Record<string, string>;
  publishedDataset: ConcertDataset;
  publishedEntities: EntityDataset;
  knowledge: PreparedKnowledge;
};

export async function prepareAndPersistDataset(
  dataset: ConcertDataset,
  outputPath: string,
  databasePath: string,
) {
  const previous = await readPreviousDataset(outputPath);
  const recoveredDataset = restoreFailedSourceEvents(dataset, previous);
  const retainedDataset = restoreUnavailableSourceEvents(
    recoveredDataset,
    previous,
    ["harbin-music-hall-maitix"],
  );
  const manualEventPath = resolve(dirname(databasePath), "manual-events.json");
  const manualEvents = await loadManualEvents(manualEventPath);
  const datasetWithManualEvents = addManualEventsToDataset(retainedDataset, manualEvents.events);
  const ocrEvidence = await loadOcrEvidence(resolve(dirname(databasePath), "ocr-inspect"));
  const eventsWithOcrEvidence = attachOcrEvidence(datasetWithManualEvents.events, ocrEvidence);
  const canonicalEvents = preserveTrustedPreviousPrograms(
    mergeCrossSourceEvents(
      normalizeKnownSourceFields(eventsWithOcrEvidence),
      datasetWithManualEvents.sources,
    ),
    previous?.events ?? [],
  );
  const reviewPath = resolve(dirname(databasePath), "manual-reviews.json");
  const reviews = await loadManualReviews(reviewPath);
  const knowledgeRegistry = await loadKnowledgeRegistry(resolve(dirname(databasePath), ".."));
  const reviewedEvents = assignProgramIdentities(
    applyManualReviews(canonicalEvents, reviews.decisions),
    knowledgeRegistry,
  );
  const canonicalDataset: ConcertDataset = {
    ...datasetWithManualEvents,
    schemaVersion: 2,
    events: reviewedEvents,
    stats: { ...retainedDataset.stats, normalizedEvents: reviewedEvents.length },
  };
  const entities = buildEntities(canonicalDataset);
  const latestChanges = buildChanges(previous, canonicalDataset);
  const changes = mergeChangeHistory(
    await readPreviousChangeHistory(resolve(dirname(outputPath), "changes.json")),
    latestChanges,
  );
  const eventRedirects = await mergeEventRedirects(
    resolve(dirname(outputPath), "redirects.json"),
    buildEventRedirects(previous, canonicalDataset),
    canonicalDataset,
  );
  const publishedDataset = toPublishedDataset(canonicalDataset);
  const index = buildIndex(publishedDataset);
  const publishedEntities = buildEntities(publishedDataset);
  const knowledge = prepareKnowledge(knowledgeRegistry, publishedDataset);
  const prepared = { dataset: canonicalDataset, index, entities, changes, eventRedirects, publishedDataset, publishedEntities, knowledge };

  await persistSqlite(prepared, databasePath);
  await exportStaticData(prepared, outputPath);
  return prepared;
}

export async function reapplyManualReviewsAndPersist(
  outputPath: string,
  databasePath: string,
) {
  const previous = await readPreviousDataset(outputPath);
  if (!previous) throw new Error("当前数据集不存在，无法应用审核结果");
  const manualEventPath = resolve(dirname(databasePath), "manual-events.json");
  const manualEvents = await loadManualEvents(manualEventPath);
  const datasetWithManualEvents = addManualEventsToDataset(previous, manualEvents.events);
  const ocrEvidence = await loadOcrEvidence(resolve(dirname(databasePath), "ocr-inspect"));
  const eventsWithOcrEvidence = attachOcrEvidence(datasetWithManualEvents.events, ocrEvidence);
  const reviewPath = resolve(dirname(databasePath), "manual-reviews.json");
  const reviews = await loadManualReviews(reviewPath);
  const knowledgeRegistry = await loadKnowledgeRegistry(resolve(dirname(databasePath), ".."));
  const reviewedEvents = assignProgramIdentities(
    applyManualReviews(
      mergeCrossSourceEvents(
        normalizeKnownSourceFields(eventsWithOcrEvidence),
        datasetWithManualEvents.sources,
      ),
      reviews.decisions,
    ),
    knowledgeRegistry,
  );
  const reviewedDataset: ConcertDataset = {
    ...datasetWithManualEvents,
    events: reviewedEvents,
    stats: {
      ...datasetWithManualEvents.stats,
      normalizedEvents: reviewedEvents.length,
    },
  };
  const entities = buildEntities(reviewedDataset);
  const latestChanges = buildChanges(previous, reviewedDataset);
  const changes = mergeChangeHistory(
    await readPreviousChangeHistory(resolve(dirname(outputPath), "changes.json")),
    latestChanges,
  );
  const eventRedirects = await mergeEventRedirects(
    resolve(dirname(outputPath), "redirects.json"),
    buildEventRedirects(previous, reviewedDataset),
    reviewedDataset,
  );
  const publishedDataset = toPublishedDataset(reviewedDataset);
  const index = buildIndex(publishedDataset);
  const publishedEntities = buildEntities(publishedDataset);
  const knowledge = prepareKnowledge(knowledgeRegistry, publishedDataset);
  const prepared = {
    dataset: reviewedDataset,
    index,
    entities,
    changes,
    eventRedirects,
    publishedDataset,
    publishedEntities,
    knowledge,
  };

  await persistSqlite(prepared, databasePath);
  await exportStaticData(prepared, outputPath);
  return prepared;
}

export function restoreFailedSourceEvents(
  current: ConcertDataset,
  previous: ConcertDataset | null,
): ConcertDataset {
  if (!previous || previous.schemaVersion !== 2) return current;

  const failedSources = current.sources.filter((source) => !source.ok);
  if (!failedSources.length) return current;

  const failedIds = new Set(failedSources.map((source) => source.id));
  const failedNames = new Set(failedSources.map((source) => source.name));
  const retainedEvents: ConcertEvent[] = [];
  const retainedCountBySource = new Map<string, number>();

  for (const event of previous.events) {
    const retainedReferences = (event.sources ?? []).filter((source) => failedIds.has(source.sourceId));
    const belongsToLegacySource = !event.sources?.length && failedNames.has(event.sourceName);
    if (!retainedReferences.length && !belongsToLegacySource) continue;

    const primaryReference = retainedReferences[0];
    retainedEvents.push({
      ...event,
      sourceName: primaryReference?.sourceName ?? event.sourceName,
      sourceUrl: primaryReference?.sourceUrl ?? event.sourceUrl,
      ticketUrl: primaryReference?.ticketUrl ?? event.ticketUrl,
      sources: retainedReferences.length ? retainedReferences : event.sources,
    });

    if (retainedReferences.length) {
      for (const sourceId of new Set(retainedReferences.map((source) => source.sourceId))) {
        retainedCountBySource.set(sourceId, (retainedCountBySource.get(sourceId) ?? 0) + 1);
      }
    } else {
      const sourceId = failedSources.find((source) => source.name === event.sourceName)?.id;
      if (sourceId) retainedCountBySource.set(sourceId, (retainedCountBySource.get(sourceId) ?? 0) + 1);
    }
  }

  return {
    ...current,
    events: [...current.events, ...retainedEvents],
    sources: current.sources.map((source) =>
      source.ok ? source : { ...source, eventCount: retainedCountBySource.get(source.id) ?? 0 },
    ),
  };
}

export function restoreUnavailableSourceEvents(
  current: ConcertDataset,
  previous: ConcertDataset | null,
  sourceIds: string[],
  now = Date.now(),
): ConcertDataset {
  if (!previous || previous.schemaVersion !== 2 || !sourceIds.length) return current;

  const retainedSourceIds = new Set(sourceIds);
  const sourceNameById = new Map(current.sources.map((source) => [source.id, source.name]));
  const eligibleSourceIds = new Set(
    current.sources
      .filter((source) => source.ok && retainedSourceIds.has(source.id))
      .map((source) => source.id),
  );
  if (!eligibleSourceIds.size) return current;

  const belongsToSource = (event: ConcertEvent, sourceId: string) =>
    event.sources?.some((reference) => reference.sourceId === sourceId)
    || event.sourceName === sourceNameById.get(sourceId);
  const isSameOccurrence = (left: ConcertEvent, right: ConcertEvent) =>
    left.startTime === right.startTime
    && normalizeIdentity(left.title) === normalizeIdentity(right.title);

  const retainedEvents: ConcertEvent[] = [];
  const retainedCountBySource = new Map<string, number>();
  for (const event of previous.events) {
    if (new Date(event.startTime).getTime() < now) continue;
    const references = (event.sources ?? []).filter((reference) => eligibleSourceIds.has(reference.sourceId));
    const legacySourceId = references.length
      ? undefined
      : Array.from(eligibleSourceIds).find((sourceId) => event.sourceName === sourceNameById.get(sourceId));
    const eventSourceIds = references.length ? references.map((reference) => reference.sourceId) : legacySourceId ? [legacySourceId] : [];
    if (!eventSourceIds.length) continue;

    const missingSourceIds = eventSourceIds.filter((sourceId) =>
      !current.events.some((candidate) => belongsToSource(candidate, sourceId) && isSameOccurrence(candidate, event)),
    );
    if (!missingSourceIds.length) continue;

    const retainedReferences = references.filter((reference) => missingSourceIds.includes(reference.sourceId));
    const primaryReference = retainedReferences[0];
    retainedEvents.push({
      ...event,
      sourceName: primaryReference?.sourceName ?? event.sourceName,
      sourceUrl: primaryReference?.sourceUrl ?? event.sourceUrl,
      ticketUrl: primaryReference?.ticketUrl ?? event.ticketUrl,
      sources: retainedReferences.length ? retainedReferences : event.sources,
    });
    for (const sourceId of missingSourceIds) {
      retainedCountBySource.set(sourceId, (retainedCountBySource.get(sourceId) ?? 0) + 1);
    }
  }

  if (!retainedEvents.length) return current;
  return {
    ...current,
    events: [...current.events, ...retainedEvents],
    sources: current.sources.map((source) => {
      const retainedCount = retainedCountBySource.get(source.id) ?? 0;
      if (!retainedCount) return source;
      const retainedMessage = `保留 ${retainedCount} 场此前已发现、但当前列表暂不可见的演出`;
      return {
        ...source,
        eventCount: source.eventCount + retainedCount,
        message: source.message ? `${source.message}；${retainedMessage}` : retainedMessage,
      };
    }),
  };
}

export function preserveTrustedPreviousPrograms(
  current: ConcertEvent[],
  previous: ConcertEvent[],
) {
  if (!current.length || !previous.length) return current;
  const previousMatches = matchPreviousEvents(previous, current);

  return current.map((event) => {
    const old = previousMatches.get(event.id);
    if (event.program.length || !old || !isTrustedProgram(old)) return event;
    return {
      ...event,
      program: old.program,
      composers: unique([...event.composers, ...old.composers]),
      tags: unique([...event.tags, ...old.tags]),
      dataQuality: old.dataQuality,
      extraction: old.extraction,
      review: old.review,
    };
  });
}

function isTrustedProgram(event: ConcertEvent) {
  if (!event.program.length) return false;
  if (event.dataQuality === "ocr-assisted") return event.extraction?.accepted === true;
  return event.dataQuality !== "needs-review";
}

export function mergeCrossSourceEvents(
  events: ConcertEvent[],
  sources: ConcertDataset["sources"],
) {
  const sourceIdByName = new Map(sources.map((source) => [source.name, source.id]));
  const groups: ConcertEvent[][] = [];

  for (const event of events) {
    const existing = groups.find((group) => shouldMerge(group[0], event));
    if (existing) existing.push(event);
    else groups.push([event]);
  }

  return groups.map((group) => mergeEventGroup(group, sourceIdByName));
}

export function buildIndex(dataset: ConcertDataset): ConcertIndexDataset {
  return {
    schemaVersion: 2,
    generatedAt: dataset.generatedAt,
    city: dataset.city,
    sources: dataset.sources,
    stats: dataset.stats,
    events: dataset.events.map(toSummary),
  };
}

export function toPublishedDataset(dataset: ConcertDataset, now = Date.now()): ConcertDataset {
  const events = dataset.events.filter((event) => new Date(event.startTime).getTime() >= now);
  const countBySource = new Map<string, number>();
  for (const event of events) {
    for (const source of event.sources ?? []) {
      countBySource.set(source.sourceId, (countBySource.get(source.sourceId) ?? 0) + 1);
    }
    if (!event.sources?.length) {
      const source = dataset.sources.find((item) => item.name === event.sourceName);
      if (source) countBySource.set(source.id, (countBySource.get(source.id) ?? 0) + 1);
    }
  }

  return {
    ...dataset,
    events,
    sources: dataset.sources.map((source) => ({
      ...source,
      eventCount: countBySource.get(source.id) ?? 0,
    })),
    stats: {
      ...dataset.stats,
      normalizedEvents: events.length,
    },
  };
}

export function buildEntities(dataset: ConcertDataset): EntityDataset {
  const entities = new Map<string, EntityRecord>();
  const now = Date.now();

  for (const event of dataset.events) {
    const upcoming = new Date(event.startTime).getTime() >= now;
    const people = [event.conductor, ...event.performers]
      .filter((value): value is string => Boolean(value))
      .filter((value) => !isEnsembleName(value));
    for (const observedName of new Set(people)) {
      const name = canonicalPersonName(observedName);
      const id = entityId("person", name);
      const current = entities.get(id) ?? {
        id,
        type: "person" as const,
        name,
        aliases: [],
        eventIds: [],
        upcomingEventCount: 0,
      };
      current.aliases = unique([
        ...current.aliases,
        ...personNameVariants(observedName).filter((alias) => alias !== name),
      ]);
      current.eventIds.push(event.id);
      if (upcoming) current.upcomingEventCount += 1;
      entities.set(id, current);
    }

    for (const item of event.program) {
      const id = item.workId ?? workId(item);
      const current = entities.get(id) ?? {
        id,
        type: "work" as const,
        name: item.title,
        subtitle: [item.composer, item.opus].filter(Boolean).join(" · ") || undefined,
        aliases: item.alternateTitles ?? [],
        eventIds: [],
        upcomingEventCount: 0,
      };
      current.aliases = unique([...current.aliases, ...(item.alternateTitles ?? [])]);
      current.eventIds.push(event.id);
      if (upcoming) current.upcomingEventCount += 1;
      entities.set(id, current);
    }
  }

  return {
    generatedAt: dataset.generatedAt ?? new Date().toISOString(),
    entities: Array.from(entities.values())
      .map((entity) => ({ ...entity, eventIds: Array.from(new Set(entity.eventIds)) }))
      .sort((a, b) => b.upcomingEventCount - a.upcomingEventCount || a.name.localeCompare(b.name, "zh-CN")),
  };
}

export function buildEventRedirects(
  previous: ConcertDataset | null,
  current: ConcertDataset,
): Record<string, string> {
  if (!previous || previous.schemaVersion !== 2) return {};
  const matches = matchPreviousEvents(previous.events, current.events);
  const redirects: Record<string, string> = {};
  for (const [currentId, oldEvent] of matches) {
    if (oldEvent.id !== currentId) redirects[oldEvent.id] = currentId;
  }
  return redirects;
}

async function mergeEventRedirects(
  redirectsPath: string,
  latest: Record<string, string>,
  current: ConcertDataset,
): Promise<Record<string, string>> {
  let existing: Record<string, string> = {};
  try {
    const raw = JSON.parse(await readFile(redirectsPath, "utf8"));
    if (raw && typeof raw === "object" && raw.redirects && typeof raw.redirects === "object") {
      existing = raw.redirects as Record<string, string>;
    }
  } catch {
    existing = {};
  }
  const currentIds = new Set(current.events.map((event) => event.id));
  const merged: Record<string, string> = {};
  for (const [from, to] of Object.entries({ ...existing, ...latest })) {
    if (from === to) continue;
    // 跟随链式跳转：被再次合并的事件始终指向当前存活的事件 ID。
    const target = currentIds.has(to) ? to : latest[to];
    if (target && currentIds.has(target) && target !== from) merged[from] = target;
  }
  return merged;
}

export function buildChanges(  previous: ConcertDataset | null,
  current: ConcertDataset,
): ChangeDataset {
  const detectedAt = current.generatedAt ?? new Date().toISOString();
  if (!previous || previous.schemaVersion !== 2) return { generatedAt: detectedAt, changes: [] };

  const changes: DatasetChange[] = [];
  const previousMatches = matchPreviousEvents(previous.events, current.events);
  const matchedPreviousIds = new Set(Array.from(previousMatches.values(), (event) => event.id));

  for (const event of current.events) {
    const old = previousMatches.get(event.id);
    if (!old) {
      changes.push(change(event.id, "added", detectedAt, `新增演出：${event.title}`, undefined, event));
      continue;
    }
    if (old.startTime !== event.startTime) {
      changes.push(change(event.id, "rescheduled", detectedAt, `演出时间变化：${event.title}`, old, event));
    }
    if (old.status !== "cancelled" && event.status === "cancelled") {
      changes.push(change(event.id, "cancelled", detectedAt, `演出取消：${event.title}`, old, event));
    }
    if (old.price !== event.price || JSON.stringify(old.priceTiers) !== JSON.stringify(event.priceTiers)) {
      changes.push(change(event.id, "price", detectedAt, `票价变化：${event.title}`, old, event));
    }
  }

  if (!current.stats.errors.length) {
    for (const event of previous.events) {
      if (!matchedPreviousIds.has(event.id)) {
        changes.push(change(event.id, "removed", detectedAt, `官网不再返回：${event.title}`, event));
      }
    }
  }

  return { generatedAt: detectedAt, changes };
}

function matchPreviousEvents(previous: ConcertEvent[], current: ConcertEvent[]) {
  const matches = new Map<string, ConcertEvent>();
  const previousById = new Map(previous.map((event) => [event.id, event]));
  const usedPreviousIds = new Set<string>();

  for (const event of current) {
    const direct = previousById.get(event.id);
    if (!direct) continue;
    matches.set(event.id, direct);
    usedPreviousIds.add(direct.id);
  }

  const previousBySourceRecord = new Map<string, ConcertEvent[]>();
  for (const event of previous) {
    if (usedPreviousIds.has(event.id)) continue;
    for (const key of sourceRecordKeys(event)) {
      previousBySourceRecord.set(key, [...(previousBySourceRecord.get(key) ?? []), event]);
    }
  }
  for (const event of current) {
    if (matches.has(event.id)) continue;
    const candidates = new Map<string, ConcertEvent>();
    for (const key of sourceRecordKeys(event)) {
      for (const candidate of previousBySourceRecord.get(key) ?? []) {
        if (!usedPreviousIds.has(candidate.id)) candidates.set(candidate.id, candidate);
      }
    }
    if (candidates.size !== 1) continue;
    const candidate = Array.from(candidates.values())[0];
    matches.set(event.id, candidate);
    usedPreviousIds.add(candidate.id);
  }

  const unmatchedCurrentByProject = new Map<string, ConcertEvent[]>();
  const unmatchedPreviousByProject = new Map<string, ConcertEvent[]>();
  for (const event of current) {
    if (!matches.has(event.id) && event.projectId) {
      unmatchedCurrentByProject.set(event.projectId, [...(unmatchedCurrentByProject.get(event.projectId) ?? []), event]);
    }
  }
  for (const event of previous) {
    if (!usedPreviousIds.has(event.id) && event.projectId) {
      unmatchedPreviousByProject.set(event.projectId, [...(unmatchedPreviousByProject.get(event.projectId) ?? []), event]);
    }
  }
  for (const [projectId, currentEvents] of unmatchedCurrentByProject) {
    const previousEvents = unmatchedPreviousByProject.get(projectId) ?? [];
    if (currentEvents.length !== 1 || previousEvents.length !== 1) continue;
    matches.set(currentEvents[0].id, previousEvents[0]);
  }
  return matches;
}

function sourceRecordKeys(event: ConcertEvent) {
  return (event.sources ?? []).map((source) => `${source.sourceId}:${source.sourceRecordId}`);
}

export function mergeChangeHistory(
  previous: ChangeDataset | null,
  latest: ChangeDataset,
): ChangeDataset {
  const cleanedPrevious = previous ? cleanChangeHistory(previous) : null;
  const cleanedLatest = cleanChangeHistory(latest);
  const previousChanges = cleanedPrevious?.changes ?? [];
  const latestChanges = cleanedLatest.changes;
  const changesById = new Map(previousChanges.map((item) => [item.id, item]));
  for (const item of latestChanges) changesById.set(item.id, item);

  const runsByTime = new Map<string, Set<string>>();
  const previousRuns = cleanedPrevious?.runs?.length
    ? cleanedPrevious.runs
    : legacyChangeRuns(previousChanges);
  for (const run of previousRuns) {
    runsByTime.set(
      run.generatedAt,
      new Set(run.changeIds.filter((id) => changesById.has(id))),
    );
  }
  const currentRun = runsByTime.get(latest.generatedAt) ?? new Set<string>();
  for (const id of latestChanges.map((item) => item.id)) currentRun.add(id);
  runsByTime.set(latest.generatedAt, currentRun);

  return {
    schemaVersion: 2,
    generatedAt: latest.generatedAt,
    latestChangeIds: latestChanges.map((item) => item.id),
    runs: Array.from(runsByTime, ([generatedAt, ids]) => ({
      generatedAt,
      changeIds: Array.from(ids),
    })).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)),
    changes: Array.from(changesById.values())
      .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt) || a.id.localeCompare(b.id)),
  };
}

export function cleanChangeHistory(history: ChangeDataset): ChangeDataset {
  const changes = history.changes.filter((item) => item.type !== "program" && item.type !== "lineup");
  const retainedIds = new Set(changes.map((item) => item.id));
  return {
    ...history,
    latestChangeIds: history.latestChangeIds?.filter((id) => retainedIds.has(id)),
    runs: history.runs?.map((run) => ({
      ...run,
      changeIds: run.changeIds.filter((id) => retainedIds.has(id)),
    })),
    changes,
  };
}

function legacyChangeRuns(changes: DatasetChange[]) {
  const byTime = new Map<string, string[]>();
  for (const item of changes) {
    byTime.set(item.detectedAt, [...(byTime.get(item.detectedAt) ?? []), item.id]);
  }
  return Array.from(byTime, ([generatedAt, changeIds]) => ({ generatedAt, changeIds }));
}

async function exportStaticData(prepared: PreparedData, outputPath: string) {
  const dataDir = dirname(outputPath);
  const detailDir = resolve(dataDir, "events");
  const knowledgeDir = resolve(dataDir, "knowledge");
  const knowledgeWorkDir = resolve(knowledgeDir, "works");
  const knowledgeComposerDir = resolve(knowledgeDir, "composers");
  await rm(detailDir, { recursive: true, force: true });
  await rm(knowledgeDir, { recursive: true, force: true });
  await Promise.all([
    mkdir(detailDir, { recursive: true }),
    mkdir(knowledgeWorkDir, { recursive: true }),
    mkdir(knowledgeComposerDir, { recursive: true }),
  ]);

  await writeFile(outputPath, `${JSON.stringify(prepared.dataset, null, 2)}\n`, "utf8");
  await writeFile(resolve(dataDir, "events-index.json"), JSON.stringify(prepared.index), "utf8");
  await writeFile(resolve(dataDir, "entities.json"), JSON.stringify(prepared.publishedEntities), "utf8");
  await writeFile(resolve(dataDir, "changes.json"), JSON.stringify(prepared.changes), "utf8");
  await writeFile(
    resolve(dataDir, "redirects.json"),
    JSON.stringify({ schemaVersion: 1, generatedAt: prepared.dataset.generatedAt, redirects: prepared.eventRedirects }),
    "utf8",
  );
  await writeFile(resolve(knowledgeDir, "index.json"), JSON.stringify(prepared.knowledge.index), "utf8");
  await Promise.all([
    ...prepared.publishedDataset.events.map((event) =>
      writeFile(resolve(detailDir, `${event.id}.json`), JSON.stringify(event), "utf8"),
    ),
    ...prepared.knowledge.works.map((work) =>
      writeFile(resolve(knowledgeWorkDir, `${work.id}.json`), JSON.stringify(work), "utf8"),
    ),
    ...prepared.knowledge.composers.map((composer) =>
      writeFile(resolve(knowledgeComposerDir, `${composer.id}.json`), JSON.stringify(composer), "utf8"),
    ),
  ]);
}

async function persistSqlite(prepared: PreparedData, databasePath: string) {
  await mkdir(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS scrape_runs (
      id TEXT PRIMARY KEY, started_at TEXT NOT NULL, event_count INTEGER NOT NULL, errors_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, ok INTEGER NOT NULL, event_count INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_records (
      id TEXT PRIMARY KEY, source_id TEXT NOT NULL, source_url TEXT NOT NULL, scraped_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS venues (
      id TEXT PRIMARY KEY, city TEXT NOT NULL, name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS halls (
      id TEXT PRIMARY KEY, venue_id TEXT NOT NULL, name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, ensemble TEXT, data_quality TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS performances (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL, venue_id TEXT NOT NULL, hall_id TEXT,
      start_time TEXT NOT NULL, end_time TEXT, status TEXT NOT NULL, price_label TEXT, detail_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS event_sources (
      performance_id TEXT NOT NULL, source_record_id TEXT NOT NULL,
      PRIMARY KEY (performance_id, source_record_id)
    );
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY, name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS person_aliases (
      person_id TEXT NOT NULL, alias TEXT NOT NULL, PRIMARY KEY (person_id, alias)
    );
    CREATE TABLE IF NOT EXISTS event_people (
      performance_id TEXT NOT NULL, person_id TEXT NOT NULL, role TEXT NOT NULL,
      PRIMARY KEY (performance_id, person_id, role)
    );
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS event_organizations (
      performance_id TEXT NOT NULL, organization_id TEXT NOT NULL, role TEXT NOT NULL,
      PRIMARY KEY (performance_id, organization_id, role)
    );
    CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY, composer TEXT, title TEXT NOT NULL, opus TEXT
    );
    CREATE TABLE IF NOT EXISTS work_aliases (
      work_id TEXT NOT NULL, alias TEXT NOT NULL, PRIMARY KEY (work_id, alias)
    );
    CREATE TABLE IF NOT EXISTS program_items (
      id TEXT PRIMARY KEY, performance_id TEXT NOT NULL, work_id TEXT NOT NULL, position INTEGER NOT NULL,
      confidence TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS movements (
      id TEXT PRIMARY KEY, program_item_id TEXT NOT NULL, number_label TEXT, title TEXT NOT NULL, position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS price_tiers (
      performance_id TEXT NOT NULL, price REAL NOT NULL, PRIMARY KEY (performance_id, price)
    );
    CREATE TABLE IF NOT EXISTS changes (
      id TEXT PRIMARY KEY, performance_id TEXT NOT NULL, type TEXT NOT NULL, detected_at TEXT NOT NULL, summary TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS field_observations (
      id TEXT PRIMARY KEY, performance_id TEXT NOT NULL, source_record_id TEXT NOT NULL,
      field_name TEXT NOT NULL, value_json TEXT NOT NULL, confidence TEXT NOT NULL, observed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS review_items (
      id TEXT PRIMARY KEY, performance_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);

  database.exec("BEGIN");
  try {
    for (const table of [
      "changes",
      "review_items",
      "price_tiers",
      "movements",
      "program_items",
      "field_observations",
      "event_organizations",
      "organizations",
      "event_people",
      "person_aliases",
      "people",
      "work_aliases",
      "works",
      "event_sources",
      "performances",
      "events",
      "halls",
      "venues",
      "source_records",
      "sources",
    ]) {
      database.exec(`DELETE FROM ${table}`);
    }

    database
      .prepare("INSERT OR REPLACE INTO scrape_runs VALUES (?, ?, ?, ?)")
      .run(
        prepared.dataset.generatedAt,
        prepared.dataset.generatedAt,
        prepared.dataset.events.length,
        JSON.stringify(prepared.dataset.stats.errors),
      );

    const insertSource = database.prepare("INSERT INTO sources VALUES (?, ?, ?, ?, ?)");
    for (const source of prepared.dataset.sources) {
      insertSource.run(source.id, source.name, source.url, source.ok ? 1 : 0, source.eventCount);
    }

    const insertVenue = database.prepare("INSERT OR IGNORE INTO venues VALUES (?, ?, ?)");
    const insertHall = database.prepare("INSERT OR IGNORE INTO halls VALUES (?, ?, ?)");
    const insertEvent = database.prepare("INSERT OR REPLACE INTO events VALUES (?, ?, ?, ?)");
    const insertPerformance = database.prepare("INSERT OR REPLACE INTO performances VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertSourceRecord = database.prepare("INSERT OR REPLACE INTO source_records VALUES (?, ?, ?, ?)");
    const insertEventSource = database.prepare("INSERT OR IGNORE INTO event_sources VALUES (?, ?)");
    const insertPerson = database.prepare("INSERT OR IGNORE INTO people VALUES (?, ?)");
    const insertEventPerson = database.prepare("INSERT OR IGNORE INTO event_people VALUES (?, ?, ?)");
    const insertOrganization = database.prepare("INSERT OR IGNORE INTO organizations VALUES (?, ?, ?)");
    const insertEventOrganization = database.prepare("INSERT OR IGNORE INTO event_organizations VALUES (?, ?, ?)");
    const insertWork = database.prepare("INSERT OR IGNORE INTO works VALUES (?, ?, ?, ?)");
    const insertWorkAlias = database.prepare("INSERT OR IGNORE INTO work_aliases VALUES (?, ?)");
    const insertProgram = database.prepare("INSERT OR REPLACE INTO program_items VALUES (?, ?, ?, ?, ?)");
    const insertMovement = database.prepare("INSERT OR REPLACE INTO movements VALUES (?, ?, ?, ?, ?)");
    const insertPrice = database.prepare("INSERT OR IGNORE INTO price_tiers VALUES (?, ?)");
    const insertReview = database.prepare("INSERT OR REPLACE INTO review_items VALUES (?, ?, ?, ?)");
    const insertObservation = database.prepare("INSERT OR REPLACE INTO field_observations VALUES (?, ?, ?, ?, ?, ?, ?)");

    for (const event of prepared.dataset.events) {
      const venueId = entityId("venue", `${event.city}:${event.venue}`);
      const hallId = event.hall ? entityId("hall", `${venueId}:${event.hall}`) : null;
      const projectId = event.projectId ?? stableId("event", event.id);
      insertVenue.run(venueId, event.city, event.venue);
      if (event.hall && hallId) insertHall.run(hallId, venueId, event.hall);
      insertEvent.run(projectId, event.title, event.ensemble ?? null, event.dataQuality);
      insertPerformance.run(
        event.id,
        projectId,
        venueId,
        hallId,
        event.startTime,
        event.endTime ?? null,
        event.status,
        event.price ?? null,
        JSON.stringify(event),
      );

      for (const source of event.sources ?? []) {
        insertSourceRecord.run(source.sourceRecordId, source.sourceId, source.sourceUrl, source.scrapedAt);
        insertEventSource.run(event.id, source.sourceRecordId);
        for (const [fieldName, value] of [
          ["title", event.title],
          ["startTime", event.startTime],
          ["venue", event.venue],
          ["program", event.program],
        ] as const) {
          insertObservation.run(
            entityId("observation", `${event.id}:${source.sourceRecordId}:${fieldName}`),
            event.id,
            source.sourceRecordId,
            fieldName,
            JSON.stringify(value),
            fieldName === "program" && event.dataQuality !== "scraped"
              ? event.dataQuality === "manual-reviewed"
                ? "manual"
                : event.dataQuality
              : "official",
            source.scrapedAt,
          );
        }
      }

      if (event.ensemble) {
        const organizationId = entityId("organization", event.ensemble);
        insertOrganization.run(organizationId, event.ensemble, "ensemble");
        insertEventOrganization.run(event.id, organizationId, "performer");
      }

      if (event.conductor) {
        const personName = canonicalPersonName(event.conductor);
        const personId = entityId("person", personName);
        insertPerson.run(personId, personName);
        insertEventPerson.run(event.id, personId, "conductor");
      }
      for (const performer of event.performers) {
        if (isEnsembleName(performer)) continue;
        const personName = canonicalPersonName(performer);
        const personId = entityId("person", personName);
        insertPerson.run(personId, personName);
        insertEventPerson.run(event.id, personId, "performer");
      }

      event.program.forEach((item, index) => {
        const itemWorkId = item.workId ?? workId(item);
        const programItemId = item.id ?? entityId("program", `${event.id}:${index}:${itemWorkId}`);
        insertWork.run(itemWorkId, item.composer ?? null, item.title, item.opus ?? null);
        for (const alias of item.alternateTitles ?? []) insertWorkAlias.run(itemWorkId, alias);
        insertProgram.run(programItemId, event.id, itemWorkId, index, item.confidence);
        item.movements?.forEach((movement, movementIndex) => {
          insertMovement.run(
            entityId("movement", `${programItemId}:${movementIndex}`),
            programItemId,
            movement.number ?? null,
            movement.title,
            movementIndex,
          );
        });
      });

      for (const price of event.priceTiers ?? []) insertPrice.run(event.id, price);
      if (
        !event.review &&
        (
          event.dataQuality === "needs-review" ||
          event.dataQuality === "ocr-assisted" ||
          event.dataQuality === "ai-enhanced"
        )
      ) {
        const ocrConfidence =
          event.dataQuality === "ocr-assisted" && event.extraction?.confidence !== undefined
            ? `（OCR 置信度 ${event.extraction.confidence}）`
            : "";
        insertReview.run(
          entityId("review", event.id),
          event.id,
          event.dataQuality === "ocr-assisted"
            ? `图片节目单需要人工复核${ocrConfidence}`
            : event.extraction?.method === "ocr" && event.extraction.accepted
              ? `图片 OCR 候选需要人工确认${event.extraction.confidence !== undefined
                ? `（置信度 ${event.extraction.confidence}）`
                : ""}`
            : event.extraction?.method === "ocr"
              ? `图片 OCR 未通过自动门槛：${event.extraction.reasons?.join("；") || "未解析出可信节目单"}`
            : event.dataQuality === "ai-enhanced"
              ? "AI 辅助节目单需要人工复核"
            : event.program.length
              ? "字段需要人工复核"
              : "缺少可确认节目单",
          prepared.dataset.generatedAt,
        );
      }
    }

    const insertChange = database.prepare("INSERT OR IGNORE INTO changes VALUES (?, ?, ?, ?, ?)");
    for (const item of prepared.changes.changes) {
      insertChange.run(item.id, item.eventId, item.type, item.detectedAt, item.summary);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }
}

function mergeEventGroup(
  group: ConcertEvent[],
  sourceIdByName: Map<string, string>,
): ConcertEvent {
  const ranked = [...group].sort((a, b) => richness(b) - richness(a));
  const base = ranked[0];
  const sources = dedupeSourceReferences(
    group.flatMap((event) =>
      event.sources?.length
        ? event.sources
        : [sourceReference(event, sourceIdByName.get(event.sourceName) ?? "unknown")],
    ),
  );
  const normalizedTitle = normalizeIdentity(base.title);
  const venueKey = normalizeVenue(base.venue);
  const dateLabels = formatChinaDateLabels(new Date(base.startTime));
  const performanceId = stableId("perf", `${normalizedTitle}|${base.startTime}|${venueKey}|${base.hall ?? ""}`);
  const projectId = stableId(
    "event",
    `${normalizedTitle}|${venueKey}|${new Date(base.startTime).getFullYear()}`,
  );
  const program = dedupeProgram(group.flatMap((event) => event.program).map(normalizeProgramItemCredits)).map((item, index) => {
    const itemWorkId = workId(item);
    return {
      ...item,
      id: stableId("program", `${performanceId}:${index}:${itemWorkId}`),
      workId: itemWorkId,
    };
  });
  const dataQuality = mergedProgramQuality(program);
  const extraction =
    dataQuality === "manual-reviewed"
      ? ranked.find((event) => event.extraction)?.extraction
      : dataQuality === "ocr-assisted"
      ? ranked.find((event) => event.extraction?.method === "ocr")?.extraction
      : dataQuality === "ai-enhanced"
        ? ranked.find((event) => event.extraction?.method === "ai")?.extraction
        : dataQuality === "needs-review"
          ? ranked.find((event) => event.extraction)?.extraction
          : undefined;

  return {
    ...base,
    id: performanceId,
    projectId,
    weekday: dateLabels.weekday,
    dateLabel: dateLabels.dateLabel,
    timeLabel: dateLabels.timeLabel,
    description: ranked.find((event) => event.description)?.description,
    price: ranked.find((event) => event.price)?.price,
    priceTiers: Array.from(new Set(group.flatMap((event) => event.priceTiers ?? []))).sort((a, b) => a - b),
    ticketUrl: ranked.find((event) => event.ticketUrl)?.ticketUrl,
    performers: unique(group.flatMap((event) => event.performers)),
    composers: unique([...group.flatMap((event) => event.composers), ...program.map((item) => item.composer)]),
    tags: unique(group.flatMap((event) => event.tags)),
    program,
    sources,
    dataQuality,
    extraction,
    review: ranked.find((event) => event.review)?.review,
  };
}

function mergedProgramQuality(
  program: ProgramItem[],
): ConcertEvent["dataQuality"] {
  if (!program.length) return "needs-review";
  if (program.some((item) => item.confidence === "manual")) return "manual-reviewed";
  if (program.some((item) => item.confidence === "official")) return "scraped";
  if (program.some((item) => item.confidence === "ocr")) return "ocr-assisted";
  if (program.some((item) => item.confidence === "ai")) return "ai-enhanced";
  return "needs-review";
}

function toSummary(event: ConcertEvent): ConcertEventSummary {
  const workLabels = event.program.map((item) => {
    const creditLabels = item.credits?.map(formatProgramCredit) ?? [];
    return [item.composer, item.title, ...(item.alternateTitles ?? []), item.opus, ...creditLabels]
      .filter(Boolean)
      .join(" ");
  });
  const knownGenres = ["交响", "室内乐", "钢琴", "独奏", "合唱", "歌剧"];
  const searchText = [
    event.title,
    event.city,
    event.venue,
    event.hall,
    event.ensemble,
    event.conductor,
    ...event.performers,
    ...event.composers,
    ...event.tags,
    ...workLabels,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("zh-CN");

  return {
    id: event.id,
    projectId: event.projectId,
    title: event.title,
    city: event.city,
    venue: event.venue,
    hall: event.hall,
    startTime: event.startTime,
    endTime: event.endTime,
    weekday: event.weekday,
    dateLabel: event.dateLabel,
    timeLabel: event.timeLabel,
    price: event.price,
    status: event.status,
    ticketStatus: event.ticketStatus,
    ensemble: event.ensemble,
    mainPerson: event.conductor ?? event.performers[0],
    genres: knownGenres.filter((genre) => event.tags.includes(genre) || event.title.includes(genre)),
    dataQuality: event.dataQuality,
    detailPath: `events/${event.id}.json`,
    hasProgram: event.program.length > 0,
    programPreview: event.program.slice(0, 3).map((item) => ({
      workId: item.workId,
      knowledgeWorkId: item.knowledgeWorkId,
      composer: item.composer,
      title: item.title,
      alternateTitles: item.alternateTitles,
      opus: item.opus,
      credits: item.credits,
    })),
    searchText,
    sourceCount: event.sources?.length ?? 1,
  };
}

function shouldMerge(a: ConcertEvent, b: ConcertEvent) {
  if (minuteKey(a.startTime) !== minuteKey(b.startTime)) return false;
  if (normalizeVenue(a.venue) !== normalizeVenue(b.venue)) return false;
  const aHall = normalizeIdentity(a.hall ?? embeddedHall(a.venue));
  const bHall = normalizeIdentity(b.hall ?? embeddedHall(b.venue));
  if (aHall && bHall && aHall !== bHall) return false;

  const aTitle = normalizeIdentity(a.title);
  const bTitle = normalizeIdentity(b.title);
  if (aTitle === bTitle) return true;
  const similarity = diceCoefficient(aTitle, bTitle);
  if (
    similarity >= 0.88 ||
    (Math.min(aTitle.length, bTitle.length) >= 10 &&
      (aTitle.includes(bTitle) || bTitle.includes(aTitle)))
  ) {
    return true;
  }

  const peopleOverlap = intersects([a.conductor, ...a.performers], [b.conductor, ...b.performers]);
  const workOverlap = programIntersects(a.program, b.program);
  if (similarity >= 0.25 && peopleOverlap && workOverlap) return true;
  return similarity >= 0.68 && (peopleOverlap || workOverlap);
}

function sourceReference(event: ConcertEvent, sourceId: string): EventSourceReference {
  return {
    sourceId,
    sourceName: event.sourceName,
    sourceRecordId: event.id,
    sourceUrl: event.sourceUrl,
    ticketUrl: event.ticketUrl,
    scrapedAt: event.scrapedAt,
  };
}

function dedupeSourceReferences(sources: EventSourceReference[]) {
  const byRecord = new Map<string, EventSourceReference>();
  for (const source of sources) {
    byRecord.set(`${source.sourceId}:${source.sourceRecordId}`, source);
  }
  return Array.from(byRecord.values());
}

function richness(event: ConcertEvent) {
  const qualityWeight = {
    "manual-reviewed": 10,
    scraped: 8,
    "ocr-assisted": 2,
    "ai-enhanced": 1,
    "needs-review": 0,
  }[event.dataQuality];
  return event.program.length * 20 +
    event.performers.length * 3 +
    (event.description?.length ?? 0) / 100 +
    qualityWeight;
}

function assignProgramIdentities(
  events: ConcertEvent[],
  knowledgeRegistry: KnowledgeRegistry,
) {
  return events.map((event) => ({
    ...event,
    program: event.program.map((item, index) => {
      const normalizedItem = normalizeProgramItemCredits(item);
      const itemWorkId = workId(normalizedItem);
      const knowledgeMapping = mapProgramItemToKnowledge(normalizedItem, knowledgeRegistry);
      return {
        ...normalizedItem,
        ...knowledgeMapping,
        id: stableId("program", `${event.id}:${index}:${itemWorkId}`),
        workId: itemWorkId,
      };
    }),
  }));
}

function workId(item: ProgramItem) {
  return entityId("work", `${item.composer ?? ""}:${item.title}:${item.opus ?? ""}`);
}

export function normalizeProgramItemCredits(item: ProgramItem): ProgramItem {
  let title = normalizeProgramTitle(item.title);
  let composer = item.composer;
  const credits = [...(item.credits ?? [])];
  const extractedCredits: ProgramCredit[] = [];

  for (let pass = 0; pass < 8; pass += 1) {
    const match = title.match(/^(.*\S)\s+([\u3400-\u9fffA-Za-z【（(][\u3400-\u9fffA-Za-z·.\-、,，（）()【】\s]{0,32}?)\s+(作词|词|传谱|编曲|改编[\u3400-\u9fff]{0,10}|编配[\u3400-\u9fff]{0,12}|配器|原曲|创作|曲)$/u)
      ?? title.match(/^(.*?)([\u3400-\u9fff]{2,6}[（(][^）)]+[）)])\s+(作词|词)$/u);
    if (!match) break;

    const [, remaining, rawName, rawRole] = match;
    const nextTitle = normalizeProgramTitle(remaining);
    const name = normalizeCreditName(rawName);
    const role = normalizeCreditRole(rawRole);
    if (!nextTitle || !name || isLikelyWholeTitleCredit(title, nextTitle)) break;

    title = nextTitle;
    if (role === "曲") {
      if (!composer) composer = name;
      else if (normalizeIdentity(composer) !== normalizeIdentity(name)) addProgramCredit(extractedCredits, { name, role });
      continue;
    }
    addProgramCredit(extractedCredits, { name, role });
  }

  const sourceMatch = title.match(/^(.*\S)\s+(新疆民歌|温州民歌|畲族民歌|山东沂蒙民间小调|河南豫西南民间曲调改编|俄罗斯歌曲连唱|红军革命歌曲)$/u);
  if (sourceMatch) {
    const nextTitle = normalizeProgramTitle(sourceMatch[1]);
    if (nextTitle) {
      title = nextTitle;
      addProgramCredit(extractedCredits, { name: sourceMatch[2], role: "来源" });
    }
  }

  const normalizedCredits = [...credits, ...extractedCredits.reverse()];
  return {
    ...item,
    composer,
    title,
    credits: normalizedCredits.length ? normalizedCredits : undefined,
  };
}

function normalizeProgramTitle(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([：:，,。；;])/g, "$1")
    .trim();
}

function normalizeCreditName(value: string) {
  return value
    .replace(/^【[^】]+】\s*/, "")
    .replace(/^\([^)]*\)\s*/, "")
    .replace(/^（[^）]*）\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCreditRole(value: string) {
  return value === "作词" ? "词" : value.trim();
}

function isLikelyWholeTitleCredit(fullTitle: string, remainingTitle: string) {
  return remainingTitle.length < 2 || normalizeIdentity(fullTitle) === normalizeIdentity(remainingTitle);
}

function addProgramCredit(credits: ProgramCredit[], credit: ProgramCredit) {
  if (!credits.some((item) =>
    normalizeIdentity(item.name) === normalizeIdentity(credit.name) &&
    normalizeIdentity(item.role) === normalizeIdentity(credit.role)
  )) {
    credits.push(credit);
  }
}

function formatProgramCredit(credit: ProgramCredit) {
  return `${credit.name} ${credit.role}`;
}

function entityId(type: string, value: string) {
  return stableId(type, normalizeIdentity(value));
}

function stableId(prefix: string, value: string) {
  return `${prefix}_${createHash("sha1").update(value).digest("hex").slice(0, 16)}`;
}

function normalizeVenue(value: string) {
  return normalizeIdentity(value)
    .replace(/^捷豹/, "")
    .replace(/^凯迪拉克/, "")
    .replace(/^(国家大剧院)(?:音乐厅|歌剧院|戏剧场|小剧场)$/, "$1")
    .replace(/^(北京艺术中心)(?:音乐厅|歌剧院|戏剧场|小剧场)$/, "$1")
    .replace(/^(上海东方艺术中心)(?:音乐厅|歌剧厅|演奏厅)$/, "$1");
}

function normalizeKnownSourceFields(events: ConcertEvent[]) {
  return events.map(normalizeKnownSourceEvent);
}

export function normalizeKnownSourceEvent(event: ConcertEvent): ConcertEvent {
  const sanitized = sanitizeKnownSourceProgram(event);
  if (isXinghaiDetailEvent(sanitized)) {
    const hall = sanitized.hall
      ?? (sanitized.venue === "星海音乐厅"
        ? undefined
        : sanitized.venue.replace(/^星海音乐厅\s*/, "").trim() || undefined);
    return {
      ...sanitized,
      title: sanitized.title.replace(/\s*[-—–－]+\s*星海音乐厅\s*$/, "").trim(),
      venue: "星海音乐厅",
      hall,
      program: mergeXinghaiProgramTranslations(sanitized.program, false),
    };
  }
  if (sanitized.sourceName !== "深圳音乐厅官网") return sanitized;
  const hall = sanitized.hall ?? sanitized.venue.match(/深圳音乐厅\s*(二楼演奏大厅|五楼小剧场|演奏大厅)/)?.[1];
  return { ...sanitized, venue: "深圳音乐厅", hall };
}

function isXinghaiDetailEvent(event: ConcertEvent) {
  return /concerthall\.com\.cn\/events\/neweventdetail\.php/i.test(event.sourceUrl)
    || event.sources?.some((source) => /concerthall\.com\.cn\/events\/neweventdetail\.php/i.test(source.sourceUrl));
}

export function sanitizeKnownSourceProgram(event: ConcertEvent): ConcertEvent {
  const keptProgram = event.program.filter((item) => (
    item.confidence === "manual" || !isUnmistakablyNonProgramItem(item, event.sourceName)
  ));
  if (keptProgram.length === event.program.length) return event;

  const keptComposers = new Set(
    keptProgram.map((item) => normalizeIdentity(item.composer ?? "")).filter(Boolean),
  );
  const rejectedComposers = new Set(
    event.program
      .filter((item) => !keptProgram.includes(item))
      .map((item) => normalizeIdentity(item.composer ?? ""))
      .filter(Boolean),
  );
  const composers = unique([
    ...event.composers.filter((composer) => {
      const key = normalizeIdentity(composer);
      return !rejectedComposers.has(key) || keptComposers.has(key);
    }),
    ...keptProgram.map((item) => item.composer),
  ]);
  const tags = event.tags.filter((tag) => {
    const key = normalizeIdentity(tag);
    return !rejectedComposers.has(key) || keptComposers.has(key);
  });

  return {
    ...event,
    program: keptProgram,
    composers,
    tags,
    dataQuality: mergedProgramQuality(keptProgram),
  };
}

function isUnmistakablyNonProgramItem(item: ProgramItem, sourceName: string) {
  const title = normalizeProgramTitle(item.title);
  const composer = normalizeProgramTitle(item.composer ?? "");
  if (/^(?:注|说明|备注|曲目说明|温馨提示)\s*[：:]/.test(title)) return true;
  if (/^(?:演出|演奏|伴奏|领唱|合唱|独唱|指挥|艺术指导|钢琴伴奏)$/.test(composer)) return true;
  if (/[\[【（(]\s*20\d{2}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}\s*[\]】）)]/.test(title)) return true;

  if (sourceName === "星海音乐厅官网") {
    const sentenceCount = (title.match(/[。！？]/g) ?? []).length;
    if (title.length >= 32 && sentenceCount > 0) return true;
    if (composer.length > 32 || /[。！？；，,]$/.test(composer)) return true;
  }
  return false;
}

function embeddedHall(value: string) {
  return value.match(/(音乐厅|歌剧院|戏剧场|小剧场|歌剧厅|演奏厅|主厅)$/)?.[1] ?? "";
}

function minuteKey(value: string) {
  return value.slice(0, 16);
}

function diceCoefficient(a: string, b: string) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const pairs = new Map<string, number>();
  for (let index = 0; index < a.length - 1; index += 1) {
    const pair = a.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) ?? 0) + 1);
  }
  let overlap = 0;
  for (let index = 0; index < b.length - 1; index += 1) {
    const pair = b.slice(index, index + 2);
    const count = pairs.get(pair) ?? 0;
    if (!count) continue;
    overlap += 1;
    pairs.set(pair, count - 1);
  }
  return (2 * overlap) / (a.length + b.length - 2);
}

function intersects(a: Array<string | undefined>, b: Array<string | undefined>) {
  const left = new Set(a.filter(Boolean).map((value) => normalizeIdentity(value ?? "")));
  return b.some((value) => value && left.has(normalizeIdentity(value)));
}

function programIntersects(a: ProgramItem[], b: ProgramItem[]) {
  return a.some((left) => b.some((right) => programItemsEquivalent(left, right)));
}

function programItemsEquivalent(a: ProgramItem, b: ProgramItem) {
  const aComposer = normalizeIdentity(a.composer ?? "");
  const bComposer = normalizeIdentity(b.composer ?? "");
  if (aComposer && bComposer && aComposer !== bComposer) return false;
  if (workNumberIdentityConflicts(a.title, b.title)) return false;
  if (selectedExcerptIdentityConflicts(a.title, b.title)) return false;
  const similarityThreshold = aComposer && bComposer ? 0.65 : 0.8;
  const titlesMatch = (left: string, right: string) =>
    left === right ||
    (Math.min(left.length, right.length) >= 6 &&
      (left.includes(right) ||
        right.includes(left) ||
        diceCoefficient(left, right) >= similarityThreshold));
  const aMain = normalizeIdentity(a.title);
  const bMain = normalizeIdentity(b.title);
  const aAlternates = (a.alternateTitles ?? []).map(normalizeIdentity).filter(Boolean);
  const bAlternates = (b.alternateTitles ?? []).map(normalizeIdentity).filter(Boolean);
  // A shared alternate alone must not identify a work: at least one side's main
  // title has to match, otherwise arias sharing "from Rigoletto"-style fragments
  // or composer-name lines collapse into one entry during dedupe.
  return Boolean(
    (aMain && bMain && titlesMatch(aMain, bMain)) ||
      aAlternates.some((alternate) => bMain && titlesMatch(alternate, bMain)) ||
      bAlternates.some((alternate) => aMain && titlesMatch(alternate, aMain)),
  );
}

function selectedExcerptIdentityConflicts(a: string, b: string) {
  const excerpt = (value: string) => {
    const match = value.normalize("NFKC").match(/^(.+?)选自(.+)$/);
    return match
      ? { title: normalizeIdentity(match[1]), source: normalizeIdentity(match[2]) }
      : undefined;
  };
  const left = excerpt(a);
  const right = excerpt(b);
  return Boolean(
    left && right && left.source === right.source && left.title && right.title && left.title !== right.title,
  );
}

function workNumberIdentityConflicts(a: string, b: string) {
  const left = workNumberTokens(a);
  const right = workNumberTokens(b);
  return left.length > 0 && right.length > 0 && !left.some((token) => right.includes(token));
}

function workNumberTokens(value: string) {
  const tokens = Array.from(value.matchAll(/\d+/g), (match) => String(Number(match[0])));
  const chineseOrdinals = Array.from(
    value.matchAll(/(?:第|曲)([一二三四五六七八九十]+)(?=\p{L}|$)|([一二三四五六七八九十]+)$/gu),
    (match) => chineseNumber(match[1] || match[2]),
  ).filter((token): token is string => Boolean(token));
  return unique([...tokens, ...chineseOrdinals]);
}

function chineseNumber(value: string) {
  const digits: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  if (value.length === 1) return String(digits[value] ?? "");
  if (value.startsWith("十")) return String(10 + (digits[value[1]] ?? 0));
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    return String((digits[tens] ?? 0) * 10 + (digits[ones] ?? 0));
  }
  return undefined;
}

function dedupeProgram(items: ProgramItem[]) {
  const deduped: ProgramItem[] = [];
  for (const item of items) {
    const existing = deduped.find((candidate) => programItemsEquivalent(candidate, item));
    if (!existing) {
      deduped.push({ ...item });
      continue;
    }
    const alternateTitles = unique([
      ...(existing.alternateTitles ?? []),
      ...(item.alternateTitles ?? []),
      ...(normalizeIdentity(existing.title) === normalizeIdentity(item.title) ? [] : [item.title]),
    ]);
    if (programConfidenceRank(item.confidence) > programConfidenceRank(existing.confidence)) {
      const previousTitle = existing.title;
      Object.assign(existing, item);
      existing.alternateTitles = unique([
        ...alternateTitles,
        ...(normalizeIdentity(previousTitle) === normalizeIdentity(item.title)
          ? []
          : [previousTitle]),
      ]);
    } else {
      existing.alternateTitles = alternateTitles;
      existing.movements = existing.movements?.length ? existing.movements : item.movements;
      existing.opus = existing.opus || item.opus;
      existing.composer = existing.composer || item.composer;
    }
  }
  return deduped;
}

function programConfidenceRank(confidence: ProgramItem["confidence"]) {
  return {
    manual: 5,
    official: 4,
    ocr: 3,
    ai: 2,
    "title-inferred": 1,
  }[confidence];
}

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function change(
  eventId: string,
  type: DatasetChange["type"],
  detectedAt: string,
  summary: string,
  before?: ConcertEvent,
  after?: ConcertEvent,
): DatasetChange {
  return {
    id: stableId("change", `${eventId}:${type}:${detectedAt}:${summary}`),
    eventId,
    type,
    detectedAt,
    summary,
    before: before ? buildChangeEventSnapshot(before) : undefined,
    after: after ? buildChangeEventSnapshot(after) : undefined,
  };
}

export function buildChangeEventSnapshot(event: ConcertEvent) {
  return {
    title: event.title,
    city: event.city,
    venue: event.venue,
    hall: event.hall,
    startTime: event.startTime,
    endTime: event.endTime,
    status: event.status,
    price: event.price,
    conductor: event.conductor,
    performers: event.performers,
    sourceName: event.sourceName,
    programPreview: event.program.map((item) => ({
      composer: item.composer,
      title: item.title,
      opus: item.opus,
      alternateTitles: item.alternateTitles,
      credits: item.credits,
      movements: item.movements,
    })),
  };
}

async function readPreviousChangeHistory(path: string) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as ChangeDataset;
    return Array.isArray(parsed.changes) ? parsed : null;
  } catch {
    return null;
  }
}

async function readPreviousDataset(path: string) {
  const paths = Array.from(new Set([process.env.PREVIOUS_DATASET_PATH, path].filter(Boolean))) as string[];
  let previous: ConcertDataset | null = null;
  for (const candidatePath of paths) {
    try {
      const candidate = JSON.parse(await readFile(candidatePath, "utf8")) as ConcertDataset;
      if (previous === null) {
        previous = candidate;
      } else {
        const primary = previous as ConcertDataset;
        previous = {
          ...primary,
          events: preserveTrustedPreviousPrograms(primary.events, candidate.events),
        };
      }
    } catch {
      // Try the next baseline. A first deployment may not have either file yet.
    }
  }
  return previous;
}
