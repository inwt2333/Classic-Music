import type { SupabaseClient } from "@supabase/supabase-js";
import { isAuthNetworkError, withAuthNetworkRetry } from "./auth/auth-request";
import { getSupabase } from "./auth/supabase";
import {
  compactFollowNotificationHistory,
  mergeFollowNotificationHistory,
  readDismissedNotificationIds,
  readFollows,
  readFollowNotificationHistory,
  readReadNotificationIds,
  readSavedFilters,
  writeDismissedNotificationIds,
  writeFollows,
  writeFollowNotificationHistory,
  writeReadNotificationIds,
  writeSavedFilters,
  type FollowMap,
  type FollowNotification,
  type SavedFilter,
} from "./discovery-features";

export type UserPreferencesState = {
  follows: FollowMap;
  savedFilters: SavedFilter[];
  notificationHistory: FollowNotification[];
  readNotificationIds: string[];
  dismissedNotificationIds: string[];
};

export type UserPreferenceColumn =
  | "follows"
  | "saved_filters"
  | "notification_history"
  | "read_notification_ids"
  | "dismissed_notification_ids";

type UserPreferencesRow = {
  user_id: string;
  follows: unknown;
  saved_filters: unknown;
  notification_history: unknown;
  read_notification_ids: unknown;
  dismissed_notification_ids: unknown;
};

type PendingPreference = { value: unknown; token: string };
type PendingPreferenceMap = Partial<Record<UserPreferenceColumn, PendingPreference>>;

const migrationKey = "classic-music.user-preferences-cloud-migrated.v1";
const pendingKey = "classic-music.user-preferences-cloud-pending.v1";

export async function synchronizeUserPreferences(userId: string): Promise<UserPreferencesState> {
  const client = await requireSupabase();
  const local = readLocalPreferences(userId);
  let row = await fetchRow(client, userId);

  if (!readBoolean(`${migrationKey}.${userId}`)) {
    const merged = mergeLegacyPreferences(local, row ? rowToState(row) : emptyPreferences());
    await upsertState(client, userId, merged);
    writeBoolean(`${migrationKey}.${userId}`, true);
  } else if (!row) {
    await upsertState(client, userId, local);
  }

  await flushPendingPreferences(client, userId);
  row = await fetchRow(client, userId);
  const state = row ? rowToState(row) : emptyPreferences();
  writeLocalPreferences(userId, state);
  return state;
}

export async function persistUserPreference(
  userId: string,
  column: UserPreferenceColumn,
  value: unknown,
) {
  const pending: PendingPreference = { value, token: makeToken() };
  writePendingPreference(userId, column, pending);
  const client = await requireSupabase();
  await upsertColumns(client, userId, { [column]: value });
  clearPendingPreference(userId, column, pending.token);
}

export function readLocalPreferences(userId?: string): UserPreferencesState {
  return {
    follows: readFollows(userId),
    savedFilters: readSavedFilters(userId),
    notificationHistory: readFollowNotificationHistory(userId),
    readNotificationIds: readReadNotificationIds(userId),
    dismissedNotificationIds: readDismissedNotificationIds(userId),
  };
}

export function writeLocalPreferences(userId: string, state: UserPreferencesState) {
  writeFollows(state.follows, userId);
  writeSavedFilters(state.savedFilters, userId);
  writeFollowNotificationHistory(state.notificationHistory, userId);
  writeReadNotificationIds(state.readNotificationIds, userId);
  writeDismissedNotificationIds(state.dismissedNotificationIds, userId);
}

export function mergeLegacyPreferences(local: UserPreferencesState, cloud: UserPreferencesState): UserPreferencesState {
  const follows = { ...local.follows, ...cloud.follows };
  const filtersById = new Map([...local.savedFilters, ...cloud.savedFilters].map((filter) => [filter.id, filter]));
  const savedFilters = [...filtersById.values()]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-12);
  const readNotificationIds = uniqueStrings([...local.readNotificationIds, ...cloud.readNotificationIds], 1000);
  const dismissedNotificationIds = uniqueStrings([...local.dismissedNotificationIds, ...cloud.dismissedNotificationIds], 1000);
  const notificationHistory = mergeFollowNotificationHistory(
    local.notificationHistory,
    cloud.notificationHistory,
    readNotificationIds,
    dismissedNotificationIds,
  );
  return { follows, savedFilters, notificationHistory, readNotificationIds, dismissedNotificationIds };
}

export function rowToState(row: UserPreferencesRow): UserPreferencesState {
  return {
    follows: parseFollows(row.follows),
    savedFilters: parseSavedFilters(row.saved_filters),
    notificationHistory: parseNotificationHistory(row.notification_history),
    readNotificationIds: parseStringArray(row.read_notification_ids, 1000),
    dismissedNotificationIds: parseStringArray(row.dismissed_notification_ids, 1000),
  };
}

async function fetchRow(client: SupabaseClient, userId: string) {
  const { data, error } = await withAuthNetworkRetry(() => client
    .from("user_preferences")
    .select("user_id,follows,saved_filters,notification_history,read_notification_ids,dismissed_notification_ids")
    .eq("user_id", userId)
    .maybeSingle());
  if (error) throw formatPreferenceCloudError(error);
  return data as UserPreferencesRow | null;
}

