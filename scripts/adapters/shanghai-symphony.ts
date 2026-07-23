import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

type ContentBlock = {
  text: string;
  indented: boolean;
};

const performerRolePattern =
  /^(?:指挥|小提琴|中提琴|大提琴|低音提琴|钢琴|羽管键琴|管风琴|马林巴|琵琶|古琴|长笛|短笛|单簧管|双簧管|巴松|圆号|小号|长号|大号|打击乐|竖琴|吉他|女高音|女中音|男高音|男中音|男低音|独奏|演奏|演唱|合唱|乐团|首席|旁白|主持|艺术指导)\s*[：:]/;

const programFooterPattern =
  /本场音乐会|中场休息|演出时长|具体曲目|以现场为准|谢幕|导赏|返场|儿童全票|儿童谢绝入场|身高.*入场/;

export function parseShanghaiSymphonyContent(programInfo: string, showContent?: string | null) {
  const blocks = htmlToBlocks(programInfo);
  const headingIndex = blocks.findIndex((block) => /^(?:曲目|节目单)\s*[：:]?$/.test(block.text));

  if (headingIndex < 0) {
    return {
      program: [] as ProgramItem[],
      description: htmlToDescription(showContent || ""),
    };
  }

  const afterHeading = blocks.slice(headingIndex + 1);
  const footerIndex = afterHeading.findIndex((block) => programFooterPattern.test(block.text));
  const programBlocks = footerIndex >= 0 ? afterHeading.slice(0, footerIndex) : afterHeading;
  const inlineDescription =
    footerIndex >= 0 ? extractDescriptionAfterFooter(afterHeading.slice(footerIndex)) : undefined;

  return {
    program: parseProgramBlocks(programBlocks),
    description: htmlToDescription(showContent || "") || inlineDescription,
  };
}

export function parseShanghaiSymphonyCast(html: string) {
  const lines = htmlToBlocks(html)
    .map((block) => block.text)
    .filter(Boolean);
  const performers: string[] = [];
  let conductor: string | undefined;

  for (const line of lines) {
    const match = line.match(/^([^：:]{2,12})[：:]\s*(.+)$/);
    if (!match) continue;
    const role = match[1];
    const names = splitNames(match[2]);
    if (/指挥/.test(role)) conductor = names[0];
    if (
      /指挥|小提琴|钢琴|大提琴|中提琴|长笛|单簧管|双簧管|圆号|女高音|男高音|男中音|合唱|表演|策划/.test(
        role,
      )
    ) {
      performers.push(...names);
    }
  }

  return { conductor, performers: Array.from(new Set(performers)).filter(Boolean) };
}

export function parseShanghaiSymphonyPrices(raw: Record<string, any>, priceRows: unknown) {
  const apiPrices = Array.isArray(priceRows)
    ? priceRows.map((row) => Number(row?.price)).filter((price) => Number.isFinite(price) && price >= 0)
    : [];
  const fallbackPrices = [raw.minPrice, raw.maxPrice]
    .map((price) => Number(price))
    .filter((price) => Number.isFinite(price) && price >= 0);
  const priceTiers = Array.from(new Set(apiPrices.length ? apiPrices : fallbackPrices)).sort((a, b) => a - b);

  if (!priceTiers.length) return {};
  if (priceTiers.length === 1) {
    return { price: formatPrice(priceTiers[0]), priceTiers };
  }

  return {
    price: `${formatPrice(priceTiers[0])} - ${formatPrice(priceTiers[priceTiers.length - 1])}`,
    priceTiers,
  };
}

function parseProgramBlocks(blocks: ContentBlock[]): ProgramItem[] {
  const program: ProgramItem[] = [];
  let currentComposer: string | undefined;
  let currentWork: ProgramItem | undefined;

  for (const block of blocks) {
    const normalized = block.text;
    if (!normalized || /^(?:--+|——+)$/.test(normalized)) continue;
    if (performerRolePattern.test(normalized)) continue;

    const composer = extractComposerHeading(normalized);
    if (composer) {
      currentComposer = composer;
      currentWork = undefined;
      continue;
    }

    const movement = parseMovement(normalized);
    if (
      currentWork &&
      movement &&
      isMovementParent(currentWork.title) &&
      (block.indented || movement.number !== undefined)
    ) {
      currentWork.movements ??= [];
      if (!currentWork.movements.some((item) => item.number === movement.number && item.title === movement.title)) {
        currentWork.movements.push(movement);
      }
      continue;
    }

    const inlineComposer = normalized.match(/^([^：:]{2,24})[：:]\s*(.+)$/);
    if (inlineComposer && looksLikeComposer(inlineComposer[1])) {
      currentComposer = cleanComposer(inlineComposer[1]);
      const title = cleanProgramTitle(inlineComposer[2]);
      if (title) {
        currentWork = { composer: currentComposer, title, confidence: "official" };
        program.push(currentWork);
      }
      continue;
    }

    const title = cleanProgramTitle(normalized);
    if (title) {
      currentWork = { composer: currentComposer, title, confidence: "official" };
      program.push(currentWork);
    }
  }

  return dedupeProgram(program);
}

