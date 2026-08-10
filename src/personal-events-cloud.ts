import type { SupabaseClient } from "@supabase/supabase-js";
import { isAuthNetworkError, withAuthNetworkRetry } from "./auth/auth-request";
import { getSupabase } from "./auth/supabase";
import {
  readPersonalEventSnapshots,
  readPersonalEvents,
  writePersonalEventSnapshots,
  writePersonalEvents,
  type PersonalEventMap,
  type PersonalEventSnapshot,
  type PersonalEventSnapshotMap,
  type PersonalEventStatus,
} from "./product-features";

export type PersonalEventRow = {
  user_id: string;
  event_id: string;
  status: PersonalEventStatus;
  snapshot: unknown;
  updated_at?: string;
};

type PendingMutation =
  | { action: "upsert"; status: PersonalEventStatus; snapshot?: PersonalEventSnapshot; token: string }
  | { action: "delete"; token: string };

type PendingMutationMap = Record<string, PendingMutation>;

const migrationKey = "classic-music.personal-events-cloud-migrated.v1";
const pendingKey = "classic-music.personal-events-cloud-pending.v1";

export type PersonalEventCloudState = {
  events: PersonalEventMap;
  snapshots: PersonalEventSnapshotMap;
};

export async function synchronizePersonalEvents(userId: string): Promise<PersonalEventCloudState> {
  const client = await requireSupabase();
  const localEvents = readPersonalEvents(userId);
  const localSnapshots = readPersonalEventSnapshots(userId);
  let rows = await fetchRows(client, userId);

  if (!readBoolean(`${migrationKey}.${userId}`)) {
    const migrationRows = buildLegacyMigrationRows(userId, localEvents, localSnapshots, rows);
    if (migrationRows.length) await upsertRows(client, migrationRows);
    writeBoolean(`${migrationKey}.${userId}`, true);
  }

  await flushPendingMutations(client, userId);
  rows = await fetchRows(client, userId);
  const state = rowsToState(rows);
  writePersonalEvents(state.events, userId);
  writePersonalEventSnapshots(state.snapshots, userId);
  return state;
}

export async function upsertPersonalEvent(
  userId: string,
  eventId: string,
  status: PersonalEventStatus,
  snapshot?: PersonalEventSnapshot,
) {
  const mutation: PendingMutation = { action: "upsert", status, snapshot, token: makeToken() };
  writePendingMutation(userId, eventId, mutation);
  const client = await requireSupabase();
  await upsertRows(client, [{ user_id: userId, event_id: eventId, status, snapshot: snapshot ?? null }]);
  clearPendingMutation(userId, eventId, mutation.token);
}

export async function deletePersonalEvent(userId: string, eventId: string) {
  const mutation: PendingMutation = { action: "delete", token: makeToken() };
  writePendingMutation(userId, eventId, mutation);
  const client = await requireSupabase();
  await deleteRow(client, userId, eventId);
  clearPendingMutation(userId, eventId, mutation.token);
}

async function fetchRows(client: SupabaseClient, userId: string) {
  const { data, error } = await withAuthNetworkRetry(() => client
    .from("personal_events")
    .select("user_id,event_id,status,snapshot,updated_at")
    .eq("user_id", userId));
  if (error) throw formatPersonalEventCloudError(error);
  return (data ?? []).filter(isPersonalEventRow);
}

async function upsertRows(client: SupabaseClient, rows: Array<Omit<PersonalEventRow, "updated_at">>) {
  if (!rows.length) return;
  const { error } = await withAuthNetworkRetry(() => client
    .from("personal_events")
    .upsert(rows, { onConflict: "user_id,event_id" }));
  if (error) throw formatPersonalEventCloudError(error);
}

async function deleteRow(client: SupabaseClient, userId: string, eventId: string) {
  const { error } = await withAuthNetworkRetry(() => client
    .from("personal_events")
    .delete()
    .eq("user_id", userId)
    .eq("event_id", eventId));
  if (error) throw formatPersonalEventCloudError(error);
}

async function flushPendingMutations(client: SupabaseClient, userId: string) {
  const pending = readPendingMutations(userId);
  for (const [eventId, mutation] of Object.entries(pending)) {
    if (mutation.action === "upsert") {
      await upsertRows(client, [{
        user_id: userId,
        event_id: eventId,
        status: mutation.status,
        snapshot: mutation.snapshot ?? null,
      }]);
    } else {
      await deleteRow(client, userId, eventId);
    }
    clearPendingMutation(userId, eventId, mutation.token);
  }
}

