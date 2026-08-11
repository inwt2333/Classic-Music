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
  const program = parseHarbinMaitixProgram(lines);
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

  while (index < lines.length) {
    const header = parseWorkHeader(lines[index]);
    if (!header) {
      index += 1;
      continue;
    }

    const item: ProgramItem = { composer: header.composer, title: header.title, confidence: "official" };
    const english: string[] = [];
    const movements: NonNullable<ProgramItem["movements"]> = [];
    index += 1;

    while (index < lines.length && !isWorkHeader(lines[index])) {
      const line = lines[index];
      const movement = parseMovement(line);
      if (movement) {
        const next = lines[index + 1];
        if (hasChinese(movement.title) && next && !hasChinese(next) && /[A-Za-z]{3}/.test(next)) {
          movements.push({ ...movement, alternateTitles: [cleanText(next)] });
          index += 2;
          continue;
        }
        if (next && hasChinese(next) && !isWorkHeader(next)) {
          movements.push({ number: movement.number, title: stripMovementNumber(next), alternateTitles: [movement.title] });
          index += 2;
          continue;
        }
        const following = lines[index + 2];
        if (next && !hasChinese(next) && following && hasChinese(following) && !isWorkHeader(following)) {
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
  const $ = cheerio.load(html || "");
  const elements = $("p, li").map((_, element) => cleanText($(element).text())).get().filter(Boolean);
  if (elements.length) return elements;
  return cleanText($.root().text()).split(/\n+/).map(cleanText).filter(Boolean);
}

function parseWorkHeader(line: string) {
  const normalized = cleanText(line).replace(/^【|】$/g, "");
  const bracket = normalized.match(/^(?:[一二三四五六七八九十]+|\d+)?[.、．]?\s*([^《》：:]{2,30})\s*《\s*([^》]{2,100})\s*》\s*(.*)$/);
  if (bracket) {
    const composer = cleanText(bracket[1]);
    const title = cleanText(`${bracket[2]} ${bracket[3]}`);
    if (isPlausibleComposer(composer) && looksLikeWork(title)) return { composer, title };
  }
  const numbered = normalized.match(/^(?:[一二三四五六七八九十]+|\d+)[.、．]\s*(.{2,40}?)[：:]\s*(.+)$/);
  const plain = normalized.match(/^([^：:]{2,30})[：:]\s*(.+)$/);
  const match = numbered || plain;
  if (!match) return undefined;
  const composer = cleanText(match[1]);
  const title = cleanText(match[2].replace(/[《》]/g, ""));
  if (!isPlausibleComposer(composer) || !looksLikeWork(title)) return undefined;
  return { composer, title };
}

function isWorkHeader(line: string) {
  return Boolean(parseWorkHeader(line));
}

function parseMovement(line: string): NonNullable<ProgramItem["movements"]>[number] | undefined {
  const match = cleanText(line).match(/^(?:第\s*)?((?:[IVX]+|\d+|[一二三四五六七八九十]+))(?:\s*乐章)?\s*[.、．:：]\s*(.+)$/i);
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
  return /交响曲|协奏曲|奏鸣曲|四重奏|三重奏|组曲|小品集|序曲|变奏曲|幻想曲|狂想曲|舞曲|练习曲|夜曲|前奏曲|赋格|作品|Op\.|曲$/i.test(value);
}

function isPlausibleComposer(value: string) {
  return hasChinese(value) &&
    !/^(?:演出|购票|时间|地点|票价|阵容|曲目|节目单|全称|作曲家|出版|编制|第?[一二三四五六七八九十\dIVX]+乐章)$/i.test(value) &&
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
