import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { ConcertDataset, ConcertEvent, ProgramItem } from "../src/types";
import type {
  KnowledgeComposer,
  KnowledgeGeneration,
  KnowledgeSource,
  KnowledgeWork,
  KnowledgeWorkMappingRule,
} from "../src/knowledge/types";
import { fetchWithRetry } from "./fetch-retry";
import { normalizeIdentity } from "./identity";
import type { KnowledgeRegistry } from "./knowledge-store";

const difficultySchema = z.enum(["第一次听", "容易进入", "需要专注", "适合深入"]);
const entityLevelSchema = z.enum(["complete_work", "suite", "movement", "excerpt", "arrangement", "collection", "unknown"]);
function emptyObjectToUndefined(value: unknown) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "object" && !Array.isArray(value)) {
    const item = value as Record<string, unknown>;
    if (Object.keys(item).length === 0) return undefined;
    const composer = typeof item.composer === "string" ? item.composer.trim() : "";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!composer && !title) return undefined;
  }
  return value;
}

function normalizeGeneratedKnowledgePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const root = { ...(value as Record<string, unknown>) };
  if (!root.work || typeof root.work !== "object" || Array.isArray(root.work)) return root;
  const work = { ...(root.work as Record<string, unknown>) };
  for (const key of ["recordings", "movements", "listeningPoints"]) {
    if (root[key] !== undefined && work[key] === undefined) work[key] = root[key];
    delete root[key];
  }
  root.work = work;
  return root;
}
const optionalText = (max?: number) => z.preprocess(
  (value) => value === null || value === "" ? undefined : value,
  (max ? z.string().min(1).max(max) : z.string().min(1)).optional(),
);
const optionalInteger = (options?: { positive?: boolean; min?: number; max?: number }) => z.preprocess(
  (value) => value === null || value === "" ? undefined : value,
  (options?.positive ? z.number().int().positive() : z.number().int())
    .min(options?.min ?? Number.MIN_SAFE_INTEGER)
    .max(options?.max ?? Number.MAX_SAFE_INTEGER)
    .optional(),
);
const optionalDifficulty = z.preprocess(
  (value) => value === null || value === "" ? undefined : value,
  difficultySchema.optional().catch(undefined),
);

export const generatedIdentitySchema = z.object({
  decision: z.enum(["research", "skip"]),
  entityLevel: entityLevelSchema,
  parentIdentity: z.preprocess(emptyObjectToUndefined, z.object({
    composer: z.string().min(1),
    title: z.string().min(1),
    originalTitle: optionalText(),
    opus: optionalText(),
  }).strict().optional()),
  composer: z.object({
    name: z.string().min(1),
    originalName: optionalText(),
  }).strict(),
  work: z.object({
    title: z.string().min(1),
    originalTitle: optionalText(),
    englishTitle: z.string().min(2),
    opus: optionalText(),
  }).strict().nullish().transform((value) => value ?? undefined),
  searchQueries: z.array(z.string().min(2)).min(1).max(6),
  warnings: z.array(z.string().min(1).max(300)).default([]),
}).strict();

export const generatedKnowledgeSchema = z.preprocess(normalizeGeneratedKnowledgePayload, z.object({
  decision: z.enum(["publish", "skip"]),
  entityLevel: entityLevelSchema,
  suggestedCompleteness: z.enum(["basic", "complete"]),
  parentIdentity: z.preprocess(emptyObjectToUndefined, z.object({
    composer: z.string().min(1),
    title: z.string().min(1),
    opus: optionalText(),
  }).strict().optional()),
  composer: z.object({
    name: z.string().min(1),
    originalName: optionalText(),
    aliases: z.array(z.string().min(1)).default([]),
    birthYear: optionalInteger(),
    deathYear: optionalInteger(),
    nationality: optionalText(),
    period: optionalText(),
    introduction: optionalText(500),
    styleSummary: optionalText(400),
  }).strict(),
  work: z.object({
    title: z.string().min(1),
    originalTitle: optionalText(),
    aliases: z.array(z.string().min(1)).default([]),
    opus: optionalText(),
    key: optionalText(),
    genre: optionalText(),
    period: optionalText(),
    composedYears: optionalText(),
    durationMinutes: optionalInteger({ positive: true, max: 300 }),
    instrumentation: optionalText(500),
    difficulty: optionalDifficulty,
    tags: z.array(z.string().min(1).max(24)).max(6).default([]),
    summary: z.string().min(1).max(160),
    whyListen: optionalText(300),
    firstListen: optionalText(300),
    listeningPoints: z.array(z.object({
      title: z.string().min(1).max(80),
      description: z.string().min(1).max(240),
      movement: optionalInteger({ positive: true }),
    }).strict()).max(6).default([]),
    movements: z.array(z.object({
      number: z.number().int().positive(),
      title: z.string().min(1).max(120),
      tempo: optionalText(120),
      description: z.string().min(1).max(240),
    }).strict()).max(20).default([]),
    recordings: z.array(z.object({
      label: optionalText(80),
      performers: z.string().min(1).max(180),
      year: optionalInteger({ min: 1900, max: 2100 }),
      note: z.string().min(1).max(240),
      evidenceId: z.string().min(1),
    }).strict()).max(2).default([]),
  }).strict().nullish().transform((value) => value ?? undefined),
  sourcesUsed: z.array(z.object({
    evidenceId: z.string().min(1),
    supports: z.array(z.string().min(1)).min(1),
  }).strict()),
  warnings: z.array(z.string().min(1).max(300)).default([]),
}).strict());

export const generatedAuditSchema = z.object({
  verdict: z.enum(["pass", "skip"]),
  warnings: z.array(z.string().min(1).max(300)),
}).strict();

export type GeneratedKnowledge = z.infer<typeof generatedKnowledgeSchema>;
export type GeneratedAudit = z.infer<typeof generatedAuditSchema>;
export type GeneratedIdentity = z.infer<typeof generatedIdentitySchema>;

