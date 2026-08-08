import assert from "node:assert/strict";
import type { ConcertDataset, ConcertEvent, ProgramItem } from "../src/types";
import type { KnowledgeComposer, KnowledgeWork } from "../src/knowledge/types";
import {
  discardUnsupportedRecordings,
  discoverKnowledgeCandidates,
  generatedIdentitySchema,
  generatedKnowledgeSchema,
  materializeGeneratedKnowledge,
  mergeGeneratedWork,
  missingCompleteFields,
  parseAutomationConfig,
  requestDeepSeekJson,
  resolveExistingWork,
  validateGeneratedEvidence,
  type GeneratedAudit,
  type GeneratedKnowledge,
  type KnowledgeEvidence,
} from "./knowledge-automation";
import type { KnowledgeRegistry } from "./knowledge-store";

const composer: KnowledgeComposer = {
  id: "composer_test_beethoven",
  name: "路德维希·范·贝多芬",
  originalName: "Ludwig van Beethoven",
  aliases: ["贝多芬", "Beethoven"],
  birthYear: 1770,
  deathYear: 1827,
  nationality: "德国",
  period: "古典主义",
  introduction: "测试作曲家。",
  styleSummary: "测试风格。",
  status: "published",
  reviewedAt: "2026-08-08T00:00:00.000Z",
  updatedAt: "2026-08-08T00:00:00.000Z",
  sources: [{ id: "composer-source", title: "Composer", url: "https://example.com/composer", publisher: "Example", accessedAt: "2026-08-08", supports: ["identity"] }],
};

function work(id: string, title: string, opus: string, aliases: string[]): KnowledgeWork {
  return {
    id,
    composerId: composer.id,
    title,
    originalTitle: title,
    aliases,
    opus,
    key: "C 小调",
    genre: "交响曲",
    period: "古典主义",
    composedYears: "1800",
    durationMinutes: 30,
    instrumentation: "管弦乐团",
    difficulty: "第一次听",
    tags: ["测试"],
    summary: "测试作品。",
    whyListen: "测试。",
    firstListen: "测试。",
    listeningPoints: [{ title: "测试", description: "测试", movement: 1 }],
    movements: [{ number: 1, title: "第一乐章", description: "测试" }],
    recordings: [],
    relatedWorkIds: [],
    status: "published",
    reviewedAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
    sources: [{ id: `${id}-source`, title, url: `https://example.com/${id}`, publisher: "Example", accessedAt: "2026-08-08", supports: ["identity"] }],
  };
}

const registry: KnowledgeRegistry = {
  composers: [composer],
  works: [
    work("work_test_five", "C 小调第五交响曲", "Op. 67", ["第五交响曲", "命运交响曲"]),
    work("work_test_nine", "D 小调第九交响曲", "Op. 125", ["第九交响曲", "合唱交响曲"]),
  ],
  mappings: [],
};

const config = parseAutomationConfig({
  schemaVersion: 1,
  enabled: true,
  model: "deepseek-chat",
  skillVersion: "1.0.0",
  maxCandidatesPerRun: 5,
  basicPublishScore: 70,
  completePublishScore: 90,
  trustedSources: [{ id: "trusted", name: "可信官网", score: 20 }],
});

const existingItem: ProgramItem = {
  composer: "贝多芬",
  title: "c小调第五交响曲，作品67",
  opus: "作品67",
  alternateTitles: ["D小调第九交响曲，作品125", "Symphony No. 5 in C minor, Op. 67"],
  confidence: "official",
};
const newItem: ProgramItem = {
  composer: "贝多芬",
  title: "G大调新作品，作品99",
  opus: "作品99",
  confidence: "official",
};

const dataset: ConcertDataset = {
  generatedAt: "2026-08-08T00:00:00.000Z",
  city: "全国",
  sources: [{ id: "trusted", name: "可信官网", url: "https://example.com", ok: true, eventCount: 1 }],
  stats: { rawEvents: 1, normalizedEvents: 1, aiEnhancedEvents: 0, errors: [] },
  events: [event("event-one", [existingItem, newItem, { ...newItem, title: "AI 项目", confidence: "ai" }])],
};

