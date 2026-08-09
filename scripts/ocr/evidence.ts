import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ConcertEvent, EventEvidenceImage } from "../../src/types";

type OcrEvidenceRecord = {
  projectId: string;
  extraction: {
    accepted: boolean;
    provider?: string;
    confidence?: number;
    reasons?: string[];
    pages?: Array<{
      url?: string;
      confidence?: number;
    }>;
  };
};

export async function loadOcrEvidence(directory: string) {
  const evidence = new Map<string, OcrEvidenceRecord>();
  let files: string[];
  try {
    files = await readdir(directory);
  } catch {
    return evidence;
  }

  for (const file of files.filter((name) => name.endsWith(".json"))) {
    try {
      const record = JSON.parse(await readFile(resolve(directory, file), "utf8")) as OcrEvidenceRecord;
      if (record.projectId && record.extraction) evidence.set(record.projectId, record);
    } catch {
      // Ignore incomplete inspection records; the next OCR run can regenerate them.
    }
  }
  return evidence;
}

export function attachOcrEvidence(
  events: ConcertEvent[],
  evidence: Map<string, OcrEvidenceRecord>,
) {
  return events.map((event) => {
    if (event.dataQuality === "scraped" || event.dataQuality === "manual-reviewed") return event;
    const record = eventEvidenceIds(event).map((id) => evidence.get(id)).find(Boolean);
    if (!record) return event;
    const images = uniqueImages(record.extraction.pages ?? []);
    if (!images.length) return event;

    return {
      ...event,
      extraction: {
        method: "ocr" as const,
        provider: record.extraction.provider ?? "tesseract",
        confidence: record.extraction.confidence,
        imageCount: images.length,
        accepted: record.extraction.accepted,
        reasons: record.extraction.reasons ?? [],
        reviewRequired: event.extraction?.reviewRequired ?? true,
        images,
      },
    };
  });
}

function eventEvidenceIds(event: ConcertEvent) {
  const ids = new Set<string>();
  if (event.projectId) ids.add(event.projectId);
  for (const source of event.sources ?? []) {
    ids.add(source.sourceRecordId);
    const shoacProject = source.sourceRecordId.match(/^shoac_(\d+)_/)?.[1];
    if (shoacProject) ids.add(shoacProject);
  }
  const directShoacProject = event.sourceUrl.match(/[?&]projectId=(\d+)/)?.[1];
  if (directShoacProject) ids.add(directShoacProject);
  return Array.from(ids);
}

function uniqueImages(pages: NonNullable<OcrEvidenceRecord["extraction"]["pages"]>) {
  const images = new Map<string, EventEvidenceImage>();
  for (const page of pages) {
    if (!page.url || !/^https?:\/\//i.test(page.url)) continue;
    images.set(page.url, { url: page.url, confidence: page.confidence });
  }
  return Array.from(images.values());
}