const automationConfigSchema = z.object({
  schemaVersion: z.literal(1),
  enabled: z.boolean(),
  model: z.string().min(1),
  skillVersion: z.string().min(1),
  maxCandidatesPerRun: z.number().int().positive().max(50),
  basicPublishScore: z.number().int().min(0).max(100),
  completePublishScore: z.number().int().min(0).max(100),
  trustedSources: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    score: z.number().int().min(0).max(40),
  }).strict()).min(1),
}).strict();

export type KnowledgeAutomationConfig = z.infer<typeof automationConfigSchema>;

export type KnowledgeEvidence = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  content: string;
  kind: "official" | "wikipedia" | "wikidata" | "musicbrainz" | "recording";
};

export type KnowledgeCandidate = {
  fingerprint: string;
  composer: string;
  title: string;
  opus?: string;
  alternateTitles: string[];
  movements: NonNullable<ProgramItem["movements"]>;
  confidence: ProgramItem["confidence"];
  eventIds: string[];
  eventTitles: string[];
  sourceIds: string[];
  sourceNames: string[];
  sourceUrls: string[];
  sourceScore: number;
  firstSeenAt: string;
  description?: string;
};

export type ExistingWorkResolution = {
  candidate: KnowledgeCandidate;
  workId: string;
  reason: "title" | "catalogue";
};

export type AutomationState = {
  schemaVersion: 1;
  candidates: Record<string, {
    status: "published" | "needs_completion" | "mapped" | "skipped" | "failed";
    workId?: string;
    attempts: number;
    updatedAt: string;
    reason?: string;
    sourceEventIds: string[];
    pipelineVersion?: string;
    nextRetryAt?: string;
  }>;
};

export function parseAutomationConfig(value: unknown) {
  return automationConfigSchema.parse(value);
}

export function discoverKnowledgeCandidates(
  dataset: ConcertDataset,
  registry: KnowledgeRegistry,
  config: KnowledgeAutomationConfig,
) {
  const trusted = new Map(config.trustedSources.map((source) => [source.id, source]));
  const candidates = new Map<string, KnowledgeCandidate>();

  for (const event of dataset.events) {
    const eventSources = (event.sources ?? []).filter((source) => trusted.has(source.sourceId));
    if (!eventSources.length) continue;
    for (const item of event.program) {
      if (item.knowledgeWorkId || (item.confidence !== "official" && item.confidence !== "manual")) continue;
      if (!item.composer?.trim() || !item.title.trim() || isNonWorkLabel(item.composer, item.title)) continue;
      const fingerprint = candidateFingerprint(item);
      const current = candidates.get(fingerprint);
      const sourceIds = eventSources.map((source) => source.sourceId);
      const sourceNames = eventSources.map((source) => source.sourceName);
      const sourceUrls = eventSources.map((source) => source.sourceUrl);
      const sourceScore = Math.max(...sourceIds.map((id) => trusted.get(id)?.score ?? 0));
      if (current) {
        pushUnique(current.eventIds, event.id);
        pushUnique(current.eventTitles, event.title);
        sourceIds.forEach((value) => pushUnique(current.sourceIds, value));
        sourceNames.forEach((value) => pushUnique(current.sourceNames, value));
        sourceUrls.forEach((value) => pushUnique(current.sourceUrls, value));
        if (event.scrapedAt < current.firstSeenAt) current.firstSeenAt = event.scrapedAt;
        if (!current.description && event.description) current.description = cleanExcerpt(event.description, 2_500);
        continue;
      }
      candidates.set(fingerprint, {
        fingerprint,
        composer: item.composer.trim(),
        title: item.title.trim(),
        opus: item.opus?.trim() || extractCatalogue(item.title),
        alternateTitles: uniqueStrings(item.alternateTitles ?? []),
        movements: item.movements ?? [],
        confidence: item.confidence,
        eventIds: [event.id],
        eventTitles: [event.title],
        sourceIds: uniqueStrings(sourceIds),
        sourceNames: uniqueStrings(sourceNames),
        sourceUrls: uniqueStrings(sourceUrls),
        sourceScore,
        firstSeenAt: event.scrapedAt,
        description: event.description ? cleanExcerpt(event.description, 2_500) : undefined,
      });
    }
  }

  return [...candidates.values()].sort((left, right) => right.firstSeenAt.localeCompare(left.firstSeenAt));
}

export function discoverIncompleteGeneratedWorks(
  dataset: ConcertDataset,
  registry: KnowledgeRegistry,
  config: KnowledgeAutomationConfig,
) {
  const incompleteWorks = registry.works.filter((work) => work.generation?.method === "deepseek" && (
    work.completeness !== "complete"
    || work.generation.skillVersion !== config.skillVersion
    || !persistedWorkIsComplete(work)
  ));
  return incompleteWorks.flatMap((work) => {
    const sourceEventIds = new Set(work.generation?.sourceEventIds ?? []);
    const matchingEvents = dataset.events.filter((event) => sourceEventIds.has(event.id)).map((event) => ({
      ...event,
      program: event.program
        .filter((item) => item.knowledgeWorkId === work.id || matchesGeneratedWork(item, work, registry))
        .map((item) => ({ ...item, knowledgeWorkId: undefined, knowledgeMapping: undefined })),
    })).filter((event) => event.program.length);
    const [candidate] = discoverKnowledgeCandidates({ ...dataset, events: matchingEvents }, registry, config);
    if (!candidate) return [];
    return [{ candidate, work }];
  });
}

function persistedWorkIsComplete(work: KnowledgeWork) {
  return Boolean(
    work.originalTitle
    && work.genre
    && (work.period || work.composedYears)
    && work.durationMinutes
    && hasUsefulInstrumentation(work.instrumentation)
    && work.difficulty
    && work.whyListen
    && work.firstListen
    && work.movements.length
    && work.listeningPoints.length
    && work.recordings.length,
  );
}

