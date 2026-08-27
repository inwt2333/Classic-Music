import type {
  ChangeDataset,
  ConcertEvent,
  ConcertEventSummary,
  DatasetChange,
  ProgramItem,
} from "./types";
import {
  canonicalPersonName,
  normalizePersonIdentity,
  personNameAppearsInText,
  personNameVariants,
  samePersonName,
} from "./person-identity";
import { matchesExpandedSearch, type PersonalEventStatus } from "./product-features";
import { dateMatchesPreset, normalizeEnsembleName, normalizeVenueName } from "./utils";

export type FollowTargetType = "person" | "composer" | "work" | "ensemble" | "venue" | "city" | "filter";

export type FollowTarget = {
  key: string;
  type: FollowTargetType;
  name: string;
  entityId?: string;
  aliases?: string[];
  createdAt: string;
};

export type FollowMap = Record<string, FollowTarget>;

export type SortMode = "time" | "updated" | "price" | "program";

export type SavedFilterState = {
  query: string;
  datePreset: "all" | "week" | "weekend" | "month";
  city: string;
  venue: string;
  ensemble: string;
  genre: string;
  hasProgram: boolean;
  sortMode: SortMode;
};

export type SavedFilter = SavedFilterState & {
  id: string;
  name: string;
  createdAt: string;
};

export type CorrectionField = "venue" | "time" | "price" | "program" | "lineup" | "other";

export type CorrectionReport = {
  id: string;
  eventId: string;
  eventTitle: string;
  field: CorrectionField;
  description: string;
  sourceUrl: string;
  createdAt: string;
  submitted: boolean;
};

export type FollowNotification = {
  id: string;
  change: DatasetChange;
  event?: Pick<ConcertEventSummary, "id" | "title">;
  targets: FollowTarget[];
  read: boolean;
};

const storageKeys = {
  follows: "classic-music.follows.v1",
  readNotifications: "classic-music.read-notifications.v1",
  notificationHistory: "classic-music.follow-notifications.v1",
  dismissedNotifications: "classic-music.dismissed-notifications.v1",
  savedFilters: "classic-music.saved-filters.v1",
  corrections: "classic-music.correction-reports.v1",
} as const;

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function accountStorageKey(key: string, userId?: string) {
  return userId ? `${key}.${userId}` : "";
}

export function makeFollowTarget(
  type: FollowTargetType,
  name: string,
  entityId?: string,
  aliases: string[] = [],
): FollowTarget {
  const canonicalName = type === "person" ? canonicalPersonName(name) : name.trim();
  const normalizedAliases = type === "person"
    ? Array.from(new Set([
      ...aliases,
      ...personNameVariants(name),
    ].map((alias) => alias.trim()).filter((alias) => alias && alias !== canonicalName)))
    : Array.from(new Set(aliases.map((alias) => alias.trim()).filter(Boolean)));
  const identity = type === "person"
    ? normalizePersonIdentity(canonicalName)
    : entityId || canonicalName.toLocaleLowerCase("zh-CN");
  return {
    key: `${type}:${identity}`,
    type,
    name: canonicalName,
    entityId,
    aliases: normalizedAliases,
    createdAt: new Date().toISOString(),
  };
}

export function followTargetsEquivalent(left: FollowTarget, right: FollowTarget) {
  if (left.type !== right.type) return false;
  if (left.type !== "person") {
    return left.key === right.key
      || Boolean(left.entityId && right.entityId && left.entityId === right.entityId)
      || left.name.trim().toLocaleLowerCase("zh-CN") === right.name.trim().toLocaleLowerCase("zh-CN");
  }
  const leftNames = [left.name, ...(left.aliases ?? [])];
  const rightNames = [right.name, ...(right.aliases ?? [])];
  return leftNames.some((leftName) => rightNames.some((rightName) => samePersonName(leftName, rightName)));
}

export function isFollowTargetActive(follows: FollowMap, target: FollowTarget) {
  return Object.values(follows).some((follow) => followTargetsEquivalent(follow, target));
}

export function readFollows(userId?: string): FollowMap {
  const key = accountStorageKey(storageKeys.follows, userId);
  return key ? readStorage<FollowMap>(key, {}) : {};
}

export function writeFollows(follows: FollowMap, userId?: string) {
  const key = accountStorageKey(storageKeys.follows, userId);
  if (key) writeStorage(key, follows);
}

