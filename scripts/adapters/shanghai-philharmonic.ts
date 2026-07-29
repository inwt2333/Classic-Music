import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

export function parseShanghaiPhilharmonicDetail(html: string) {
  const $ = cheerio.load(html || "");
  const root = $("#detail1 .desc").first();
  const lines = root
    .find("p, li")
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);
  const marker = lines.findIndex((line) => /^曲目[：:]?$/.test(line));
  const cast = parseCast(lines);
  const program = marker >= 0 ? parseProgram(lines.slice(marker + 1)) : [];
  const venueText = $(".detail-box .address")
    .map((_, element) => cleanText($(element).text()))
    .get()
    .find((line) => line.startsWith("场馆："));
  const date = cleanText($(".detail-box .time1").first().text());
  const time = cleanText($(".detail-box .time2").first().text()).match(/\d{1,2}:\d{2}/)?.[0];
  const price = cleanText($(".detail-price").first().text()) || undefined;
  const priceTiers = unique(
    Array.from(
      `${price ?? ""} ${lines.slice(0, Math.max(0, marker)).join(" ")}`.matchAll(
        /(?:￥|¥)\s*(\d+)|(\d+)\s*元/g,
      ),
    ).map((match) => Number(match[1] ?? match[2])),
  ).sort((a, b) => a - b);

  return {
    title: cleanText($(".detail-box h1").first().text()),
    dateTime: date && time ? `${date} ${time}` : undefined,
    venue: cleanText((venueText ?? "").replace(/^场馆[：:]/, "")),
    price,
    priceTiers,
    conductor: cast.conductor,
    performers: cast.performers,
    ensembles: cast.ensembles,
    program,
  };
}

function parseCast(lines: string[]) {
  let conductor: string | undefined;
  const performers: string[] = [];
  const ensembles: string[] = [];
  for (const line of lines) {
    const match = line.match(
      /^(指挥|钢琴|小提琴|中提琴|大提琴|女高音|女中音|男高音|男中音|男低音|独唱|合唱|乐团|(?:[\u3400-\u9fff]{0,8})(?:独奏|领奏|领唱|演唱|伴奏|朗诵|导聆))[：:]\s*(.+)$/,
    );
    if (!match) continue;
    const names = match[2].split(/[、，,\/]/).map(cleanText).filter(Boolean);
    if (match[1] === "指挥") conductor = names[0];
    if (/合唱|乐团/.test(match[1])) ensembles.push(...names);
    else performers.push(...names);
  }
  return { conductor, performers: unique(performers), ensembles: unique(ensembles) };
}

function parseProgram(lines: string[]) {
  const program: ProgramItem[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/主办方保留|subject to change|购票须知|温馨提示/i.test(line)) break;
    if (!hasChinese(line)) continue;
    const item = parseChineseWork(line);
    if (!item) continue;
    const alternate = lines[index + 1];
    if (alternate && !hasChinese(alternate) && /[A-Za-z]{3}/.test(alternate)) {
      item.alternateTitles = [alternate];
      index += 1;
    }
    program.push(item);
  }
  return dedupeProgram(program);
}

function parseChineseWork(line: string): ProgramItem | undefined {
  if (
    /^(作曲|改编|编曲|指挥|钢琴|小提琴|中提琴|大提琴|女高音|女中音|男高音|男中音|男低音|独唱|合唱|乐团|(?:[\u3400-\u9fff]{0,8})(?:独奏|领奏|领唱|演唱|伴奏|朗诵|导聆))[：:]/.test(
      line,
    )
  ) {
    return undefined;
  }
  const colon = line.match(/^([^：:]{2,36})[：:]\s*(.+)$/);
  const composer = colon ? cleanText(colon[1]) : undefined;
  const title = cleanText((colon?.[2] ?? line).replace(/[《》]/g, ""));
  if (!title || /音乐会|音乐季|纪念.*周年$/.test(title)) return undefined;
  const opus = title.match(/(?:作品|Op\.?)\s*([\dA-Za-z./-]+)/i)?.[0];
  return { composer, title, opus, confidence: "official" };
}

function hasChinese(value: string) {
  return /[\u3400-\u9fff]/.test(value);
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