async function upsertState(client: SupabaseClient, userId: string, state: UserPreferencesState) {
  await upsertColumns(client, userId, {
    follows: state.follows,
    saved_filters: state.savedFilters,
    notification_history: compactFollowNotificationHistory(state.notificationHistory),
    read_notification_ids: state.readNotificationIds,
    dismissed_notification_ids: state.dismissedNotificationIds,
  });
}

async function upsertColumns(client: SupabaseClient, userId: string, columns: Partial<Record<UserPreferenceColumn, unknown>>) {
  const { error } = await withAuthNetworkRetry(() => client
    .from("user_preferences")
    .upsert({ user_id: userId, ...columns }, { onConflict: "user_id", defaultToNull: false }));
  if (error) throw formatPreferenceCloudError(error);
}

async function flushPendingPreferences(client: SupabaseClient, userId: string) {
  const pending = readPendingPreferences(userId);
  const columns = Object.fromEntries(Object.entries(pending).map(([column, item]) => [column, item?.value]));
  if (Object.keys(columns).length) await upsertColumns(client, userId, columns);
  for (const [column, item] of Object.entries(pending)) {
    if (item) clearPendingPreference(userId, column as UserPreferenceColumn, item.token);
  }
}

function parseFollows(value: unknown): FollowMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, target]) => (
    Boolean(target)
    && typeof target === "object"
    && typeof (target as { key?: unknown }).key === "string"
    && typeof (target as { name?: unknown }).name === "string"
    && ["person", "composer", "work", "ensemble", "venue", "city"].includes(String((target as { type?: unknown }).type))
  ))) as FollowMap;
}

function parseSavedFilters(value: unknown): SavedFilter[] {
  if (!Array.isArray(value)) return [];
  return value.filter((filter): filter is SavedFilter => (
    Boolean(filter)
    && typeof filter === "object"
    && typeof (filter as { id?: unknown }).id === "string"
    && typeof (filter as { name?: unknown }).name === "string"
    && typeof (filter as { createdAt?: unknown }).createdAt === "string"
  )).slice(-12);
}

function parseNotificationHistory(value: unknown): FollowNotification[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is FollowNotification => (
    Boolean(item)
    && typeof item === "object"
    && typeof (item as { id?: unknown }).id === "string"
    && Boolean((item as { change?: unknown }).change)
    && Array.isArray((item as { targets?: unknown }).targets)
  )).slice(0, 300);
}

function parseStringArray(value: unknown, limit: number) {
  return Array.isArray(value) ? uniqueStrings(value.filter((item): item is string => typeof item === "string"), limit) : [];
}

function uniqueStrings(values: string[], limit: number) {
  return Array.from(new Set(values)).slice(-limit);
}

function emptyPreferences(): UserPreferencesState {
  return { follows: {}, savedFilters: [], notificationHistory: [], readNotificationIds: [], dismissedNotificationIds: [] };
}

function readPendingPreferences(userId: string): PendingPreferenceMap {
  try {
    const value = window.localStorage.getItem(`${pendingKey}.${userId}`);
    return value ? JSON.parse(value) as PendingPreferenceMap : {};
  } catch {
    return {};
  }
}

function writePendingPreference(userId: string, column: UserPreferenceColumn, pending: PendingPreference) {
  const values = readPendingPreferences(userId);
  values[column] = pending;
  window.localStorage.setItem(`${pendingKey}.${userId}`, JSON.stringify(values));
}

function clearPendingPreference(userId: string, column: UserPreferenceColumn, token: string) {
  const values = readPendingPreferences(userId);
  if (values[column]?.token !== token) return;
  delete values[column];
  window.localStorage.setItem(`${pendingKey}.${userId}`, JSON.stringify(values));
}

function readBoolean(key: string) {
  return window.localStorage.getItem(key) === "1";
}

function writeBoolean(key: string, value: boolean) {
  window.localStorage.setItem(key, value ? "1" : "0");
}

async function requireSupabase() {
  const client = await getSupabase();
  if (!client) throw new Error("账号服务尚未配置，个人设置已保存在当前设备。");
  return client;
}

function formatPreferenceCloudError(reason: unknown) {
  const code = typeof reason === "object" && reason && "code" in reason ? String(reason.code) : "";
  const message = reason instanceof Error
    ? reason.message
    : typeof reason === "object" && reason && "message" in reason
      ? String(reason.message)
      : String(reason);
  if (code === "PGRST205" || code === "42P01" || /user_preferences.*schema cache/i.test(message)) {
    return new Error("个人设置云端数据表尚未初始化，当前修改已保存在本机。", { cause: reason });
  }
  if (isAuthNetworkError(reason)) {
    return new Error("个人设置暂时无法同步，当前修改已保存在本机。", { cause: reason });
  }
  return new Error(`个人设置同步失败：${message}`, { cause: reason });
}

function makeToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
