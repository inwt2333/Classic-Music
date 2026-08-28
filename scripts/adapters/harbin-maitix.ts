import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

export type HarbinMaitixProject = {
  projectToken?: string | number;
  projectName?: string;
  aliasName?: string;
  projectDetail?: string;
  siteName?: string;
  imgUrl?: string;
  shareImg?: string;
  eventVoList?: HarbinMaitixEvent[];
};

export type HarbinMaitixEvent = {
  eventToken?: string | number;
  eventCaption?: string;
  showTime?: number;
  showEndTime?: number;
  siteName?: string;
  priceVoList?: Array<{ price?: string | number; priceType?: number }>;
};

export function parseHarbinMaitixSeedFile(value: unknown): HarbinMaitixProject[] {
  if (!value || typeof value !== "object") throw new Error("Harbin Maitix seed file must be an object");
  const input = value as { schemaVersion?: unknown; projects?: unknown };
  if (input.schemaVersion !== 1 || !Array.isArray(input.projects)) {
    throw new Error("Harbin Maitix seed file schema is invalid");
  }
  return input.projects.map((project, index) => {
    if (!project || typeof project !== "object") throw new Error(`Harbin Maitix seed project ${index} is invalid`);
    const item = project as HarbinMaitixProject;
    if (!item.projectToken || !item.projectName || !Array.isArray(item.eventVoList)) {
      throw new Error(`Harbin Maitix seed project ${index} is incomplete`);
    }
    for (const [eventIndex, event] of item.eventVoList.entries()) {
      if (!Number.isFinite(Number(event.showTime)) || Number(event.showTime) <= 0) {
        throw new Error(`Harbin Maitix seed project ${index} event ${eventIndex} has no valid showTime`);
      }
    }
    return item;
  });
}

export function parseHarbinMaitixDetail(project: HarbinMaitixProject) {
  const lines = extractLines(project.projectDetail || "");
  const program = parseHarbinMaitixProgram(sliceProgramSection(lines));
  const cast = parseCast(lines);
  const firstWorkIndex = lines.findIndex((line) => isWorkHeader(line));
  const description = lines
    .slice(0, firstWorkIndex >= 0 ? firstWorkIndex : Math.min(lines.length, 18))
    .filter((line) => !isBoilerplate(line, project.projectName || project.aliasName || ""))
    .join("\n")
    .trim() || undefined;

  return {
    title: cleanText(project.projectName || project.aliasName || "未命名演出"),
    description,
    program,
    conductor: cast.conductor,
    performers: cast.performers,
    ensemble: cast.ensemble,
    imageUrl: project.shareImg || project.imgUrl,
    events: Array.isArray(project.eventVoList) ? project.eventVoList : [],
  };
}

export function parseHarbinMaitixProgram(input: string[] | string) {
  const lines = Array.isArray(input) ? input.map(cleanText).filter(Boolean) : extractLines(input);
  const program: ProgramItem[] = [];
  let index = 0;
  let pendingComposer: string | undefined;

  while (index < lines.length) {
    const line = cleanText(lines[index]);
    if (isHalfMarker(line)) {
      pendingComposer = undefined;
      index += 1;
      continue;
    }
    const loneComposer = parseLoneComposer(line);
    if (loneComposer) {
      pendingComposer = loneComposer;
      index += 1;
      continue;
    }
    const header = parseWorkHeader(lines[index], pendingComposer);
    if (!header) {
      index += 1;
      continue;
    }
    pendingComposer = undefined;

    const item: ProgramItem = { composer: header.composer, title: header.title, confidence: "official" };
    const english: string[] = [];
    const movements: NonNullable<ProgramItem["movements"]> = [];
    index += 1;

    while (
      index < lines.length &&
      !isWorkHeader(lines[index]) &&
      !parseLoneComposer(lines[index]) &&
      !isHalfMarker(lines[index]) &&
      !isBracketFirstLine(lines[index])
    ) {
      const line = lines[index];
      const movement = parseMovement(line);
      if (movement) {
        const next = lines[index + 1];
        const nextMovement = next ? parseMovement(next) : undefined;
        const nextIsMovement = Boolean(nextMovement && nextMovement.number !== movement.number);
        const nextIsCast = next ? /^(?:指挥|钢琴|小提琴|中提琴|大提琴|长笛|双簧管|单簧管|圆号|乐团|管弦乐团|交响乐团|合唱团|演唱|演奏|独奏|领奏|领唱|朗诵|主持人|艺术指导|女高音|女中音|男高音|男中音|男低音)[^：:]*[：:]/.test(cleanText(next)) : false;
        if (hasChinese(movement.title) && next && !hasChinese(next) && !nextIsMovement && !nextIsCast && /[A-Za-z]{3}/.test(next)) {
          movements.push({ ...movement, alternateTitles: [cleanText(next)] });
          index += 2;
          continue;
        }
        if (next && hasChinese(next) && !isWorkHeader(next) && !nextIsMovement && !nextIsCast) {
          movements.push({ number: movement.number, title: stripMovementNumber(next), alternateTitles: [movement.title] });
          index += 2;
          continue;
        }
        const following = lines[index + 2];
        if (next && !hasChinese(next) && !nextIsMovement && following && hasChinese(following) && !isWorkHeader(following) && !following.match?.(/^第\s*[一二三四五六七八九十\d]+\s*乐章/)) {
          movements.push({
            number: movement.number,
            title: stripMovementNumber(following),
            alternateTitles: [cleanText(`${movement.title} ${next}`)],
          });
          index += 3;
          continue;
        }
        movements.push(movement);
        index += 1;
        continue;
      }
      if (/^(?:指挥|钢琴|小提琴|中提琴|大提琴|长笛|双簧管|单簧管|圆号|乐团|管弦乐团|交响乐团|合唱团|演唱|演奏|独奏|领奏|领唱|朗诵|主持人|艺术指导|女高音|女中音|男高音|男中音|男低音)[^：:]*[：:]/.test(line)) {
        index += 1;
        continue;
      }
      if (/^(?:Op\.?|作品)\s*[\dA-Za-z./-]+/i.test(line) && !item.title.includes(line)) {
        item.title = `${item.title}，${line}`;
      } else if (!hasChinese(line) && /[A-Za-z]{3}/.test(line)) {
        english.push(line.replace(/:\s*$/, ""));
      }
      index += 1;
    }

    const alternateTitle = cleanText(english.join(" "));
    if (alternateTitle) item.alternateTitles = [alternateTitle];
    const opus = item.title.match(/(?:作品|Op\.?)\s*[\dA-Za-z./-]+/i)?.[0];
    if (opus) item.opus = opus;
    if (movements.length) item.movements = dedupeMovements(movements);
    program.push(item);
  }

  return dedupeProgram(program);
}

