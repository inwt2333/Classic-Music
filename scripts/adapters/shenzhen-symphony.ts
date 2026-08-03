import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

export function parseShenzhenSymphonyList(html: string, baseUrl: string) {
  const $ = cheerio.load(html || "");
  const items = $("a[href*='infodetail.action']")
    .map((_, element) => {
      const link = $(element);
      const container = link.closest("li, .item, .list, .box");
      const text = cleanText(container.text() || link.text());
      const href = link.attr("href");
      const date = text.match(/20\d{2}[-./年]\d{1,2}[-./月]\d{1,2}/)?.[0];
      const title = cleanText(link.attr("title") || link.text() || text.replace(date ?? "", ""));
      return href && date && title ? { url: new URL(href, baseUrl).href, date, title } : undefined;
    })
    .get()
    .filter((item): item is { url: string; date: string; title: string } => Boolean(item));
  const byUrl = new Map<string, { url: string; date: string; title: string }>();
  for (const item of items) {
    const current = byUrl.get(item.url);
    if (!current || item.title.length > current.title.length) byUrl.set(item.url, item);
  }
  return Array.from(byUrl.values());
}

export function parseShenzhenSymphonyDetail(html: string, pageUrl: string) {
  const $ = cheerio.load(html || "");
  const content = $(".content, .article, .detail, .newsContent").first();
  const text = cleanText(content.text());
  const program = parseShenzhenSymphonyProgramText(text, "official");
  const imageUrls = content.find("img[src]").map((_, element) => $(element).attr("src") || "").get().filter(Boolean).map((url) => new URL(url, pageUrl).href);
  const time = text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)?.[0];
  return { program, imageUrls, time, description: program.length ? text : undefined };
}

export function parseShenzhenSymphonyProgramText(text: string, confidence: ProgramItem["confidence"] = "ocr") {
  const lines = text.split(/\n|\r| {2,}/).map(cleanText).filter(Boolean);
  const marker = lines.findIndex((line) => /^(?:演出)?曲目|节目单/.test(line));
  if (marker < 0) return [];
  const program: ProgramItem[] = [];
  for (const raw of lines.slice(marker + 1)) {
    if (/艺术家|购票|票价|主办|曲目.*为准/.test(raw)) break;
    const line = raw.replace(/^\d+[.、]\s*/, "");
    const match = line.match(/^([^：:—－]{2,32})[：:—－]\s*(.+)$/);
    if (!match || match[2].length > 160) continue;
    program.push({ composer: match[1], title: match[2].replace(/[《》]/g, ""), confidence });
  }
  return dedupe(program);
}

function dedupe(items: ProgramItem[]) { const s = new Set<string>(); return items.filter((x) => { const k = `${x.composer}:${x.title}`; if (s.has(k)) return false; s.add(k); return true; }); }
function cleanText(value: string) { return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