export function toggleFollow(follows: FollowMap, target: FollowTarget, userId?: string) {
  const next = { ...follows };
  const equivalentKeys = Object.entries(next)
    .filter(([, follow]) => followTargetsEquivalent(follow, target))
    .map(([key]) => key);
  if (equivalentKeys.length) equivalentKeys.forEach((key) => delete next[key]);
  else next[target.key] = target;
  writeFollows(next, userId);
  return next;
}

export function readReadNotificationIds(userId?: string) {
  const key = accountStorageKey(storageKeys.readNotifications, userId);
  return key ? readStorage<string[]>(key, []) : [];
}

export function writeReadNotificationIds(ids: string[], userId?: string) {
  const key = accountStorageKey(storageKeys.readNotifications, userId);
  if (key) writeStorage(key, Array.from(new Set(ids)).slice(-1000));
}

export function readFollowNotificationHistory(userId?: string) {
  const key = accountStorageKey(storageKeys.notificationHistory, userId);
  return key ? readStorage<FollowNotification[]>(key, []) : [];
}

export function writeFollowNotificationHistory(notifications: FollowNotification[], userId?: string) {
  const compact = compactFollowNotificationHistory(notifications);
  const key = accountStorageKey(storageKeys.notificationHistory, userId);
  if (key) writeStorage(key, compact);
}

export function compactFollowNotificationHistory(notifications: FollowNotification[]) {
  return notifications.slice(0, 300).map((item) => ({
    ...item,
    change: {
      id: item.change.id,
      eventId: item.change.eventId,
      type: item.change.type,
      detectedAt: item.change.detectedAt,
      summary: item.change.summary,
    },
    event: item.event ? { id: item.event.id, title: item.event.title } : undefined,
  }));
}

export function readDismissedNotificationIds(userId?: string) {
  const key = accountStorageKey(storageKeys.dismissedNotifications, userId);
  return key ? readStorage<string[]>(key, []) : [];
}

export function writeDismissedNotificationIds(ids: string[], userId?: string) {
  const key = accountStorageKey(storageKeys.dismissedNotifications, userId);
  if (key) writeStorage(key, Array.from(new Set(ids)).slice(-1000));
}

export function mergeFollowNotificationHistory(
  history: FollowNotification[],
  incoming: FollowNotification[],
  readIds: string[],
  dismissedIds: string[],
) {
  const dismissed = new Set(dismissedIds);
  const read = new Set(readIds);
  const merged = new Map<string, FollowNotification>();

  for (const item of [...history, ...incoming]) {
    if (item.change.type === "program" || item.change.type === "lineup") continue;
    if (dismissed.has(item.id)) continue;
    const previous = merged.get(item.id);
    const targets = new Map(
      [...(previous?.targets ?? []), ...item.targets].map((target) => [target.key, target]),
    );
    merged.set(item.id, {
      ...previous,
      ...item,
      event: item.event ?? previous?.event,
      targets: Array.from(targets.values()),
      read: read.has(item.id) || Boolean(previous?.read) || item.read,
    });
  }

  return Array.from(merged.values())
    .sort((left, right) => right.change.detectedAt.localeCompare(left.change.detectedAt))
    .slice(0, 300);
}

export function readSavedFilters(userId?: string) {
  const key = accountStorageKey(storageKeys.savedFilters, userId);
  return key ? readStorage<SavedFilter[]>(key, []) : [];
}

export function writeSavedFilters(filters: SavedFilter[], userId?: string) {
  const key = accountStorageKey(storageKeys.savedFilters, userId);
  if (key) writeStorage(key, filters.slice(-12));
}

export function saveFilter(filters: SavedFilter[], state: SavedFilterState, name: string, userId?: string) {
  const next: SavedFilter[] = [
    ...filters,
    {
      ...state,
      id: `filter_${Date.now().toString(36)}`,
      name,
      createdAt: new Date().toISOString(),
    },
  ].slice(-12);
  writeSavedFilters(next, userId);
  return next;
}

export function removeSavedFilter(filters: SavedFilter[], id: string, userId?: string) {
  const next = filters.filter((item) => item.id !== id);
  writeSavedFilters(next, userId);
  return next;
}

export function readCorrectionReports() {
  return readStorage<CorrectionReport[]>(storageKeys.corrections, []);
}