export function buildLegacyMigrationRows(
  userId: string,
  localEvents: PersonalEventMap,
  localSnapshots: PersonalEventSnapshotMap,
  cloudRows: PersonalEventRow[],
): Array<Omit<PersonalEventRow, "updated_at">> {
  const rowsById = new Map(cloudRows.map((row) => [row.event_id, row]));
  return Object.entries(localEvents).flatMap(([eventId, status]) => {
    const existing = rowsById.get(eventId);
    const localSnapshot = localSnapshots[eventId];
    if (existing && (existing.snapshot || !localSnapshot)) return [];
    return [{
      user_id: userId,
      event_id: eventId,
      status: existing?.status ?? status,
      snapshot: localSnapshot ?? existing?.snapshot ?? null,
    }];
  });
}

export function rowsToState(rows: PersonalEventRow[]): PersonalEventCloudState {
  const events: PersonalEventMap = {};
  const snapshots: PersonalEventSnapshotMap = {};
  for (const row of rows) {
    events[row.event_id] = row.status;
    const snapshot = parseSnapshot(row.snapshot);
    if (snapshot) snapshots[row.event_id] = snapshot;
  }
  return { events, snapshots };
}

function isPersonalEventRow(value: unknown): value is PersonalEventRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PersonalEventRow>;
  return typeof row.user_id === "string"
    && typeof row.event_id === "string"
    && (row.status === "interested" || row.status === "attended");
}

function parseSnapshot(value: unknown): PersonalEventSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const snapshot = value as Partial<PersonalEventSnapshot>;
  if (
    typeof snapshot.id !== "string"
    || typeof snapshot.title !== "string"
    || typeof snapshot.city !== "string"
    || typeof snapshot.venue !== "string"
    || typeof snapshot.startTime !== "string"
    || typeof snapshot.dateLabel !== "string"
    || typeof snapshot.timeLabel !== "string"
  ) return undefined;
  return {
    ...snapshot,
    performers: Array.isArray(snapshot.performers) ? snapshot.performers.filter((item): item is string => typeof item === "string") : [],
    programPreview: Array.isArray(snapshot.programPreview) ? snapshot.programPreview as PersonalEventSnapshot["programPreview"] : [],
    savedAt: typeof snapshot.savedAt === "string" ? snapshot.savedAt : new Date().toISOString(),
  } as PersonalEventSnapshot;
}

function readPendingMutations(userId: string): PendingMutationMap {
  try {
    const value = window.localStorage.getItem(`${pendingKey}.${userId}`);
    return value ? JSON.parse(value) as PendingMutationMap : {};
  } catch {
    return {};
  }
}

function writePendingMutation(userId: string, eventId: string, mutation: PendingMutation) {
  const pending = readPendingMutations(userId);
  pending[eventId] = mutation;
  window.localStorage.setItem(`${pendingKey}.${userId}`, JSON.stringify(pending));
}

function clearPendingMutation(userId: string, eventId: string, token: string) {
  const pending = readPendingMutations(userId);
  if (pending[eventId]?.token !== token) return;
  delete pending[eventId];
  window.localStorage.setItem(`${pendingKey}.${userId}`, JSON.stringify(pending));
}

function readBoolean(key: string) {
  return window.localStorage.getItem(key) === "1";
}

function writeBoolean(key: string, value: boolean) {
  window.localStorage.setItem(key, value ? "1" : "0");
}

async function requireSupabase() {
  const client = await getSupabase();
  if (!client) throw new Error("账号服务尚未配置，个人演出已保存在当前设备。");
  return client;
}

function formatPersonalEventCloudError(reason: unknown) {
  const code = typeof reason === "object" && reason && "code" in reason ? String(reason.code) : "";
  const message = reason instanceof Error
    ? reason.message
    : typeof reason === "object" && reason && "message" in reason
      ? String(reason.message)
      : String(reason);
  if (code === "PGRST205" || code === "42P01" || /personal_events.*schema cache/i.test(message)) {
    return new Error("个人演出云端数据表尚未初始化，当前修改已保存在本机。", { cause: reason });
  }
  if (isAuthNetworkError(reason)) {
    return new Error("个人演出暂时无法同步，当前修改已保存在本机。", { cause: reason });
  }
  return new Error(`个人演出同步失败：${message}`, { cause: reason });
}

function makeToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
