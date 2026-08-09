import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { ConcertDataset, ProgramItem } from "../src/types";
import type {
  KnowledgeComposer,
  KnowledgeComposerSummary,
  KnowledgeIndex,
  KnowledgeWork,
  KnowledgeWorkMappingFile,
  KnowledgeWorkMappingRule,
  PublishedKnowledgeComposer,
  PublishedKnowledgeWork,
} from "../src/knowledge/types";
import { classifyKnowledgeGenre, classifyKnowledgePeriod } from "../src/knowledge/taxonomy";
import { normalizeIdentity } from "./identity";

const publicationStatusSchema = z.enum(["draft", "reviewed", "published"]);
const sourceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  publisher: z.string().min(1),
  accessedAt: z.string().date(),
  supports: z.array(z.string().min(1)).min(1),
});

const generationSchema = z.object({
  method: z.literal("deepseek"),
  model: z.string().min(1),
  skillVersion: z.string().min(1),
  promptHash: z.string().regex(/^[a-f0-9]{16,64}$/),
  generatedAt: z.string().datetime(),
  score: z.number().int().min(0).max(100),
  sourceEventIds: z.array(z.string().min(1)).min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
});

const composerSchema: z.ZodType<KnowledgeComposer> = z.object({
  id: z.string().regex(/^composer_[a-z0-9_]+$/),
  name: z.string().min(1),
  originalName: z.string().min(1).optional(),
  aliases: z.array(z.string().min(1)),
  birthYear: z.number().int().optional(),
  deathYear: z.number().int().optional(),
  nationality: z.string().min(1).optional(),
  period: z.string().min(1).optional(),
  introduction: z.string().min(1),
  styleSummary: z.string().min(1).optional(),
  completeness: z.enum(["basic", "complete"]).optional(),
  generation: generationSchema.optional(),
  status: publicationStatusSchema,
  reviewedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  sources: z.array(sourceSchema).min(1),
});

const workSchema: z.ZodType<KnowledgeWork> = z.object({
  id: z.string().regex(/^work_[a-z0-9_]+$/),
  composerId: z.string().regex(/^composer_[a-z0-9_]+$/),
  title: z.string().min(1),
  originalTitle: z.string().min(1).optional(),
  aliases: z.array(z.string().min(1)),
  opus: z.string().min(1).optional(),
  key: z.string().min(1).optional(),
  genre: z.string().min(1).optional(),
  period: z.string().min(1).optional(),
  composedYears: z.string().min(1).optional(),
  durationMinutes: z.number().int().positive().optional(),
  instrumentation: z.string().min(1).optional(),
  difficulty: z.enum(["第一次听", "容易进入", "需要专注", "适合深入"]).optional(),
  tags: z.array(z.string().min(1)),
  summary: z.string().min(1).max(160),
  whyListen: z.string().min(1).optional(),
  firstListen: z.string().min(1).optional(),
  listeningPoints: z.array(z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    movement: z.number().int().positive().optional(),
  })),
  movements: z.array(z.object({
    number: z.number().int().positive(),
    title: z.string().min(1),
    tempo: z.string().min(1).optional(),
    description: z.string().min(1),
  })),
  recordings: z.array(z.object({
    label: z.string().min(1),
    performers: z.string().min(1),
    year: z.number().int().optional(),
    note: z.string().min(1),
    sourceId: z.string().min(1),
  })),
  relatedWorkIds: z.array(z.string().regex(/^work_[a-z0-9_]+$/)),
  completeness: z.enum(["basic", "complete"]).optional(),
  generation: generationSchema.optional(),
  status: publicationStatusSchema,
  reviewedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
  sources: z.array(sourceSchema).min(1),
});

const mappingRuleSchema: z.ZodType<KnowledgeWorkMappingRule> = z.object({
  id: z.string().min(1),
  workId: z.string().regex(/^work_[a-z0-9_]+$/),
  composers: z.array(z.string().min(1)).min(1),
  titles: z.array(z.string().min(1)).min(1),
  opus: z.array(z.string().min(1)).optional(),
  method: z.enum(["reviewed-exact", "automated-exact"]),
  reviewedAt: z.string().datetime(),
});

const mappingFileSchema: z.ZodType<KnowledgeWorkMappingFile> = z.object({
  schemaVersion: z.literal(1),
  rules: z.array(mappingRuleSchema),
});

export type KnowledgeRegistry = {
  composers: KnowledgeComposer[];
  works: KnowledgeWork[];
  mappings: KnowledgeWorkMappingRule[];
};