export function saveCorrectionReport(report: Omit<CorrectionReport, "id" | "createdAt">) {
  const nextReport: CorrectionReport = {
    ...report,
    id: `correction_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
  };
  const next = [...readCorrectionReports(), nextReport].slice(-100);
  writeStorage(storageKeys.corrections, next);
  return nextReport;
}

export function buildGithubCorrectionUrl(report: CorrectionReport) {
  const labels: Record<CorrectionField, string> = {
    venue: "场馆",
    time: "日期或时间",
    price: "票价",
    program: "节目单",
    lineup: "人物或乐团",
    other: "其他",
  };
  const title = `[数据纠错] ${report.eventTitle}`;
  const body = [
    `### 需要修正的字段`,
    labels[report.field],
    "",
    "### 问题说明",
    report.description,
    "",
    "### 演出信息",
    `- 事件 ID：${report.eventId}`,
    `- 官网：${report.sourceUrl}`,
    `- 反馈时间：${report.createdAt}`,
  ].join("\n");
  const params = new URLSearchParams({ title, body });
  return `https://github.com/inwt2333/Classic-Music/issues/new?${params}`;
}

export function latestChangesByEvent(changes: ChangeDataset | null) {
  const map = new Map<string, DatasetChange>();
  for (const change of changes?.changes ?? []) {
    if (change.type === "program" || change.type === "lineup") continue;
    const current = map.get(change.eventId);
    if (!current || new Date(change.detectedAt) > new Date(current.detectedAt)) map.set(change.eventId, change);
  }
  return map;
}

export function recentChangeLabel(change: DatasetChange | undefined, generatedAt: string | null) {
  if (!change || !generatedAt) return undefined;
  if (change.type === "program" || change.type === "lineup") return undefined;
  const age = new Date(generatedAt).getTime() - new Date(change.detectedAt).getTime();
  if (age > 14 * 24 * 60 * 60 * 1000) return undefined;
  if (change.type === "added") return "新收录";
  const labels: Record<DatasetChange["type"], string> = {
    added: "新收录",
    removed: "已下架",
    rescheduled: "已改期",
    cancelled: "已取消",
    lineup: "阵容更新",
    program: "曲目更新",
    price: "票价更新",
  };
  return labels[change.type];
}

export function sortConcerts(
  events: ConcertEventSummary[],
  mode: SortMode,
  changesByEvent: Map<string, DatasetChange>,
) {
  return [...events].sort((left, right) => {
    if (mode === "updated") {
      const leftTime = changesByEvent.get(left.id)?.detectedAt ?? "";
      const rightTime = changesByEvent.get(right.id)?.detectedAt ?? "";
      return rightTime.localeCompare(leftTime) || left.startTime.localeCompare(right.startTime);
    }
    if (mode === "price") {
      return lowestPrice(left.price) - lowestPrice(right.price) || left.startTime.localeCompare(right.startTime);
    }
    if (mode === "program") {
      return Number(right.hasProgram) - Number(left.hasProgram)
        || right.programPreview.length - left.programPreview.length
        || left.startTime.localeCompare(right.startTime);
    }
    return left.startTime.localeCompare(right.startTime);
  });
}

