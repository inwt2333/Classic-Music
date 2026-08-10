import type {
  ChangeDataset,
  ConcertEvent,
  ConcertEventSummary,
  DatasetChange,
  ProgramItem,
} from "./types";

export type FollowTargetType = "person" | "composer" | "work" | "ensemble" | "venue" | "city";

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
  const identity = entityId || name.trim().toLocaleLowerCase("zh-CN");
  return {
    key: `${type}:${identity}`,
    type,
    name: name.trim(),
    entityId,
    aliases: Array.from(new Set(aliases.map((alias) => alias.trim()).filter(Boolean))),
    createdAt: new Date().toISOString(),
  };
}

export function readFollows(userId?: string): FollowMap {
  const key = accountStorageKey(storageKeys.follows, userId);
  return key ? readStorage<FollowMap>(key, {}) : {};
}

export function toggleFollow(follows: FollowMap, target: FollowTarget, userId?: string) {
  const next = { ...follows };
  if (next[target.key]) delete next[target.key];
  else next[target.key] = target;
  const key = accountStorageKey(storageKeys.follows, userId);
  if (key) writeStorage(key, next);
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
  const compact = notifications.slice(0, 300).map((item) => ({
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
  const key = accountStorageKey(storageKeys.notificationHistory, userId);
  if (key) writeStorage(key, compact);
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
  const key = accountStorageKey(storageKeys.savedFilters, userId);
  if (key) writeStorage(key, next);
  return next;
}

export function removeSavedFilter(filters: SavedFilter[], id: string, userId?: string) {
  const next = filters.filter((item) => item.id !== id);
  const key = accountStorageKey(storageKeys.savedFilters, userId);
  if (key) writeStorage(key, next);
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
    const current = map.get(change.eventId);
    if (!current || new Date(change.detectedAt) > new Date(current.detectedAt)) map.set(change.eventId, change);
  }
  return map;
}

export function recentChangeLabel(change: DatasetChange | undefined, generatedAt: string | null) {
  if (!change || !generatedAt) return undefined;
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

export function buildFollowNotifications(
  changes: ChangeDataset | null,
  events: ConcertEventSummary[],
  follows: FollowMap,
  readIds: string[],
): FollowNotification[] {
  const eventMap = new Map(events.map((event) => [event.id, event]));
  const targets = Object.values(follows);
  if (!targets.length) return [];
  return (changes?.changes ?? [])
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
    ].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN");
    return people.includes(normalizedName);
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
    issues.push(event.dataQuality === "ocr-assisted" ? "节目单来自 OCR，尚未人工确认" : "该演出正在等待人工复核");
  }
  if (isSuspiciousVenue(event.venue)) issues.push("场馆名称可能混入主办方或演出标题");
  if (event.ensemble && isSuspiciousEnsemble(event.ensemble)) issues.push("乐团名称可能需要拆分或规范化");
  if ("program" in event && event.program.some(isSuspiciousProgramItem)) issues.push("节目单中可能混入演出简介或人员信息");
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
