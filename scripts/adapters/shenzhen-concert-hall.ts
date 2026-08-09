import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

export function buildShenzhenConcertHallListUrl(baseUrl: string, page: number) {
  if (page <= 1) return baseUrl;
  return new URL(`/performance/0/0000-00-00/0000-00-00/0/0/key%5E/${page}`, baseUrl).href;
}

export function discoverShenzhenConcertHallDetailUrls(html: string, baseUrl: string) {
  const $ = cheerio.load(html || "");
  return Array.from(new Set(
    $('a[href*="/performance/show_"]')
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
  const parsedProgram = parseProgram(content);
  const content$ = cheerio.load(content);
  const imageUrls = content$("img[src]").map((_, element) => content$(element).attr("src") || "").get().filter(Boolean).map((url) => new URL(url, pageUrl).href);
  return {
    title,
    dateTime,
    venue,
    hall,
    priceTiers,
    program: parsedProgram.program,
    performers: parsedProgram.performers,
    imageUrls,
  };
}

export function parseShenzhenConcertHallProgramText(
  text: string,
  confidence: ProgramItem["confidence"] = "ocr",
) {
  return parseProgram(`<p>${text.replace(/\n/g, "</p><p>")}</p>`, confidence).program;
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
  const performers: string[] = [];
  for (const rawLine of scoped) {
    const line = rawLine.replace(/^\d+[.、]\s*/, "");
    if (/曲目.*为准|演出阵容|艺术家介绍|温馨提示/.test(line)) break;
    if (/^中场休息$/.test(line)) continue;

    const personnel = line.match(/^(演出|演奏|伴奏|领唱|合唱|独唱)[：:]\s*(.+)$/);
    if (personnel) {
      performers.push(...splitPeople(personnel[2]));
      continue;
    }

    const work = line.match(/^《([^》]+)》(.*)$/);
    if (work) {
      const sourceSuffix = work[2].match(/^\s*([（(][^）)]+[）)])/)?.[1] ?? "";
      const item: ProgramItem = {
        title: cleanText(`${work[1]}${sourceSuffix}`),
        confidence,
      };
      applyCredits(item, work[2]);
      program.push(item);
      continue;
    }

    if (program.length && applyCredits(program.at(-1)!, line)) continue;

    const match = line.match(/^([^—－\-:：]{2,36})[—－\-:：]\s*(.+)$/);
    if (!match) continue;
    if (isPersonnelLabel(match[1])) {
      performers.push(...splitPeople(match[2]));
      continue;
    }
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
  return { program: dedupe(program), performers: unique(performers) };
}

function applyCredits(item: ProgramItem, value: string) {
  const parts = value
    .replace(/^[（(][^）)]*[）)]\s*/, "")
    .split(/[，,；;]/)
    .map(cleanText)
    .filter(Boolean);
  const credits = [...(item.credits ?? [])];
  let matched = false;

  for (const part of parts) {
    const match = part.match(/^(.{1,40}?)\s*(作词|填词|汉语填词|词曲|词|曲|改编合唱|合唱改编|合唱编创|钢琴编配|编配|编创|改编)$/);
    if (!match) continue;
    matched = true;
    const name = cleanText(match[1]);
    const role = match[2];
    if (role === "曲" || role === "词曲") {
      item.composer ||= name;
      if (role === "词曲") credits.push({ name, role: "词" });
    } else {
      credits.push({ name, role });
    }
  }

  if (credits.length) item.credits = dedupeCredits(credits);
  return matched;
}

function isPersonnelLabel(value: string) {
  return /^(?:演出|演奏|伴奏|领唱|合唱|独唱|指挥|艺术指导|钢琴伴奏)$/.test(cleanText(value));
}

function splitPeople(value: string) {
  if (cleanText(value) === "全体") return [];
  return value.split(/[、，,\/]/).map(cleanText).filter(Boolean);
}

function dedupeCredits(items: NonNullable<ProgramItem["credits"]>) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.name}:${item.role}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupe(items: ProgramItem[]) { const s = new Set<string>(); return items.filter((x) => { const k = `${x.composer}:${x.title}`; if (s.has(k)) return false; s.add(k); return true; }); }
function unique<T>(values: T[]) { return Array.from(new Set(values)); }
function cleanText(value: string) { return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
