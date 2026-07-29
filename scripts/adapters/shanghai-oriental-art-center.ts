import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

type ContentBlock = {
  text: string;
};

type ParseOptions = {
  showDate?: Date;
  confidence?: ProgramItem["confidence"];
};

const boilerplatePattern =
  /请留意确认所购场次和票档|迟到或中途离场|曲目以现场为准|曲目及顺序以现场为准|programs? (?:is|are)? ?subject to change|开演无短信提醒服务/i;
const programFooterPattern =
  /曲目(?:及顺序)?以现场|programs? (?:is|are)? ?subject to change|主办方保留更换曲目|艺术家简介|演奏家介绍|演出阵容|主办单位|温馨提示|购票须知/i;
const rolePattern =
  /^(指\s*挥|演\s*奏|演\s*唱|钢琴|小提琴|中提琴|大提琴|低音提琴|长笛|双簧管|单簧管|大管|圆号|小号|长号|打击乐|竖琴|吉他|管风琴|男高音|男中音|低男中音|男低音|女高音|女中音|女低音|独唱|独奏|合唱|乐团|管弦乐团)\s*[|｜:：]\s*(.+)$/i;
const dateMarkerPattern = /^(20\d{2})[./-](\d{1,2})[./-](\d{1,2})(?:\s+\d{1,2}:\d{2})?/;

export function parseOrientalArtCenterContent(html: string, options: ParseOptions = {}) {
  const blocks = htmlToBlocks(html);
  const heading = findProgramHeading(blocks);
  const cast = parseCast(blocks);
  const imageUrls = extractOrientalArtCenterImageUrls(html);

  if (!heading) {
    return {
      program: [] as ProgramItem[],
      description: buildDescription(blocks),
      imageUrls,
      hasProgramHeading: false,
      ...cast,
    };
  }

  const afterHeading = blocks.slice(heading.index + 1);
  const footerIndex = afterHeading.findIndex((block) => programFooterPattern.test(block.text));
  const programBlocks = footerIndex >= 0 ? afterHeading.slice(0, footerIndex) : afterHeading;
  if (heading.firstProgramLine) {
    programBlocks.unshift({ text: heading.firstProgramLine });
  }
  const descriptionBlocks = [
    ...blocks.slice(0, heading.index),
    ...(footerIndex >= 0 ? afterHeading.slice(footerIndex + 1) : []),
  ];

  return {
    program: parseProgram(programBlocks, options),
    description: buildDescription(descriptionBlocks),
    imageUrls,
    hasProgramHeading: true,
    ...cast,
  };
}

export function parseOrientalArtCenterOcrText(text: string, options: ParseOptions = {}) {
  const blocks = text
    .split(/\r?\n+/)
    .map((line) => ({ text: cleanText(line) }))
    .filter((block) => block.text);
  const heading = findProgramHeading(blocks);
  if (!heading) return [] as ProgramItem[];

  const afterHeading = blocks.slice(heading.index + 1);
  const footerIndex = afterHeading.findIndex((block) => programFooterPattern.test(block.text));
  const programBlocks = footerIndex >= 0 ? afterHeading.slice(0, footerIndex) : afterHeading;
  if (heading.firstProgramLine) {
    programBlocks.unshift({ text: heading.firstProgramLine });
  }

  return parseProgram(programBlocks, { ...options, confidence: "ocr" });
}

