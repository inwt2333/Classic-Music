import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as cheerio from "cheerio";
import { z } from "zod";
import type { ConcertEvent, ProgramItem } from "../../src/types";
import { requestSjtuJson, type SjtuAiConfig } from "./sjtu-client";

const PROMPT_VERSION = 3;
const evidenceByEvent = new WeakMap<ConcertEvent, string>();
const personnelLabels = new Set([
  "\u6307\u6325", "\u94a2\u7434", "\u5c0f\u63d0\u7434", "\u4e2d\u63d0\u7434", "\u5927\u63d0\u7434", "\u4f4e\u97f3\u63d0\u7434",
  "\u957f\u7b1b", "\u77ed\u7b1b", "\u53cc\u7c27\u7ba1", "\u5355\u7c27\u7ba1", "\u5927\u7ba1", "\u5706\u53f7", "\u5c0f\u53f7", "\u957f\u53f7", "\u5927\u53f7", "\u7ad6\u7434",
  "\u4e8c\u80e1", "\u53e4\u7b5d", "\u7435\u7436", "\u7b1b\u5b50", "\u7b19", "\u626c\u7434", "\u6253\u51fb\u4e50", "\u6f14\u5531", "\u6f14\u594f", "\u72ec\u594f", "\u9886\u594f", "\u5408\u5531",
]);
const creditMarkerPattern = /(?:^|\s)(?:\u8bcd\u66f2|\u6269\u8bcd|\u8bcd|\u8bd7|\u66f2|\u7f16\u66f2|\u7f16\u5408\u5531|\u7f16\u914d)(?:\s|$)/;

const optionalText = z.preprocess(
  (value) => typeof value === "string" && value.trim() ? value.trim() : undefined,
  z.string().max(180).optional(),
);
const reviewIssue = z.preprocess(
  (value) => typeof value === "string" ? value.trim().slice(0, 400) : value,
  z.string().min(1).max(400),
);
const reviewIssues = z.preprocess(
  (value) => Array.isArray(value) ? value.slice(0, 12) : value,
  z.array(reviewIssue).max(12).default([]),
);
const alternateTitlesSchema = z.array(z.string().min(2).max(1_000))
  .max(8)
  .transform((values) => values.filter((value) => value.trim().length <= 180).slice(0, 4));

const programItemSchema = z.object({
  composer: optionalText,
  title: z.string().min(1).max(180),
  alternateTitles: alternateTitlesSchema.default([]),
  opus: optionalText,
  movements: z.array(z.object({
    number: optionalText,
    title: z.string().min(1).max(180),
    alternateTitles: alternateTitlesSchema.default([]),
  }).strict()).max(30).default([]),
  evidenceLineIds: z.array(z.number().int().positive()).min(1).max(40),
}).strict();

const programReviewSchema = z.object({
  decision: z.enum(["keep", "replace", "abstain"]),
  confidence: z.number().min(0).max(1),
  issues: reviewIssues,
  program: z.array(programItemSchema).max(40).default([]),
}).strict();

export function registerProgramEvidence(event: ConcertEvent, raw: unknown) {
  const text = extractReadableEvidence(raw);
  if (text) evidenceByEvent.set(event, text);
  return event;
}

export function getProgramEvidence(event: ConcertEvent) {
  return evidenceByEvent.get(event);
}

export function isProgramReviewCandidate(event: ConcertEvent, evidence = getProgramEvidence(event)) {
  return programReviewPriority(event, evidence) > 0;
}

export function programReviewPriority(event: ConcertEvent, evidence = getProgramEvidence(event)) {
  if (!evidence || evidence.length < 20) return 0;
  const normalized = normalizeEvidence(evidence);
  const isNcpa = isNcpaProgramSource(event);
  const hasProgramHeading = /(?:曲目|节目单|programme?|programlist)/i.test(normalized);
  if (!event.program.length) return hasProgramHeading || isNcpa ? 100 : 0;
  if (hasAmbiguousPartialBilingualPair(event, evidence)) return 120;
  if (hasPersonnelAsProgram(event)) return 118;
  if (hasCreditTextInProgram(event)) return 116;
  if (event.program.some((item) => isSuspiciousProgramTitle(item.title))) return 110;
  const fingerprints = event.program.map((item) => normalizeEvidence(`${item.composer ?? ""}${item.title}`));
  if (new Set(fingerprints).size !== fingerprints.length) return 105;
  if (event.program.length === 1 && hasProgramHeading && countWorkLikeLines(evidence) >= 2) return 95;
  if (isNcpa) return 70;
  return event.dataQuality === "needs-review" ? 50 : 0;
}

export function selectProgramReviewCandidates(events: ConcertEvent[], limit: number) {
  const ranked = events
    .map((event) => ({ event, priority: programReviewPriority(event) }))
    .filter(({ priority }) => priority > 0)
    .sort((left, right) => right.priority - left.priority);
  const ncpa = ranked.filter(({ event }) => isNcpaProgramSource(event));
  const others = ranked.filter(({ event }) => !isNcpaProgramSource(event));
  const otherSlots = Math.max(0, limit - ncpa.length);
  return [...ncpa, ...others.slice(0, otherSlots)]
    .sort((left, right) => right.priority - left.priority);
}

