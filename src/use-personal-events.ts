import { useCallback, useEffect, useRef, useState } from "react";
import {
  deletePersonalEvent,
  synchronizePersonalEvents,
  upsertPersonalEvent,
} from "./personal-events-cloud";
import {
  createPersonalEventSnapshot,
  readPersonalEventSnapshots,
  readPersonalEvents,
  setPersonalEventStatus,
  writePersonalEventSnapshots,
  type PersonalEventMap,
  type PersonalEventSnapshotMap,
  type PersonalEventStatus,
} from "./product-features";
import type { ConcertEvent, ConcertEventSummary } from "./types";

export function usePersonalEvents(userId?: string) {
  const [events, setEvents] = useState<PersonalEventMap>(() => readPersonalEvents(userId));
  const [snapshots, setSnapshots] = useState<PersonalEventSnapshotMap>(() => readPersonalEventSnapshots(userId));
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const eventsRef = useRef(events);
  const revisionRef = useRef(0);

  const replaceEvents = useCallback((next: PersonalEventMap) => {
    eventsRef.current = next;
    setEvents(next);
  }, []);

  useEffect(() => {
    const localEvents = readPersonalEvents(userId);
    const localSnapshots = readPersonalEventSnapshots(userId);
    replaceEvents(localEvents);
    setSnapshots(localSnapshots);
    setSyncError("");
    if (!userId) {
      setSyncing(false);
      return undefined;
    }

    let cancelled = false;
    const synchronize = () => {
      const revision = revisionRef.current;
      setSyncError("");
      setSyncing(true);
      void synchronizePersonalEvents(userId)
        .then((state) => {
          if (cancelled || revision !== revisionRef.current) return;
          replaceEvents(state.events);
          setSnapshots(state.snapshots);
        })
        .catch((reason) => {
          if (!cancelled) setSyncError(reason instanceof Error ? reason.message : String(reason));
        })
        .finally(() => {
          if (!cancelled) setSyncing(false);
        });
    };
    synchronize();
    window.addEventListener("online", synchronize);
    return () => {
      cancelled = true;
      window.removeEventListener("online", synchronize);
    };
  }, [replaceEvents, userId]);

  const updateStatus = useCallback((event: ConcertEvent | ConcertEventSummary, status: PersonalEventStatus | null) => {
    if (!userId) return;
    revisionRef.current += 1;
    const nextEvents = setPersonalEventStatus(eventsRef.current, event.id, status, userId, event);
    const nextSnapshots = readPersonalEventSnapshots(userId);
    replaceEvents(nextEvents);
    setSnapshots(nextSnapshots);
    setSyncError("");
    const request = status
      ? upsertPersonalEvent(userId, event.id, status, nextSnapshots[event.id])
      : deletePersonalEvent(userId, event.id);
    void request.catch((reason) => setSyncError(reason instanceof Error ? reason.message : String(reason)));
  }, [replaceEvents, userId]);

  const removeStatus = useCallback((eventId: string) => {
    if (!userId) return;
    revisionRef.current += 1;
    const nextEvents = setPersonalEventStatus(eventsRef.current, eventId, null, userId);
    replaceEvents(nextEvents);
    setSnapshots(readPersonalEventSnapshots(userId));
    setSyncError("");
    void deletePersonalEvent(userId, eventId)
      .catch((reason) => setSyncError(reason instanceof Error ? reason.message : String(reason)));
  }, [replaceEvents, userId]);

  const saveSnapshot = useCallback((event: ConcertEvent | ConcertEventSummary) => {
    if (!userId) return;
    const status = eventsRef.current[event.id];
    if (!status) return;
    const snapshot = createPersonalEventSnapshot(event);
    const nextSnapshots = { ...readPersonalEventSnapshots(userId), [event.id]: snapshot };
    writePersonalEventSnapshots(nextSnapshots, userId);
    setSnapshots(nextSnapshots);
    void upsertPersonalEvent(userId, event.id, status, snapshot)
      .catch((reason) => setSyncError(reason instanceof Error ? reason.message : String(reason)));
  }, [userId]);

  return {
    events,
    snapshots,
    syncing,
    syncError,
    updateStatus,
    removeStatus,
    saveSnapshot,
  };
}
