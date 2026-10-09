import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";
import { parseChinaDate } from "../china-time";
import { isProgramRoleLabel } from "../program-role-labels";

type XinghaiProgram = {
  id: number | string;
  cnName?: string;
  fullCnName?: string;
  category?: string;
  tag?: string;
  startTime?: string;
  endTime?: string;
};

export function selectXinghaiConcertHallPrograms(response: { success?: boolean; msg?: string; data?: XinghaiProgram[] }, now = Date.now()) {
  if (!response.success || !Array.isArray(response.data)) {
    throw new Error(`Xinghai list API: ${response.msg || "invalid response"}`);
  }
  return response.data.filter((item) => {
    const title = cleanText(item.fullCnName || item.cnName || "");
    const end = parseChinaDate(item.endTime || item.startTime || "").getTime();
    return item.id && Number.isFinite(end) && end >= now
      && isXinghaiConcertHallClassical(`${title} ${item.category || ""} ${item.tag || ""}`);
  });
}

export function parseXinghaiConcertHallApiDetail(detail: {
  fullCnName?: string; cnName?: string; venueName?: string; programInfo?: string; showContent?: string;
}) {
  const html = detail.showContent || detail.programInfo || "";
  const lines = htmlLines(html);
  const start = lines.findIndex((line) => /^(?:(?:主要|演出|参考)\s*)?(?:曲目(?:单)?|节目单)(?:\s*PROGRAMME)?[：:]?$/i.test(line));
  const rest = start >= 0 ? lines.slice(start + 1) : [];
  const end = rest.findIndex((line) => /曲目.*为准/.test(line)
    || /^(?:\*?\s*演出信息|票价|艺术家|演出阵容|温馨提示|购票)/.test(line));
  const programLines = end >= 0 ? rest.slice(0, end) : rest;
  const program = parseApiProgram(programLines);
  const performerLines = start >= 0 ? lines.slice(0, start) : [];
  const artistLines = performerLines.filter((line) => /^(?:指挥|钢琴|小提琴|中提琴|大提琴|长笛|独奏|演唱|乐团)[：:]/.test(line));
  const priceLine = lines.find((line) => /^票价[：:]/.test(line)) || "";
  return {
    title: cleanText(detail.fullCnName || detail.cnName || ""),
    hall: detail.venueName?.replace(/^星海音乐厅\s*/, ""),
    program,
    conductor: artistLines.find((line) => /^指挥[：:]/.test(line))?.replace(/^指挥[：:]\s*/, ""),
    performers: unique(artistLines.filter((line) => !/^(?:指挥|乐团)[：:]/.test(line)).flatMap(parseArtistNames)),
    priceTiers: unique(Array.from(priceLine.matchAll(/\d+/g)).map((match) => Number(match[0]))).sort((a, b) => a - b),
  };
}

function parseApiProgram(lines: string[]) {
  const items: ProgramItem[] = [];
  let composer: string | undefined;
  for (const raw of lines) {
    const line = cleanText(raw.replace(/^(?:\d+|[一二三四五六七八九十]+)[.、．]\s*/, ""));
    if (!line || /中场休息|^(?:上|下)半场/.test(line)) continue;
    if (/^[\u3400-\u9fff]+(?:[·•][\u3400-\u9fff]+)+$/.test(line) && line.length <= 24) {
      composer = line;
      continue;
    }
    const prefix = line.match(/^([^：:]{1,40})[：:]/)?.[1];
    if (prefix && isProgramRoleLabel(prefix)) continue;
    const bracketFirst = line.match(/^《([^》]+)》(.*)$/);
    if (bracketFirst) {
      items.push({ composer, title: cleanText(`${bracketFirst[1]} ${bracketFirst[2]}`), confidence: "official" });
      continue;
    }
    const pair = line.match(/^([^：:《》（）()]{2,40})(?:[（(]改编[：:].+?[）)])?[：:]\s*(.*)$/);
    if (pair) {
      const label = cleanText(pair[1]);
      const isForce = isProgramRoleLabel(label) || /协奏曲|管弦乐|序幕|第.+部分|颂歌|终篇/.test(label);
      composer = isForce ? undefined : label;
      if (pair[2]) items.push({ composer, title: stripBookTitle(pair[2]), confidence: "official" });
      continue;
    }
    if (/演唱[：:∶]/.test(line)) {
      items.push({ title: stripBookTitle(line.replace(/\s*演唱[：:∶].*$/, "")), confidence: "official" });
      continue;
    }
    items.push({ composer, title: stripBookTitle(line), confidence: "official" });
  }
  return dedupeProgram(mergeXinghaiProgramTranslations(items));
}

