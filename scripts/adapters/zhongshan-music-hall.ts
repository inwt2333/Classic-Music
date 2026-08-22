import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";
import { isProgramRoleLabel } from "../program-role-labels";

export function parseZhongshanMusicHallList(html: string, baseUrl: string) {
  const $ = cheerio.load(html || "");
  const seen = new Set<string>();
  return $("a[href]").map((_, element) => {
    const href = $(element).attr("href") || "";
    if (!/^\/?t\d+\.html/.test(href)) return undefined;
    const url = new URL(href, baseUrl).href;
    if (seen.has(url)) return undefined;
    seen.add(url);
    const title = cleanText($(element).attr("title") || $(element).text());
    return title ? { url, title } : undefined;
  }).get().filter((item): item is { url: string; title: string } => Boolean(item));
}

export function isZhongshanMusicHallClassical(title: string) {
  if (/爵士|流行|摇滚|动漫|影视|亲子|音乐剧|相声|戏曲/.test(title)) return false;
  return /交响|古典|室内乐|独奏|协奏|奏鸣|钢琴|小提琴|大提琴|管风琴|弦乐|乐团|合唱|名曲|音乐季/.test(title);
}

export function parseZhongshanMusicHallDetail(html: string, pageUrl: string) {
  const $ = cheerio.load(html || "");
  $("script,style,noscript").remove();
  const body = $("body");
  const text = body.text().replace(/\r/g, "\n");
  const title = cleanText($("title").text()).replace(/--票品详情.*$/, "").replace(/-+$/, "");
  const dateTime = text.match(/(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}[^\n]{0,20}\d{1,2}:\d{2})/)?.[1];
  const venueCandidate = text.match(/(?:场馆|演出地点)[：:]?\s*([^\n]+)/)?.[1]?.trim();
  const venue = venueCandidate && /中山.*音乐堂/.test(venueCandidate) ? venueCandidate : undefined;
  const priceLine = text.match(/(?:票价|演出票价)[：:]?\s*([^\n]+)/)?.[1] ?? "";
  const priceTiers = unique(Array.from(priceLine.matchAll(/\d+/g)).map((match) => Number(match[0]))).sort((a, b) => a - b);
  const program = parseZhongshanMusicHallProgramText(text, "official");
  const personnel = parseZhongshanMusicHallPersonnel(text);
  const imageUrls = $(".pp_l img.pp_pic[src]").map((_, element) => $(element).attr("src") || "").get().filter(Boolean).map((url) => new URL(url, pageUrl).href);
  return { title, dateTime, venue, priceTiers, program, performers: personnel.performers, ensemble: personnel.ensemble, imageUrls };
}

export function parseZhongshanMusicHallProgramText(text: string, confidence: ProgramItem["confidence"] = "ocr") {
  const lines = text.split(/\n|\r/).map(cleanText).filter(Boolean);
  const marker = lines.findIndex((line) => /^(?:演出)?曲目|节目单/.test(line));
  if (marker < 0) return [];
  const program: ProgramItem[] = [];
  for (const raw of lines.slice(marker + 1)) {
    if (/演出阵容|艺术家|购票|温馨提示|演出介绍|院团简介|团体介绍|主创简介|主要演员|推荐演出|曲目.*为准|以.{0,8}为准/.test(raw)) break;
    const line = raw.replace(/^\d+[.、]\s*/, "");
    const movementHeader = line.match(/^(?:序曲|终曲|尾声|引子|前奏|间奏曲?|第[一二三四五六七八九十百\d]+乐章)[\s　]*(?:[\u4e00-\u9fa5与·]*?)《([^》]+)》\s*(.*)$/);
    if (movementHeader) {
      const item: ProgramItem = { title: cleanText(movementHeader[1]), confidence };
      const trailingCredits = parsePerformanceCredits(movementHeader[2]);
      if (trailingCredits.length) item.credits = trailingCredits;
      program.push(item);
      continue;
    }
    const leadingRole = line.match(/^(.{1,10}?)[：:]\s*(.+)$/);
    if (leadingRole && program.length && !/《/.test(line) && isPerformanceRoleLabel(leadingRole[1])) {
      const last = program.at(-1)!;
      last.credits = [...(last.credits ?? []), ...parsePerformanceCredits(line)];
      continue;
    }
    const match = line.match(/^([^：:—－]{2,32})[：:—－]\s*(.+)$/);
    if (match && match[2].length <= 160 && !isProgramRoleLabel(match[1])) {
      program.push({ composer: match[1], title: match[2].replace(/[《》]/g, ""), confidence });
      continue;
    }
    const credited = line.match(/^(.+?(?:\s|[）\]」》]))\s*([\u4e00-\u9fa5A-Za-z·、]{2,30})\s*作曲(?:\s|$)/);
    if (credited && !/[。！？；;]$/.test(line) && !isProgramRoleLabel(credited[2])) {
      const title = stripPerformanceForceAnnotation(credited[1].replace(/^\d{1,3}[.、]?\s*/, "").trim())
        .replace(/[《》]/g, "").trim();
      if (title.length >= 2 && title.length <= 80) {
        program.push({ composer: credited[2], title, confidence });
      }
    }
  }
  return program;
}

