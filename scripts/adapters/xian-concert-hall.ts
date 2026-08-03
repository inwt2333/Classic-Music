import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

export function isXianConcertHallClassical(item: Record<string, unknown>) {
  if (String(item.category ?? "") !== "音乐会") return false;
  const title = String(item.fullCnName ?? item.cnName ?? "");
  if (/爵士|流行|摇滚|动漫|影视|亲子|合唱专场/.test(title)) return false;
  return /大师|古典|交响|室内乐|独奏|协奏|奏鸣|钢琴|小提琴|中提琴|大提琴|XSO|音乐季/.test(title);
}

export function parseXianConcertHallDetail(html: string) {
  const $ = cheerio.load(html || "");
  const text = cleanText($("body").text());
  const program = parseXianConcertHallProgramText(text, "official");
  const imageUrls = $("img[src]").map((_, element) => $(element).attr("src") || "").get().filter(Boolean);
  const description = program.length ? text : undefined;
  return { program, imageUrls, description };
}

export function parseXianConcertHallProgramText(text: string, confidence: ProgramItem["confidence"] = "ocr") {
  const lines = text.split(/\n|\r| {2,}/).map(cleanText).filter(Boolean);
  const marker = lines.findIndex((line) => /^(?:演出)?曲目|节目单/.test(line));
  if (marker < 0) return [];
  const program: ProgramItem[] = [];
  for (const raw of lines.slice(marker + 1)) {
    if (/艺术家|演出介绍|购票|曲目.*为准/.test(raw)) break;
    const line = raw.replace(/^\d+[.、]\s*/, "");
    const match = line.match(/^([^：:—－]{2,32})[：:—－]\s*(.+)$/);
    if (match && match[2].length <= 160) program.push({ composer: match[1], title: match[2].replace(/[《》]/g, ""), confidence });
  }
  return program;
}

function cleanText(value: string) { return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
