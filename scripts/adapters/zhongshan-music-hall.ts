import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

export function parseZhongshanMusicHallList(html: string, baseUrl: string) {
  const $ = cheerio.load(html || "");
  const seen = new Set<string>();
  return $("a[href]").map((_, element) => {
    const href = $(element).attr("href") || "";
    if (!/^\/?t\d+\.html/.test(href)) return undefined;
    const url = new URL(href, baseUrl).href;
    if (seen.has(url)) return undefined;
    seen.add(url);
    const title = cleanText($(element).attr("title") || $(element).text());
    return title ? { url, title } : undefined;
  }).get().filter((item): item is { url: string; title: string } => Boolean(item));
}

export function isZhongshanMusicHallClassical(title: string) {
  if (/爵士|流行|摇滚|动漫|影视|亲子|音乐剧|相声|戏曲/.test(title)) return false;
  return /交响|古典|室内乐|独奏|协奏|奏鸣|钢琴|小提琴|大提琴|管风琴|弦乐|乐团|合唱|名曲|音乐季/.test(title);
}

export function parseZhongshanMusicHallDetail(html: string, pageUrl: string) {
  const $ = cheerio.load(html || "");
  const body = $("body");
  const text = body.text().replace(/\r/g, "\n");
  const title = cleanText($("title").text()).replace(/--票品详情.*$/, "").replace(/-+$/, "");
  const dateTime = text.match(/(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}[^\n]{0,20}\d{1,2}:\d{2})/)?.[1];
  const venueCandidate = text.match(/(?:场馆|演出地点)[：:]?\s*([^\n]+)/)?.[1]?.trim();
  const venue = venueCandidate && /中山.*音乐堂/.test(venueCandidate) ? venueCandidate : undefined;
  const priceLine = text.match(/(?:票价|演出票价)[：:]?\s*([^\n]+)/)?.[1] ?? "";
  const priceTiers = unique(Array.from(priceLine.matchAll(/\d+/g)).map((match) => Number(match[0]))).sort((a, b) => a - b);
  const program = parseZhongshanMusicHallProgramText(text, "official");
  const imageUrls = $(".pp_l img.pp_pic[src]").map((_, element) => $(element).attr("src") || "").get().filter(Boolean).map((url) => new URL(url, pageUrl).href);
  return { title, dateTime, venue, priceTiers, program, imageUrls };
}

export function parseZhongshanMusicHallProgramText(text: string, confidence: ProgramItem["confidence"] = "ocr") {
  const lines = text.split(/\n|\r/).map(cleanText).filter(Boolean);
  const marker = lines.findIndex((line) => /^(?:演出)?曲目|节目单/.test(line));
  if (marker < 0) return [];
  const program: ProgramItem[] = [];
  for (const raw of lines.slice(marker + 1)) {
    if (/演出阵容|艺术家|购票|温馨提示|曲目.*为准/.test(raw)) break;
    const line = raw.replace(/^\d+[.、]\s*/, "");
    const match = line.match(/^([^：:—－]{2,32})[：:—－]\s*(.+)$/);
    if (!match || match[2].length > 160) continue;
    program.push({ composer: match[1], title: match[2].replace(/[《》]/g, ""), confidence });
  }
  return program;
}

function unique<T>(values: T[]) { return Array.from(new Set(values)); }
function cleanText(value: string) { return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