export function extractOrientalArtCenterImageUrls(html: string) {
  if (!html) return [] as string[];
  const $ = cheerio.load(html);
  return Array.from(
    new Set(
      $("img")
        .map((_, image) => $(image).attr("src") || $(image).attr("data-src") || "")
        .get()
        .map((url) => url.trim())
        .filter((url) => /^https?:\/\//i.test(url)),
    ),
  );
}

export function parseOrientalArtCenterPrices(
  shows: Array<Record<string, any>>,
  detail?: Record<string, any>,
) {
  const priceTiers = Array.from(
    new Set(
      shows.flatMap((show) =>
        (Array.isArray(show.ticketPriceList) ? show.ticketPriceList : [])
          .map((row: Record<string, any>) => Number(row.basisPrice ?? row.actuallyPrice ?? row.price))
          .filter((price: number) => Number.isFinite(price) && price >= 0),
      ),
    ),
  ).sort((a, b) => a - b);

  if (!priceTiers.length && detail) {
    for (const value of [detail.minPrice, detail.maxPrice]) {
      const price = Number(value);
      if (Number.isFinite(price) && price >= 0 && !priceTiers.includes(price)) {
        priceTiers.push(price);
      }
    }
    priceTiers.sort((a, b) => a - b);
  }

  if (!priceTiers.length) return {};
  if (priceTiers.length === 1) {
    return { price: formatPrice(priceTiers[0]), priceTiers };
  }

  return {
    price: `${formatPrice(priceTiers[0])} - ${formatPrice(priceTiers[priceTiers.length - 1])}`,
    priceTiers,
  };
}

function findProgramHeading(blocks: ContentBlock[]) {
  for (let index = 0; index < blocks.length; index += 1) {
    const line = cleanText(blocks[index].text);
    if (boilerplatePattern.test(line)) continue;

    const match = line.match(
      /^[【[]?\s*(?:本次)?(?:交响)?(?:音乐会)?(?:演出)?(?:精选)?(?:节目单|曲目单|曲目)\s*[】\]]?\s*(?:PROGRAMMES?|PROGRAMS?|PRGORAM)?\s*[:：]?\s*(.*)$/i,
    );
    if (!match) continue;

    const tail = cleanText(match[1] || "");
    const firstProgramLine =
      tail && !/^[（(]/.test(tail) && !/以演出|以现场|分钟|无中场/i.test(tail) ? tail : undefined;
    return { index, firstProgramLine };
  }
  return undefined;
}

function parseCast(blocks: ContentBlock[]) {
  const performers: string[] = [];
  let conductor: string | undefined;
  let ensemble: string | undefined;

  for (const block of blocks) {
    const match = matchRoleLine(block.text);
    if (!match) continue;

    const role = match.role.replace(/\s+/g, "");
    const names = splitNames(stripPerformerDetails(match.value));
    if (/指挥/.test(role)) conductor = names[0];
    if (/乐团/.test(role)) ensemble = names.join("、");
    performers.push(...names);
  }

  return {
    conductor,
    ensemble,
    performers: Array.from(new Set(performers)).filter(Boolean),
  };
}

function parseProgram(blocks: ContentBlock[], options: ParseOptions) {
  const confidence = options.confidence ?? "official";
  const targetDate = options.showDate ? chinaDateKey(options.showDate) : undefined;
  const hasDateSections = blocks.some((block) => dateMarkerPattern.test(cleanText(block.text)));
  const alternatingCreditFormat = isAlternatingTitleCreditFormat(blocks);
  const inlineTitleCreditFormat = isInlineTitleCreditFormat(blocks);
  const labeledProgramFormat =
    blocks.filter((block) => parseLabeledWork(cleanText(block.text), confidence)).length >= 3;
  if (alternatingCreditFormat) {
    return parseAlternatingTitleCreditProgram(blocks, targetDate, hasDateSections, confidence);
  }

  const program: ProgramItem[] = [];
  let activeDate: string | undefined;
  let currentComposer: string | undefined;
  let currentWork: ProgramItem | undefined;
  let previousSourceLine: string | undefined;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const line = cleanText(block.text);
    if (!line || isSeparator(line) || boilerplatePattern.test(line)) continue;

    const dateMarker = parseDateMarker(line);
    if (dateMarker) {
      activeDate = dateMarker;
      currentComposer = undefined;
      currentWork = undefined;
      previousSourceLine = undefined;
      continue;
    }
    if (hasDateSections && targetDate && activeDate !== targetDate) continue;

    if (matchRoleLine(line) || isCastOrCreditLine(line)) continue;
    if (
      confidence !== "ocr" &&
      previousSourceLine &&
      /[\u3400-\u9fff]/.test(previousSourceLine) &&
      isEnglishTranslation(line)
    ) {
      continue;
    }
    previousSourceLine = line;

    const bracketWork = parseBracketWork(line, confidence);
    if (bracketWork) {
      currentComposer = bracketWork.composer;
      currentWork = bracketWork;
      program.push(currentWork);
      continue;
    }

    const labeledWork = parseLabeledWork(line, confidence);
    if (labeledWork) {
      currentComposer = labeledWork.composer;
      currentWork = labeledWork;
      program.push(currentWork);
      continue;
    }
    if (labeledProgramFormat) continue;

    const inline = line.match(/^(.{1,80}?)\s*[|｜∣]\s*(.+)$/);
    if (inline) {
      const left = cleanText(inline[1]);
      const right = cleanText(inline[2]);
      if (inlineTitleCreditFormat || looksLikeWorkCredits(right)) {
        const title = cleanProgramTitle(left);
        if (!title) continue;
        const composer = parseComposerFromCredit(right);
        currentComposer = composer;
        currentWork = { composer, title, confidence };
      } else {
        const composer = cleanComposer(left);
        const title = cleanProgramTitle(right);
        if (!composer || !title) continue;
        currentComposer = composer;
        currentWork = { composer, title, confidence };
      }
      program.push(currentWork);
      continue;
    }

    const colonWork = parseColonWork(line, confidence);
    if (colonWork) {
      currentComposer = colonWork.composer;
      currentWork = colonWork;
      program.push(currentWork);
      continue;
    }

    const movements = parseMovements(line);
    if (currentWork && movements.length && isMovementParent(currentWork.title)) {
      currentWork.movements ??= [];
      currentWork.movements.push(...movements);
      continue;
    }

    const composerHeading = parseComposerHeading(line);
    if (
      composerHeading &&
      (!currentWork ||
        !isMovementParent(currentWork.title) ||
        isComposerHeadingBeforeBilingualWork(blocks, index))
    ) {
      currentComposer = composerHeading;
      currentWork = undefined;
      continue;
    }

    const title = cleanProgramTitle(stripLeadingWorkNumber(line));
    if (!title || looksLikeBiography(title)) continue;
    if (
      currentWork &&
      isMovementParent(currentWork.title) &&
      isUnnumberedBilingualMovement(blocks, index, line)
    ) {
      currentWork.movements ??= [];
      currentWork.movements.push({ title });
      continue;
    }
    const plainTitles =
      !currentComposer && /[；;]/.test(title)
        ? title
            .split(/[；;]/)
            .map((part) => cleanProgramTitle(part))
            .filter(Boolean)
        : [title];
    for (const plainTitle of plainTitles) {
      currentWork = { composer: currentComposer, title: plainTitle, confidence };
      program.push(currentWork);
    }
  }

  return dedupeConsecutiveProgram(program);
}

function parseBracketWork(line: string, confidence: ProgramItem["confidence"]) {
  const bracketIndex = line.indexOf("《");
  const prefix = bracketIndex >= 0 ? line.slice(0, bracketIndex) : "";
  const numberedComposerPrefix =
    /^\s*\d{1,3}\s*[.、．)）:：]\s*[^:：]{2,30}\s*[:：]\s*$/.test(prefix);
  const performancePrefix = /独奏|独唱|合奏|交响乐团|管弦乐团|指\s*挥/.test(prefix);
  if (
    bracketIndex < 0 ||
    /[|｜∣]/.test(prefix) ||
    (numberedComposerPrefix && !performancePrefix) ||
    (!/^\s*\d{1,3}\s*[.、．)）:：]/.test(line) &&
      !/(?:独奏|独唱|合奏|交响乐团|管弦乐团|指\s*挥)\s*[:：&]?/.test(prefix))
  ) {
    return undefined;
  }
  const stripped = stripLeadingWorkNumber(line);
  const match = stripped.match(/^(.*?)《\s*([^》]+?)\s*》(.*)$/);
  if (!match) return undefined;

  const inside = cleanText(match[2]);
  const trailing = cleanText(match[3]);
  const split = splitComposerAndWork(inside);
  const title = cleanProgramTitle([split.title, trailing].filter(Boolean).join(" "));
  if (!title) return undefined;
  return {
    composer: split.composer,
    title,
    confidence,
  } satisfies ProgramItem;
}