function hasUsefulInstrumentation(value?: string) {
  if (!value) return false;
  const normalized = value.trim();
  if (/^(钢琴|小提琴|中提琴|大提琴|竖琴|管风琴|古钢琴|吉他|声乐)$/.test(normalized)) return true;
  if (/^[\p{Script=Han}]{1,8}独奏$/u.test(normalized)) return true;
  if (normalized.length < 6) return false;
  return !/^(管弦乐团|交响乐团|室内乐团|弦乐团)$/.test(normalized);
}

function matchesGeneratedWork(item: ProgramItem, work: KnowledgeWork, registry: KnowledgeRegistry) {
  const composer = registry.composers.find((value) => value.id === work.composerId);
  if (!composer || !item.composer) return false;
  const composerMatches = [composer.name, composer.originalName, ...composer.aliases]
    .filter(Boolean)
    .some((value) => normalizeIdentity(value!) === normalizeIdentity(item.composer!));
  if (!composerMatches) return false;
  const catalogue = normalizeCatalogue(item.opus ?? extractCatalogue(item.title));
  if (catalogue && normalizeCatalogue(work.opus) === catalogue) return true;
  return [work.title, work.originalTitle, ...work.aliases]
    .filter(Boolean)
    .some((value) => normalizeWorkTitle(value!) === normalizeWorkTitle(item.title));
}

export function resolveExistingWork(candidate: KnowledgeCandidate, registry: KnowledgeRegistry): ExistingWorkResolution | null {
  const composerIds = new Set(registry.composers
    .filter((composer) => [composer.name, composer.originalName, ...composer.aliases]
      .filter(Boolean)
      .some((value) => normalizeIdentity(value!) === normalizeIdentity(candidate.composer)))
    .map((composer) => composer.id));
  if (!composerIds.size) return null;
  const works = registry.works.filter((work) => composerIds.has(work.composerId));
  const candidateCatalogue = normalizeCatalogue(candidate.opus ?? extractCatalogue(candidate.title));
  const compatibleAlternateTitles = candidate.alternateTitles.filter((title) => {
    const alternateCatalogue = normalizeCatalogue(extractCatalogue(title));
    return !candidateCatalogue || !alternateCatalogue || alternateCatalogue === candidateCatalogue;
  });
  const candidateTitles = [candidate.title, ...compatibleAlternateTitles].map(normalizeWorkTitle);
  const titleMatches = works.filter((work) => [work.title, work.originalTitle, ...work.aliases]
    .filter(Boolean)
    .map((value) => normalizeWorkTitle(value!))
    .some((value) => candidateTitles.includes(value)));
  if (titleMatches.length === 1) return { candidate, workId: titleMatches[0].id, reason: "title" };

  const catalogue = candidateCatalogue;
  if (!catalogue) return null;
  const catalogueMatches = works.filter((work) => normalizeCatalogue(work.opus) === catalogue);
  return catalogueMatches.length === 1
    ? { candidate, workId: catalogueMatches[0].id, reason: "catalogue" }
    : null;
}

export function candidatePriorityScore(candidate: KnowledgeCandidate, registry: KnowledgeRegistry) {
  let score = candidate.sourceScore;
  if (normalizeCatalogue(candidate.opus ?? extractCatalogue(candidate.title))) score += 25;
  if (registry.composers.some((composer) => [composer.name, composer.originalName, ...composer.aliases]
    .filter(Boolean).some((value) => normalizeIdentity(value!) === normalizeIdentity(candidate.composer)))) score += 15;
  if (!/(?:第[一二三四五六七八九十\d]+乐章|选段|选自|\(第.+乐章\)|（第.+乐章）)/.test(candidate.title)) score += 10;
  return score;
}

export function findKnownComposer(name: string, registry: KnowledgeRegistry) {
  return registry.composers.find((composer) => [composer.name, composer.originalName, ...composer.aliases]
    .filter(Boolean).some((value) => normalizeIdentity(value!) === normalizeIdentity(name)));
}

export function buildAutomatedMapping(
  candidate: KnowledgeCandidate,
  workId: string,
  generatedAt: string,
): KnowledgeWorkMappingRule {
  return {
    id: `mapping_auto_${hash(`${workId}:${candidate.fingerprint}`).slice(0, 16)}`,
    workId,
    composers: [candidate.composer],
    titles: [candidate.title],
    opus: candidate.opus ? [candidate.opus] : undefined,
    method: "automated-exact",
    reviewedAt: generatedAt,
  };
}

export async function collectKnowledgeEvidence(
  candidate: KnowledgeCandidate,
  fetchImpl: typeof fetch = globalThis.fetch,
  identity?: GeneratedIdentity,
): Promise<KnowledgeEvidence[]> {
  const evidence: KnowledgeEvidence[] = candidate.sourceUrls.map((url, index) => ({
    id: `official_${hash(url).slice(0, 12)}`,
    title: candidate.eventTitles[index] ?? candidate.eventTitles[0] ?? candidate.title,
    url,
    publisher: candidate.sourceNames[index] ?? candidate.sourceNames[0] ?? "演出官网",
    kind: "official" as const,
    content: cleanExcerpt([
      `作曲家：${candidate.composer}`,
      `官网曲名：${candidate.title}`,
      candidate.opus ? `作品号：${candidate.opus}` : "",
      candidate.alternateTitles.length ? `其他语种标题：${candidate.alternateTitles.join("；")}` : "",
      candidate.movements.length ? `官网结构：${candidate.movements.map((item) => `${item.number ?? ""} ${item.title}`).join("；")}` : "",
      candidate.description ? `演出介绍：${candidate.description}` : "",
    ].filter(Boolean).join("\n"), 4_000),
  }));

  if (!identity || identity.decision === "skip" || !identity.work) return evidence;
  const queries = uniqueStrings([
    `${identity.work.englishTitle} ${surname(identity.composer.originalName ?? identity.composer.name)}`,
    `${identity.composer.originalName ?? identity.composer.name} ${identity.work.opus ?? candidate.opus ?? ""}`.trim(),
    `${identity.work.originalTitle ?? identity.work.title} ${surname(identity.composer.originalName ?? identity.composer.name)}`,
    ...identity.searchQueries,
    `${identity.composer.originalName ?? identity.composer.name} ${identity.work.originalTitle ?? identity.work.title} ${identity.work.opus ?? ""}`.trim(),
  ]).slice(0, 4);
  const researchCandidate: KnowledgeCandidate = {
    ...candidate,
    composer: identity.composer.originalName ?? identity.composer.name,
    title: identity.work.originalTitle ?? identity.work.title,
    opus: identity.work.opus ?? candidate.opus,
  };
  const [englishWikipedia, chineseWikipedia, wikidata, musicbrainz, recordings] = await Promise.all([
    fetchWikipediaEvidence(queries, "en", fetchImpl).catch(() => []),
    fetchWikipediaEvidence(queries, "zh", fetchImpl).catch(() => []),
    fetchWikidataEvidence(queries, fetchImpl).catch(() => []),
    fetchMusicBrainzEvidence(researchCandidate, fetchImpl).catch(() => []),
    fetchRecordingEvidence(queries, fetchImpl).catch(() => []),
  ]);
  return dedupeEvidence([
    ...evidence,
    ...englishWikipedia,
    ...chineseWikipedia,
    ...wikidata,
    ...musicbrainz,
    ...recordings,
  ]);
}