export async function verifyProgramWithAi(input: {
  event: ConcertEvent;
  config: SjtuAiConfig;
  cacheDirectory: string;
  fetchImpl?: typeof fetch;
}) {
  const evidence = getProgramEvidence(input.event);
  if (!isProgramReviewCandidate(input.event, evidence)) return { changed: false, reason: "not-needed" as const };
  const lines = evidenceLines(evidence!);
  if (!lines.length) return { changed: false, reason: "no-evidence" as const };
  const cacheKey = createHash("sha256").update(JSON.stringify({
    version: PROMPT_VERSION,
    model: input.config.programModel,
    eventId: input.event.id,
    lines,
    program: input.event.program,
  })).digest("hex");
  const cachePath = resolve(input.cacheDirectory, `${cacheKey}.json`);

  let rawReview: unknown;
  try {
    rawReview = JSON.parse(await readFile(cachePath, "utf8"));
  } catch {
    const prompt = buildProgramReviewPrompt(input.event, lines);
    rawReview = programReviewSchema.parse(await requestSjtuJson({
      config: input.config,
      model: input.config.programModel,
      messages: [
        { role: "system", content: "You verify classical-concert programs. Return one JSON object only. Never add facts absent from the numbered source lines." },
        { role: "user", content: prompt },
      ],
      maxTokens: 5_000,
      fetchImpl: input.fetchImpl,
      parse: (value) => value,
    }));
    await mkdir(input.cacheDirectory, { recursive: true });
    await writeFile(cachePath, JSON.stringify(rawReview, null, 2), "utf8");
  }

  const review = programReviewSchema.parse(rawReview);
  if (review.decision !== "replace" || review.confidence < 0.78 || !review.program.length) {
    return { changed: false, reason: review.decision as "keep" | "abstain", issues: review.issues };
  }
  const validated = validateReplacement(review.program, lines, input.event.program);
  if (!validated.length) return { changed: false, reason: "invalid-evidence" as const, issues: review.issues };

  input.event.program = validated;
  input.event.composers = uniqueStrings([
    ...input.event.composers,
    ...validated.map((item) => item.composer),
  ]);
  input.event.dataQuality = "ai-enhanced";
  return { changed: true, reason: "replaced" as const, issues: review.issues };
}

export function extractReadableEvidence(raw: unknown) {
  const value = typeof raw === "string" ? raw : collectStringValues(raw).join("\n");
  if (!value.trim()) return "";
  if (!/[<>]/.test(value)) return cleanEvidenceText(value);
  const $ = cheerio.load(value);
  $("script,style,noscript,svg").remove();
  $("br").replaceWith("\n");
  $("p,div,li,tr,h1,h2,h3,h4,h5").each((_, element) => {
    $(element).append("\n");
  });
  return cleanEvidenceText($.root().text());
}

function collectStringValues(value: unknown, result: string[] = [], depth = 0): string[] {
  if (depth > 8 || value === null || value === undefined) return result;
  if (typeof value === "string") {
    if (value.trim()) result.push(value);
    return result;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, result, depth + 1);
    return result;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectStringValues(item, result, depth + 1);
  }
  return result;
}

function cleanEvidenceText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 30_000);
}

function evidenceLines(evidence: string) {
  const all = cleanEvidenceText(evidence).split("\n").filter((line) => line.length >= 2 && line.length <= 500);
  const heading = all.findIndex((line) => /^(?:曲目|节目单|演出曲目|programme?|program)$/i.test(line.replace(/[：:]/g, "").trim()));
  const selected = heading >= 0 ? all.slice(Math.max(0, heading - 1), heading + 100) : all.slice(0, 140);
  return selected.map((text, index) => ({ id: index + 1, text }));
}

function buildProgramReviewPrompt(event: ConcertEvent, lines: Array<{ id: number; text: string }>) {
  return `TASK\nCheck the deterministic parser result against SOURCE_LINES. Fix only program structure, including composer/work pairing, bilingual titles, suite movements, and removal of people, section headings or notes incorrectly treated as works.\n\nRULES\n- Use only SOURCE_LINES.\n- Keep Chinese and foreign-language titles together as alternateTitles only when they are semantically the same work.\n- An unlabelled Latin-script line after a Chinese title is not automatically its translation. If they name different songs or works, output two independent program items.\n- This semantic check applies to classical works, pop songs, film music and crossover programs alike.\n- Keep movements under their parent work.\n- Do not infer missing works from general musical knowledge, but extract every identifiable work actually present even when the published list may be incomplete.\n- Section headings such as 上半场, 下半场 and 中场休息 in currentProgram are parser errors. When source lines contain identifiable works, replace those headings with the cited works rather than abstaining.\n- Every output work must cite source line IDs that contain its title.\n- Use decision=keep when no material correction is needed; abstain only when no work can be supported by source lines.\n\nOUTPUT_SCHEMA\n{"decision":"keep|replace|abstain","confidence":0.0,"issues":[],"program":[{"composer":"","title":"","alternateTitles":[],"opus":"","movements":[{"number":"","title":"","alternateTitles":[]}],"evidenceLineIds":[1]}]}\n\nEVENT\n${JSON.stringify({ title: event.title, venue: event.venue, currentProgram: event.program })}\n\nSOURCE_LINES\n${lines.map((line) => `[${line.id}] ${line.text}`).join("\n")}`;
}

