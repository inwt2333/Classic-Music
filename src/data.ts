import type {
  ChangeDataset,
  ConcertEvent,
  ConcertIndexDataset,
  EntityDataset,
} from "./types";

const detailCache = new Map<string, ConcertEvent>();

function dataUrl(path: string) {
  return `${import.meta.env.BASE_URL}data/${path}`.replace(/([^:]\/)\/+/g, "$1");
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(dataUrl(path));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export function loadEventIndex() {
  return fetchJson<ConcertIndexDataset>("events-index.json");
}

export async function loadEventDetail(id: string, detailPath: string) {
  const cached = detailCache.get(id);
  if (cached) return cached;

  const detail = await fetchJson<ConcertEvent>(detailPath.replace(/^data\//, ""));
  detailCache.set(id, detail);
  return detail;
}

export function loadEntities() {
  return fetchJson<EntityDataset>("entities.json");
}

export function loadChanges() {
  return fetchJson<ChangeDataset>("changes.json");
}