export function scoreGeneratedKnowledge(
  candidate: KnowledgeCandidate,
  generated: GeneratedKnowledge,
  evidence: KnowledgeEvidence[],
  registry: KnowledgeRegistry,
  audit: GeneratedAudit,
) {
  if (generated.decision !== "publish" || !generated.work || audit.verdict !== "pass") return 0;
  let score = candidate.sourceScore;
  const knownComposer = registry.composers.some((composer) => [composer.name, composer.originalName, ...composer.aliases]
    .filter(Boolean).some((value) => normalizeIdentity(value!) === normalizeIdentity(generated.composer.name)));
  if (knownComposer) score += 15;
  if (normalizeCatalogue(candidate.opus ?? generated.work.opus)) score += 25;
  const used = new Set(generated.sourcesUsed.map((source) => source.evidenceId));
  const independentPublishers = new Set(evidence.filter((item) => used.has(item.id)).map((item) => item.publisher));
  if (independentPublishers.size >= 2) score += 20;
  if (generated.entityLevel === "complete_work" || generated.entityLevel === "suite") score += 15;
  if (!generated.warnings.length && !audit.warnings.length) score += 5;
  return Math.min(score, 100);
}

export function validateGeneratedEvidence(generated: GeneratedKnowledge, evidence: KnowledgeEvidence[]) {
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const unknown = generated.sourcesUsed.filter((source) => !evidenceIds.has(source.evidenceId));
  if (unknown.length) throw new Error(`DeepSeek 引用了未知证据：${unknown.map((item) => item.evidenceId).join(", ")}`);
  if (generated.decision === "publish" && !generated.work) throw new Error("DeepSeek 决定发布但没有返回作品内容");
  if (generated.decision === "publish" && !generated.sourcesUsed.length) throw new Error("DeepSeek 决定发布但没有引用证据");
  if (generated.entityLevel !== "complete_work" && generated.entityLevel !== "suite") {
    throw new Error(`不能把 ${generated.entityLevel} 自动发布为独立作品`);
  }
}

export function discardUnsupportedRecordings(generated: GeneratedKnowledge, evidence: KnowledgeEvidence[]) {
  if (!generated.work?.recordings.length) return generated;
  const recordingEvidenceIds = new Set(evidence.filter((item) => item.kind === "recording").map((item) => item.id));
  const recordings = generated.work.recordings.filter((recording) => recordingEvidenceIds.has(recording.evidenceId));
  if (recordings.length === generated.work.recordings.length) return generated;
  return {
    ...generated,
    work: { ...generated.work, recordings },
    warnings: uniqueStrings([...generated.warnings, "已移除没有录音来源支持的推荐。"]),
  };
}