function extractDescriptionAfterFooter(blocks: ContentBlock[]) {
  let descriptionStart = 0;
  while (
    descriptionStart < blocks.length &&
    (!blocks[descriptionStart].text || programFooterPattern.test(blocks[descriptionStart].text))
  ) {
    descriptionStart += 1;
  }

  const paragraphs = blocks
    .slice(descriptionStart)
    .map((block) => block.text)
    .filter((text) => text && !/^(?:演出简介|音乐会简介|简介)\s*[：:]?$/.test(text));

  return paragraphs.length ? paragraphs.join("\n\n") : undefined;
}

function htmlToDescription(html: string) {
  if (!html) return undefined;
  const paragraphs = htmlToBlocks(html)
    .map((block) => block.text)
    .filter((text) => text && !/^(?:演出简介|音乐会简介|简介)\s*[：:]?$/.test(text));
  return paragraphs.length ? paragraphs.join("\n\n") : undefined;
}

function htmlToBlocks(html: string): ContentBlock[] {
  const $ = cheerio.load(html);
  const blocks: ContentBlock[] = [];

  $("p, li").each((_, element) => {
    const node = $(element);
    const style = node.attr("style") || "";
    const offsetMatch = style.match(/(?:padding-left|margin-left)\s*:\s*([\d.]+)/i);
    const hasOffset = Number(offsetMatch?.[1] || 0) > 0;
    const listDepth = node.parents("ul, ol").length;
    const fragment = node.html()?.replace(/<br\s*\/?\s*>/gi, "\n") || node.text();
    const lines = cheerio.load(fragment).text().split(/\n+/);

    if (!lines.some((line) => cleanText(line))) {
      blocks.push({ text: "", indented: hasOffset || listDepth > 0 });
      return;
    }

    for (const line of lines) {
      const normalized = cleanText(line);
      if (normalized) blocks.push({ text: normalized, indented: hasOffset || listDepth > 0 });
    }
  });

  if (blocks.length) return blocks;

  return cheerio
    .load(html.replace(/<br\s*\/?\s*>/gi, "\n"))
    .text()
    .split(/\n+/)
    .map((text) => ({ text: cleanText(text), indented: false }));
}

function parseMovement(value: string) {
  const match = value.match(/^(?:(\d{1,2}|[IVX]{1,5}|[一二三四五六七八九十]+)[.．、:：）)]\s*)?(.+)$/i);
  if (!match) return undefined;
  const title = cleanProgramTitle(match[2]);
  if (!title) return undefined;
  return { number: match[1] || undefined, title };
}

function isMovementParent(title: string) {
  return /组曲|交响曲|协奏曲|奏鸣曲|四重奏|五重奏|六重奏|七重奏|八重奏|九重奏|变奏曲|清唱剧|芭蕾|选曲|选段/.test(
    title,
  );
}

function extractComposerHeading(line: string) {
  if (!/[：:]$/.test(line)) return undefined;
  const composer = cleanComposer(line.replace(/[：:]$/, ""));
  if (!looksLikeComposer(composer)) return undefined;
  return composer;
}

function looksLikeComposer(value: string) {
  const composer = cleanComposer(value);
  if (composer.length > 14) return false;
  if (/曲目|时间|地点|场地|票价|演出|乐章|组曲|协奏曲|交响曲|奏鸣曲|音乐会/.test(composer)) return false;
  if (/[《》「」“”（）()；;]/.test(composer)) return false;
  return true;
}

function cleanComposer(value: string) {
  return cleanText(value.replace(/作曲|作品/g, "").replace(/[：:]/g, ""));
}

function cleanProgramTitle(value: string) {
  const cleaned = cleanText(
    value
      .replace(/^[—\-–·\s]+/, "")
      .replace(/\s*（?约\d+.*$/, "")
      .replace(/\s*\(.*?分钟.*?\)\s*$/, ""),
  );
  if (!cleaned || cleaned.length < 2) return "";
  if (cleaned.length > 90 || /。$/.test(cleaned)) return "";
  return cleaned;
}

function splitNames(value: string) {
  return value
    .replace(/、/g, "，")
    .replace(/\s+\/\s+/g, "，")
    .split(/[，,]/)
    .map((name) => cleanText(name))
    .filter(Boolean);
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

function formatPrice(price: number) {
  return price === 0 ? "免费" : `¥${Number.isInteger(price) ? price : price.toFixed(2)}`;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
