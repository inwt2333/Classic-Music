import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

export function isXinghaiConcertHallClassical(title: string) {
  if (/爵士|流行|摇滚|动漫|影视|电影主题|亲子|音乐剧/.test(title)) return false;
  return /交响|古典|室内乐|独奏|协奏|奏鸣|钢琴|小提琴|大提琴|管风琴|弦乐|乐团|合唱|音乐季/.test(title);
}

export function parseXinghaiConcertHallDetail(html: string, pageUrl: string) {
  const $ = cheerio.load(html || "");
  const title = cleanText($("h1, .event_title, .title").first().text()) || cleanText($("title").text());
  const text = $("body").text().replace(/\r/g, "\n");
  const metaLines = $(".fl.fblack.lh21").map((_, element) => cleanText($(element).text())).get();
  const dateTime = metaLines.find((line) => /^演出时间/.test(line))?.replace(/^演出时间[：:]?/, "");
  const venue = metaLines.find((line) => /^演出地点/.test(line))?.replace(/^演出地点[：:]?/, "");
  const priceLabel = $(".fl.fblack.lh21").filter((_, element) => /^演出票价/.test(cleanText($(element).text()))).first();
  const priceLine = cleanText(priceLabel.next(".fl.fblack").find(".lh21").first().text()).split(/限时|学生|长者|会员/)[0] ?? "";
  const priceTiers = unique(Array.from(priceLine.matchAll(/\d+/g)).map((match) => Number(match[0]))).sort((a, b) => a - b);
  const program = parseProgram(text);
  const imageUrls = $(".bxslider img[src]").map((_, element) => $(element).attr("src") || "").get().filter(Boolean).map((url) => new URL(url, pageUrl).href);
  return { title, dateTime, venue, priceTiers, program, imageUrls };
}

export function parseXinghaiConcertHallProgramText(text: string, confidence: ProgramItem["confidence"] = "ocr") {
  return parseProgram(text, confidence);
}

function parseProgram(text: string, confidence: ProgramItem["confidence"] = "official") {
  const lines = text.split(/\n|\r/).map(cleanText).filter(Boolean);
  const marker = lines.findIndex((line) => /^(?:(?:演出)?曲目(?:单)?|节目单)[：:]?$/.test(line));
  if (marker < 0) {
    return lines.flatMap((line) => {
      const match = line.match(/^([^《》：:]{2,36})《([^》]{2,120})》(.*)$/);
      if (!match || /(?:长笛|小提琴|中提琴|大提琴|钢琴|竖琴|指挥)$/.test(match[1])) return [];
      return [{ composer: match[1], title: `${match[2]}${match[3]}`.trim(), confidence } satisfies ProgramItem];
    });
  }
  const program: ProgramItem[] = [];
  let composer: string | undefined;
  for (const raw of lines.slice(marker + 1)) {
    if (/演出介绍|艺术家|购票|主办|曲目.*为准/.test(raw)) break;
    const line = raw.replace(/^\d+[.、]\s*/, "");
    const match = line.match(/^([^：:—－]{2,32})[：:—－]\s*(.+)$/);
    if (match) {
      composer = match[1];
      program.push({ composer, title: match[2].replace(/[《》]/g, ""), confidence });
    } else if (composer && /协奏曲|奏鸣曲|交响曲|序曲|组曲|变奏曲|狂想曲|《/.test(line)) {
      program.push({ composer, title: line.replace(/[《》]/g, ""), confidence });
    }
  }
  return program;
}

function unique<T>(values: T[]) { return Array.from(new Set(values)); }
function cleanText(value: string) { return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
