import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

export function isBeijingConcertHallClassical(category: string, title: string) {
  if (/爵士|流行|摇滚|民谣|影视|动漫|亲子/.test(`${category} ${title}`)) return false;
  return /交响|室内乐|古典|钢琴|弦乐|管乐|独奏|协奏|奏鸣|歌剧|合唱|乐团|音乐季/.test(`${category} ${title}`);
}

export function parseBeijingConcertHallDetail(html: string) {
  const $ = cheerio.load(html || "");
  const lines = $("p, h1, h2, h3, h4, li")
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);
  const marker = lines.findIndex((line) => /^(?:【)?(?:曲目介绍|演出曲目|节目单)(?:】)?[：:]?$/.test(line));
  const end = lines.findIndex((line, index) => index > marker && /^(?:【)?(?:阵容介绍|艺术家介绍|艺术家简介|演出介绍|主创介绍|曲目解读)(?:】)?[：:]?$/.test(line));
  const scoped = marker >= 0 ? lines.slice(marker + 1, end >= 0 ? end : lines.length) : [];
  const program: ProgramItem[] = [];

  for (const raw of scoped) {
    if (/中场休息|曲目.*为准|谢绝|购票|票价|演出时间|演出地点/.test(raw)) continue;
    if (raw.length > 120) break;
    const movement = raw.match(/^[（(](\d+)[）)]\s*(.+)$/);
    if (movement && program.length) {
      program.at(-1)!.movements ??= [];
      program.at(-1)!.movements!.push({ number: movement[1], title: stripBookTitle(movement[2]) });
      continue;
    }
    const line = raw.replace(/^\d+[.、]\s*/, "");
    if (!line || line.length > 180) continue;
    const colon = line.match(/^([^：:]{2,36})[：:]\s*(.+)$/);
    if (colon) {
      program.push({ composer: cleanText(colon[1]), title: stripBookTitle(colon[2]), confidence: "official" });
      continue;
    }
    const quoted = line.match(/^(.*?)《([^》]+)》[：:]?$/);
    if (quoted) {
      program.push({ composer: cleanText(quoted[1]) || undefined, title: quoted[2], confidence: "official" });
      continue;
    }
    const split = line.match(/^([\u3400-\u9fff·、]{2,28}(?:曲|改编)?)\s+(.+)$/);
    const leadingComposer = line.match(/^(巴赫|亨德尔|海顿|莫扎特|贝多芬|舒伯特|门德尔松|肖邦|舒曼|李斯特|勃拉姆斯|柴可夫斯基|德沃夏克|马勒|布鲁克纳|德彪西|拉威尔|拉赫玛尼诺夫|普罗科菲耶夫|肖斯塔科维奇|斯特拉文斯基|维瓦尔第)(.+)$/);
    if (!split && !leadingComposer && !/协奏曲|奏鸣曲|交响曲|序曲|组曲|变奏曲|狂想曲|帕蒂塔|小夜曲|随想曲|舞曲|练习曲|小品|BWV|Op\.|作品\d/i.test(line)) continue;
    program.push({
      composer: split ? cleanText(split[1].replace(/曲$/, "")) : leadingComposer?.[1],
      title: stripBookTitle(split?.[2] ?? leadingComposer?.[2] ?? line),
      confidence: "official",
    });
  }

  const metadata = lines.join("\n");
  const dateTime = metadata.match(/演出时间[：:]\s*([^\n]+)/)?.[1];
  const venue = metadata.match(/演出地点[：:]\s*([^\n]+)/)?.[1];
  const prices = unique(Array.from(metadata.matchAll(/(?:VIP\/)?([\d/]+)元/g)).flatMap((match) => match[1].split("/").map(Number))).sort((a, b) => a - b);
  return { program: dedupe(program), dateTime, venue, priceTiers: prices, description: undefined };
}

function stripBookTitle(value: string) { return cleanText(value.replace(/[《》]/g, "")); }
function cleanText(value: string) { return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function unique<T>(values: T[]) { return Array.from(new Set(values)); }
function dedupe(items: ProgramItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => { const key = `${item.composer}:${item.title}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
