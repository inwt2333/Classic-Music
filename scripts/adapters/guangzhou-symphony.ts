import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

export function discoverGuangzhouSymphonySeasonUrls(html: string, baseUrl: string) {
  const $ = cheerio.load(html || "");
  const candidates = $("a[href]")
    .map((_, element) => {
      const href = $(element).attr("href") || "";
      const match = href.match(/music-season-(20\d{2})-?\d{2}[^"'?#]*\/index\.html/i);
      if (!match) return undefined;
      try {
        return { year: Number(match[1]), url: new URL(href, baseUrl).href };
      } catch {
        return undefined;
      }
    })
    .get()
    .filter((item): item is { year: number; url: string } => Boolean(item));
  const latestYear = Math.max(...candidates.map((item) => item.year));
  if (!Number.isFinite(latestYear)) return [];
  return Array.from(
    new Set(candidates.filter((item) => item.year === latestYear).map((item) => item.url)),
  );
}

export function discoverGuangzhouSymphonySupplementalUrls(html: string, baseUrl: string) {
  const $ = cheerio.load(html || "");
  return Array.from(new Set(
    $('a[href*="neweventdetail.php?id="]')
      .map((_, element) => {
        const href = $(element).attr("href");
        if (!href) return undefined;
        try {
          return new URL(href, baseUrl).href;
        } catch {
          return undefined;
        }
      })
      .get()
      .filter((url): url is string => Boolean(url)),
  ));
}

export function parseGuangzhouSymphonyDetail(html: string) {
  const $ = cheerio.load(html || "");
  const title = (cleanText($("h1.post-title, .av-special-heading-tag").first().text()) || cleanText($("title").text()).split("|").at(-1) || "").replace(/^广州交响乐团\s*/, "").trim();
  const metaText = cleanText($(".av_promobox, .avia-promocontent").first().text());
  const tab = $("#tab-id-1-container .tab_inner_content, #tab-id-1-container").first();
  const lines = htmlLines(tab.html() || "");
  const program = parseProgram(lines);
  const dateTime = metaText.match(/时间[：:]?\s*((?:20\d{2}[年./-])?\d{1,2}[月./-]\d{1,2}[^地点票价]*)/)?.[1];
  const venue = metaText.match(/(?:地点|场地)[：:]?\s*([^票价]+)/)?.[1]?.trim();
  const priceSection = metaText.match(/票价[：:]?\s*(.+)$/)?.[1] ?? "";
  const priceTiers = unique(Array.from(priceSection.matchAll(/\d+/g)).map((match) => Number(match[0]))).sort((a, b) => a - b);
  return { title, dateTime, venue, priceTiers, program, description: undefined };
}

function parseProgram(lines: string[]) {
  const marker = lines.findIndex((line) => /^(?:演出)?曲目(?:单)?[：:]?$/.test(line));
  const scoped = marker >= 0 ? lines.slice(marker + 1) : lines;
  const program: ProgramItem[] = [];
  let composer: string | undefined;
  for (const line of scoped) {
    if (/曲目.*为准|演出阵容|艺术家介绍|简介/.test(line)) break;
    if (/中\s*场\s*休\s*息/.test(line)) { composer = undefined; continue; }
    if (/^(?:指挥|小提琴|钢琴|大提琴|演奏|主办|时间|地点)[：:]/.test(line) || /音乐季|艺术季|第\d+场/.test(line)) continue;
    const next = scoped[scoped.indexOf(line) + 1] ?? "";
    if (line.length <= 32 && /协奏曲|交响曲|序曲|组曲|奏鸣曲|变奏曲|狂想曲|小品/.test(next)) {
      composer = line.replace(/[：:]$/, "");
      continue;
    }
    const movement = line.match(/^([IVX]+|\d+)[.、]\s*(.+)$/i);
    if (movement && program.length) {
      program.at(-1)!.movements ??= [];
      program.at(-1)!.movements!.push({ number: movement[1], title: movement[2] });
      continue;
    }
    if (composer && line.length <= 160) program.push({ composer, title: line.replace(/[《》]/g, ""), confidence: "official" });
  }
  return dedupe(program);
}

function dedupe(items: ProgramItem[]) { const s = new Set<string>(); return items.filter((x) => { const k = `${x.composer}:${x.title}`; if (s.has(k)) return false; s.add(k); return true; }); }
function unique<T>(values: T[]) { return Array.from(new Set(values)); }
function cleanText(value: string) { return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function htmlLines(html: string) {
  const withLineBreaks = html
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|li|h[1-6]|div)>/gi, (tag) => `${tag}\n`);
  const $ = cheerio.load(withLineBreaks);
  return $("body").text().split(/\n|\r/).map(cleanText).filter(Boolean);
}
