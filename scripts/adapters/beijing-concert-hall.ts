import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

export function isBeijingConcertHallClassical(category: string, title: string) {
  if (/爵士|流行|摇滚|民谣|影视|动漫|亲子/.test(`${category} ${title}`)) return false;
  return /交响|室内乐|古典|钢琴|弦乐|管乐|独奏|协奏|奏鸣|歌剧|合唱|乐团|音乐季/.test(`${category} ${title}`);
}

export function parseBeijingConcertHallDetail(html: string) {
  const $ = cheerio.load((html || "").replace(/<br\s*\/?>/gi, "\n"));
  const lines = $("p, h1, h2, h3, h4, li")
    .map((_, element) => $(element).text().split(/\n+/).map(cleanText))
    .get()
    .flat()
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
    const bracketCredit = line.match(/^《([^》]+)》\s*(.+)$/);
    if (bracketCredit) {
      const rest = cleanText(bracketCredit[2]);
      const credit = rest.match(/^(.*?)(?:曲|作曲)\s*(?:[：:]\s*|(?=【))(\S.{1,40})$/);
      if (credit && cleanText(credit[2])) {
        const titleExtra = cleanText(credit[1]);
        let name = cleanText(credit[2]);
        const fromMatch = name.match(/^(.*?)[（(]\s*(选自[^）)]*)\s*[）)]$/);
        let fromSuffix = "";
        if (fromMatch) {
          name = cleanText(fromMatch[1]);
          fromSuffix = `（${fromMatch[2]}）`;
        }
        name = name.replace(/[【\[]([^】\]]*)[】\]]/g, "").trim();
        const title = cleanText(`${bracketCredit[1]}${titleExtra ? ` ${titleExtra}` : ""}${fromSuffix}`);
        program.push({ composer: name || undefined, title: stripBookTitle(title), confidence: "official" });
        continue;
      }
      if (/^(?:[一-龥]{2,8}民歌|中国传统古曲|[一-龥]{2,8}古曲|[一-龥]{2,8}曲牌)$/.test(rest)) {
        program.push({
          title: stripBookTitle(bracketCredit[1]),
          credits: [{ name: rest, role: "来源" }],
          confidence: "official",
        });
        continue;
      }
    }
    const trailingCredits = parseTrailingCreditTitle(line);
    if (trailingCredits) {
      program.push({
        composer: trailingCredits.composer,
        title: stripBookTitle(trailingCredits.title),
        credits: trailingCredits.credits.length ? trailingCredits.credits : undefined,
        confidence: "official",
      });
      continue;
    }
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

const trailingCreditRoleWords = ["作词", "填词", "作曲", "编曲", "编配", "改编", "配器", "演唱", "演奏", "词", "曲"];

function normalizeCreditSpacing(value: string) {
  return value
    .replace(/([^\s])(作词|填词|作曲|编曲|编配|改编|配器|民歌|演唱|演奏)/g, "$1 $2")
    .replace(/(作词|填词|作曲|编曲|编配|改编|配器|民歌)([\u3400-\u9fff])/g, "$1 $2");
}

function consumeCreditToken(token: string) {
  if (token === "民歌") return { name: "", role: "民歌" };
  if (trailingCreditRoleWords.includes(token)) return { name: "", role: token };
  const glued = token.match(/^([\u3400-\u9fff·、]{2,8})(作词|填词|作曲|编曲|编配|改编|配器|民歌|演唱|演奏)$/u);
  if (glued) return { name: glued[1], role: glued[2] };
  return undefined;
}

function parseTrailingCreditTitle(line: string) {
  const tokens = normalizeCreditSpacing(cleanText(line)).split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return undefined;
  const credits: NonNullable<ProgramItem["credits"]> = [];
  let composer: string | undefined;
  let end = tokens.length;
  while (end > 1 && credits.length < 4) {
    const consumed = consumeCreditToken(tokens[end - 1]);
    if (!consumed) break;
    let { name, role } = consumed;
    if (!name) {
      const previous = tokens[end - 2];
      if (
        !previous ||
        previous.length > 12 ||
        trailingCreditRoleWords.includes(previous) ||
        /交响|协奏|奏鸣|组曲|序曲|狂想|变奏|舞曲|进行曲|前奏|间奏|练习|夜曲|圆舞|合唱|重奏|幻想|随想/.test(previous)
      ) break;
      name = previous;
      end -= 2;
    } else {
      end -= 1;
    }
    if (role === "民歌") credits.unshift({ name: `${name}民歌`, role: "来源" });
    else if (role === "曲" || role === "作曲") composer ||= cleanText(name);
    else credits.unshift({ name: cleanText(name), role });
  }
  const title = tokens.slice(0, end).join(" ");
  if (!credits.length && !composer) return undefined;
  if (title.length < 2 || title.length > 60) return undefined;
  if (!/[\u3400-\u9fff]/.test(title)) return undefined;
  return { title, composer, credits };
}
function dedupe(items: ProgramItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => { const key = `${item.composer}:${item.title}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