export function isXinghaiConcertHallClassical(title: string) {
  if (/爵士|流行|摇滚|动漫|影视|电影主题|亲子|音乐剧/.test(title)) return false;
  return /交响|古典|室内乐|独奏|协奏|奏鸣|钢琴|小提琴|大提琴|管风琴|弦乐|乐团|合唱|音乐季/.test(title);
}

export function parseXinghaiConcertHallDetail(html: string, pageUrl: string) {
  const $ = cheerio.load(html || "");
  const rawTitle = cleanText($("h1, .event_title, .title").first().text()) || cleanText($("title").text());
  const title = cleanXinghaiTitle(rawTitle);
  const text = $("body").text().replace(/\r/g, "\n");
  const metaLines = $(".fl.fblack.lh21").map((_, element) => cleanText($(element).text())).get();
  const dateTime = metaLines.find((line) => /^演出时间/.test(line))?.replace(/^演出时间[：:]?/, "");
  const rawHall = metaLines.find((line) => /^演出地点/.test(line))?.replace(/^演出地点[：:]?/, "");
  const hall = cleanText(rawHall || "").replace(/^星海音乐厅\s*/, "") || undefined;
  const venue = "星海音乐厅";
  const priceLabel = $(".fl.fblack.lh21").filter((_, element) => /^演出票价/.test(cleanText($(element).text()))).first();
  const priceLine = cleanText(priceLabel.next(".fl.fblack").find(".lh21").first().text()).split(/限时|学生|长者|会员/)[0] ?? "";
  const priceTiers = unique(Array.from(priceLine.matchAll(/\d+/g)).map((match) => Number(match[0]))).sort((a, b) => a - b);
  const programHtml = $("#program").first().html();
  const program = programHtml ? parseProgramBlock(programHtml) : parseMarkedProgram(text);
  const artistLines = htmlLines($("#artists").first().html() || "");
  const performers = unique(artistLines.flatMap(parseArtistNames));
  const conductor = artistLines
    .map((line) => line.match(/^指挥[：:]\s*(.+)$/)?.[1])
    .filter((name): name is string => Boolean(name))
    .map(cleanText)[0];
  const imageUrls = $(".bxslider img[src]").map((_, element) => $(element).attr("src") || "").get().filter(Boolean).map((url) => new URL(url, pageUrl).href);
  return { title, dateTime, venue, hall, priceTiers, program, performers, conductor, imageUrls };
}

export function parseXinghaiConcertHallProgramText(text: string, confidence: ProgramItem["confidence"] = "ocr") {
  return parseMarkedProgram(text, confidence, true);
}

