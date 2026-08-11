import type { ProgramItem } from "../../src/types";
import type { OcrProgramSection } from "./local-tesseract";

export type OcrPageResult = {
  url: string;
  text: string;
  confidence: number;
  imageHash: string;
  cacheHit: boolean;
  provider?: string;
  programSections?: OcrProgramSection[];
};

export type OcrProgramExtraction = {
  accepted: boolean;
  provider: string;
  confidence: number;
  imageCount: number;
  cacheHits: number;
  rawText: string;
  program: ProgramItem[];
  programSections: OcrProgramSection[];
  reasons: string[];
  pages: OcrPageResult[];
};

export function evaluateOcrProgram(
  pages: OcrPageResult[],
  parseProgram: (text: string) => ProgramItem[],
  options: { minConfidence?: number; minProgramItems?: number; targetDates?: Date[] } = {},
): OcrProgramExtraction {
  const minConfidence = options.minConfidence ?? 55;
  const minProgramItems = options.minProgramItems ?? 2;
  const rawText = pages.map((page) => page.text.trim()).filter(Boolean).join("\n");
  const programSections = collectProgramSections(pages, options.targetDates);
  const structuredProgram = dedupeProgram(programSections.flatMap((section) => section.program));
  const parsedProgram = parseProgram(normalizeOcrText(rawText)).filter(isPlausibleProgramItem);
  const program = structuredProgram.length ? structuredProgram : parsedProgram;
  const weightedTextLength = pages.reduce((sum, page) => sum + page.text.trim().length, 0);
  const confidence = weightedTextLength
    ? Math.round(
        pages.reduce(
          (sum, page) => sum + page.confidence * page.text.trim().length,
          0,
        ) / weightedTextLength,
      )
    : 0;
  const reasons: string[] = [];

  if (!programSections.length && !/(?:曲\s*目|节目\s*单|program(?:me)?s?)/i.test(rawText)) {
    reasons.push("未识别到节目单标题");
  }
  if (confidence < minConfidence) {
    reasons.push(`OCR 平均置信度 ${confidence} 低于阈值 ${minConfidence}`);
  }
  if (program.length < minProgramItems) {
    reasons.push(`仅解析出 ${program.length} 个可信节目项，低于阈值 ${minProgramItems}`);
  }
  const oversizedSection = programSections.find((section) => section.program.length > 45);
  if (oversizedSection) {
    reasons.push(`单个日期解析出 ${oversizedSection.program.length} 个节目项，疑似把图片换行误拆为曲目`);
  } else if (!programSections.length && program.length > 45) {
    reasons.push(`解析出 ${program.length} 个节目项，疑似把图片换行误拆为曲目`);
  }
  const suspiciousItems = program.filter(isLikelyProgramDescription);
  if (suspiciousItems.length >= 3 && suspiciousItems.length / Math.max(program.length, 1) >= 0.2) {
    reasons.push(`有 ${suspiciousItems.length} 个节目项疑似说明文字，超过安全阈值`);
  }

  return {
    accepted: reasons.length === 0,
    provider: Array.from(new Set(pages.map((page) => page.provider || "tesseract"))).join("+") || "tesseract",
    confidence,
    imageCount: pages.length,
    cacheHits: pages.filter((page) => page.cacheHit).length,
    rawText,
    program,
    programSections,
    reasons,
    pages,
  };
}

export function selectOcrProgramForDate(extraction: OcrProgramExtraction, date: Date) {
  if (!extraction.programSections.length) return extraction.program;
  const target = chinaMonthDay(date);
  const datedMatches = extraction.programSections.filter(
    (section) => section.date && ocrSectionMonthDay(section.date) === target,
  );
  if (datedMatches.length) return dedupeProgram(datedMatches.flatMap((section) => section.program));
  const undated = extraction.programSections.filter((section) => !section.date);
  if (extraction.programSections.length === 1 && undated.length === 1) return undated[0].program;
  return [];
}

