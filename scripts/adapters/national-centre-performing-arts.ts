import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

type NcpaContent = {
  type?: string;
  content?: string;
};

type NcpaIntroduction = {
  type?: string;
  contents?: NcpaContent[];
};

export function parseNcpaDetail(detail: Record<string, any>, sessionDate?: string) {
  const programIntroduction = (detail.introduce as NcpaIntroduction[] | undefined)?.find(
    (item) => item.type === "70",
  );
  const allProgramLines = (programIntroduction?.contents ?? []).flatMap((content) =>
    htmlLines(content.content ?? ""),
  );
  const lines = selectNcpaProgramLines(allProgramLines, sessionDate);
  const performers: string[] = [];
  let conductor: string | undefined;
  const program: ProgramItem[] = [];

  for (const line of lines) {
    if (
      !line ||
      /中场休息|以上内容|节目及演出票价|subject to change/i.test(line) ||
      /^[-—–\s]+$/.test(line)
    ) {
      continue;
    }

    const role = parseRole(line);
    if (role) {
      performers.push(...role.names);
      if (role.conductor) conductor = role.names[0];
      continue;
    }

    const movement = line.match(/^第([一二三四五六七八九十\d]+)乐章[：:、]?\s*(.+)$/);
    if (movement && program.length) {
      const current = program.at(-1)!;
      current.movements = [
        ...(current.movements ?? []),
        { number: movement[1], title: cleanText(movement[2]) },
      ];
      continue;
    }

    const item = parseChineseWork(line);
    if (item) program.push(item);
  }

  const descriptionIntroduction = (detail.introduce as NcpaIntroduction[] | undefined)?.find(
    (item) => item.type === "20",
  );
  const description = descriptionIntroduction?.contents
    ?.flatMap((content) => htmlLines(content.content ?? ""))
    .filter(Boolean)
    .join("\n\n");

  return {
    conductor,
    performers: unique(performers),
    program: dedupeProgram(program),
    description: description || undefined,
  };
}

function selectNcpaProgramLines(lines: string[], sessionDate?: string) {
  const targetDate = sessionDate?.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (!targetDate) return lines;

  const commonLines: string[] = [];
  const sections: Array<{
    year?: number;
    month: number;
    day: number;
    lines: string[];
  }> = [];
  let currentSection: (typeof sections)[number] | undefined;

  for (const line of lines) {
    const heading = line.match(/^(?:(20\d{2})年)?(\d{1,2})月(\d{1,2})日/);
    if (heading) {
      currentSection = {
        year: heading[1] ? Number(heading[1]) : undefined,
        month: Number(heading[2]),
        day: Number(heading[3]),
        lines: [],
      };
      sections.push(currentSection);
      continue;
    }

    if (currentSection) currentSection.lines.push(line);
    else commonLines.push(line);
  }

  if (!sections.length) return lines;
  const year = Number(targetDate[1]);
  const month = Number(targetDate[2]);
  const day = Number(targetDate[3]);
  const selected = sections.find(
    (section) =>
      section.month === month &&
      section.day === day &&
      (section.year === undefined || section.year === year),
  );

  return selected ? [...commonLines, ...selected.lines] : lines;
}

export function parseNcpaPriceTiers(session: Record<string, any>) {
  const prices = (Array.isArray(session.sessionPrices) ? session.sessionPrices : [])
    .flatMap((item: Record<string, any>) => {
      const matches = String(item.name ?? item.price ?? "").match(/\d+(?:\.\d+)?/g);
      return matches?.length ? [Number(matches[0])] : [];
    })
    .filter((price: number) => Number.isFinite(price) && price > 0);
  return unique(prices).sort((a, b) => a - b);
}

function htmlLines(html: string) {
  const withBreaks = (html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n</p>");
  const $ = cheerio.load(withBreaks);
  return $.text()
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean);
}

function parseRole(line: string) {
  const match = line.match(
    /^(指挥|钢琴|小提琴|中提琴|大提琴|女高音|女中音|男高音|男中音|男低音|独唱|合唱|演奏|公爵|众臣|弄臣|(?:[\u3400-\u9fff]{0,8})(?:独奏|领奏|领唱|演唱|伴奏|朗诵|导聆))[：:]\s*(.+)$/,
  );
  if (!match) return undefined;
  return {
    conductor: match[1] === "指挥",
    names: match[2]
      .split(/[、，,\/]/)
      .map(cleanText)
      .filter(Boolean),
  };
}

function parseChineseWork(line: string): ProgramItem | undefined {
  if (line.length < 3 || line.length > 180 || /^[（(]?\d+[）).、]/.test(line)) return undefined;
  if (
    /^(作曲|改编|编曲|指挥|钢琴|小提琴|中提琴|大提琴|女高音|女中音|男高音|男中音|男低音|独唱|合唱|演奏|公爵|众臣|弄臣|(?:[\u3400-\u9fff]{0,8})(?:独奏|领奏|领唱|演唱|伴奏|朗诵|导聆))[：:]/.test(
      line,
    ) ||
    /^[\p{L}·\s]{2,30}\s+改编$/u.test(line)
  ) {
    return undefined;
  }

  let value = cleanText(line);
  let composer: string | undefined;
  const suffixComposer = value.match(
    /^(.+?)\s+([\u3400-\u9fff·]{2,24})\s+曲(?:\s+[\u3400-\u9fff·]{2,24}\s+改编)?$/,
  );
  const prefixComposer = value.match(/^([\u3400-\u9fff·]{2,24})[：:]\s*(.+)$/);

  if (suffixComposer) {
    value = cleanText(suffixComposer[1]);
    composer = cleanText(suffixComposer[2]);
  } else if (prefixComposer) {
    composer = cleanText(prefixComposer[1]);
    value = cleanText(prefixComposer[2]);
  }

  if (!composer && !looksLikeWork(value)) return undefined;
  const opus = value.match(/(?:作品|Op\.?)\s*([\dA-Za-z./-]+)/i)?.[0];
  return {
    composer,
    title: cleanText(value.replace(/[《》]/g, "")),
    opus,
    confidence: "official",
  };
}

function looksLikeWork(value: string) {
  return /交响曲|协奏曲|序曲|组曲|乐章|狂想曲|变奏曲|奏鸣曲|四重奏|五重奏|圆舞曲|进行曲|歌曲|咏叹调|清唱剧|交响合唱|随想曲|夜曲|舞曲|幻想曲|赋格|前奏曲|练声曲|Op\.|作品\d/i.test(
    value,
  );
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