export type PreparedKnowledge = {
  index: KnowledgeIndex;
  works: PublishedKnowledgeWork[];
  composers: PublishedKnowledgeComposer[];
};

export async function loadKnowledgeRegistry(root: string): Promise<KnowledgeRegistry> {
  const [composerFiles, workFiles, mappingFiles] = await Promise.all([
    listJsonFiles(resolve(root, "knowledge/composers")),
    listJsonFiles(resolve(root, "knowledge/works")),
    listJsonFiles(resolve(root, "knowledge/mappings")),
  ]);
  const composers = (await Promise.all(composerFiles.map((name) => readJsonCollection(
    resolve(root, "knowledge/composers", name),
    composerSchema,
  )))).flat();
  const works = (await Promise.all(workFiles.map((name) => readJsonCollection(
    resolve(root, "knowledge/works", name),
    workSchema,
  )))).flat();
  const mappings = await Promise.all(mappingFiles.map((name) => readJson(
    resolve(root, "knowledge/mappings", name),
    mappingFileSchema,
  )));
  const registry = { composers, works, mappings: mappings.flatMap((file) => file.rules) };
  validateRegistry(registry);
  return registry;
}

export function mapProgramItemToKnowledge(
  item: ProgramItem,
  registry: KnowledgeRegistry,
): Pick<ProgramItem, "knowledgeWorkId" | "knowledgeMapping"> {
  if (item.confidence === "ocr" || item.confidence === "ai" || item.confidence === "title-inferred") {
    return {};
  }
  const composer = normalizeIdentity(item.composer ?? "");
  const title = normalizeIdentity(item.title);
  const opus = normalizeIdentity(item.opus ?? "");
  const matches = registry.mappings.filter((rule) => {
    if (!rule.composers.some((value) => normalizeIdentity(value) === composer)) return false;
    if (!rule.titles.some((value) => normalizeIdentity(value) === title)) return false;
    return !rule.opus?.length || !opus || rule.opus.some((value) => normalizeIdentity(value) === opus);
  });
  if (matches.length !== 1) return {};
  const match = matches[0];
  return {
    knowledgeWorkId: match.workId,
    knowledgeMapping: {
      ruleId: match.id,
      method: match.method,
      reviewedAt: match.reviewedAt,
    },
  };
}

export function prepareKnowledge(
  registry: KnowledgeRegistry,
  publishedDataset: ConcertDataset,
): PreparedKnowledge {
  const publishedComposers = registry.composers.filter((item) => item.status === "published");
  const publishedWorks = registry.works.filter((item) => item.status === "published");
  const workById = new Map(publishedWorks.map((item) => [item.id, item]));
  const eventIdsByWork = new Map<string, string[]>();
  const eventIdsByComposer = new Map<string, string[]>();
  for (const event of publishedDataset.events) {
    for (const item of event.program) {
      if (!item.knowledgeWorkId) continue;
      const ids = eventIdsByWork.get(item.knowledgeWorkId) ?? [];
      if (!ids.includes(event.id)) ids.push(event.id);
      eventIdsByWork.set(item.knowledgeWorkId, ids);
      const composerId = workById.get(item.knowledgeWorkId)?.composerId;
      if (!composerId) continue;
      const composerEventIds = eventIdsByComposer.get(composerId) ?? [];
      if (!composerEventIds.includes(event.id)) composerEventIds.push(event.id);
      eventIdsByComposer.set(composerId, composerEventIds);
    }
  }

  const workCountByComposer = new Map<string, number>();
  for (const work of publishedWorks) {
    workCountByComposer.set(work.composerId, (workCountByComposer.get(work.composerId) ?? 0) + 1);
  }
  const composerSummaries = new Map(publishedComposers.map((composer) => [
    composer.id,
    toComposerSummary(
      composer,
      workCountByComposer.get(composer.id) ?? 0,
      eventIdsByComposer.get(composer.id)?.length ?? 0,
    ),
  ]));

  const works = publishedWorks
    .map((work): PublishedKnowledgeWork => {
      const composer = composerSummaries.get(work.composerId);
      if (!composer) throw new Error(`作品 ${work.id} 的作曲家未发布：${work.composerId}`);
      const upcomingEventIds = eventIdsByWork.get(work.id) ?? [];
      return {
        ...work,
        composer,
        upcomingEventIds,
        upcomingEventCount: upcomingEventIds.length,
      };
    });
  const workSummaries = works.map(toWorkSummary);
  const composers = publishedComposers.map((composer): PublishedKnowledgeComposer => ({
    ...composer,
    works: workSummaries.filter((work) => work.composerId === composer.id),
    upcomingEventIds: eventIdsByComposer.get(composer.id) ?? [],
    upcomingEventCount: eventIdsByComposer.get(composer.id)?.length ?? 0,
  }));

  return {
    index: {
      schemaVersion: 1,
      generatedAt: publishedDataset.generatedAt,
      composers: [...composerSummaries.values()],
      works: workSummaries,
    },
    works,
    composers,
  };
}

