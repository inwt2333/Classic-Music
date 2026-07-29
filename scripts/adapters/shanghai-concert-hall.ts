import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

type ContentBlock = {
  text: string;
  bold: boolean;
};

const programHeadingPattern = /^(?:曲目单|演出曲目|节目单|曲目)\s*[：:]?$/;
const programFooterPattern = /^(?:艺术家|演奏家|演出阵容|购票须知|温馨提示)\s*[：:]?$/;
const disclaimerPattern = /曲目.*(?:现场|变更)|中场休息|intermission|interval/i;
const rolePattern =
  /^(指挥|钢琴|小提琴|中提琴|大提琴|低音提琴|吉他|长笛|双簧管|单簧管|大管|圆号|小号|长号|大号|竖琴|打击乐|女高音|女中音|男高音|男中音|男低音|演奏|演唱|乐团|合唱团)\s*[：:]?\s*(.*)$/;
const workKeywordPattern =
  /交响曲|协奏曲|奏鸣曲|三重奏|四重奏|五重奏|六重奏|组曲|序曲|圆舞曲|波尔卡|幻想曲|变奏曲|狂想曲|小夜曲|赋格|练习曲|前奏曲|叙事曲|歌曲|咏叹调|进行曲|舞曲|小品|选段|选曲|乐章|随想曲|托卡塔|即兴曲/i;
const creditPattern = /^(?:原曲|作曲|作曲家|曲|改编|创编)\s*[：:]?\s*(.+)$/i;

export function parseShanghaiConcertHallContent(html: string) {
  const blocks = htmlToBlocks(html);
  const headingIndex = blocks.findIndex((block) => programHeadingPattern.test(block.text));
  const cast = parseCast(blocks);

  if (headingIndex < 0) {
    return {
      program: [] as ProgramItem[],
      description: buildDescription(blocks),
      ...cast,
    };
  }

  const afterHeading = blocks.slice(headingIndex + 1);
  const footerIndex = afterHeading.findIndex((block) => programFooterPattern.test(block.text));
  const programBlocks = footerIndex >= 0 ? afterHeading.slice(0, footerIndex) : afterHeading;

  return {
    program: parseProgram(programBlocks),
    description: buildDescription(blocks.slice(0, headingIndex)),
    ...cast,
  };
}

export function parseShanghaiConcertHallPrices(
  project: Record<string, any>,
  event?: Record<string, any>,
) {
  const eventPrices = Array.isArray(event?.eventPrices)
    ? event.eventPrices.map((row: Record<string, any>) => Number(row.price))
    : [];
  const fallback = [project.projectMinPrice, project.projectMaxPrice].map(Number);
  const priceTiers = Array.from(
    new Set([...eventPrices, ...fallback].filter((price) => Number.isFinite(price) && price >= 0)),
  ).sort((a, b) => a - b);

  if (!priceTiers.length) return {};
  if (priceTiers.length === 1) return { price: formatPrice(priceTiers[0]), priceTiers };
  return {
    price: `${formatPrice(priceTiers[0])} - ${formatPrice(priceTiers[priceTiers.length - 1])}`,
    priceTiers,
  };
}

function parseProgram(blocks: ContentBlock[]) {
  const program: ProgramItem[] = [];
  let currentComposer: string | undefined;
  let pendingAlternateTitle: string | undefined;
  let lastWorkBlockIndex = -2;

  const addProgramItem = (item: ProgramItem, blockIndex: number) => {
    if (pendingAlternateTitle) {
      item.alternateTitles = [pendingAlternateTitle];
      pendingAlternateTitle = undefined;
    }
    program.push(item);
    lastWorkBlockIndex = blockIndex;
  };

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const line = cleanText(block.text);
    if (!line || disclaimerPattern.test(line) || /^[—\-–]+$/.test(line)) continue;

    const credit = line.match(creditPattern);
    if (credit) {
      const composer = cleanComposerCredit(credit[1]);
      if (program.length && /^(?:原曲|作曲|作曲家|曲)\s*[：:]?/.test(line)) {
        program[program.length - 1].composer = composer;
      }
      continue;
    }

    if (isEnglishLine(line)) {
      if (block.bold) continue;
      const alternateTitle = cleanAlternateTitle(line);
      if (!alternateTitle) continue;
      if (program.length && lastWorkBlockIndex === index - 1) {
        addAlternateTitle(program[program.length - 1], alternateTitle);
      } else {
        pendingAlternateTitle = alternateTitle;
      }
      continue;
    }

    const nextLine =
      blocks
        .slice(index + 1, index + 4)
        .map((item) => cleanText(item.text))
        .find((item) => item && !isEnglishLine(item)) || "";
    if (/^民间乐曲\s*[：:]?$/.test(line)) continue;
    if (creditPattern.test(nextLine)) {
      const item = createProgramItem(stripProgramNumber(line), currentComposer);
      if (item) addProgramItem(item, index);
      continue;
    }

    const composerCandidate = stripProgramNumber(line);
    if (isComposerHeading(composerCandidate, block.bold, nextLine)) {
      currentComposer = cleanComposerCredit(composerCandidate);
      continue;
    }

    const inline = splitInlineComposer(line);
    if (inline) {
      const item = createProgramItem(inline.title, inline.composer);
      if (item) addProgramItem(item, index);
      currentComposer = inline.composer;
      continue;
    }

    const candidate = stripProgramNumber(line);
    if (!isWorkLine(candidate, block.bold, currentComposer, program.length === 0, nextLine)) continue;

    const item = createProgramItem(candidate, currentComposer);
    if (item) addProgramItem(item, index);
  }

  return dedupeProgram(program);
}