function splitComposerAndWork(value: string) {
  const hyphen = value.match(/^((?:老|小)?约翰·施特劳斯)\s*[-–—]\s*(.+)$/);
  if (hyphen) {
    return { composer: cleanComposer(hyphen[1]), title: hyphen[2] };
  }

  const separatorIndex = value.search(/[·:：]/);
  if (separatorIndex > 0 && separatorIndex < 24) {
    return {
      composer: cleanComposer(value.slice(0, separatorIndex)),
      title: cleanText(value.slice(separatorIndex + 1)),
    };
  }
  return { title: value };
}

function parseColonWork(line: string, confidence: ProgramItem["confidence"]) {
  const match = stripLeadingWorkNumber(line).match(/^([^:：]{2,30})\s*[:：]\s*(.+)$/);
  if (
    !match ||
    /[《》]|(?:描绘|抒发|原是|原曲|作品|曲谱|创作|取材)/.test(match[1]) ||
    /^(演奏|演唱|指挥|钢琴|小提琴|大提琴)$/.test(match[1].replace(/\s+/g, ""))
  ) {
    return undefined;
  }
  const composer = cleanComposer(match[1]);
  let rawTitle = cleanText(match[2]);
  if (rawTitle.startsWith("《")) {
    const closingIndex = rawTitle.indexOf("》");
    if (closingIndex > 0) {
      rawTitle = `${rawTitle.slice(1, closingIndex)} ${rawTitle.slice(closingIndex + 1)}`;
    }
  }
  const title = cleanProgramTitle(rawTitle);
  return composer && title ? ({ composer, title, confidence } satisfies ProgramItem) : undefined;
}

