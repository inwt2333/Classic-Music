import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

export function parseChinaPhilharmonicDetail(html: string) {
  const $ = cheerio.load(html || "");
  const article = $(".content .article, .content .text").first();
  const paragraphs = article.find("p").toArray();
  const title =
    cleanText($('meta[name="ArticleTitle"]').attr("content") ?? "") || cleanText($(".content h2").first().text());
  const dateTime =
    cleanText($('meta[name="PubDate"]').attr("content") ?? "") ||
    cleanText($("ul.desc li").first().text()).match(/20\d{2}年\d{1,2}月\d{1,2}日.*?\d{1,2}:\d{2}/)?.[0] ||
    "";
  const venue = cleanText($("ul.desc li").eq(1).clone().find("a").remove().end().text());

  const markers = markerIndexes($, paragraphs);
  const chineseProgram = paragraphTexts($, paragraphs, markers.qumu + 1, markers.artists);
  const englishProgram = paragraphTexts($, paragraphs, markers.programEnglish + 1, markers.artistsEnglish);
  const castLines = paragraphTexts($, paragraphs, markers.artists + 1, markers.programEnglish);
  const cast = parseCast(castLines);
  const program = chineseProgram
    .map(parseChineseWork)
    .filter((item): item is ProgramItem => Boolean(item))
    .map((item, index) => ({
      ...item,
      alternateTitles: englishProgram[index] ? [englishProgram[index]] : undefined,
    }));
  const description = article
    .find("hr")
    .first()
    .prevAll("p")
    .toArray()
    .reverse()
    .map((element) => cleanText($(element).text()))
    .filter((line) => line.length >= 30)
    .join("\n\n");

  return {
    title,
    dateTime,
    venue,
    conductor: cast.conductor,
    performers: cast.performers,
    program: dedupeProgram(program),
    description: description || undefined,
  };
}

function markerIndexes($: cheerio.CheerioAPI, paragraphs: any[]) {
  const find = (pattern: RegExp) =>
    paragraphs.findIndex((element) => {
      const image = $(element).find("img").first();
      return pattern.test(`${image.attr("title") ?? ""} ${image.attr("src") ?? ""}`);
    });
  return {
    qumu: find(/QUMU/i),
    artists: find(/YISHUJIA/i),
    programEnglish: find(/(?:^|\/)PRO(?:\.|$)/i),
    artistsEnglish: find(/(?:^|\/)ART(?:\.|$)/i),
  };
}

function paragraphTexts(
  $: cheerio.CheerioAPI,
  paragraphs: any[],
  start: number,
  end: number,
) {
  if (start <= 0 || end < start) return [];
  return paragraphs
    .slice(start, end)
    .map((element) => cleanText($(element).text()))
    .filter(Boolean);
}

function parseCast(lines: string[]) {
  let conductor: string | undefined;
  const performers: string[] = [];
  for (const line of lines) {
    const match = line.match(
      /^(指挥|钢琴|小提琴|中提琴|大提琴|女高音|女中音|男高音|男中音|男低音|长笛|独唱|独奏|领唱|演唱|合唱)[：:]\s*(.+)$/,
    );
    if (!match) continue;
    const names = match[2].split(/[、，,\/]/).map(cleanText).filter(Boolean);
    performers.push(...names);
    if (match[1] === "指挥") conductor = names[0];
  }
  return { conductor, performers: unique(performers) };
}

function parseChineseWork(line: string): ProgramItem | undefined {
  if (line.length < 3 || line.length > 180) return undefined;
  if (
    /^(指挥|钢琴|小提琴|中提琴|大提琴|女高音|女中音|男高音|男中音|男低音|独唱|独奏|领唱|演唱|合唱)[：:]/.test(
      line,
    )
  ) {
    return undefined;
  }
  const colon = line.match(/^([^：:]{2,30})[：:]\s*(.+)$/);
  const composer = colon ? cleanText(colon[1]) : undefined;
  const title = cleanText((colon?.[2] ?? line).replace(/[《》]/g, ""));
  if (!title || /演出阵容|音乐季|音乐会$/.test(title)) return undefined;
  const opus = title.match(/(?:作品|Op\.?)\s*([\dA-Za-z./-]+)/i)?.[0];
  return { composer, title, opus, confidence: "official" };
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

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function cleanText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