export function materializeGeneratedKnowledge(input: {
  candidate: KnowledgeCandidate;
  generated: GeneratedKnowledge;
  audit: GeneratedAudit;
  evidence: KnowledgeEvidence[];
  registry: KnowledgeRegistry;
  config: KnowledgeAutomationConfig;
  skillText: string;
  generatedAt: string;
  existingWork?: KnowledgeWork;
}) {
  const { candidate, generated, audit, evidence, registry, config, skillText, generatedAt, existingWork } = input;
  validateGeneratedEvidence(generated, evidence);
  if (!generated.work) throw new Error("缺少作品内容");
  const score = scoreGeneratedKnowledge(candidate, generated, evidence, registry, audit);
  if (score < config.basicPublishScore) throw new Error(`自动发布评分不足：${score}/${config.basicPublishScore}`);
  const usedEvidence = new Map(generated.sourcesUsed.map((item) => [item.evidenceId, [...item.supports]]));
  const generatedRecordings = generated.work.recordings ?? [];
  generatedRecordings.forEach((recording, index) => {
    const evidenceItem = evidence.find((item) => item.id === recording.evidenceId && item.kind === "recording");
    if (!evidenceItem) throw new Error(`录音推荐引用了无效证据：${recording.evidenceId}`);
    const supports = usedEvidence.get(recording.evidenceId) ?? [];
    if (!supports.includes(`recordings.${index}`)) supports.push(`recordings.${index}`);
    usedEvidence.set(recording.evidenceId, supports);
  });
  const sources = evidence.filter((item) => usedEvidence.has(item.id)).map((item): KnowledgeSource => ({
    id: item.id,
    title: item.title,
    url: item.url,
    publisher: item.publisher,
    accessedAt: generatedAt.slice(0, 10),
    supports: usedEvidence.get(item.id)!,
  }));
  const existingComposer = registry.composers.find((composer) => [composer.name, composer.originalName, ...composer.aliases]
    .filter(Boolean).some((value) => normalizeIdentity(value!) === normalizeIdentity(generated.composer.name)));
  const composerId = existingComposer?.id ?? `composer_auto_${hash(normalizeIdentity(generated.composer.originalName ?? generated.composer.name)).slice(0, 16)}`;
  const workIdentity = `${composerId}:${normalizeCatalogue(generated.work.opus) || normalizeWorkTitle(generated.work.originalTitle ?? generated.work.title)}`;
  const workId = existingWork?.id ?? `work_auto_${hash(workIdentity).slice(0, 16)}`;
  const generation: KnowledgeGeneration = {
    method: "deepseek",
    model: config.model,
    skillVersion: config.skillVersion,
    promptHash: hash(skillText),
    generatedAt,
    score,
    sourceEventIds: candidate.eventIds,
    evidenceIds: sources.map((source) => source.id),
  };
  const requiredComplete = missingCompleteFields(generated).length === 0;
  const completeness = score >= config.completePublishScore && requiredComplete ? "complete" : "basic";
  const aliases = uniqueStrings([candidate.title, ...generated.work.aliases])
    .filter((value) => normalizeIdentity(value) !== normalizeIdentity(generated.work!.title));
  const relatedWorkIds = rankRelatedWorks({
    composerId,
    workId,
    genre: generated.work.genre,
    period: generated.work.period,
    difficulty: generated.work.difficulty,
  }, registry.works);
  const recordings = generatedRecordings.map(({ evidenceId, ...recording }, index) => ({
    ...recording,
    label: index === 0 ? "第一次听" : "另一种理解",
    searchUrl: `https://music.163.com/#/search/m/?s=${encodeURIComponent(`${generated.work!.title} ${recording.performers}`)}`,
    sourceId: evidenceId,
  }));
  const work: KnowledgeWork = {
    id: workId,
    composerId,
    ...generated.work,
    aliases,
    recordings,
    relatedWorkIds,
    completeness,
    generation,
    status: "published",
    updatedAt: generatedAt,
    sources,
  };
  const finalWork = existingWork ? mergeGeneratedWork(existingWork, work) : work;
  const composer: KnowledgeComposer | undefined = existingComposer ? undefined : {
    id: composerId,
    ...generated.composer,
    aliases: uniqueStrings([candidate.composer, ...generated.composer.aliases])
      .filter((value) => normalizeIdentity(value) !== normalizeIdentity(generated.composer.name)),
    introduction: generated.composer.introduction ?? `${generated.composer.name}的作品已收录于演出知识库，资料依据所列来源自动整理。`,
    completeness: generated.composer.birthYear && generated.composer.deathYear && generated.composer.period ? "complete" : "basic",
    generation,
    status: "published",
    updatedAt: generatedAt,
    sources,
  };
  return { work: finalWork, composer, mapping: buildAutomatedMapping(candidate, workId, generatedAt), score };
}

export function mergeGeneratedWork(existing: KnowledgeWork, incoming: KnowledgeWork): KnowledgeWork {
  const incomingScore = incoming.generation?.score ?? 0;
  const existingScore = existing.generation?.score ?? 0;
  const base = incomingScore >= existingScore ? incoming : existing;
  const supplement = base === incoming ? existing : incoming;
  const sources = [...base.sources];
  for (const source of supplement.sources) {
    if (!sources.some((item) => item.id === source.id)) sources.push(source);
  }
  const merged: KnowledgeWork = {
    ...base,
    id: existing.id,
    composerId: existing.composerId,
    title: base.title || supplement.title,
    originalTitle: base.originalTitle || supplement.originalTitle,
    aliases: uniqueStrings([...base.aliases, ...supplement.aliases]),
    opus: base.opus || supplement.opus,
    key: base.key || supplement.key,
    genre: base.genre || supplement.genre,
    period: base.period || supplement.period,
    composedYears: base.composedYears || supplement.composedYears,
    durationMinutes: base.durationMinutes || supplement.durationMinutes,
    instrumentation: chooseDetailedText(base.instrumentation, supplement.instrumentation),
    difficulty: base.difficulty || supplement.difficulty,
    tags: uniqueStrings([...base.tags, ...supplement.tags]).slice(0, 6),
    summary: base.summary || supplement.summary,
    whyListen: base.whyListen || supplement.whyListen,
    firstListen: base.firstListen || supplement.firstListen,
    listeningPoints: base.listeningPoints.length ? base.listeningPoints : supplement.listeningPoints,
    movements: base.movements.length ? base.movements : supplement.movements,
    recordings: base.recordings.length ? base.recordings : supplement.recordings,
    relatedWorkIds: base.relatedWorkIds.length ? base.relatedWorkIds : supplement.relatedWorkIds,
    generation: incoming.generation ? {
      ...incoming.generation,
      score: Math.max(existingScore, incomingScore),
      sourceEventIds: uniqueStrings([
        ...(existing.generation?.sourceEventIds ?? []),
        ...incoming.generation.sourceEventIds,
      ]),
      evidenceIds: uniqueStrings([
        ...(existing.generation?.evidenceIds ?? []),
        ...incoming.generation.evidenceIds,
      ]),
    } : existing.generation,
    updatedAt: incoming.updatedAt,
    sources,
  };
  merged.completeness = persistedWorkIsComplete(merged) && (merged.generation?.score ?? 0) >= 90 ? "complete" : "basic";
  return merged;
}

function chooseDetailedText(primary?: string, secondary?: string) {
  if (!primary) return secondary;
  if (!secondary) return primary;
  return secondary.length > primary.length * 1.5 ? secondary : primary;
}