function lowestPrice(price?: string) {
  if (!price) return Number.MAX_SAFE_INTEGER;
  if (/免费/.test(price)) return 0;
  const values = [...price.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  return values.length ? Math.min(...values) : Number.MAX_SAFE_INTEGER;
}

export function buildSavedFilterNotifications(
  changes: ChangeDataset | null,
  events: ConcertEventSummary[],
  savedFilters: SavedFilter[],
  readIds: string[],
): FollowNotification[] {
  if (!changes || !savedFilters.length) return [];
  const eventMap = new Map(events.map((event) => [event.id, event]));
  return (changes.changes ?? [])
    .filter((change) => change.type === "added")
    .flatMap<FollowNotification>((change) => {
      const event = eventMap.get(change.eventId);
      if (!event) return [];
      return savedFilters
        .filter((filter) => eventMatchesSavedFilter(event, filter))
        .map((filter) => {
          const id = `${change.id}:filter:${filter.id}`;
          return {
            id,
            change,
            event,
            targets: [{
              key: `filter:${filter.id}`,
              type: "filter" as const,
              name: `筛选「${filter.name}」`,
              createdAt: filter.createdAt,
            }],
            read: readIds.includes(id),
          };
        });
    })
    .sort((left, right) => right.change.detectedAt.localeCompare(left.change.detectedAt));
}

export type ConcertRecommendation = {
  event: ConcertEventSummary;
  reason: string;
  score: number;
};

export function buildRecommendations({
  events,
  follows,
  personalEvents,
  now = Date.now(),
}: {
  events: ConcertEventSummary[];
  follows: FollowMap;
  personalEvents: Record<string, PersonalEventStatus>;
  now?: number;
}): ConcertRecommendation[] {
  const markedIds = new Set(Object.keys(personalEvents));
  const markedEvents = events.filter((event) => markedIds.has(event.id));
  const markedWorkIds = new Set(
    markedEvents.flatMap((event) => event.programPreview.map((item) => item.knowledgeWorkId).filter(Boolean) as string[]),
  );
  const markedComposers = new Set(
    markedEvents.flatMap((event) => event.programPreview.map((item) => item.composer).filter(Boolean) as string[]),
  );
  const markedEnsembles = new Set(markedEvents.map((event) => normalizeEnsembleName(event.ensemble)).filter(Boolean) as string[]);

  const recommendations = new Map<string, ConcertRecommendation>();
  const bump = (event: ConcertEventSummary, reason: string, score: number) => {
    const existing = recommendations.get(event.id);
    if (existing && existing.score >= score) return;
    recommendations.set(event.id, { event, reason, score });
  };

  for (const event of events) {
    if (markedIds.has(event.id)) continue;
    if (new Date(event.startTime).getTime() <= now) continue;

    for (const target of Object.values(follows)) {
      if (target.type === "city" && event.city === target.name) bump(event, `你关注的城市 · ${target.name}`, 6);
      if (target.type === "venue" && normalizeVenueName(event.venue) === target.name) bump(event, `你关注的场馆 · ${target.name}`, 6);
      if (target.type === "ensemble" && normalizeEnsembleName(event.ensemble)?.includes(target.name.toLocaleLowerCase("zh-CN"))) {
        bump(event, `你关注的乐团 · ${target.name}`, 5);
      }
      if (target.type === "person" && event.mainPerson && samePersonName(event.mainPerson, target.name)) {
        bump(event, `你关注的音乐家 · ${target.name}`, 5);
      }
    }

    const sharedWork = event.programPreview.find((item) => item.knowledgeWorkId && markedWorkIds.has(item.knowledgeWorkId));
    if (sharedWork?.knowledgeWorkId) bump(event, `你标记过《${sharedWork.title}》`, 4);

    const sharedComposer = event.programPreview.find((item) => item.composer && markedComposers.has(item.composer));
    if (sharedComposer?.composer) bump(event, `你听过${sharedComposer.composer}的作品`, 3);

    const ensemble = normalizeEnsembleName(event.ensemble);
    if (ensemble && markedEnsembles.has(ensemble)) bump(event, `你关注过${ensemble}`, 2);
  }

  return [...recommendations.values()]
    .sort((left, right) => right.score - left.score || left.event.startTime.localeCompare(right.event.startTime))
    .slice(0, 6);
}

function eventMatchesSavedFilter(event: ConcertEventSummary, filter: SavedFilterState) {
  if (filter.city !== "全部城市" && event.city !== filter.city) return false;
  if (filter.venue !== "全部场馆" && normalizeVenueName(event.venue) !== filter.venue) return false;
  if (filter.ensemble !== "全部乐团" && normalizeEnsembleName(event.ensemble) !== filter.ensemble) return false;
  if (filter.genre !== "全部类型" && !event.genres.includes(filter.genre)) return false;
  if (filter.hasProgram && !event.hasProgram) return false;
  if (filter.datePreset !== "all" && !dateMatchesPreset(event.startTime, filter.datePreset)) return false;
  const query = filter.query.trim();
  return !query || matchesExpandedSearch(event.searchText, [query]);
}

export function buildFollowNotifications(  changes: ChangeDataset | null,
  events: ConcertEventSummary[],
  follows: FollowMap,
  readIds: string[],
): FollowNotification[] {
  const eventMap = new Map(events.map((event) => [event.id, event]));
  const targets = Object.values(follows);
  if (!targets.length) return [];
  return (changes?.changes ?? [])
    .filter((change) => change.type !== "program" && change.type !== "lineup")
    .flatMap<FollowNotification>((change) => {
      const event = eventMap.get(change.eventId);
      const matching = targets.filter((target) => eventMatchesFollow(event, change, target));
      return matching.length
        ? [{ id: change.id, change, event, targets: matching, read: readIds.includes(change.id) }]
        : [];
    })
    .sort((left, right) => right.change.detectedAt.localeCompare(left.change.detectedAt));
}

function eventMatchesFollow(
  event: ConcertEventSummary | undefined,
  change: DatasetChange,
  target: FollowTarget,
) {
  const snapshot = change.after ?? change.before;
  const normalizedName = target.name.toLocaleLowerCase("zh-CN");
  if (target.type === "city") return (event?.city ?? snapshot?.city) === target.name;
  if (target.type === "venue") return (event?.venue ?? snapshot?.venue) === target.name;
  if (target.type === "ensemble") return event?.ensemble?.toLocaleLowerCase("zh-CN").includes(normalizedName) ?? false;
  if (target.type === "person") {
    const people = [
      event?.mainPerson,
      snapshot?.conductor,
      ...(snapshot?.performers ?? []),
    ].filter((value): value is string => Boolean(value));
    const followedNames = [target.name, ...(target.aliases ?? [])];
    if (people.some((person) => followedNames.some((name) => samePersonName(person, name)))) return true;
    const title = event?.title ?? snapshot?.title ?? "";
    return followedNames.some((name) => personNameAppearsInText(name, title));
  }
  if (target.type === "composer") {
    const program = event?.programPreview ?? snapshot?.programPreview ?? [];
    const names = [target.name, ...(target.aliases ?? [])].map((name) => name.toLocaleLowerCase("zh-CN"));
    return program.some((item) => {
      const composer = item.composer?.toLocaleLowerCase("zh-CN") ?? "";
      if (!composer) return false;
      return names.some((name) => composer.includes(name) || name.includes(composer));
    });
  }
  const program = event?.programPreview ?? snapshot?.programPreview ?? [];
  return program.some((item) => (
    (target.entityId && "knowledgeWorkId" in item && item.knowledgeWorkId === target.entityId)
    || (target.entityId && "workId" in item && item.workId === target.entityId)
    || [item.composer, item.title, ...(item.alternateTitles ?? [])]
      .filter(Boolean).join(" ").toLocaleLowerCase("zh-CN").includes(normalizedName)
  ));
}

export function detectDataIssues(event: ConcertEvent | ConcertEventSummary) {
  const issues: string[] = [];
  if (event.dataQuality === "needs-review" || event.dataQuality === "ocr-assisted") {
    issues.push(event.dataQuality === "ocr-assisted" ? "节目单文字来自官方图片，可能不完整" : "部分信息尚待补充");
  }
  if (isSuspiciousVenue(event.venue)) issues.push("场馆信息可能不完整");
  if (event.ensemble && isSuspiciousEnsemble(event.ensemble)) issues.push("乐团信息可能不完整");
  if ("program" in event && event.program.some(isSuspiciousProgramItem)) issues.push("节目单可能包含无关文字");
  return Array.from(new Set(issues));
}

function isSuspiciousVenue(value: string) {
  return value.length > 30
    || /(?:有限公司|主办|呈现|系列音乐会|合唱团[、，]|乐团[、，])/.test(value);
}

function isSuspiciousEnsemble(value: string) {
  return value.length > 34 || /(?:启程|嘉年华|周年音乐会|演绎|音乐季|丨|\s[·・]\s)/.test(value);
}

function isSuspiciousProgramItem(item: ProgramItem) {
  const text = `${item.composer ?? ""}${item.title}`;
  return text.length > 75
    || /(?:本场音乐会|将为观众|音乐会现场|敬请期待|演出阵容|指挥[：:]|演奏[：:])/.test(text);
}

export function buildSavedFilterName(state: SavedFilterState) {
  const parts = [
    state.city !== "全部城市" ? state.city : undefined,
    state.venue !== "全部场馆" ? state.venue : undefined,
    state.ensemble !== "全部乐团" ? state.ensemble : undefined,
    state.genre !== "全部类型" ? state.genre : undefined,
    state.datePreset === "week" ? "本周" : state.datePreset === "weekend" ? "周末" : state.datePreset === "month" ? "本月" : undefined,
    state.hasProgram ? "有节目单" : undefined,
    state.query || undefined,
  ].filter(Boolean);
  return parts.slice(0, 3).join(" · ") || "全部未来演出";
}

export function formatCorrectionField(field: CorrectionField) {
  return ({
    venue: "场馆",
    time: "日期或时间",
    price: "票价",
    program: "节目单",
    lineup: "人物或乐团",
    other: "其他",
  } as const)[field];
}
