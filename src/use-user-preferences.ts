import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import {
  compactFollowNotificationHistory,
  writeDismissedNotificationIds,
  writeFollows,
  writeFollowNotificationHistory,
  writeReadNotificationIds,
  writeSavedFilters,
  type FollowMap,
  type FollowNotification,
  type SavedFilter,
} from "./discovery-features";
import {
  persistUserPreference,
  readLocalPreferences,
  synchronizeUserPreferences,
} from "./user-preferences-cloud";

export function useUserPreferences(userId?: string) {
  const local = readLocalPreferences(userId);
  const [follows, setFollowsState] = useState(local.follows);
  const [savedFilters, setSavedFiltersState] = useState(local.savedFilters);
  const [notificationHistory, setNotificationHistoryState] = useState(local.notificationHistory);
  const [readNotificationIds, setReadNotificationIdsState] = useState(local.readNotificationIds);
  const [dismissedNotificationIds, setDismissedNotificationIdsState] = useState(local.dismissedNotificationIds);
  const [syncError, setSyncError] = useState("");
  const revisionRef = useRef(0);
  const followsRef = useRef(follows);
  const savedFiltersRef = useRef(savedFilters);
  const notificationHistoryRef = useRef(notificationHistory);
  const readIdsRef = useRef(readNotificationIds);
  const dismissedIdsRef = useRef(dismissedNotificationIds);

  useEffect(() => {
    const current = readLocalPreferences(userId);
    replaceFollows(current.follows);
    replaceSavedFilters(current.savedFilters);
    replaceNotificationHistory(current.notificationHistory);
    replaceReadIds(current.readNotificationIds);
    replaceDismissedIds(current.dismissedNotificationIds);
    setSyncError("");
    if (!userId) return undefined;
    let cancelled = false;
    const synchronize = () => {
      const revision = revisionRef.current;
      setSyncError("");
      void synchronizeUserPreferences(userId)
        .then((state) => {
          if (cancelled || revision !== revisionRef.current) return;
          replaceFollows(state.follows);
          replaceSavedFilters(state.savedFilters);
          replaceNotificationHistory(state.notificationHistory);
          replaceReadIds(state.readNotificationIds);
          replaceDismissedIds(state.dismissedNotificationIds);
        })
        .catch((reason) => {
          if (!cancelled) setSyncError(reason instanceof Error ? reason.message : String(reason));
        });
    };
    synchronize();
    window.addEventListener("online", synchronize);
    return () => {
      cancelled = true;
      window.removeEventListener("online", synchronize);
    };
  }, [userId]);

  const updateFollows = useCallback((update: SetStateAction<FollowMap>) => {
    if (!userId) return;
    revisionRef.current += 1;
    const next = resolveUpdate(update, followsRef.current);
    replaceFollows(next);
    writeFollows(next, userId);
    persist(userId, "follows", next, setSyncError);
  }, [userId]);

  const updateSavedFilters = useCallback((update: SetStateAction<SavedFilter[]>) => {
    if (!userId) return;
    revisionRef.current += 1;
    const next = resolveUpdate(update, savedFiltersRef.current).slice(-12);
    replaceSavedFilters(next);
    writeSavedFilters(next, userId);
    persist(userId, "saved_filters", next, setSyncError);
  }, [userId]);

  const updateNotificationHistory = useCallback((update: SetStateAction<FollowNotification[]>) => {
    if (!userId) return;
    revisionRef.current += 1;
    const next = resolveUpdate(update, notificationHistoryRef.current).slice(0, 300);
    const compact = compactFollowNotificationHistory(next);
    replaceNotificationHistory(next);
    writeFollowNotificationHistory(compact, userId);
    persist(userId, "notification_history", compact, setSyncError);
  }, [userId]);

  const updateReadNotificationIds = useCallback((update: SetStateAction<string[]>) => {
    if (!userId) return;
    revisionRef.current += 1;
    const next = uniqueStrings(resolveUpdate(update, readIdsRef.current), 1000);
    replaceReadIds(next);
    writeReadNotificationIds(next, userId);
    persist(userId, "read_notification_ids", next, setSyncError);
  }, [userId]);

  const updateDismissedNotificationIds = useCallback((update: SetStateAction<string[]>) => {
    if (!userId) return;
    revisionRef.current += 1;
    const next = uniqueStrings(resolveUpdate(update, dismissedIdsRef.current), 1000);
    replaceDismissedIds(next);
    writeDismissedNotificationIds(next, userId);
    persist(userId, "dismissed_notification_ids", next, setSyncError);
  }, [userId]);

  function replaceFollows(next: FollowMap) {
    followsRef.current = next;
    setFollowsState(next);
  }

  function replaceSavedFilters(next: SavedFilter[]) {
    savedFiltersRef.current = next;
    setSavedFiltersState(next);
  }

  function replaceNotificationHistory(next: FollowNotification[]) {
    notificationHistoryRef.current = next;
    setNotificationHistoryState(next);
  }

  function replaceReadIds(next: string[]) {
    readIdsRef.current = next;
    setReadNotificationIdsState(next);
  }

  function replaceDismissedIds(next: string[]) {
    dismissedIdsRef.current = next;
    setDismissedNotificationIdsState(next);
  }

  return {
    follows,
    savedFilters,
    notificationHistory,
    readNotificationIds,
    dismissedNotificationIds,
    syncError,
    updateFollows,
    updateSavedFilters,
    updateNotificationHistory,
    updateReadNotificationIds,
    updateDismissedNotificationIds,
  };
}

function resolveUpdate<T>(update: SetStateAction<T>, current: T) {
  return typeof update === "function" ? (update as (value: T) => T)(current) : update;
}

function uniqueStrings(values: string[], limit: number) {
  return Array.from(new Set(values)).slice(-limit);
}

function persist(
  userId: string,
  column: Parameters<typeof persistUserPreference>[1],
  value: unknown,
  setError: (value: string) => void,
) {
  setError("");
  void persistUserPreference(userId, column, value)
    .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));
}