export function getHarbinMaitixPriceTiers(event: HarbinMaitixEvent) {
  return Array.from(new Set(
    (event.priceVoList || [])
      .filter((price) => price.priceType === undefined || price.priceType === 0)
      .map((price) => Number(price.price))
      .filter((price) => Number.isFinite(price) && price > 0),
  )).sort((a, b) => a - b);
}

function extractLines(html: string) {
  // 部分剧院（如江苏大剧院）的详情不用 <p>/<li>，而是 <br> 分行。
  const normalized = (html || "").replace(/<br\s*\/?>/gi, "\n");
  const $ = cheerio.load(normalized);
  const elements = $("p, li").map((_, element) => cleanText($(element).text())).get().filter(Boolean);
  if (elements.length) return elements;
  // 注意先按行切分再逐行清洗，cleanText 会把换行折叠成空格。
  return $.root().text().split(/\n+/).map(cleanText).filter(Boolean);
}

export { extractLines };

// 综合剧院（如江苏大剧院）的详情把艺术家介绍与曲目混排；
// 存在「曲目单」标记时只解析标记之后的段落，遇艺术家介绍/温馨提示等段落截止。
export function sliceProgramSection(lines: string[]) {
  const start = lines.findIndex((line) => {
    const normalized = cleanText(line).replace(/^【|】$/g, "");
    return /^曲\s*目(单)?\s*(PROGRAMME)?$/i.test(normalized);
  });
  if (start < 0) return lines;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) =>
    /^【?(艺术家介绍|演员介绍|艺术家|演出信息|温馨提示|观演须知)】?/.test(cleanText(line))
    || /^\*?\s*曲目以/.test(cleanText(line)));
  const section = end >= 0 ? rest.slice(0, end) : rest;
  return section.length ? section : lines;
}

function parseWorkHeader(line: string, pendingComposer?: string) {
  const normalized = cleanText(line).replace(/^【|】$/g, "");
  const bracketFirst = normalized.match(/^《\s*([^》]{2,100})\s*》\s*(.*)$/);
  if (bracketFirst) {
    const title = cleanText(`${bracketFirst[1]} ${bracketFirst[2]}`.replace(/[《》]/g, ""));
    const structuredAria = /选自.{0,24}(?:轻)?(?:歌剧|话剧).{0,16}(?:咏叹调|间奏曲|序曲)/.test(title);
    if (looksLikeWork(title) && (structuredAria || !isProseLine(title))) {
      const ariaComposer = title.match(/选自([一-龥·]{2,12}?)(?:轻)?(?:歌剧|话剧)/);
      return { composer: pendingComposer ?? (cleanText(ariaComposer?.[1] ?? "") || undefined), title };
    }
  }
  if (pendingComposer) {
    if (
      !/《|》|[：:]/.test(normalized) &&
      normalized.length >= 4 &&
      normalized.length <= 60 &&
      looksLikeWork(normalized) &&
      !isProseLine(normalized)
    ) {
      return { composer: pendingComposer, title: normalized };
    }
  }
  const bracket = normalized.match(/^(?:[一二三四五六七八九十]+|\d+)?[.、．]?\s*([^《》：:]{2,30})\s*《\s*([^》]{2,100})\s*》\s*(.*)$/);
  if (bracket) {
    const composer = cleanText(bracket[1]);
    const title = cleanText(`${bracket[2]} ${bracket[3]}`);
    if (isPlausibleComposer(composer) && looksLikeWork(title) && !isProseLine(title) && title.length <= 80) return { composer, title };
  }
  const numbered = normalized.match(/^(?:[一二三四五六七八九十]+|\d+)[.、．]\s*(.{2,40}?)[：:]\s*(.+)$/);
  const plain = normalized.match(/^([^：:]{2,30})[：:]\s*(.+)$/);
  const match = numbered || plain;
  if (!match) return undefined;
  const composer = cleanText(match[1]);
  const title = cleanText(match[2].replace(/[《》]/g, ""));
  if (!isPlausibleComposer(composer) || !looksLikeWork(title) || isProseLine(title)) return undefined;
  return { composer, title };
}

