import type { ConcertEventSummary } from "../types";
import type { KnowledgeIndex, KnowledgeWorkSummary } from "./types";

export type KnowledgeCollectionKey =
  | "live-classics"
  | "first-listen"
  | "orchestral-stage"
  | "concerto-focus"
  | "chamber-closeup"
  | "budget-classics";

export type KnowledgeCollection = {
  key: KnowledgeCollectionKey;
  eyebrow: string;
  title: string;
  description: string;
  reason: string;
  works: KnowledgeWorkSummary[];
  events: ConcertEventSummary[];
};

type CollectionDefinition = Omit<KnowledgeCollection, "works" | "events"> & {
  matches: (work: KnowledgeWorkSummary, events: ConcertEventSummary[]) => boolean;
};

const definitions: CollectionDefinition[] = [
  {
    key: "live-classics",
    eyebrow: "本期现场",
    title: "经典作品正在上演",
    description: "从已有知识指南出发，直接查看近期可以在国内舞台听到的作品。",
    reason: "只收录已完成知识映射且有未来场次的作品。",
    matches: () => true,
  },
  {
    key: "first-listen",
    eyebrow: "第一次听",
    title: "适合作为起点的现场",
    description: "旋律线索清楚、结构相对容易进入，并且近期确有演出的入门作品。",
    reason: "依据编辑入门等级筛选，并以真实未来演出作为展示前提。",
    matches: (work) => work.difficulty === "第一次听" || work.difficulty === "容易进入",
  },
  {
    key: "orchestral-stage",
    eyebrow: "宏大音响",
    title: "值得在现场听的管弦乐",
    description: "从交响曲、管弦乐与大型组曲中，寻找现场空间和乐团音色带来的完整冲击。",
    reason: "来自管弦乐体裁大类，并且近期至少有一场已匹配演出。",
    matches: (work) => work.genreFamily === "orchestral",
  },
  {
    key: "concerto-focus",
    eyebrow: "独奏与乐团",
    title: "协奏曲现场焦点",
    description: "在独奏者与乐团的对话中进入经典作品，适合关注演奏个性与舞台张力。",
    reason: "来自协奏曲体裁大类，并连接当前真实场次。",
    matches: (work) => work.genreFamily === "concerto",
  },
  {
    key: "chamber-closeup",
    eyebrow: "近距离聆听",
    title: "室内乐的细节时刻",
    description: "把注意力放在声部关系、呼吸与音色变化上，适合在较小空间中专注聆听。",
    reason: "来自室内乐体裁大类，并连接当前真实场次。",
    matches: (work) => work.genreFamily === "chamber",
  },
  {
    key: "budget-classics",
    eyebrow: "价格友好",
    title: "两百元以内听经典",
    description: "从最低公开票价不高于 200 元的场次中，选择已有作品指南可供听前了解的演出。",
    reason: "票价直接来自官网采集；免费场次也会纳入。",
    matches: (_work, events) => events.some((event) => lowestPrice(event.price) <= 200),
  },
];

export function buildKnowledgeCollections(
  index: KnowledgeIndex,
  events: ConcertEventSummary[],
): KnowledgeCollection[] {
  const eventById = new Map(events.map((event) => [event.id, event]));
  return definitions.flatMap((definition) => {
    const works = index.works
      .map((work) => ({
        work,
        events: work.upcomingEventIds
          .map((id) => eventById.get(id))
          .filter((event): event is ConcertEventSummary => Boolean(event)),
      }))
      .filter(({ work, events: linkedEvents }) => linkedEvents.length && definition.matches(work, linkedEvents))
      .sort((left, right) => right.events.length - left.events.length || left.work.title.localeCompare(right.work.title, "zh-CN"));
    const collectionEvents = uniqueEvents(works.flatMap((item) => item.events));
    if (!works.length || !collectionEvents.length) return [];
    return [{
      key: definition.key,
      eyebrow: definition.eyebrow,
      title: definition.title,
      description: definition.description,
      reason: definition.reason,
      works: works.map((item) => item.work),
      events: collectionEvents,
    }];
  });
}

export function isKnowledgeCollectionKey(value: string | null): value is KnowledgeCollectionKey {
  return definitions.some((definition) => definition.key === value);
}

function uniqueEvents(events: ConcertEventSummary[]) {
  return Array.from(new Map(events.map((event) => [event.id, event])).values())
    .sort((left, right) => left.startTime.localeCompare(right.startTime));
}

function lowestPrice(price?: string) {
  if (!price) return Number.POSITIVE_INFINITY;
  if (/免费/.test(price)) return 0;
  const values = [...price.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  return values.length ? Math.min(...values) : Number.POSITIVE_INFINITY;
}