function parseLabeledWork(
  line: string,
  confidence: ProgramItem["confidence"],
): ProgramItem | undefined {
  const opening = line.match(/^开场\s*[:：]\s*《\s*([^》]+)\s*》(.*)$/);
  if (opening) {
    const title = cleanProgramTitle(opening[1]);
    return title ? ({ title, confidence } satisfies ProgramItem) : undefined;
  }

  const numbered = line.match(/^【[壹贰叁肆伍陆柒捌玖拾百一二三四五六七八九十]+】\s*(.+)$/);
  if (!numbered) return undefined;
  const title = cleanProgramTitle(numbered[1]);
  return title ? ({ title, confidence } satisfies ProgramItem) : undefined;
}

function parseAlternatingTitleCreditProgram(
  blocks: ContentBlock[],
  targetDate: string | undefined,
  hasDateSections: boolean,
  confidence: ProgramItem["confidence"],
) {
  const lines: string[] = [];
  let activeDate: string | undefined;
  for (const block of blocks) {
    const line = cleanText(block.text);
    const dateMarker = parseDateMarker(line);
    if (dateMarker) {
      activeDate = dateMarker;
      continue;
    }
    if (hasDateSections && targetDate && activeDate !== targetDate) continue;
    if (
      !line ||
      isSeparator(line) ||
      boilerplatePattern.test(line) ||
      matchRoleLine(line) ||
      isCastOrCreditLine(line) ||
      isEnglishTranslation(line)
    ) {
      continue;
    }
    lines.push(line);
  }

  const program: ProgramItem[] = [];
  for (let index = 0; index < lines.length; index += 2) {
    const title = cleanProgramTitle(lines[index]);
    if (title) program.push({ title, confidence });
  }
  return dedupeConsecutiveProgram(program);
}

function parseMovements(line: string) {
  const normalized = cleanText(line);
  const matches = Array.from(
    normalized.matchAll(
      /(?:^|[；;]\s*)(\d{1,2}(?:-\d{1,2})?|[IVXⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)\s*[)）.、．:：]\s*([^；;]+)/gi,
    ),
  );
  if (matches.length) {
    return matches
      .map((match) => ({ number: match[1], title: cleanProgramTitle(match[2]) }))
      .filter((movement) => movement.title);
  }

  const dash = normalized.match(/^[—–-]\s*(.+)$/);
  if (!dash) return [];
  const title = cleanProgramTitle(dash[1]);
  return title ? [{ title }] : [];
}

function buildDescription(blocks: ContentBlock[]) {
  const paragraphs = blocks
    .map((block) => cleanText(block.text))
    .filter(
      (text) =>
        text &&
        !isSeparator(text) &&
        !boilerplatePattern.test(text) &&
        !matchRoleLine(text) &&
        !/^艺术家简介$/i.test(text) &&
        !isEnglishTranslation(text),
    );

  return paragraphs.length ? Array.from(new Set(paragraphs)).join("\n\n") : undefined;
}

function htmlToBlocks(html: string): ContentBlock[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const blocks: ContentBlock[] = [];

  $("p, li, h1, h2, h3, h4").each((_, element) => {
    const node = $(element);
    if (node.parents("p, li, h1, h2, h3, h4").length) return;
    const fragment = node.html()?.replace(/<br\s*\/?\s*>/gi, "\n") || node.text();
    const lines = cheerio.load(fragment).text().split(/\n+/);
    for (const line of lines) {
      const text = cleanText(line);
      if (text) blocks.push({ text });
    }
  });

  if (blocks.length) return blocks;
  return cheerio
    .load(html.replace(/<br\s*\/?\s*>/gi, "\n"))
    .text()
    .split(/\n+/)
    .map((text) => ({ text: cleanText(text) }))
    .filter((block) => block.text);
}