export function ocrSectionMonthDay(value: string) {
  const normalized = value.normalize("NFKC").trim();
  const match = normalized.match(/(?:20\d{2}\s*[年./-]\s*)?(\d{1,2})\s*(?:月|[./-])\s*(\d{1,2})(?:\s*日)?/);
  if (!match) return undefined;
  return `${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

export function normalizeOcrText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/曲\s{1,3}目/g, "曲目")
    .replace(/节\s{1,3}目\s{0,3}单/g, "节目单")
    .replace(/[|｜]\s*(?:Programme|Program)\b/gi, " Programme")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*[;；]\s*/g, "; ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isPlausibleProgramItem(item: ProgramItem) {
  const title = item.title.trim();
  if (title.length < 2 || title.length > 180) return false;
  if (
    /^(?:曲目|节目单|programme?s?|艺术家简介|演出阵容|温馨提示|购票须知)$|音乐会(?:[IVⅠⅡⅢⅣⅤ]+)?$/i.test(
      title,
    )
  ) {
    return false;
  }
  if (
    item.composer &&
    /^(?:指挥|演奏|演唱|领唱|独奏|合唱|钢琴|小提琴|中提琴|大提琴)$/.test(
      item.composer,
    )
  ) {
    return false;
  }
  return /[\p{L}\p{N}]/u.test(title);
}

function isLikelyProgramDescription(item: ProgramItem) {
  const title = item.title.trim();
  if (/^(?:介绍|20\d{2}年|选自|滑动|全称|作曲家|出版|编制)(?:$|[：:])/i.test(title)) return true;
  if (/[。！？]$/.test(title)) return true;
  if (title.length < 12) return false;
  return /(?:据说|当时|作者|作于|首演|改编|获得|传遍|代表作|深受|总是|经常作为|每年|听众|人们|本身就是|伴奏音乐|音乐表演|节奏自由|旋律生动|演绎形式|展示着|历史悠久)/.test(title);
}

function collectProgramSections(pages: OcrPageResult[], targetDates: Date[] = []) {
  const sections: OcrProgramSection[] = [];
  let previousDatedSection: OcrProgramSection | undefined;
  const targetDateKeys = targetDates.map(chinaMonthDay);

  for (const page of pages) {
    const rawPageSections = page.programSections ?? [];
    const isScheduleOverview = rawPageSections.length >= 4 && rawPageSections.every(
      (section) => section.program.length <= 1,
    );
    if (isScheduleOverview) continue;
    const pageSections = rawPageSections.map((section) => ({
      ...section,
      program: dedupeProgram(section.program.filter(isPlausibleProgramItem)),
    })).filter((section) => section.program.length);
    const inferredDate = pageSections.length === 1 ? extractPrintedMonthDay(page.text) : undefined;
    const nextDatedKeys = pageSections.map((section, index) => ({
      index,
      key: section.date ? ocrSectionMonthDay(section.date) : undefined,
    })).filter((entry): entry is { index: number; key: string } => Boolean(entry.key));

    for (const [index, rawSection] of pageSections.entries()) {
      let date = rawSection.date?.trim() || inferredDate;
      if (!date && pageSections.length > 1 && targetDateKeys.length) {
        const nextDated = nextDatedKeys.find((entry) => entry.index > index)?.key;
        const previousKey = previousDatedSection?.date
          ? ocrSectionMonthDay(previousDatedSection.date)
          : undefined;
        const between = targetDateKeys.filter((key) => (
          (!previousKey || key > previousKey) && (!nextDated || key < nextDated)
        ));
        if (between.length === 1) date = between[0];
      }
      if (date) {
        const dateKey = ocrSectionMonthDay(date);
        const existing = dateKey
          ? sections.find((section) => section.date && ocrSectionMonthDay(section.date) === dateKey)
          : undefined;
        if (existing) {
          existing.program = dedupeProgram([...existing.program, ...rawSection.program]);
          existing.time ||= rawSection.time;
          previousDatedSection = existing;
        } else {
          const section = { ...rawSection, date };
          sections.push(section);
          previousDatedSection = section;
        }
      } else if (pageSections.length === 1 && previousDatedSection) {
        previousDatedSection.program = dedupeProgram([...previousDatedSection.program, ...rawSection.program]);
      } else {
        sections.push(rawSection);
      }
    }
  }

  return sections;
}

function extractPrintedMonthDay(text: string) {
  const match = text.normalize("NFKC").match(/(?:^|\n)\s*(\d{1,2}\s*[./-]\s*\d{1,2})(?=\s|\||$)/m);
  return match?.[1].replace(/\s+/g, "");
}

function chinaMonthDay(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return `${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

function dedupeProgram(program: ProgramItem[]) {
  const seen = new Set<string>();
  return program.filter((item) => {
    const key = `${item.composer ?? ""}\u0000${item.title}\u0000${item.opus ?? ""}`.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
