import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

type ContentBlock = {
  text: string;
  bold: boolean;
};

export type SuzhouSymphonySection = {
  slug: string;
  index: number;
};

export function discoverSuzhouSymphonySeasonUrl(html: string, baseUrl: string) {
  const $ = cheerio.load(html || "");
  const candidates = $("a[href]")
    .map((_, element) => {
      const href = $(element).attr("href") || "";
      const label = cleanText($(element).text());
      const season = `${label} ${href}`.match(/(20\d{2})\s*-\s*\d{2}/);
      if (!season || !/music-season/i.test(href)) return undefined;
      try {
        return { url: new URL(href, baseUrl).href, year: Number(season[1]) };
      } catch {
        return undefined;
      }
    })
    .get()
    .filter((candidate): candidate is { url: string; year: number } => Boolean(candidate));

  return candidates.sort((left, right) => right.year - left.year)[0]?.url;
}

export function discoverSuzhouSymphonySections(html: string): SuzhouSymphonySection[] {
  const sections = new Map<string, SuzhouSymphonySection>();
  const $ = cheerio.load(html || "");
  const calls = [
    ...$("[onclick*='getMusicDataList']")
      .map((_, element) => $(element).attr("onclick") || "")
      .get(),
    ...$("script")
      .map((_, element) =>
        ($(element).html() || "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, ""),
      )
      .get(),
  ];
  for (const call of calls) {
    for (const match of call.matchAll(/getMusicDataList\s*\(\s*["']([^"']+)["']\s*,\s*(\d+)/gi)) {
      const section = { slug: match[1], index: Number(match[2]) };
      sections.set(`${section.slug.toLowerCase()}:${section.index}`, section);
    }
  }
  return Array.from(sections.values());
}

const rolePattern =
  /^(指挥|演奏|演唱|特邀主演|贾宝玉\/男高音|钢琴|小提琴|中提琴|大提琴|低音提琴|长笛|双簧管|单簧管|大管|圆号|小号|长号|大号|竖琴|打击乐|女高音|女中音|假声男高音|男高音|男中音|低男中音|男低音|独奏|合唱|乐团)\s*(?:[|｜:：]\s*|\s+)?(.*)$/;
const programFooterPattern = /^(?:观演须知|温馨提示|购票须知)/;
const workPattern =
  /[《》]|交响曲|协奏曲|奏鸣曲|三重奏|四重奏|五重奏|组曲|序曲|圆舞曲|波尔卡|幻想曲|变奏曲|狂想曲|小夜曲|赋格|练习曲|前奏曲|叙事曲|歌曲|咏叹调|进行曲|舞曲|小品|选段|选曲|乐章|随想曲|托卡塔|无伴奏|告别曲|Op\.?|K\.?\s*\d|BWV|WAB/i;
const sectionPattern = /^(?:引子|第[一二三四五六七八九十\d]+幕|终章|上半场|下半场|中场休息)/;

export function parseSuzhouSymphonyContent(html: string) {
  const blocks = htmlToBlocks(html);
  const footerIndex = blocks.findIndex((block) => programFooterPattern.test(block.text));
  const mainBlocks = footerIndex >= 0 ? blocks.slice(0, footerIndex) : blocks;
  const cast = parseCast(mainBlocks);
  const program = parseProgram(mainBlocks);
  const description = footerIndex >= 0 ? buildDescription(blocks.slice(footerIndex + 1)) : undefined;

  return { program, description, ...cast };
}

export function extractSuzhouSymphonyDates(html: string, fallback?: string) {
  const $ = cheerio.load(html || "");
  const lines = $("p, li")
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);
  if (!lines.length) lines.push(cleanText($.text()));
  const dates: string[] = [];

  for (const line of lines) {
    const dateMatches = Array.from(line.matchAll(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/g));
    for (let index = 0; index < dateMatches.length; index += 1) {
      const match = dateMatches[index];
      const segmentStart = (match.index ?? 0) + match[0].length;
      const segmentEnd = dateMatches[index + 1]?.index ?? line.length;
      const times = Array.from(line.slice(segmentStart, segmentEnd).matchAll(/(\d{1,2})\s*[：:]\s*(\d{2})/g));
      for (const time of times) {
        dates.push(
          `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(
            2,
            "0",
          )} ${String(Number(time[1])).padStart(2, "0")}:${time[2]}`,
        );
      }
    }
  }

  if (!dates.length && fallback) dates.push(normalizeDateTime(fallback));
  return Array.from(new Set(dates.filter(Boolean)));
}

export function parseSuzhouSymphonyVenue(value: string, html = "") {
  const normalized = cleanText(value);
  const pageText = cleanText(cheerio.load(html || "").text());
  const reliableValue =
    /苏州文化艺术中心|金鸡湖音乐厅|Jinji Lake Concert Hall/i.test(normalized) ? normalized : pageText;
  if (/Jinji Lake Concert Hall/i.test(reliableValue)) {
    return { venue: "苏州文化艺术中心", hall: "金鸡湖音乐厅" };
  }
  if (/金鸡湖音乐厅/.test(reliableValue)) {
    return { venue: "苏州文化艺术中心", hall: "金鸡湖音乐厅" };
  }
  if (/苏州文化艺术中心.*大剧院/.test(reliableValue)) {
    return { venue: "苏州文化艺术中心", hall: "大剧院" };
  }
  return { venue: "苏州文化艺术中心", hall: undefined };
}

function parseProgram(blocks: ContentBlock[]) {
  const program: ProgramItem[] = [];
  let currentComposer: string | undefined;
  let started = false;
  const castIndexes = castBlockIndexes(blocks);

  for (let index = 0; index < blocks.length; index += 1) {
    if (castIndexes.has(index)) continue;
    const block = blocks[index];
    const line = cleanText(block.text);
    if (!line || isMetadataLine(line) || sectionPattern.test(line)) continue;

    const composer = parseComposerHeading(line, block.bold, cleanText(blocks[index + 1]?.text || ""));
    if (composer) {
      currentComposer = composer;
      started = true;
      continue;
    }

    if (!started || !isWorkLine(line)) continue;
    const item = createProgramItem(line, currentComposer);
    if (item) program.push(item);
  }

  return dedupeProgram(program);
}

function parseCast(blocks: ContentBlock[]) {
  const performers: string[] = [];
  let conductor: string | undefined;
  let ensemble: string | undefined;

  for (let index = 0; index < blocks.length; index += 1) {
    const match = blocks[index].text.match(rolePattern);
    if (!match) continue;
    const role = match[1];
    const inlineValue = cleanText(match[2] || "");
    const nextValue = cleanText(blocks[index + 1]?.text || "");
    const value = inlineValue || (!rolePattern.test(nextValue) ? nextValue : "");
    const names = splitNames(value);
    if (/指挥/.test(role)) conductor = names[0];
    if (/演奏|乐团/.test(role) && names.some((name) => /乐团|合唱团/.test(name))) {
      ensemble = names.find((name) => /乐团|合唱团/.test(name));
    }
    performers.push(...names);
  }

  return {
    conductor,
    ensemble,
    performers: Array.from(new Set(performers)).filter(Boolean),
  };
}

function castBlockIndexes(blocks: ContentBlock[]) {
  const indexes = new Set<number>();
  for (let index = 0; index < blocks.length; index += 1) {
    const match = blocks[index].text.match(rolePattern);
    if (!match) continue;
    indexes.add(index);
    if (!cleanText(match[2] || "") && blocks[index + 1]) indexes.add(index + 1);
  }
  return indexes;
}

function parseComposerHeading(line: string, bold: boolean, nextLine: string) {
  if (/^作曲\s+.+\s+作词\s+/.test(line)) {
    return cleanText(line.replace(/^作曲\s+/, "").replace(/\s+作词\s+.*$/, ""));
  }
  if (line.length > 36 || isMetadataLine(line) || workPattern.test(line)) return undefined;
  if (!looksLikeWork(nextLine)) return undefined;
  if (/音乐会|音乐季|系列|特别策划|格调室内乐|大师系列/.test(line)) return undefined;
  return cleanText(line.replace(/曲\s*\/\s*/g, "/").replace(/\s*改编$/, "改编"));
}

function isWorkLine(line: string) {
  return line.length <= 120 && workPattern.test(line) && !/[。！？]$/.test(line);
}

function looksLikeWork(line: string) {
  return Boolean(line && isWorkLine(line));
}

function createProgramItem(value: string, composer?: string): ProgramItem | undefined {
  const cleaned = cleanText(value.replace(/^\d{1,2}[.、．)）]\s*/, ""));
  const opusMatch = cleaned.match(
    /(?:[,，]?\s*)((?:Op\.?\s*\d+(?:\s*No\.?\s*\d+)?|K\.?\s*\d+[a-z]?|M\.?\s*\d+(?:\/\d+)?|BWV\s*\d+|WAB\s*\d+)(?:[，,、]\s*(?:Op\.?|K\.?|M\.?|BWV|WAB)\s*[\w./-]+)*)/i,
  );
  const title = cleanText(
    (opusMatch ? cleaned.replace(opusMatch[0], "") : cleaned)
      .replace(/^《([^》]+)》/, "$1")
      .replace(/[（(]\s*\d{4}\s*[）)]$/, "")
      .replace(/[，,；;：:]+$/, ""),
  );
  if (!title || title.length < 2) return undefined;
  return {
    composer,
    title,
    opus: opusMatch ? cleanText(opusMatch[1]) : undefined,
    confidence: "official",
  };
}