export function rankRelatedWorks(
  target: Pick<KnowledgeWork, "composerId" | "genre" | "period" | "difficulty"> & { workId: string },
  works: KnowledgeWork[],
) {
  return works
    .filter((work) => work.id !== target.workId)
    .map((work) => ({
      id: work.id,
      score: (work.composerId === target.composerId ? 100 : 0)
        + (target.genre && work.genre === target.genre ? 25 : 0)
        + (target.period && work.period === target.period ? 10 : 0)
        + (target.difficulty && work.difficulty === target.difficulty ? 5 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, 3)
    .map((item) => item.id);
}

export function buildIdentityPrompt(candidate: KnowledgeCandidate, knownComposer?: KnowledgeComposer) {
  return `Resolve the canonical identity before research. Return JSON only using this exact contract.\n${JSON.stringify({
    decision: "research | skip",
    entityLevel: "complete_work | suite | movement | excerpt | arrangement | collection | unknown",
    parentIdentity: { composer: "", title: "", originalTitle: "optional", opus: "optional" },
    composer: { name: "", originalName: "optional" },
    work: { title: "", originalTitle: "optional", englishTitle: "optional established English title", opus: "optional" },
    searchQueries: ["established English composer and work title with catalogue number"],
    warnings: [],
  })}\nUse parentIdentity and its complete work for a movement or excerpt only when the parent identity is unambiguous. Always return an established English title when one exists. Search queries must include an English query plus the catalogue number.\nKNOWN_COMPOSER_FROM_CURATED_REGISTRY\n${knownComposer ? JSON.stringify({ id: knownComposer.id, name: knownComposer.name, originalName: knownComposer.originalName, aliases: knownComposer.aliases }) : "null"}\nOFFICIAL_CANDIDATE\n${JSON.stringify(candidate)}`;
}

export function buildGenerationPrompt(
  candidate: KnowledgeCandidate,
  identity: GeneratedIdentity,
  evidence: KnowledgeEvidence[],
  knownComposer?: KnowledgeComposer,
) {
  return `Return one JSON object using this exact contract. Optional fields may be omitted.\n${JSON.stringify({
    decision: "publish | skip",
    entityLevel: "complete_work | suite | movement | excerpt | arrangement | collection | unknown",
    suggestedCompleteness: "basic | complete",
    parentIdentity: { composer: "", title: "", opus: "optional" },
    composer: { name: "", originalName: "optional", aliases: [], birthYear: "optional integer", deathYear: "optional integer", nationality: "optional", period: "optional", introduction: "optional", styleSummary: "optional" },
    work: { title: "", originalTitle: "optional", aliases: [], opus: "optional", key: "optional", genre: "optional", period: "optional", composedYears: "optional", durationMinutes: "optional integer", instrumentation: "optional", difficulty: "optional enum", tags: [], summary: "", whyListen: "optional", firstListen: "optional", listeningPoints: [{ title: "", description: "", movement: "optional positive integer" }], movements: [{ number: 1, title: "", tempo: "optional", description: "" }], recordings: [{ label: "", performers: "", year: "optional integer", note: "", evidenceId: "recording evidence id" }] },
    sourcesUsed: [{ evidenceId: "", supports: [""] }],
    warnings: [],
  })}\n\nRESOLVED_IDENTITY\n${JSON.stringify(identity)}\n\nKNOWN_COMPOSER_FROM_CURATED_REGISTRY\n${knownComposer ? JSON.stringify({ id: knownComposer.id, name: knownComposer.name, originalName: knownComposer.originalName, aliases: knownComposer.aliases }) : "null"}\n\nOFFICIAL_CANDIDATE\n${JSON.stringify(candidate)}\n\nUNTRUSTED_EVIDENCE\n${JSON.stringify(evidence)}`;
}

export function buildAuditPrompt(candidate: KnowledgeCandidate, generated: GeneratedKnowledge, evidence: KnowledgeEvidence[], knownComposer?: KnowledgeComposer) {
  return `Audit the proposed knowledge object against the official candidate and evidence. Return JSON only: {"verdict":"pass|skip","warnings":[""]}. Use skip for identity ambiguity, unsupported work facts, movement-as-work errors, or conflicting catalogue numbers. The supplied KNOWN_COMPOSER_FROM_CURATED_REGISTRY is trusted and does not require new biographical evidence.\nKNOWN_COMPOSER_FROM_CURATED_REGISTRY\n${knownComposer ? JSON.stringify({ id: knownComposer.id, name: knownComposer.name, originalName: knownComposer.originalName, aliases: knownComposer.aliases }) : "null"}\nOFFICIAL_CANDIDATE\n${JSON.stringify(candidate)}\nPROPOSAL\n${JSON.stringify(generated)}\nUNTRUSTED_EVIDENCE\n${JSON.stringify(evidence)}`;
}

export function missingCompleteFields(generated: GeneratedKnowledge) {
  if (!generated.work) return ["work"];
  const fields: Array<[string, unknown]> = [
    ["originalTitle", generated.work.originalTitle],
    ["genre", generated.work.genre],
    ["periodOrComposedYears", generated.work.period || generated.work.composedYears],
    ["durationMinutes", generated.work.durationMinutes],
    ["instrumentation", hasUsefulInstrumentation(generated.work.instrumentation)],
    ["difficulty", generated.work.difficulty],
    ["whyListen", generated.work.whyListen],
    ["firstListen", generated.work.firstListen],
    ["movements", generated.work.movements.length],
    ["listeningPoints", generated.work.listeningPoints.length],
    ["recordings", generated.work.recordings.length],
  ];
  return fields.filter(([, value]) => !value).map(([field]) => field);
}

export function buildCompletionPrompt(
  candidate: KnowledgeCandidate,
  identity: GeneratedIdentity,
  generated: GeneratedKnowledge,
  evidence: KnowledgeEvidence[],
  missingFields: string[],
  knownComposer?: KnowledgeComposer,
) {
  return `${buildGenerationPrompt(candidate, identity, evidence, knownComposer)}\n\nINCOMPLETE_PROPOSAL\n${JSON.stringify(generated)}\n\nMISSING_COMPLETE_FIELDS\n${JSON.stringify(missingFields)}\nRevise the incomplete proposal into one complete object. Preserve supported existing content, fill every listed field when the evidence supports it, and never replace an evidence gap with an invented fact.`;
}

export async function requestDeepSeekJson<T>(input: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  timeoutMs?: number;
  thinking?: "enabled" | "disabled";
  fetchImpl?: typeof fetch;
  sleep?: (delayMs: number) => Promise<void>;
}) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const endpoint = `${(input.baseUrl ?? "https://api.deepseek.com").replace(/\/$/, "")}/chat/completions`;
  const sleep = input.sleep ?? ((delayMs: number) => new Promise<void>((done) => setTimeout(done, delayMs)));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetchWithRetry(endpoint, () => ({
      method: "POST",
      headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: "system", content: input.system }, { role: "user", content: input.prompt }],
        temperature: 0,
        max_tokens: input.maxTokens,
        thinking: { type: input.thinking ?? "disabled" },
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 180_000),
    }), { retries: 1, retryDelayMs: 60_000, fetchImpl });
    if (response.ok) {
      const data = await response.json() as {
        choices?: Array<{ finish_reason?: string; message?: { content?: string; reasoning_content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        const choice = data.choices?.[0];
        const reason = choice?.finish_reason ? `，结束原因：${choice.finish_reason}` : "";
        const reasoningOnly = choice?.message?.reasoning_content ? "（仅返回了推理内容）" : "";
        throw new Error(`DeepSeek 没有返回 JSON 内容${reason}${reasoningOnly}`);
      }
      return input.schema.parse(JSON.parse(content));
    }
    if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
      await sleep(60_000);
      continue;
    }
    throw new Error(`DeepSeek 请求失败（HTTP ${response.status}）`);
  }
  throw new Error("DeepSeek 请求失败");
}