const candidates = discoverKnowledgeCandidates(dataset, registry, config);
assert.equal(candidates.length, 2);
const existingCandidate = candidates.find((candidate) => candidate.opus === "作品67")!;
const newCandidate = candidates.find((candidate) => candidate.opus === "作品99")!;
assert.equal(resolveExistingWork(existingCandidate, registry)?.workId, "work_test_five");
assert.equal(resolveExistingWork(existingCandidate, registry)?.reason, "title");
assert.equal(resolveExistingWork(newCandidate, registry), null);

const evidence: KnowledgeEvidence[] = [
  { id: "official-one", title: "官网", url: "https://example.com/event", publisher: "可信官网", content: "贝多芬：G大调新作品，作品99", kind: "official" },
  { id: "wiki-one", title: "资料", url: "https://example.org/work", publisher: "百科", content: "测试资料", kind: "wikipedia" },
];
const generated: GeneratedKnowledge = {
  decision: "publish",
  entityLevel: "complete_work",
  suggestedCompleteness: "basic",
  parentIdentity: undefined,
  composer: { name: "路德维希·范·贝多芬", aliases: ["贝多芬"] },
  work: {
    title: "G 大调新作品",
    aliases: [],
    opus: "Op. 99",
    genre: "管弦乐",
    tags: ["测试"],
    summary: "这是一条用于验证自动知识流水线的测试作品。",
    listeningPoints: [],
    movements: [],
    recordings: [],
  },
  sourcesUsed: [
    { evidenceId: "official-one", supports: ["title", "composer", "opus"] },
    { evidenceId: "wiki-one", supports: ["summary", "genre"] },
  ],
  warnings: [],
};
const audit: GeneratedAudit = { verdict: "pass", warnings: [] };
const materialized = materializeGeneratedKnowledge({
  candidate: newCandidate,
  generated,
  audit,
  evidence,
  registry,
  config,
  skillText: "test skill",
  generatedAt: "2026-08-08T12:00:00.000Z",
});
assert.equal(materialized.score, 100);
assert.equal(materialized.work.completeness, "basic");
assert.equal(materialized.work.generation?.method, "deepseek");
assert.equal(materialized.mapping.method, "automated-exact");
assert.equal(materialized.composer, undefined);
const { recordings: misplacedRecordings, ...workWithoutRecordings } = generated.work!;
const relocatedGenerated = generatedKnowledgeSchema.parse({
  ...generated,
  work: workWithoutRecordings,
  recordings: misplacedRecordings,
});
assert.deepEqual(relocatedGenerated.work?.recordings, []);
const generatedWithEmptyRecordingLabel = generatedKnowledgeSchema.parse({
  ...generated,
  work: {
    ...generated.work,
    recordings: [{
      label: "",
      performers: "测试乐团",
      note: "用于验证空标签由系统统一补全。",
      evidenceId: "wiki-one",
    }],
  },
});
assert.equal(generatedWithEmptyRecordingLabel.work?.recordings[0]?.label, undefined);
const generatedWithUnsupportedRecording = discardUnsupportedRecordings(generatedKnowledgeSchema.parse({
  ...generated,
  work: {
    ...generated.work,
    instrumentation: "两把小提琴、两把中提琴与一把大提琴",
    recordings: [{ performers: "测试乐团", note: "测试", evidenceId: "invented" }],
  },
}), evidence);
assert.deepEqual(generatedWithUnsupportedRecording.work?.recordings, []);
assert.ok(generatedWithUnsupportedRecording.warnings.some((warning) => warning.includes("移除")));
assert.ok(!missingCompleteFields({
  ...generated,
  work: { ...generated.work!, instrumentation: "两把小提琴、两把中提琴与一把大提琴" },
}).includes("instrumentation"));
assert.ok(!missingCompleteFields({
  ...generated,
  work: { ...generated.work!, instrumentation: "大提琴独奏" },
}).includes("instrumentation"));
assert.ok(!missingCompleteFields({
  ...generated,
  work: { ...generated.work!, instrumentation: "大提琴" },
}).includes("instrumentation"));
assert.deepEqual(missingCompleteFields(generated).sort(), [
  "difficulty",
  "durationMinutes",
  "firstListen",
  "instrumentation",
  "listeningPoints",
  "movements",
  "originalTitle",
  "periodOrComposedYears",
  "recordings",
  "whyListen",
].sort());