function parseProgramBlock(html: string, confidence: ProgramItem["confidence"] = "official") {
  const lines = htmlLines(html);
  const items: ProgramItem[] = [];
  let currentComposer: string | undefined;
  for (const raw of lines) {
    const line = cleanText(raw.replace(/^\d+[.、]\s*/, ""));
    if (!line || /中场休息|曲目.*为准|演出现场为准|节目.*为准/.test(line)) continue;
    if (/^(?:注|说明|备注|主办|承办|协办|演出|演奏|伴奏|指挥)[：:]/.test(line)) continue;
    if (/^芭比之[^：:《》]{2,24}$/.test(line)) {
      items.push({ title: "", confidence });
      currentComposer = undefined;
      continue;
    }

    const composerHeading = line.match(/^([^：:]{2,32})[：:]$/);
    if (composerHeading) {
      currentComposer = cleanText(composerHeading[1]);
      continue;
    }

    const colon = line.match(/^([^：:—－]{2,32})[：:—－]\s*(.+)$/);
    if (colon) {
      currentComposer = cleanText(colon[1]);
      items.push({ composer: currentComposer, title: stripBookTitle(colon[2]), confidence });
      continue;
    }

    const bookTitle = line.match(/^([^《》：:]{2,32})《([^》]{2,120})》(.*)$/);
    if (
      bookTitle &&
      !/(?:长笛|小提琴|中提琴|大提琴|钢琴|竖琴|指挥|歌剧|舞剧|芭蕾舞剧|音乐剧|清唱剧|交响诗)$/.test(bookTitle[1])
    ) {
      items.push({
        composer: cleanText(bookTitle[1]),
        title: cleanText(`${bookTitle[2]}${bookTitle[3]}`),
        confidence,
      });
      continue;
    }

    items.push({ composer: currentComposer, title: stripBookTitle(line), confidence });
  }
  return dedupeProgram(mergeXinghaiProgramTranslations(items));
}

export function mergeXinghaiProgramTranslations(items: ProgramItem[], mergeUnattributed = true) {
  const merged: ProgramItem[] = [];
  let canMergeWithPrevious = true;
  for (const item of items) {
    if (!item.title) {
      canMergeWithPrevious = false;
      continue;
    }
    const previous = merged.at(-1);
    const isLatinTitle = /[A-Za-z]/.test(item.title) && !/[\u3400-\u9fff]/.test(item.title);
    const previousIsChinese = previous && /[\u3400-\u9fff]/.test(previous.title);
    const bilingualComposerPair = previous?.composer
      && /[\u3400-\u9fff]/.test(previous.composer)
      && Boolean(item.composer)
      && /[A-Za-z]/.test(item.composer ?? "")
      && !/[\u3400-\u9fff]/.test(item.composer ?? "");
    if (canMergeWithPrevious && isLatinTitle && previousIsChinese && ((mergeUnattributed && !item.composer) || bilingualComposerPair)) {
      previous.alternateTitles = unique([...(previous.alternateTitles ?? []), item.title]);
      continue;
    }
    merged.push({ ...item });
    canMergeWithPrevious = true;
  }
  return merged;
}

function parseMarkedProgram(
  text: string,
  confidence: ProgramItem["confidence"] = "official",
  allowUnmarkedOcr = false,
) {
  const lines = text.split(/\n|\r/).map(cleanText).filter(Boolean);
  const marker = lines.findIndex((line) => /^(?:(?:演出)?曲目(?:单)?|节目单)[：:]?$/.test(line));
  if (marker < 0) {
    if (!allowUnmarkedOcr) return [];
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

function parseArtistNames(line: string) {
  const match = line.match(/^[^：:]{1,16}[：:]\s*(.+)$/);
  if (!match) return [];
  return match[1]
    .split(/[、，,\/]/)
    .map(cleanText)
    .filter((name) => name && name !== "全体");
}

function htmlLines(html: string) {
  const withBreaks = (html || "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|li|div)>/gi, (tag) => `${tag}\n`);
  const $ = cheerio.load(withBreaks);
  return $("body").text().split(/\n|\r/).map(cleanText).filter(Boolean);
}

function stripBookTitle(value: string) {
  return cleanText(value.replace(/[《》]/g, ""));
}

function cleanXinghaiTitle(value: string) {
  return cleanText(value.replace(/\s*[-—–－]+\s*星海音乐厅\s*$/, ""));
}

function dedupeProgram(items: ProgramItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.composer ?? ""}:${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique<T>(values: T[]) { return Array.from(new Set(values)); }
function cleanText(value: string) { return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