function isMetadataLine(line: string) {
  return (
    /20\d{2}[./-]\d{1,2}[./-]\d{1,2}/.test(line) ||
    /苏州文化艺术中心|金鸡湖音乐厅|Jinji Lake Concert Hall/i.test(line) ||
    /^(?:\*?曲目.*现场|本场演出|音乐厅入场|演出全长|演出适合)/.test(line)
  );
}

function buildDescription(blocks: ContentBlock[]) {
  const paragraphs = blocks
    .map((block) => block.text)
    .filter(
      (line) =>
        line &&
        !/^\d+[.、]\s*(?:本场演出|音乐厅|大剧院|本场音乐会)/.test(line) &&
        !/^(?:观演须知|温馨提示|购票须知)$/.test(line),
    );
  return paragraphs.length ? paragraphs.join("\n\n") : undefined;
}

function htmlToBlocks(html: string) {
  const $ = cheerio.load(html || "");
  const blocks: ContentBlock[] = [];
  $("p, li").each((_, element) => {
    const node = $(element);
    const text = cleanText(node.text());
    if (!text) return;
    const ownText = cleanText(node.clone().children().remove().end().text());
    const strongText = cleanText(node.find("strong, b").text());
    blocks.push({ text, bold: Boolean(strongText && (!ownText || strongText === text)) });
  });
  return blocks;
}

function splitNames(value: string) {
  return value
    .replace(/\s+\/\s+/g, "、")
    .split(/[、，,；;]/)
    .map((name) => cleanText(name))
    .filter((name) => name && name.length <= 50 && !workPattern.test(name));
}

function normalizeDateTime(value: string) {
  const match = value.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2}).*?(\d{1,2})\s*[：:]\s*(\d{2})/);
  if (!match) return "";
  return `${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(
    2,
    "0",
  )} ${String(Number(match[4])).padStart(2, "0")}:${match[5]}`;
}

function dedupeProgram(program: ProgramItem[]) {
  const seen = new Set<string>();
  return program.filter((item) => {
    const key = `${item.composer ?? ""}:${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