function parseCast(blocks: ContentBlock[]) {
  const performers: string[] = [];
  let conductor: string | undefined;

  for (let index = 0; index < blocks.length; index += 1) {
    const line = blocks[index].text;
    const match = line.match(rolePattern);
    if (!match) continue;

    const role = match[1];
    const inlineValue = cleanText(match[2] || "");
    const nextValue = cleanText(blocks[index + 1]?.text || "");
    const previousValue = cleanText(blocks[index - 1]?.text || "");
    const previousLooksLikeName =
      previousValue &&
      previousValue.length <= 40 &&
      looksLikePersonOrComposer(previousValue) &&
      !programFooterPattern.test(previousValue);
    const value =
      inlineValue ||
      (previousLooksLikeName ? previousValue : "") ||
      (nextValue && nextValue.length <= 40 && !rolePattern.test(nextValue) ? nextValue : "");
    const names = splitNames(value);
    if (/指挥/.test(role)) conductor = names[0];
    performers.push(...names);
  }

  return { conductor, performers: Array.from(new Set(performers)).filter(Boolean) };
}

function isComposerHeading(line: string, bold: boolean, nextLine: string) {
  if (creditPattern.test(line)) return false;
  if (line.length > 34 || /[《》]|Op\.?|K\.?\s*\d|BWV|作品\s*\d/i.test(line)) return false;
  if (workKeywordPattern.test(line)) return false;
  if (/^\d+[.、．)]/.test(line) || /[。！？]$/.test(line)) return false;
  if (/曲\/.+改编|曲\s*\/|改编$/.test(line)) return true;
  return (bold || looksLikeWork(stripProgramNumber(nextLine))) && looksLikePersonOrComposer(line);
}

function splitInlineComposer(line: string) {
  const match = stripProgramNumber(line).match(/^([^《》：:]{2,28}?)\s+(.+)$/);
  const bracketMatch = stripProgramNumber(line).match(/^([^《》：:]{2,32})(《.+)$/);
  if (
    bracketMatch &&
    !/改编自|创编自|选自/.test(bracketMatch[1]) &&
    looksLikePersonOrComposer(bracketMatch[1])
  ) {
    return { composer: cleanComposerCredit(bracketMatch[1]), title: bracketMatch[2] };
  }
  if (
    !match ||
    !looksLikePersonOrComposer(match[1]) ||
    !workKeywordPattern.test(match[2]) ||
    !looksLikeWork(match[2])
  ) {
    return undefined;
  }
  return { composer: cleanComposerCredit(match[1]), title: match[2] };
}

function looksLikePersonOrComposer(value: string) {
  const cleaned = cleanComposerCredit(value);
  if (!cleaned || cleaned.length > 28) return false;
  if (/音乐会|曲目|艺术家|演奏|音乐厅|现场|简介|本场|中国首演/.test(cleaned)) return false;
  return /^[\u3400-\u9fffA-Za-zÀ-ž·・.\s/-]+$/.test(cleaned);
}