function validateRegistry(registry: KnowledgeRegistry) {
  assertUnique(registry.composers.map((item) => item.id), "作曲家 ID");
  assertUnique(registry.works.map((item) => item.id), "作品 ID");
  assertUnique(registry.mappings.map((item) => item.id), "映射规则 ID");
  const composers = new Set(registry.composers.map((item) => item.id));
  const works = new Map(registry.works.map((item) => [item.id, item]));
  for (const work of registry.works) {
    if (!composers.has(work.composerId)) throw new Error(`作品 ${work.id} 引用了未知作曲家 ${work.composerId}`);
    const sourceIds = new Set(work.sources.map((source) => source.id));
    for (const recording of work.recordings) {
      if (!sourceIds.has(recording.sourceId)) throw new Error(`作品 ${work.id} 的录音缺少来源 ${recording.sourceId}`);
    }
    const movementNumbers = work.movements.map((movement) => movement.number);
    if (new Set(movementNumbers).size !== movementNumbers.length) {
      throw new Error(`作品 ${work.id} 的结构编号重复`);
    }
    const movementNumberSet = new Set(movementNumbers);
    for (const point of work.listeningPoints) {
      if (point.movement && !movementNumberSet.has(point.movement)) {
        throw new Error(`作品 ${work.id} 的聆听点引用了未知结构 ${point.movement}`);
      }
    }
    for (const relatedWorkId of work.relatedWorkIds) {
      if (relatedWorkId === work.id) throw new Error(`作品 ${work.id} 不能关联自身`);
      if (!works.has(relatedWorkId)) throw new Error(`作品 ${work.id} 引用了未知相关作品 ${relatedWorkId}`);
    }
  }
  for (const rule of registry.mappings) {
    const work = works.get(rule.workId);
    if (!work) throw new Error(`映射 ${rule.id} 引用了未知作品 ${rule.workId}`);
    if (work.status !== "published") throw new Error(`映射 ${rule.id} 指向未发布作品 ${rule.workId}`);
  }
  const exactKeys = new Map<string, string>();
  for (const rule of registry.mappings) {
    for (const composer of new Set(rule.composers.map(normalizeIdentity))) {
      for (const title of new Set(rule.titles.map(normalizeIdentity))) {
        const key = `${composer}:${title}`;
        const owner = exactKeys.get(key);
        if (owner && owner !== rule.id) throw new Error(`知识映射存在歧义：${composer} / ${title}`);
        exactKeys.set(key, rule.id);
      }
    }
  }
}

function toComposerSummary(
  composer: KnowledgeComposer,
  workCount: number,
  upcomingEventCount: number,
): KnowledgeComposerSummary {
  return {
    id: composer.id,
    name: composer.name,
    originalName: composer.originalName,
    period: composer.period,
    birthYear: composer.birthYear,
    deathYear: composer.deathYear,
    periodKey: classifyKnowledgePeriod(composer.period, composer.birthYear),
    workCount,
    upcomingEventCount,
  };
}

function toWorkSummary(work: PublishedKnowledgeWork) {
  return {
    id: work.id,
    composerId: work.composerId,
    composerName: work.composer.name,
    title: work.title,
    originalTitle: work.originalTitle,
    opus: work.opus,
    genre: work.genre,
    periodKey: work.composer.periodKey,
    genreFamily: classifyKnowledgeGenre(work),
    durationMinutes: work.durationMinutes,
    difficulty: work.difficulty,
    tags: work.tags,
    summary: work.summary,
    upcomingEventIds: work.upcomingEventIds,
    upcomingEventCount: work.upcomingEventCount,
  };
}

function assertUnique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`${label} 重复`);
}

async function listJsonFiles(path: string) {
  return (await readdir(path))
    .filter((name) => name.endsWith(".json"))
    .sort();
}

async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(JSON.parse(await readFile(path, "utf8")));
}

async function readJsonCollection<T>(path: string, schema: z.ZodType<T>): Promise<T[]> {
  const value = JSON.parse(await readFile(path, "utf8"));
  const parsed = z.union([schema, z.array(schema)]).parse(value);
  return Array.isArray(parsed) ? parsed : [parsed];
}
