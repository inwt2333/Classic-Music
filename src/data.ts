import type {
  ChangeDataset,
  ConcertEvent,
  ConcertIndexDataset,
  EntityDataset,
} from "./types";
import type {
  KnowledgeIndex,
  PublishedKnowledgeComposer,
  PublishedKnowledgeWork,
} from "./knowledge/types";

const detailCache = new Map<string, ConcertEvent>();
const knowledgeWorkCache = new Map<string, PublishedKnowledgeWork>();
const knowledgeComposerCache = new Map<string, PublishedKnowledgeComposer>();
const jsonRequests = new Map<string, Promise<unknown>>();

function dataUrl(path: string) {
  return `${import.meta.env.BASE_URL}data/${path}`.replace(/([^:]\/)\/+/g, "$1");
}

function fetchJson<T>(path: string): Promise<T> {
  const existing = jsonRequests.get(path);
  if (existing) return existing as Promise<T>;

  const request = fetch(dataUrl(path))
    .then((response) => {
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      return response.json() as Promise<T>;
    })
    .catch((error) => {
      jsonRequests.delete(path);
      throw error;
    });
  jsonRequests.set(path, request);
  return request;
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

export function loadKnowledgeIndex() {
  return fetchJson<KnowledgeIndex>("knowledge/index.json");
}

export async function loadKnowledgeWork(id: string) {
  const cached = knowledgeWorkCache.get(id);
  if (cached) return cached;

  const work = await fetchJson<PublishedKnowledgeWork>(`knowledge/works/${id}.json`);
  knowledgeWorkCache.set(id, work);
  return work;
}

export async function loadKnowledgeComposer(id: string) {
  const cached = knowledgeComposerCache.get(id);
  if (cached) return cached;

  const composer = await fetchJson<PublishedKnowledgeComposer>(`knowledge/composers/${id}.json`);
  knowledgeComposerCache.set(id, composer);
  return composer;
}