function isProseLine(value: string) {
  return value.length >= 30 && (value.match(/[，。；]/g) ?? []).length >= 2;
}

export function parseLoneComposer(line: string) {
  const match = cleanText(line).match(/^([^：《》\s]{2,24})[：:]\s*$/);
  return match && isPlausibleComposer(match[1]) ? cleanText(match[1]) : undefined;
}

function isHalfMarker(line: string) {
  return /^(?:上|下)半场[：:]?$/.test(cleanText(line).replace(/\s/g, ""));
}

function isBracketFirstLine(line: string) {
  return /^《[^》]{2,100}》/.test(cleanText(line));
}

function isWorkHeader(line: string) {
  return Boolean(parseWorkHeader(line));
}

function parseMovement(line: string): NonNullable<ProgramItem["movements"]>[number] | undefined {
  const named = cleanText(line).match(/^第\s*([一二三四五六七八九十\d]+)\s*乐章\s+(.+)$/);
  const match = named ?? cleanText(line).match(/^(?:第\s*)?((?:[IVX]+|\d+|[一二三四五六七八九十]+))(?:\s*乐章)?\s*[.、．:：]\s*(.+)$/i);
  if (!match || isWorkHeader(line)) return undefined;
  return { number: match[1], title: cleanText(match[2]) };
}

function stripMovementNumber(line: string) {
  return cleanText(line).replace(/^(?:[IVX]+|\d+)[.、．]\s*/i, "");
}

function parseCast(lines: string[]) {
  let conductor: string | undefined;
  let ensemble: string | undefined;
  const performers: string[] = [];
  for (const line of lines) {
    const match = line.match(/^(指挥|钢琴|小提琴|中提琴|大提琴|长笛|双簧管|单簧管|圆号|乐团|管弦乐团|交响乐团|合唱团)[：:]\s*(.+)$/);
    if (!match) continue;
    const names = match[2].split(/[、，,\/]/).map(cleanText).filter(Boolean);
    if (match[1] === "指挥") conductor = names[0];
    else if (/乐团|合唱团/.test(match[1])) ensemble = names[0];
    else performers.push(...names);
  }
  return { conductor, ensemble, performers: Array.from(new Set(performers)) };
}

function looksLikeWork(value: string) {
  return /交响曲|协奏曲|奏鸣曲|四重奏|三重奏|组曲|小品集|序曲|变奏曲|幻想曲|狂想曲|舞曲|练习曲|夜曲|前奏曲|赋格|间奏曲|谐谑曲|浪漫曲|咏叹调|选自|作品|Op\.|曲$/i.test(value);
}

function isPlausibleComposer(value: string) {
  return hasChinese(value) &&
    value.length <= (value.includes("·") ? 24 : 12) &&
    !/——/.test(value) &&
    !/^[一二三四五六七八九十\d]+[、.．]?$/.test(value) &&
    !/(?:演奏|独奏|指挥|演唱)$/.test(value) &&
    !/(?:管弦乐|协奏曲|交响曲|奏鸣曲|组曲|舞曲|重奏)$/.test(value) &&
    !/^(?:演出|购票|时间|地点|票价|阵容|曲目|节目单|全称|作曲家|出版|编制|温馨提示|观演须知|演出票|第?[一二三四五六七八九十\dIVX]+乐章)$/i.test(value) &&
    !/乐章$/.test(value);
}

function isBoilerplate(line: string, title: string) {
  return line === cleanText(title) || /^20\d{2}年\d{1,2}月\d{1,2}日/.test(line) || /^(演出时间|演出地点|曲目|节目单)[：:]?$/.test(line);
}

function hasChinese(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

function dedupeMovements(movements: NonNullable<ProgramItem["movements"]>) {
  const seen = new Set<string>();
  return movements.filter((movement) => {
    const key = `${movement.number || ""}:${movement.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeProgram(program: ProgramItem[]) {
  const seen = new Set<string>();
  return program.filter((item) => {
    const key = `${item.composer || ""}:${item.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanText(value: string) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