function parseComposerHeading(line: string) {
  const match = line.match(/^([\u3400-\u9fff·\-—]{2,24})(?:\s+[A-Za-zÀ-ž][A-Za-zÀ-ž .'\-]+)+$/);
  return match ? cleanComposer(match[1]) : undefined;
}

function parseDateMarker(line: string) {
  const match = line.match(dateMarkerPattern);
  if (!match) return undefined;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function isMovementParent(title: string) {
  if (/选自《[^》]+》组曲/.test(title)) return false;
  return /组曲|交响曲|协奏曲|奏鸣曲|小夜曲|帕蒂塔|三重奏|四重奏|五重奏|六重奏|七重奏|八重奏|九重奏|变奏曲|清唱剧|芭蕾|幻想曲|前奏曲集|随想曲集|选曲|选段|童年情景|即兴曲四首|俄罗斯歌曲连唱/.test(
    title,
  );
}

function cleanComposer(value: string) {
  const cleaned = cleanText(value)
    .replace(/\s+[A-Za-zÀ-ž][A-Za-zÀ-ž .'\-]+.*$/, "")
    .replace(/^(?:作曲|作品)\s*[|｜:：]?/, "")
    .replace(/[|｜∣:：]+$/, "")
    .replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/g, "$1$2")
    .trim();
  return cleaned === "圣桑" ? "圣-桑" : cleaned;
}

function cleanProgramTitle(value: string) {
  let cleaned = cleanText(value)
    .replace(/^[—–-]\s*/, "")
    .replace(/\s*[|｜∣]+\s*$/, "")
    .trim();
  if (/[\u3400-\u9fff]/.test(cleaned)) {
    cleaned = cleaned
      .replace(/\s*[“"][A-ZÀ-Þ][^”"]*(?:[”"]|$).*$/, "")
      .replace(/\s+\d{2,4}['’]s\s+[A-Za-zÀ-ž][A-Za-zÀ-ž ,.'’"()\-:;!?&]+$/, "")
      .replace(
        /(?<=[\u3400-\u9fff）】》])\s*[A-ZÀ-Þ][A-Za-zÀ-ž ,，.'’"()\-:;!?&]{3,}$/,
        "",
      )
      .replace(/\s+[A-ZÀ-Þ][A-Za-zÀ-ž0-9 ,，.'’"()\-:;!?&]+$/, "")
      .trim();
  }
  if (cleaned.length < 1 || cleaned.length > 180) return "";
  return cleaned;
}

function stripLeadingWorkNumber(value: string) {
  return cleanText(value).replace(/^\d{1,3}\s*[.、．)）:：]\s*/, "");
}

function stripPerformerDetails(value: string) {
  return cleanText(value)
    .split(/(?:钢琴|小提琴|中提琴|大提琴|声乐|指挥|吉他|管风琴)导师\s*[:：]/)[0]
    .replace(/[A-Za-zÀ-ž][A-Za-zÀ-ž .'\-]*$/, "")
    .replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/g, "$1$2")
    .trim();
}

function isEnglishTranslation(value: string) {
  const cjkCount = (value.match(/[\u3400-\u9fff]/g) || []).length;
  const latinCount = (value.match(/[A-Za-zÀ-ž]/g) || []).length;
  return cjkCount === 0 && latinCount >= 3;
}

function isAlternatingTitleCreditFormat(blocks: ContentBlock[]) {
  const credits = blocks.filter((block) => looksLikePersonCredit(block.text));
  return credits.length >= 3 && credits.filter((block) => /&/.test(block.text)).length >= 2;
}

function isInlineTitleCreditFormat(blocks: ContentBlock[]) {
  return (
    blocks.filter((block) => {
      const match = cleanText(block.text).match(/^(.{1,80}?)\s*[|｜∣]\s*(.+)$/);
      return match && looksLikeWorkCredits(match[2]);
    }).length >= 2
  );
}

function looksLikePersonCredit(value: string) {
  const line = cleanText(value);
  if (
    /[|｜∣《》]/.test(line) ||
    /^\d{1,3}\s*[.、．)）:：]/.test(line) ||
    /独奏|独唱|合奏|交响乐团|管弦乐团/.test(line) ||
    looksLikeWorkCredits(line)
  ) {
    return false;
  }
  if (/&/.test(line) && /[\u3400-\u9fff]/.test(line)) return true;
  return /^[\u3400-\u9fff·\s]{2,24}\s+[A-ZÀ-Þ][A-Za-zÀ-ž .'\-]{3,60}$/.test(line);
}

function looksLikeWorkCredits(value: string) {
  return /(?:^|\s)(?:原?词|曲|作曲|编曲|改编|词\/曲|词、曲|词，曲)\s*[:：]?(?:\s|[\u3400-\u9fff]|$)/.test(
    value,
  );
}

function parseComposerFromCredit(value: string) {
  const line = cleanText(value);
  const labeled = line.match(
    /(?:^|\s)(?:曲|作曲)\s*[:：]\s*(.+?)(?=[，,\s]+(?:词|编曲|改编)\s*[:：]|$)/,
  );
  if (labeled) {
    const composer = cleanComposer(labeled[1].replace(/[，,、；;]+$/, ""));
    return composer || undefined;
  }
  if (/^(?:词|编曲|改编)\s*[:：]/.test(line)) return undefined;
  if (/^[\u3400-\u9fff·\-—\s]{2,30}$/.test(line)) {
    const composer = cleanComposer(line);
    return composer || undefined;
  }
  return undefined;
}

function isUnnumberedBilingualMovement(blocks: ContentBlock[], index: number, line: string) {
  if (!/[\u3400-\u9fff]/.test(line) || parseMovements(line).length) {
    return false;
  }
  if (
    /(?:BWV|Hob\.|K\.?\s*\d|KV\s*\d|D\.?\s*\d|S\.?\s*\d|Op\.?\s*\d|作品\s*\d)/i.test(line) ||
    /组曲|交响曲|协奏曲|奏鸣曲|小夜曲|帕蒂塔|三重奏|四重奏|五重奏|变奏曲|幻想曲/.test(line)
  ) {
    return false;
  }
  if (/[\u3400-\u9fff].*\s+(?:[A-Z0-9][A-Za-zÀ-ž0-9 ,.'’"()\-:;!?&]{3,})$/.test(line)) {
    return true;
  }

  for (let nextIndex = index + 1; nextIndex < blocks.length; nextIndex += 1) {
    const nextLine = cleanText(blocks[nextIndex].text);
    if (!nextLine || isSeparator(nextLine)) continue;
    return isEnglishTranslation(nextLine);
  }
  return false;
}

function isComposerHeadingBeforeBilingualWork(blocks: ContentBlock[], index: number) {
  const following: string[] = [];
  for (let nextIndex = index + 1; nextIndex < blocks.length && following.length < 2; nextIndex += 1) {
    const nextLine = cleanText(blocks[nextIndex].text);
    if (!nextLine || isSeparator(nextLine)) continue;
    following.push(nextLine);
  }
  return (
    following.length === 2 &&
    /[\u3400-\u9fff]/.test(following[0]) &&
    isEnglishTranslation(following[1])
  );
}

function isCastOrCreditLine(value: string) {
  return /^(?:钢琴|小提琴|中提琴|大提琴|吉他|声乐|指挥)导师\s*[:：]/.test(value) ||
    /^(?:全体|谢幕)/.test(value);
}

function matchRoleLine(value: string) {
  const match = cleanText(value).match(rolePattern);
  return match ? { role: match[1], value: match[2] } : undefined;
}

function looksLikeBiography(value: string) {
  return value.length > 90 ||
    /出生于|毕业于|现任|曾任|曾参与|荣获|获奖|艺术家|乐团成立于|音乐生涯|职业生涯|常年活跃|国际巡演|演出场所|描绘|抒发|原是|原曲|作品原|曲谱|创作于|取材于|改编取材于/.test(
      value,
    );
}

function isSeparator(value: string) {
  return /^[-—–━┄_=·•\s]+$/.test(value) || /中场休息/.test(value);
}

function splitNames(value: string) {
  return value
    .replace(/\s+\/\s+/g, "、")
    .split(/[、，,；;]/)
    .map((name) => cleanText(name))
    .filter(Boolean);
}

function dedupeConsecutiveProgram(program: ProgramItem[]) {
  return program.filter((item, index) => {
    const previous = program[index - 1];
    return !previous || previous.composer !== item.composer || previous.title !== item.title;
  });
}

function chinaDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatPrice(price: number) {
  return price === 0 ? "免费" : `¥${Number.isInteger(price) ? price : price.toFixed(2)}`;
}

function cleanText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
