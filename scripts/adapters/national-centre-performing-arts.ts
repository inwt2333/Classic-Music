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
  const hierarchicalProgram = parseHierarchicalProgram(lines);
  const program: ProgramItem[] = hierarchicalProgram ?? [];

  for (const line of lines) {
    if (
      !line ||
      /中场休息|以上内容|节目及演出票价|subject to change/i.test(line) ||
      /^(?:注|说明|备注|曲目说明|温馨提示)\s*[：:]/.test(line) ||
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

    if (hierarchicalProgram) continue;

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

  const sharedComposer = parseSharedComposer(lines);
  if (sharedComposer && program.length && program.every((item) => !item.composer)) {
    for (const item of program) item.composer = sharedComposer;
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

function parseHierarchicalProgram(lines: string[]) {
  type Parent = { item: ProgramItem; endIndex: number };
  const parents = new Map<number, Parent>();
  const skippedIndexes = new Set<number>();
  let hasStandaloneComposer = false;
  let hasStandaloneWork = false;
  let hasNumberedChild = false;
  let hasUnnumberedChild = false;

  for (let index = 0; index < lines.length; index += 1) {
    const inline = parseChineseWork(lines[index]);
    if (inline?.composer) {
      parents.set(index, { item: inline, endIndex: index });
      continue;
    }

    const standaloneWork = parseStandaloneWork(lines[index]);
    if (standaloneWork) {
      parents.set(index, { item: standaloneWork, endIndex: index });
      hasStandaloneWork = true;
      continue;
    }

    const nextLine = cleanText(lines[index + 1] ?? "");
    if (
      lines[index] &&
      !isProgramNote(lines[index]) &&
      !parseRole(lines[index]) &&
      !isNumberedMovement(lines[index]) &&
      isNumberedMovement(nextLine)
    ) {
      parents.set(index, {
        item: { title: cleanText(lines[index].replace(/[《》]/g, "")), confidence: "official" },
        endIndex: index,
      });
      hasStandaloneWork = true;
      continue;
    }

    const standaloneComposer = lines[index].match(/^([\p{L}·.\s]{2,40})\s+曲$/u);
    if (
      !standaloneComposer ||
      index === 0 ||
      looksLikeWork(standaloneComposer[1]) ||
      /[《》（）(),，:：]/.test(standaloneComposer[1])
    ) continue;

    let titleIndex = index - 1;
    let title = lines[titleIndex];
    if (/^第[一二三四五六七八九十\d]+册$/.test(title) && titleIndex > 0) {
      titleIndex -= 1;
      title = `${lines[titleIndex]} ${title}`;
      skippedIndexes.add(index - 1);
    }
    if (!title || parseRole(title) || isProgramNote(title)) continue;

    parents.set(titleIndex, {
      item: {
        composer: cleanText(standaloneComposer[1]),
        title: cleanText(title.replace(/[《》]/g, "")),
        confidence: "official",
      },
      endIndex: index,
    });
    skippedIndexes.add(index);
    hasStandaloneComposer = true;
  }

  const parentIndexes = [...parents.keys()].sort((a, b) => a - b);
  for (const parentIndex of parentIndexes) {
    const nextParentIndex = parentIndexes.find((value) => value > parentIndex) ?? lines.length;
    const children = lines.slice(parents.get(parentIndex)!.endIndex + 1, nextParentIndex);
    if (children.some(isNumberedMovement)) {
      hasNumberedChild = true;
    }
    if (children.some((line) =>
      !isNumberedMovement(line) &&
      !isProgramNote(line) &&
      !parseRole(line) &&
      !/^(?:(?:20\d{2})年)?\d{1,2}月\d{1,2}日/.test(line)
    )) hasUnnumberedChild = true;
  }
  if (!parents.size || (!hasStandaloneComposer && !hasStandaloneWork && !hasNumberedChild && !hasUnnumberedChild)) {
    return undefined;
  }

  const program: ProgramItem[] = [];
  for (let parentPosition = 0; parentPosition < parentIndexes.length; parentPosition += 1) {
    const parentIndex = parentIndexes[parentPosition];
    const parent = parents.get(parentIndex)!;
    const nextParentIndex = parentIndexes[parentPosition + 1] ?? lines.length;
    const movements: NonNullable<ProgramItem["movements"]> = [];

    for (let index = parent.endIndex + 1; index < nextParentIndex; index += 1) {
      const line = lines[index];
      if (skippedIndexes.has(index) || !line || isProgramNote(line) || parseRole(line)) continue;

      const numbered = parseNumberedMovement(line);
      if (numbered) movements.push(numbered);
      else movements.push({ title: cleanText(line.replace(/[《》]/g, "")) });
    }

    if (movements.length) parent.item.movements = movements;
    program.push(parent.item);
  }
  return dedupeProgram(program);
}

function parseNumberedMovement(line: string) {
  const named = line.match(/^第([一二三四五六七八九十\d]+)乐章[：:、]?\s*(.+)$/);
  if (named) return { number: named[1], title: cleanText(named[2]) };
  const numbered = line.match(/^([一二三四五六七八九十\d]+)[.．、]\s*(.+)$/);
  return numbered ? { number: numbered[1], title: cleanText(numbered[2]) } : undefined;
}

function isNumberedMovement(line: string) {
  return Boolean(parseNumberedMovement(line));
}

function isProgramNote(line: string) {
  return /中场(?:休息)?|以上内容|节目及演出票价|subject to change/i.test(line) ||
    /^(?:上|下)半场(?:[：:].*)?$/.test(line) ||
    /^(?:取材自|作曲|艺术顾问)\s*[：:]?/.test(line) ||
    /联合创作/.test(line) ||
    /^(?:注|说明|备注|曲目说明|温馨提示)\s*[：:]/.test(line) ||
    /^[-—–\s]+$/.test(line);
}

function parseSharedComposer(lines: string[]) {
  const composerLine = lines.find((line) => /^作曲\s*[：:]/.test(line));
  if (!composerLine) return undefined;
  const names = composerLine
    .replace(/^作曲\s*[：:]\s*/, "")
    .split(/[、，,]/)
    .map((name) => cleanText(name.replace(/[（(][^）)]*[）)]/g, "")))
    .filter(Boolean);
  return names.length ? unique(names).join("、") : undefined;
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
    /^(指挥|钢琴|小提琴|中提琴|大提琴|二胡|京胡|京二胡|古筝|琵琶|笛子|箫|唢呐|扬琴|打击乐|大阮|中阮|柳琴|阮|笙|板胡|女高音|女中音|男高音|男中音|男低音|独唱|合唱|演奏|公爵|众臣|弄臣|(?:[\u3400-\u9fff]{0,8})(?:独奏|领奏|领唱|演唱|伴奏|朗诵|导聆))[：:]\s*(.+)$/,
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
    isProgramNote(line) ||
    /^(作曲|改编|编曲|指挥|钢琴|小提琴|中提琴|大提琴|二胡|京胡|京二胡|古筝|琵琶|笛子|箫|唢呐|扬琴|打击乐|大阮|中阮|柳琴|阮|笙|板胡|女高音|女中音|男高音|男中音|男低音|独唱|合唱|演奏|公爵|众臣|弄臣|(?:[\u3400-\u9fff]{0,8})(?:独奏|领奏|领唱|演唱|伴奏|朗诵|导聆))[：:]/.test(
      line,
    ) ||
    /^[\p{L}·\s]{2,30}\s+改编$/u.test(line)
  ) {
    return undefined;
  }

  let value = cleanText(line);
  let composer: string | undefined;
  const suffixComposer = value.match(
    /^(.+?)\s+([\p{L}·.、，,\-]{2,40})\s+曲(?:\s+[\p{L}·.、，,\-]{2,40}\s+(?:编曲|编配|改编|配器))?$/u,
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

function parseStandaloneWork(line: string): ProgramItem | undefined {
  if (!/《[^》]+》/.test(line)) return undefined;
  if (!/(?:选自|协奏曲|与乐队|曲牌|\s(?:曲|编曲|编配|改编|配器)(?:\s|$))/.test(line)) return undefined;
  return {
    title: cleanText(line.replace(/[《》]/g, "")),
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