export async function loadAutomationState(path: string): Promise<AutomationState> {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return z.object({
      schemaVersion: z.literal(1),
      candidates: z.record(z.string(), z.object({
        status: z.enum(["published", "needs_completion", "mapped", "skipped", "failed"]),
        workId: z.string().optional(),
        attempts: z.number().int().nonnegative(),
        updatedAt: z.string().datetime(),
        reason: z.string().optional(),
        sourceEventIds: z.array(z.string()),
        pipelineVersion: z.string().optional(),
        nextRetryAt: z.string().datetime().optional(),
      }).strict()),
    }).strict().parse(value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { schemaVersion: 1, candidates: {} };
  }
}

export async function saveJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchWikipediaEvidence(
  queries: string[],
  language: "en" | "zh",
  fetchImpl: typeof fetch,
): Promise<KnowledgeEvidence[]> {
  const apiUrl = `https://${language}.wikipedia.org/w/api.php`;
  const searchUrl = new URL(apiUrl);
  searchUrl.search = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: queries[0],
    srlimit: "5",
    format: "json",
    origin: "*",
  }).toString();
  const searchResponse = await fetchWithRetry(searchUrl, {
    headers: { "user-agent": "Classic-Music-KnowledgeBot/2.0" },
    signal: AbortSignal.timeout(20_000),
  }, { retries: 1, retryDelayMs: 60_000, fetchImpl });
  if (!searchResponse.ok) return [];
  const searchData = await searchResponse.json() as { query?: { search?: Array<{ title: string }> } };
  const titles = (searchData.query?.search ?? []).slice(0, 5).map((item) => item.title);
  const bestTitles = titles.filter((title) => isRelevantSearchTitle(title, queries)).slice(0, 2);
  const selectedTitles = bestTitles.slice(0, 1);
  if (!selectedTitles.length) return [];

  const detailsUrl = new URL(apiUrl);
  detailsUrl.search = new URLSearchParams({
    action: "query",
    titles: selectedTitles.join("|"),
    prop: "extracts|info|revisions",
    inprop: "url",
    explaintext: "1",
    rvprop: "content",
    rvslots: "main",
    redirects: "1",
    format: "json",
    origin: "*",
  }).toString();
  const detailsResponse = await fetchWithRetry(detailsUrl, {
    headers: { "user-agent": "Classic-Music-KnowledgeBot/2.0" },
    signal: AbortSignal.timeout(20_000),
  }, { retries: 1, retryDelayMs: 60_000, fetchImpl });
  if (!detailsResponse.ok) return [];
  const data = await detailsResponse.json() as { query?: { pages?: Record<string, {
    pageid: number;
    title: string;
    extract?: string;
    fullurl?: string;
    revisions?: Array<{ slots?: { main?: { content?: string; "*"?: string } } }>;
  }> } };
  return Object.values(data.query?.pages ?? {}).filter((page) => page.extract && page.fullurl).map((page) => ({
    id: `wikipedia_${language}_${page.pageid}`,
    title: page.title,
    url: page.fullurl!,
    publisher: language === "zh" ? "维基百科" : "English Wikipedia",
    kind: "wikipedia" as const,
    content: cleanExcerpt([
      page.extract!,
      extractWikipediaInstrumentation(
        page.revisions?.[0]?.slots?.main?.content
          ?? page.revisions?.[0]?.slots?.main?.["*"]
          ?? "",
      ),
    ].filter(Boolean).join("\n\n"), 12_000),
  }));
}

async function fetchWikidataEvidence(queries: string[], fetchImpl: typeof fetch): Promise<KnowledgeEvidence[]> {
  for (const query of queries.slice(0, 4)) {
    const searchUrl = new URL("https://www.wikidata.org/w/api.php");
    searchUrl.search = new URLSearchParams({
      action: "wbsearchentities",
      search: query,
      language: "en",
      uselang: "en",
      limit: "3",
      format: "json",
      origin: "*",
    }).toString();
    const response = await fetchWithRetry(searchUrl, {
      headers: { "user-agent": "Classic-Music-KnowledgeBot/2.0" },
      signal: AbortSignal.timeout(20_000),
    }, { retries: 1, retryDelayMs: 60_000, fetchImpl });
    if (!response.ok) continue;
    const data = await response.json() as { search?: Array<{ id: string; label: string; description?: string; aliases?: string[]; concepturi?: string }> };
    const matches = (data.search ?? []).filter((item) => isRelevantSearchTitle(`${item.label} ${item.description ?? ""}`, queries)).slice(0, 2);
    if (matches.length) return matches.map((item) => ({
      id: `wikidata_${item.id}`,
      title: item.label,
      url: item.concepturi ?? `https://www.wikidata.org/wiki/${item.id}`,
      publisher: "Wikidata",
      kind: "wikidata" as const,
      content: cleanExcerpt(JSON.stringify({ label: item.label, description: item.description, aliases: item.aliases }), 1_800),
    }));
  }
  return [];
}