function isWorkLine(
  line: string,
  bold: boolean,
  composer: string | undefined,
  first: boolean,
  nextLine: string,
) {
  if (!line || line.length > 120 || /[。！？]$/.test(line)) return false;
  if (/^[（(]|^选自/.test(line)) return false;
  if (/^民间乐曲$/.test(line)) return false;
  if (rolePattern.test(line) || creditPattern.test(line) || programFooterPattern.test(line)) return false;
  if (/^(?:艺术家|简介|上半场|下半场|曲目单|演出曲目)/.test(line)) return false;
  if (/^《[^》]+》/.test(line) || workKeywordPattern.test(line)) return true;
  if (creditPattern.test(nextLine)) return true;
  if (line.length > 18 && /[，,、；;]/.test(line)) return false;
  return Boolean(first || bold || (composer && line.length <= 18));
}

function looksLikeWork(value: string) {
  const line = stripProgramNumber(cleanText(value));
  return Boolean(line && (/^《[^》]+》/.test(line) || workKeywordPattern.test(line) || /Op\.?|K\.?\s*\d|BWV/i.test(line)));
}

function createProgramItem(value: string, composer?: string): ProgramItem | undefined {
  const cleaned = cleanText(value.replace(/^《([^》]+)》/, "$1"));
  const inlineComposer = cleaned.match(/^([^：:]{2,30})[：:]\s*(.+)$/);
  if (inlineComposer && looksLikePersonOrComposer(inlineComposer[1])) {
    return createProgramItem(inlineComposer[2], cleanComposerCredit(inlineComposer[1]));
  }
  if (!cleaned || cleaned.length < 2) return undefined;

  const opusMatch = cleaned.match(
    /(?:[,，]?\s*)((?:Op\.?\s*\d+(?:\s*No\.?\s*\d+)?|K\.?\s*\d+[a-z]?|D\.?\s*\d+|M\.?\s*\d+(?:\/\d+)?|BWV\s*\d+|WAB\s*\d+)(?:[，,、]\s*(?:Op\.?|K\.?|D\.?|M\.?|BWV|WAB)\s*[\w./-]+)*)/i,
  );
  const title = cleanText(
    (opusMatch ? cleaned.replace(opusMatch[0], "") : cleaned)
      .replace(/[（(]\s*\d{4}\s*[）)]$/, "")
      .replace(/[，,；;：:]+$/, ""),
  );
  if (!title || title.length > 100) return undefined;
  return {
    composer: composer || undefined,
    title,
    opus: opusMatch ? cleanText(opusMatch[1]) : undefined,
    confidence: "official",
  };
}

function buildDescription(blocks: ContentBlock[]) {
  const paragraphs = blocks
    .map((block) => block.text)
    .filter(
      (line) =>
        line &&
        !programHeadingPattern.test(line) &&
        !/^\*?本场演出.*儿童|^演出票|^曲目.*现场/.test(line),
    );
  return paragraphs.length ? paragraphs.join("\n\n") : undefined;
}

function htmlToBlocks(html: string) {
  const $ = cheerio.load(html || "");
  const blocks: ContentBlock[] = [];

  $("p, li").each((_, element) => {
    const node = $(element);
    const text = cleanText(node.text());
    if (!text) return;
    const ownText = cleanText(node.clone().children().remove().end().text());
    const strongText = cleanText(node.find("strong, b").text());
    blocks.push({
      text,
      bold: Boolean(strongText && (!ownText || strongText === text)),
    });
  });

  return blocks;
}

function stripProgramNumber(value: string) {
  return cleanText(value.replace(/^\s*\d{1,2}\s*[.、．)）]\s*/, ""));
}

function cleanComposerCredit(value: string) {
  return cleanText(
    value
      .replace(/^(?:原曲|作曲|作曲家|曲|改编|创编)\s*[：:]?\s*/i, "")
      .replace(/选集\s*[：:]?$/, "")
      .replace(/\s+(?:Original Composer|Composer|Adaptation).*$/i, ""),
  );
}

function isEnglishLine(value: string) {
  const letters = (value.match(/\p{L}/gu) || []).length;
  const chinese = (value.match(/[\u3400-\u9fff]/g) || []).length;
  return letters > 4 && chinese === 0;
}

function cleanAlternateTitle(value: string) {
  const title = cleanText(stripProgramNumber(value));
  return title && title.length <= 180 ? title : undefined;
}

function addAlternateTitle(item: ProgramItem, value: string) {
  if (!value || value === item.title) return;
  item.alternateTitles ??= [];
  if (!item.alternateTitles.includes(value)) item.alternateTitles.push(value);
}

function splitNames(value: string) {
  return value
    .replace(/\s+\/\s+/g, "、")
    .split(/[、，,；;]/)
    .map((name) => cleanText(name))
    .filter((name) => name && name.length <= 40 && !workKeywordPattern.test(name));
}

function dedupeProgram(program: ProgramItem[]) {
  const seen = new Set<string>();
  return program.filter((item) => {
    const key = `${item.composer ?? ""}:${item.title}:${item.opus ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatPrice(price: number) {
  return price === 0 ? "免费" : `¥${Number.isInteger(price) ? price : price.toFixed(2)}`;
}

function cleanText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
