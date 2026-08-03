import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

const composerPattern = /(?:巴赫|亨德尔|海顿|莫扎特|贝多芬|舒伯特|门德尔松|肖邦|舒曼|李斯特|勃拉姆斯|柴科夫斯基|德沃夏克|马勒|布鲁克纳|德彪西|拉威尔|拉赫玛尼诺夫|普罗科菲耶夫|肖斯塔科维奇|斯特拉文斯基|维瓦尔第|约翰内斯|罗伯特|弗雷德里克)/i;

export function isShanghaiGrandTheatreClassical(item: Record<string, unknown>) {
  if (!/音乐会|CONCERT/i.test(String(item.category ?? ""))) return false;
  const text = [item.fullCnName, item.briefName, item.cnName].filter(Boolean).join(" ");
  if (/爵士|摇滚|流行|动漫|电影金曲|影视金曲|亲子|烛光/.test(text)) return false;
  return /古典|交响|室内乐|独奏|协奏|奏鸣|四重奏|二重奏|钢琴|小提琴|中提琴|大提琴|长笛|吉他|乐团/.test(text) || composerPattern.test(text);
}

export function parseShanghaiGrandTheatreDetail(html: string) {
  const $ = cheerio.load(html || "");
  const rows = $("p, li")
    .map((_, element) => ({
      text: cleanText($(element).text()),
      strong: $(element).find("strong, b").length > 0,
    }))
    .get()
    .filter((row) => row.text);
  const introIndex = rows.findIndex((row) => /^演出介绍[：:]?$/.test(row.text));
  const programEnd = rows.findIndex((row) => /曲目.*(?:变动|为准)|program.*subject to change/i.test(row.text));
  const end = programEnd >= 0 ? programEnd : introIndex >= 0 ? introIndex : rows.length;
  const start = rows.findIndex((row) => /(?:￥|票价|Tickets)/i.test(row.text));
  const programRows = rows.slice(Math.max(0, start + 1), end);
  const program: ProgramItem[] = [];
  let composer: string | undefined;

  for (const row of programRows) {
    if (/^(?:￥|¥)\s*[\d/\s-]+$/.test(row.text) || /^(?:时间|地点|Date|Venue)/i.test(row.text)) continue;
    if ((row.strong || composerPattern.test(row.text)) && isComposerHeading(row.text)) {
      composer = row.text;
      continue;
    }
    if (!composer || !looksLikeWork(row.text)) continue;
    const opus = row.text.match(/(?:作品|Op\.?|K\.?|BWV)\s*[\dA-Za-z./-]+/i)?.[0];
    program.push({ composer, title: row.text.replace(/[《》]/g, ""), opus, confidence: "official" });
  }

  const description = introIndex >= 0
    ? cleanText(rows.slice(introIndex + 1).map((row) => row.text).join("\n")) || undefined
    : undefined;
  const imageUrls = $("img[src]").map((_, element) => $(element).attr("src") || "").get().filter(Boolean);
  return { program: dedupe(program), description, imageUrls };
}

function isComposerHeading(value: string) {
  return value.length <= 36 && composerPattern.test(value) && !/协奏曲|奏鸣曲|交响曲|组曲|小品|叙事曲|舞曲/.test(value);
}

function looksLikeWork(value: string) {
  return value.length >= 2 && value.length <= 150 && !/^(?:时间|地点|票价|演出|一个人的古典|大师之夜)/.test(value);
}

function dedupe(items: ProgramItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.composer}:${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
