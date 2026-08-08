import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

export function isShenzhenConcertHallClassical(title: string, program: ProgramItem[] = []) {
  if (/爵士|流行|摇滚|动漫|影视|音乐剧/.test(title)) return false;
  return program.length >= 2 || /交响|古典|室内乐|独奏|协奏|奏鸣|钢琴|小提琴|大提琴|管风琴|弦乐|乐团|音乐季/.test(title);
}

export function parseShenzhenConcertHallDetail(html: string, pageUrl = "https://szyyt.com/") {
  const $ = cheerio.load(html || "");
  const title = cleanText($("h1, .detailTitle, .title").filter((_, element) => cleanText($(element).text()).length > 6).first().text()) || cleanText($("title").text());
  const bodyText = $("body").text().replace(/\r/g, "");
  const dateTime = bodyText.match(/(20\d{2}年\d{1,2}月\d{1,2}日[^\d]{0,16}\d{1,2}:\d{2})/)?.[1];
  const hall = bodyText.match(/深圳音乐厅\s*(二楼演奏大厅|五楼小剧场|演奏大厅)/)?.[1];
  const venue = bodyText.includes("深圳音乐厅") ? "深圳音乐厅" : undefined;
  const priceText = bodyText.match(/(?:票价|演出票价)[：:]?\s*([^\n\r]+)/)?.[1];
  const priceTiers = unique(Array.from((priceText ?? "").matchAll(/\d+/g)).map((match) => Number(match[0]))).sort((a, b) => a - b);
  const candidates = $(".tabContent2, .tab_content")
    .filter((_, element) => $(element).find(".tabContent2, .tab_content").length === 0)
    .map((_, element) => $(element).html() || "")
    .get()
    .filter((value) => /演出曲目|节目单|曲目单/.test(cheerio.load(value).text()));
  const content = candidates.sort((a, b) => cheerio.load(a).text().length - cheerio.load(b).text().length)[0] || "";
  const program = parseProgram(content);
  const content$ = cheerio.load(content);
  const imageUrls = content$("img[src]").map((_, element) => content$(element).attr("src") || "").get().filter(Boolean).map((url) => new URL(url, pageUrl).href);
  return { title, dateTime, venue, hall, priceTiers, program, imageUrls };
}

export function parseShenzhenConcertHallProgramText(
  text: string,
  confidence: ProgramItem["confidence"] = "ocr",
) {
  return parseProgram(`<p>${text.replace(/\n/g, "</p><p>")}</p>`, confidence);
}

function parseProgram(html: string, confidence: ProgramItem["confidence"] = "official") {
  const withLineBreaks = (html || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|li|div)>/gi, (tag) => `${tag}\n`);
  const $ = cheerio.load(withLineBreaks);
  const lines = $("body").text().split(/\n|\r/).map(cleanText).filter(Boolean);
  const marker = lines.findIndex((line) => /^(?:演出)?曲目(?:单)?[：:]?$|^节目单[：:]?$/.test(line));
  const scoped = marker >= 0 ? lines.slice(marker + 1) : [];
  const program: ProgramItem[] = [];
  for (const line of scoped) {
    if (/曲目.*为准|演出阵容|艺术家介绍|温馨提示/.test(line)) break;
    const match = line.replace(/^\d+[.、]\s*/, "").match(/^([^—－\-:：]{2,36})[—－\-:：]\s*(.+)$/);
    if (!match) continue;
    const titles = Array.from(match[2].matchAll(/《([^》]+)》/g)).map((item) => item[1]);
    if (match[1] === "组曲" && titles.length > 1) {
      program.push({
        title: "组曲",
        movements: titles.map((title, index) => ({ number: String(index + 1), title })),
        confidence,
      });
      continue;
    }
    for (const title of titles.length ? titles : [match[2]]) program.push({ composer: match[1], title: title.replace(/[《》]/g, ""), confidence });
  }
  return dedupe(program);
}

function dedupe(items: ProgramItem[]) { const s = new Set<string>(); return items.filter((x) => { const k = `${x.composer}:${x.title}`; if (s.has(k)) return false; s.add(k); return true; }); }
function unique<T>(values: T[]) { return Array.from(new Set(values)); }
function cleanText(value: string) { return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
