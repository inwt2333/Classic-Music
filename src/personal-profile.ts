import type { FollowMap, FollowTarget, FollowTargetType, SavedFilter } from "./discovery-features";
import type {
  PersonalEventMap,
  PersonalEventSnapshot,
  PersonalEventSnapshotMap,
  PersonalEventStatus,
} from "./product-features";
import type { ConcertEventSummary } from "./types";

export const followTypeOrder: FollowTargetType[] = ["work", "composer", "person", "ensemble", "venue", "city"];

export function groupFollowTargets(follows: FollowMap) {
  const groups = new Map<FollowTargetType, FollowTarget[]>();
  for (const type of followTypeOrder) groups.set(type, []);
  for (const target of Object.values(follows)) groups.get(target.type)?.push(target);
  for (const targets of groups.values()) {
    targets.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.name.localeCompare(right.name, "zh-CN"));
  }
  return groups;
}

export function followTargetHref(target: FollowTarget, knowledgeWorkIds: Set<string> = new Set()) {
  const params = new URLSearchParams();
  if (target.type === "work" && target.entityId) {
    params.set(knowledgeWorkIds.has(target.entityId) ? "work" : "entity", target.entityId);
  } else if (target.type === "composer" && target.entityId) {
    params.set("composer", target.entityId);
  } else if ((target.type === "person" || target.type === "ensemble") && target.entityId) {
    params.set("entity", target.entityId);
  } else if (target.type === "venue") {
    params.set("venuePage", target.name);
  } else if (target.type === "city") {
    params.set("city", target.name);
  } else {
    params.set("q", target.name);
  }
  return `?${params.toString()}`;
}

export function savedFilterHref(filter: SavedFilter) {
  const params = new URLSearchParams();
  if (filter.query) params.set("q", filter.query);
  if (filter.datePreset !== "all") params.set("date", filter.datePreset);
  if (filter.city !== "全部城市") params.set("city", filter.city);
  if (filter.venue !== "全部场馆") params.set("venue", filter.venue);
  if (filter.ensemble !== "全部乐团") params.set("ensemble", filter.ensemble);
  if (filter.genre !== "全部类型") params.set("genre", filter.genre);
  if (filter.hasProgram) params.set("program", "1");
  if (filter.sortMode !== "time") params.set("sort", filter.sortMode);
  return params.size ? `?${params.toString()}` : "?";
}

export function countPersonalEvents(events: PersonalEventMap) {
  return Object.values(events).reduce(
    (counts, status) => ({ ...counts, [status]: counts[status] + 1 }),
    { interested: 0, attended: 0 },
  );
}

export type PersonalEventListItem = {
  event: ConcertEventSummary | PersonalEventSnapshot;
  archived: boolean;
};

export function listPersonalEvents(
  events: PersonalEventMap,
  status: PersonalEventStatus,
  eventMap: Map<string, ConcertEventSummary>,
  snapshots: PersonalEventSnapshotMap,
): PersonalEventListItem[] {
  return Object.entries(events)
    .filter(([, value]) => value === status)
    .flatMap(([id]): PersonalEventListItem[] => {
      const currentEvent = eventMap.get(id);
      if (currentEvent) return [{ event: currentEvent, archived: false }];
      const snapshot = snapshots[id];
      return snapshot ? [{ event: snapshot, archived: true }] : [];
    })
    .sort((left, right) => status === "interested"
      ? left.event.startTime.localeCompare(right.event.startTime)
      : right.event.startTime.localeCompare(left.event.startTime));
}