async function fetchRecordingEvidence(queries: string[], fetchImpl: typeof fetch): Promise<KnowledgeEvidence[]> {
  const url = new URL("https://itunes.apple.com/search");
  url.search = new URLSearchParams({ term: queries[0], entity: "album", limit: "8", country: "US" }).toString();
  const response = await fetchWithRetry(url, {
    headers: { "user-agent": "Classic-Music-KnowledgeBot/2.0" },
    signal: AbortSignal.timeout(20_000),
  }, { retries: 1, retryDelayMs: 60_000, fetchImpl });
  if (!response.ok) return [];
  const data = await response.json() as { results?: Array<{
    collectionId?: number;
    collectionName?: string;
    artistName?: string;
    collectionViewUrl?: string;
    releaseDate?: string;
    primaryGenreName?: string;
  }> };
  return (data.results ?? [])
    .filter((item) => item.collectionId && item.collectionName && item.artistName && item.collectionViewUrl)
    .filter((item) => isRelevantSearchTitle(`${item.collectionName} ${item.artistName}`, queries.slice(0, 1)))
    .slice(0, 5)
    .map((item) => ({
      id: `apple_music_${item.collectionId}`,
      title: item.collectionName!,
      url: item.collectionViewUrl!,
      publisher: "Apple Music",
      kind: "recording" as const,
      content: cleanExcerpt(JSON.stringify({
        album: item.collectionName,
        performers: item.artistName,
        releaseDate: item.releaseDate,
        genre: item.primaryGenreName,
      }), 1_200),
    }));
}

async function fetchMusicBrainzEvidence(candidate: KnowledgeCandidate, fetchImpl: typeof fetch): Promise<KnowledgeEvidence[]> {
  const query = `work:${JSON.stringify(stripCatalogue(candidate.title))} AND artist:${JSON.stringify(candidate.composer)}`;
  const url = new URL("https://musicbrainz.org/ws/2/work");
  url.search = new URLSearchParams({ query, fmt: "json", limit: "3" }).toString();
  const response = await fetchWithRetry(url, { headers: { "user-agent": "Classic-Music-KnowledgeBot/1.0 (https://inwt233.cn/Classic-Music/)" }, signal: AbortSignal.timeout(20_000) }, { retries: 1, retryDelayMs: 60_000, fetchImpl });
  if (!response.ok) return [];
  const data = await response.json() as { works?: Array<Record<string, unknown> & { id?: string; title?: string }> };
  return (data.works ?? []).filter((work) => work.id && work.title).map((work) => ({
    id: `musicbrainz_${work.id}`,
    title: work.title!,
    url: `https://musicbrainz.org/work/${work.id}`,
    publisher: "MusicBrainz",
    kind: "musicbrainz" as const,
    content: cleanExcerpt(JSON.stringify(work), 1_800),
  }));
}

function candidateFingerprint(item: ProgramItem) {
  const catalogue = normalizeCatalogue(item.opus ?? extractCatalogue(item.title));
  return hash(`${normalizeIdentity(item.composer ?? "")}:${catalogue || normalizeWorkTitle(item.title)}`).slice(0, 24);
}

function isNonWorkLabel(composer: string, title: string) {
  return /^(上半场|下半场|演出|返场|指挥|独奏|合唱|乐团|作曲家)$/.test(composer.trim())
    || /^(上半场|下半场|中场休息|曲目待定|节目单待公布)$/.test(title.trim());
}

function extractCatalogue(value: string) {
  return value.match(/(?:BWV|K(?:V)?|D|Op(?:us)?|作品|Hob\.?|RV|Sz\.?|TrV|M\.?|S\.?)[\s.]*[A-Za-z]?[\d]+(?::\s*\d+)?(?:[/-]\d+)?/i)?.[0];
}

function normalizeCatalogue(value?: string) {
  if (!value) return "";
  const match = extractCatalogue(value) ?? value;
  return match.normalize("NFKC").toLowerCase()
    .replace(/^作品/, "op")
    .replace(/^opus/, "op")
    .replace(/^kv/, "k")
    .replace(/[.\s]/g, "");
}

function stripCatalogue(value: string) {
  return value.replace(/[,，]?\s*(?:BWV|K(?:V)?|D|Op(?:us)?|作品|Hob\.?|RV|Sz\.?|TrV|M\.?|S\.?)[\s.]*[A-Za-z]?[\d]+(?::\s*\d+)?(?:[/-]\d+)?/ig, "").trim();
}

function normalizeWorkTitle(value: string) {
  return normalizeIdentity(stripCatalogue(value));
}

function cleanExcerpt(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function dedupeEvidence(values: KnowledgeEvidence[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.publisher}:${value.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRelevantSearchTitle(value: string, queries: string[]) {
  const normalizedValue = normalizeIdentity(value);
  return queries.some((query) => {
    const tokens = query.normalize("NFKC").toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && ![
        "the", "and", "opus", "op", "work", "no", "in", "of", "major", "minor", "dmitri",
      ].includes(token));
    const matches = tokens.filter((token) => normalizedValue.includes(normalizeIdentity(token))).length;
    return matches >= Math.min(2, tokens.length);
  });
}

function extractWikipediaInstrumentation(wikitext: string) {
  const section = wikitext.match(/==\s*Instrumentation\s*==([\s\S]*?)(?=\n==[^=])/i)?.[1];
  if (!section) return "";
  let value = section
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>|<ref\b[^/>]*\/>/gi, "")
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{(?:col-begin|col-end|col-\d+)\}\}/gi, "")
    .replace(/'{2,}/g, "")
    .replace(/^[;:]\s*/gm, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("；");
  value = value.replace(/；{2,}/g, "；");
  return value ? `Instrumentation details: ${value}` : "";
}

function pushUnique(values: string[], value: string) {
  if (!values.includes(value)) values.push(value);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function surname(value: string) {
  return value.trim().split(/\s+/).at(-1) ?? value;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