const identityWithNull = generatedIdentitySchema.parse({
  decision: "research",
  entityLevel: "complete_work",
  parentIdentity: null,
  composer: { name: "肖斯塔科维奇", originalName: "Dmitri Shostakovich" },
  work: {
    title: "f小调第一交响曲",
    originalTitle: null,
    englishTitle: "Symphony No. 1 in F minor",
    opus: "Op. 10",
  },
  searchQueries: ["Dmitri Shostakovich Symphony No. 1 Op. 10"],
  warnings: [],
});
assert.equal(identityWithNull.parentIdentity, undefined);
assert.equal(identityWithNull.work?.englishTitle, "Symphony No. 1 in F minor");
const identityWithEmptyParent = generatedIdentitySchema.parse({
  ...identityWithNull,
  parentIdentity: { composer: "", title: "" },
});
assert.equal(identityWithEmptyParent.parentIdentity, undefined);

const strongWork = {
  ...work("work_auto_merge", "测试交响曲", "Op. 1", []),
  instrumentation: "长笛、双簧管、单簧管、大管、圆号、小号、定音鼓与弦乐",
  movements: [{ number: 1, title: "第一乐章", description: "完整结构" }],
  recordings: [{ label: "第一次听", performers: "测试乐团", note: "清晰。", searchUrl: "https://example.com/search", sourceId: "recording" }],
  generation: { method: "deepseek" as const, model: "test", skillVersion: "2", promptHash: "a".repeat(64), generatedAt: "2026-08-08T00:00:00.000Z", score: 95, sourceEventIds: ["event"], evidenceIds: ["source"] },
};
const weakWork = {
  ...strongWork,
  summary: "较弱的新摘要。",
  instrumentation: "管弦乐团",
  movements: [],
  recordings: [],
  generation: { ...strongWork.generation, score: 75 },
};
const mergedWork = mergeGeneratedWork(strongWork, weakWork);
assert.equal(mergedWork.summary, strongWork.summary);
assert.equal(mergedWork.instrumentation, strongWork.instrumentation);
assert.equal(mergedWork.movements.length, 1);
assert.equal(mergedWork.generation?.score, 95);

assert.throws(() => validateGeneratedEvidence(
  { ...generated, sourcesUsed: [{ evidenceId: "invented", supports: ["title"] }] },
  evidence,
), /未知证据/);
assert.throws(() => validateGeneratedEvidence(
  { ...generated, entityLevel: "movement" },
  evidence,
), /不能把 movement/);

async function testDeepSeekRetry() {
  let calls = 0;
  const sleeps: number[] = [];
  const retried = await requestDeepSeekJson({
    apiKey: "test",
    model: "deepseek-chat",
    system: "test",
    prompt: "test",
    schema: generatedKnowledgeSchema,
    fetchImpl: (async () => {
      calls += 1;
      if (calls === 1) return new Response("rate limited", { status: 429 });
      return Response.json({ choices: [{ message: { content: JSON.stringify({
        decision: "skip",
        entityLevel: "unknown",
        suggestedCompleteness: "basic",
        composer: { name: "测试", aliases: [] },
        sourcesUsed: [],
        warnings: ["身份不足"],
      }) } }] });
    }) as typeof fetch,
    sleep: async (delayMs) => { sleeps.push(delayMs); },
  });
  assert.equal(retried.decision, "skip");
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [60_000]);
}

testDeepSeekRetry()
  .then(() => console.log("Knowledge automation tests passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

function event(id: string, program: ProgramItem[]): ConcertEvent {
  return {
    id,
    title: "测试音乐会",
    city: "上海",
    venue: "测试音乐厅",
    startTime: "2026-09-01T11:30:00.000Z",
    weekday: "周二",
    dateLabel: "09/01",
    timeLabel: "19:30",
    status: "scheduled",
    sourceName: "可信官网",
    sourceUrl: "https://example.com/event",
    scrapedAt: "2026-08-08T00:00:00.000Z",
    sources: [{ sourceId: "trusted", sourceName: "可信官网", sourceRecordId: id, sourceUrl: "https://example.com/event", scrapedAt: "2026-08-08T00:00:00.000Z" }],
    performers: [],
    composers: ["贝多芬"],
    program,
    tags: [],
    dataQuality: "scraped",
  };
}