const personnelRolePattern = /^(指挥|主持人|主持|独奏|独唱|领奏|领唱|首席|伴奏|艺术指导|特邀嘉宾|嘉宾|演唱|演奏)们?[：:]\s*(.{2,60})$/;
const ensembleSuffixPattern = /(?:交响乐团|爱乐乐团|管弦乐团|民族乐团|乐团|合唱团|歌剧院|四重奏|三重奏|五重奏|重奏团)$/;
const ensembleNamePattern = /[\u4e00-\u9fa5A-Za-z·]{2,16}(?:交响乐团|爱乐乐团|管弦乐团|民族乐团|乐团|合唱团)/;

export function parseZhongshanMusicHallPersonnel(text: string) {
  const lines = text.split(/\n|\r/).map(cleanText).filter(Boolean);
  const performers: string[] = [];
  let ensemble: string | undefined;
  for (const line of lines) {
    const match = line.match(personnelRolePattern);
    if (!match) continue;
    for (const name of match[2].split(/[、，,／/]/)) {
      const trimmed = name.trim();
      if (!/^[\u4e00-\u9fa5A-Za-z·\u00b7]{2,20}$/.test(trimmed)) continue;
      if (ensembleSuffixPattern.test(trimmed)) {
        ensemble ??= trimmed;
        continue;
      }
      if (!performers.includes(trimmed)) performers.push(trimmed);
    }
    if (performers.length >= 8) break;
  }
  if (!ensemble) {
    const groupIndex = lines.findIndex((line) => /团体介绍/.test(line));
    if (groupIndex >= 0) {
      ensemble = lines.slice(groupIndex + 1, groupIndex + 7).join("").match(ensembleNamePattern)?.[0];
    }
  }
  return { performers, ensemble };
}

function stripPerformanceForceAnnotation(title: string) {
  const match = title.match(/\s*[（(]([^（）()]*)[）)]\s*$/);
  if (match && /独奏|独唱|重奏|合奏|协奏|领奏|伴奏|与乐队|管弦乐|打击乐|合唱|朗诵/.test(match[1])) {
    return title.replace(/\s*[（(]([^（）()]*)[）)]\s*$/, "");
  }
  return title;
}

function unique<T>(values: T[]) { return Array.from(new Set(values)); }
function cleanText(value: string) { return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }

function isPerformanceRoleLabel(value: string) {
  const role = cleanText(value);
  if (role.length < 2 || role.length > 10) return false;
  return /[\u4e00-\u9fa5]{0,6}(?:独奏|独唱|领奏|领唱|吟诵|吟唱|伴奏|演奏|演唱|朗诵)$/.test(role);
}

function parsePerformanceCredits(value: string) {
  const match = cleanText(value).match(/^(.{1,10}?)[：:]\s*(.+)$/);
  if (!match || !isPerformanceRoleLabel(match[1])) return [];
  const merged: string[] = [];
  for (const token of match[2].split(/[\s、，,／/]+/).filter(Boolean)) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.length <= 2 &&
      token.length === 1 &&
      /^[一-龥]+$/.test(previous + token)
    ) {
      merged[merged.length - 1] = previous + token;
      continue;
    }
    merged.push(token);
  }
  return merged
    .map((name) => name.replace(/[（(][^（）()]*[）)]/g, "").trim())
    .filter((name) => name.length >= 2 && name.length <= 20)
    .map((name) => ({ name, role: cleanText(match[1]) }));
}
