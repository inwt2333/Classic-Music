import type { ProgramItem } from "../../src/types";

export type OcrPageResult = {
  url: string;
  text: string;
  confidence: number;
  imageHash: string;
  cacheHit: boolean;
};

export type OcrProgramExtraction = {
  accepted: boolean;
  provider: "tesseract";
  confidence: number;
  imageCount: number;
  cacheHits: number;
  rawText: string;
  program: ProgramItem[];
  reasons: string[];
  pages: OcrPageResult[];
};

export function evaluateOcrProgram(
  pages: OcrPageResult[],
  parseProgram: (text: string) => ProgramItem[],
  options: { minConfidence?: number; minProgramItems?: number } = {},
): OcrProgramExtraction {
  const minConfidence = options.minConfidence ?? 55;
  const minProgramItems = options.minProgramItems ?? 2;
  const rawText = pages.map((page) => page.text.trim()).filter(Boolean).join("\n");
  const program = parseProgram(normalizeOcrText(rawText)).filter(isPlausibleProgramItem);
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

  if (!/(?:曲\s*目|节目\s*单|program(?:me)?s?)/i.test(rawText)) {
    reasons.push("未识别到节目单标题");
  }
  if (confidence < minConfidence) {
    reasons.push(`OCR 平均置信度 ${confidence} 低于阈值 ${minConfidence}`);
  }
  if (program.length < minProgramItems) {
    reasons.push(`仅解析出 ${program.length} 个可信节目项，低于阈值 ${minProgramItems}`);
  }

  return {
    accepted: reasons.length === 0,
    provider: "tesseract",
    confidence,
    imageCount: pages.length,
    cacheHits: pages.filter((page) => page.cacheHit).length,
    rawText,
    program,
    reasons,
    pages,
  };
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
    /^(?:曲目|节目单|programme?s?|艺术家简介|演出阵容|温馨提示|购票须知)$/i.test(
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