function validateReplacement(
  items: z.infer<typeof programItemSchema>[],
  lines: Array<{ id: number; text: string }>,
  current: ProgramItem[],
) {
  const lineMap = new Map(lines.map((line) => [line.id, normalizeEvidence(line.text)]));
  const currentFacts = normalizeEvidence(JSON.stringify(current));
  const result: ProgramItem[] = [];
  for (const item of items) {
    const cited = item.evidenceLineIds.map((id) => lineMap.get(id)).filter(Boolean).join("");
    const title = normalizeEvidence(item.title);
    if (!title.length || (!cited.includes(title) && !currentFacts.includes(title))) return [];
    if (item.composer) {
      const composer = normalizeEvidence(item.composer);
      if (composer.length >= 2 && !cited.includes(composer) && !currentFacts.includes(composer)) return [];
    }
    if (item.opus) {
      const opus = normalizeEvidence(item.opus);
      if (opus.length >= 2 && !cited.includes(opus) && !currentFacts.includes(opus)) return [];
    }
    for (const alternateTitle of item.alternateTitles) {
      const alternate = normalizeEvidence(alternateTitle);
      if (alternate.length >= 2 && !cited.includes(alternate) && !currentFacts.includes(alternate)) return [];
    }
    for (const movement of item.movements) {
      const movementTitle = normalizeEvidence(movement.title);
      if (movementTitle.length >= 2 && !cited.includes(movementTitle) && !currentFacts.includes(movementTitle)) return [];
      for (const alternateTitle of movement.alternateTitles) {
        const alternate = normalizeEvidence(alternateTitle);
        if (alternate.length >= 2 && !cited.includes(alternate) && !currentFacts.includes(alternate)) return [];
      }
    }
    result.push({
      composer: item.composer,
      title: item.title.trim(),
      alternateTitles: item.alternateTitles.length ? uniqueStrings(item.alternateTitles) : undefined,
      opus: item.opus,
      movements: item.movements.length ? item.movements.map((movement) => ({
        number: movement.number,
        title: movement.title.trim(),
        alternateTitles: movement.alternateTitles.length ? uniqueStrings(movement.alternateTitles) : undefined,
      })) : undefined,
      confidence: "ai",
    });
  }
  return result;
}

function normalizeEvidence(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\p{P}\p{S}\s]/gu, "");
}

function isNcpaProgramSource(event: ConcertEvent) {
  return /wticket\.chncpa\.org\/product\.html/i.test(event.sourceUrl);
}

function isSuspiciousProgramTitle(title: string) {
  return /^(?:上半场|下半场|中场休息|曲目|节目单|指挥|演奏|演唱|作曲|艺术家介绍|注[:：]?)/i.test(title.trim());
}

function countWorkLikeLines(evidence: string) {
  return evidence.split("\n").filter((line) => /[:：《》]|(?:交响曲|协奏曲|奏鸣曲|组曲|序曲|幻想曲|变奏曲|随想曲)/.test(line)).length;
}

function hasPersonnelAsProgram(event: ConcertEvent) {
  return event.program.some((item) => {
    if (personnelLabels.has(normalizeEvidence(item.composer ?? ""))) return true;
    const roleLine = item.title.match(/^([^\uff1a:]{1,12})[\uff1a:]\s*\S/);
    return Boolean(roleLine && personnelLabels.has(normalizeEvidence(roleLine[1])));
  });
}

function hasCreditTextInProgram(event: ConcertEvent) {
  return event.program.some((item) => (
    creditMarkerPattern.test(item.title)
    || item.movements?.some((movement) => creditMarkerPattern.test(movement.title))
  ));
}

function hasAmbiguousPartialBilingualPair(event: ConcertEvent, evidence: string) {
  const paired = event.program.filter((item) => (
    !item.composer &&
    /[\u3400-\u9fff]/.test(item.title) &&
    item.alternateTitles?.some((title) => /[A-Za-z]/.test(title) && !/[\u3400-\u9fff]/.test(title))
  ));
  if (!paired.length || paired.length === event.program.length) return false;
  const standaloneLines = new Set(
    cleanEvidenceText(evidence).split("\n").map(normalizeEvidence).filter(Boolean),
  );
  return paired.some((item) => (
    standaloneLines.has(normalizeEvidence(item.title)) &&
    item.alternateTitles?.some((title) => standaloneLines.has(normalizeEvidence(title)))
  ));
}

function uniqueStrings(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim())));
}
