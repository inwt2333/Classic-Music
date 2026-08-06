import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { z } from "zod";
import type {
  ProgramItem,
  WechatImportCandidate,
  WechatImportEventDraft,
  WechatImportRecord,
} from "../src/types";
import { parseChinaDate } from "./china-time";
import { fetchWithRetry } from "./fetch-retry";

export type WechatArticle = {
  articleUrl?: string;
  articleTitle?: string;
  accountName?: string;
  publishedAt?: string;
  rawText: string;
};

const cityVenueMap = [
  ["上海", /上海|捷豹上海交响音乐厅|东方艺术中心|上海音乐厅/],
  ["北京", /北京|国家大剧院|中山公园音乐堂/],
  ["苏州", /苏州|金鸡湖音乐厅/],
  ["广州", /广州|星海音乐厅/],
  ["深圳", /深圳/],
  ["杭州", /杭州|浙江音乐厅/],
  ["西安", /西安/],
  ["南京", /南京|江苏大剧院/],
  ["成都", /成都/],
  ["重庆", /重庆/],
  ["武汉", /武汉/],
  ["天津", /天津/],
] as const;

const ignoredLabels = /^(演出时间|时间|日期|演出地点|地点|场馆|票价|购票|指挥|演奏|演唱|乐团|节目单|曲目|温馨提示|注意事项|主办|承办|咨询)[：:]?/i;
const stopProgram = /^(演出阵容|艺术家|指挥|演奏|演唱|乐团|票价|购票|温馨提示|注意事项|演出信息|主办|承办|咨询|点击|扫码)[：:]?/i;
const datePattern = /(?:(20\d{2})\s*[年./-])?(\d{1,2})\s*[月./-](\d{1,2})\s*日?/g;
const timePattern = /(?:^|\D)([01]?\d|2[0-3])[:：]([0-5]\d)(?:\D|$)/;

export async function readWechatArticle(input: { articleUrl?: string; rawText?: string }) {
  const articleUrl = input.articleUrl?.trim() || undefined;
  const pastedText = normalizeText(input.rawText ?? "");
  if (!articleUrl && !pastedText) throw new Error("请粘贴公众号文章链接或正文");

  if (!articleUrl) return { rawText: pastedText } satisfies WechatArticle;
  const fetched = await fetchWechatArticle(articleUrl).catch((error) => {
    if (pastedText) return undefined;
    throw error;
  });
  return {
    articleUrl,
    articleTitle: fetched?.articleTitle,
    accountName: fetched?.accountName,
    publishedAt: fetched?.publishedAt,
    rawText: pastedText || fetched?.rawText || "",
  } satisfies WechatArticle;
}

export async function fetchWechatArticle(articleUrl: string): Promise<WechatArticle> {
  const url = new URL(articleUrl);
  if (url.protocol !== "https:" || url.hostname !== "mp.weixin.qq.com") {
    throw new Error("目前只允许读取 https://mp.weixin.qq.com 的公众号文章链接");
  }
  const response = await fetchWithRetry(url, () => ({
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(12_000),
  }));
  if (!response.ok) throw new Error(`公众号文章读取失败（HTTP ${response.status}），请同时粘贴正文`);
  const html = await response.text();
  if (html.length > 4_000_000) throw new Error("公众号文章页面超过 4 MB，请改为粘贴正文");
  const parsed = extractWechatArticleHtml(html, articleUrl);
  if (parsed.rawText.length < 40) {
    throw new Error("微信未返回可用正文，请在浏览器中复制文章正文后粘贴");
  }
  return parsed;
}

export function extractWechatArticleHtml(html: string, articleUrl?: string): WechatArticle {
  const $ = cheerio.load(html);
  const content = $("#js_content").first();
  content.find("script, style").remove();
  content.find("br").replaceWith("\n");
  content.find("p, section, div, li, h1, h2, h3, h4").append("\n");
  const articleTitle = clean($("#activity-name").first().text()) ||
    clean($("meta[property='og:title']").attr("content") ?? "") || undefined;
  const accountName = clean($("#js_name").first().text()) ||
    clean($("meta[name='author']").attr("content") ?? "") || undefined;
  const publishedAt = clean($("#publish_time").first().text()) || undefined;
  return {
    articleUrl,
    articleTitle,
    accountName,
    publishedAt,
    rawText: normalizeText(content.text()),
  };
}

export function parseWechatArticle(
  article: WechatArticle,
  now = new Date(),
): WechatImportRecord {
  const rawText = normalizeText(article.rawText);
  if (rawText.length < 10) throw new Error("正文过短，无法生成演出候选");
  const lines = rawText.split("\n").map(clean).filter(Boolean);
  const dateMatches = findDateMatches(lines, now);
  const candidates = dateMatches.length
    ? dateMatches.map((match, index) => {
        const nextLineIndex = dateMatches[index + 1]?.lineIndex ?? lines.length;
        const previousLineIndex = dateMatches[index - 1]?.lineIndex ?? -1;
        const sectionStart = findSectionStart(lines, previousLineIndex + 1, match.lineIndex);
        const section = lines.slice(sectionStart, nextLineIndex);
        return buildRuleCandidate(article, section, match.startTime, match.assumedTime, index);
      })
    : [buildRuleCandidate(article, lines, "", false, 0)];
  const uniqueCandidates = dedupeCandidates(candidates);
  const importedAt = new Date().toISOString();
  const identity = article.articleUrl || `${article.articleTitle ?? ""}:${rawText.slice(0, 200)}`;
  return {
    id: `wximport_${hash(identity)}`,
    articleUrl: article.articleUrl,
    articleTitle: article.articleTitle || firstTitleLine(lines),
    accountName: article.accountName,
    publishedAt: article.publishedAt,
    rawText,
    importedAt,
    extractionMethod: "rules",
    candidates: uniqueCandidates,
  };
}

export async function enhanceWechatImportWithDeepSeek(record: WechatImportRecord) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY，已保留规则解析结果");
  const prompt = `请从下面的微信公众号文章中提取古典音乐演出。文章可能包含多场日期或不同节目单。只返回 JSON，不要 Markdown。不要猜测文章中没有的信息。时间使用带 +08:00 的 ISO 8601。\nSchema:\n{"events":[{"title":"","city":"","venue":"","hall":"","startTime":"","endTime":"","price":"","ticketUrl":"","description":"不超过500字的演出简介","ensemble":"","conductor":"","performers":[""],"program":[{"composer":"","title":"","alternateTitles":[""],"opus":"","movements":[{"number":"","title":"","alternateTitles":[""]}],"confidence":"ai"}],"tags":[""]}]}\n文章标题：${record.articleTitle ?? ""}\n公众号：${record.accountName ?? ""}\n正文：\n${record.rawText.slice(0, 30_000)}`;
  const response = await fetchWithRetry("https://api.deepseek.com/chat/completions", () => ({
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  }));
  if (!response.ok) throw new Error(`DeepSeek 请求失败（HTTP ${response.status}）`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 没有返回结构化内容");
  const parsed = deepSeekResponseSchema.parse(JSON.parse(content));
  const candidates = parsed.events.map((event, index) => ({
    id: `candidate_${hash(`${record.id}:ai:${index}:${event.startTime}:${event.title}`)}`,
    status: "pending" as const,
    event: normalizeAiDraft(event),
    reasons: candidateReasons(event),
  }));
  if (!candidates.length) throw new Error("DeepSeek 没有识别出任何演出");
  return { ...record, extractionMethod: "deepseek" as const, candidates };
}

export function parseWechatProgram(lines: string[]): ProgramItem[] {
  const normalized = lines.map(clean).filter(Boolean);
  const headingIndex = normalized.findIndex((line) => /^(曲目|节目单|演出曲目)[：:]?$/.test(line));
  const source = headingIndex >= 0 ? normalized.slice(headingIndex + 1) : normalized;
  const result: ProgramItem[] = [];
  for (const rawLine of source) {
    if (result.length && stopProgram.test(rawLine)) break;
    if (/^(曲目|节目单|演出曲目)[：:]?$/.test(rawLine) || /^[-—–]{2,}$/.test(rawLine)) continue;
    const numbered = rawLine.match(/^(\d{1,2})[.、]\s*(.+)$/);
    if (numbered && result.length && /组曲|交响曲|协奏曲|奏鸣曲|选曲|选段/.test(result.at(-1)!.title)) {
      const parent = result.at(-1)!;
      parent.movements = [...(parent.movements ?? []), { number: numbered[1], title: numbered[2] }];
      continue;
    }
    if (/^[A-Za-z][A-Za-z\s,'’.-]{4,}$/.test(rawLine) && result.length) {
      const previous = result.at(-1)!;
      previous.alternateTitles = unique([...(previous.alternateTitles ?? []), rawLine]);
      continue;
    }
    const composerLine = rawLine.match(/^([^：:]{1,30})[：:]\s*(.+)$/);
    if (composerLine && !ignoredLabels.test(rawLine) && isLikelyComposer(composerLine[1])) {
      result.push({
        composer: composerLine[1].trim(),
        ...parseWorkText(composerLine[2]),
        confidence: "title-inferred",
      });
      continue;
    }
    const work = rawLine.match(/《([^》]{2,120})》/);
    if (work) {
      const suffixComposer = rawLine.match(/[（(]([^（）()]{1,30})(?:曲|作曲)[）)]/)?.[1];
      result.push({ composer: suffixComposer, title: work[1].trim(), confidence: "title-inferred" });
      continue;
    }
    if (headingIndex >= 0 && rawLine.length >= 3 && rawLine.length <= 160 && !ignoredLabels.test(rawLine)) {
      result.push({ title: numbered?.[2] ?? stripBookMarks(rawLine), confidence: "title-inferred" });
    }
  }
  return dedupeProgram(result);
}

function buildRuleCandidate(
  article: WechatArticle,
  lines: string[],
  startTime: string,
  assumedTime: boolean,
  index: number,
): WechatImportCandidate {
  const venue = labeledValue(lines, /^(?:演出地点|地点|场馆)[：:]\s*(.+)$/i) || inferVenue(lines);
  const city = inferCity([venue, ...lines].join(" "));
  const title = nearestTitle(lines) || article.articleTitle || "";
  const price = labeledValue(lines, /^(?:演出票价|票价)[：:]\s*(.+)$/i);
  const conductor = labeledValue(lines, /^指挥[：:]\s*(.+)$/i);
  const ensemble = labeledValue(lines, /^(?:演奏|乐团)[：:]\s*(.+)$/i);
  const performers = lines.flatMap((line) => {
    const match = line.match(/^(?:钢琴|小提琴|大提琴|独奏|演唱|女高音|男高音|中提琴|长笛|单簧管)[：:]\s*(.+)$/i);
    return match ? splitNames(match[1]) : [];
  });
  const event: WechatImportEventDraft = {
    title,
    city,
    venue,
    startTime,
    price: price || undefined,
    ensemble: ensemble || undefined,
    conductor: conductor || undefined,
    performers: unique(performers),
    program: parseWechatProgram(lines),
    tags: inferTags(`${title} ${lines.join(" ")}`),
  };
  const reasons = candidateReasons(event);
  if (assumedTime) reasons.push("正文只识别到日期，开演时间暂按 19:30 填入，必须人工核对");
  return {
    id: `candidate_${hash(`${index}:${startTime}:${title}:${venue}`)}`,
    status: "pending",
    event,
    reasons: unique(reasons),
  };
}

function findDateMatches(lines: string[], now: Date) {
  const matches: Array<{ lineIndex: number; startTime: string; assumedTime: boolean }> = [];
  lines.forEach((line, lineIndex) => {
    datePattern.lastIndex = 0;
    for (const match of line.matchAll(datePattern)) {
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (month < 1 || month > 12 || day < 1 || day > 31) continue;
      let year = match[1] ? Number(match[1]) : now.getFullYear();
      const surrounding = [line, lines[lineIndex + 1] ?? "", lines[lineIndex - 1] ?? ""].join(" ");
      const time = surrounding.match(timePattern);
      const assumedTime = !time;
      const hours = Number(time?.[1] ?? 19);
      const minutes = Number(time?.[2] ?? 30);
      let date = parseChinaDate(`${year}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:00`);
      if (!match[1] && date.getTime() < now.getTime() - 60 * 24 * 60 * 60 * 1000) {
        year += 1;
        date = parseChinaDate(`${year}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:00`);
      }
      matches.push({ lineIndex, startTime: date.toISOString(), assumedTime });
    }
  });
  return matches.filter((item, index, all) =>
    all.findIndex((candidate) => candidate.startTime === item.startTime) === index,
  );
}

function inferVenue(lines: string[]) {
  const joined = lines.join(" ");
  const match = joined.match(/([\u4e00-\u9fffA-Za-z·]{2,30}(?:音乐厅|艺术中心|大剧院|歌剧院|剧场))/);
  return match?.[1] ?? "";
}

function inferCity(value: string) {
  return cityVenueMap.find(([, pattern]) => pattern.test(value))?.[0] ?? "";
}

function inferTags(value: string) {
  return ["交响", "室内乐", "钢琴", "独奏", "合唱", "歌剧"].filter((tag) => value.includes(tag));
}

function labeledValue(lines: string[], pattern: RegExp) {
  for (const line of lines) {
    const value = line.match(pattern)?.[1]?.trim();
    if (value) return value;
  }
  return "";
}

function nearestTitle(lines: string[]) {
  return lines.find((line) =>
    line.length >= 5 && line.length <= 90 && !ignoredLabels.test(line) &&
    !/(?:(?:20\d{2})\s*[年./-])?\d{1,2}\s*[月./-]\d{1,2}\s*日?/.test(line),
  ) ?? "";
}

function findSectionStart(lines: string[], minimum: number, dateLineIndex: number) {
  for (let index = dateLineIndex - 1; index >= minimum; index -= 1) {
    const line = lines[index];
    if (
      line.length >= 5 &&
      line.length <= 90 &&
      !ignoredLabels.test(line) &&
      !/^(\d{1,2})[.、]/.test(line) &&
      !/《[^》]+》/.test(line)
    ) {
      return index;
    }
  }
  return Math.max(0, minimum);
}

function firstTitleLine(lines: string[]) {
  return nearestTitle(lines) || lines[0];
}

function candidateReasons(event: WechatImportEventDraft) {
  const reasons: string[] = [];
  if (!event.title) reasons.push("未识别标题");
  if (!event.startTime) reasons.push("未识别演出日期和时间");
  if (!event.city) reasons.push("未识别城市");
  if (!event.venue) reasons.push("未识别场馆");
  if (!event.program.length) reasons.push("未识别节目单");
  if (!reasons.length) reasons.push("已生成结构化候选，发布前仍需逐项核对");
  return reasons;
}

function normalizeAiDraft(event: z.infer<typeof deepSeekEventSchema>): WechatImportEventDraft {
  return {
    ...event,
    hall: event.hall || undefined,
    endTime: event.endTime || undefined,
    price: event.price || undefined,
    ticketUrl: event.ticketUrl || undefined,
    description: event.description || undefined,
    ensemble: event.ensemble || undefined,
    conductor: event.conductor || undefined,
    performers: unique(event.performers),
    program: event.program.map((item) => ({
      ...item,
      composer: item.composer || undefined,
      alternateTitles: item.alternateTitles?.filter(Boolean),
      opus: item.opus || undefined,
      confidence: "ai",
    })),
    tags: unique(event.tags),
  };
}

const deepSeekProgramSchema = z.object({
  composer: z.string().default(""),
  title: z.string().trim().min(1),
  alternateTitles: z.array(z.string()).default([]),
  opus: z.string().default(""),
  movements: z.array(z.object({
    number: z.string().default(""),
    title: z.string().trim().min(1),
    alternateTitles: z.array(z.string()).default([]),
  })).default([]),
  confidence: z.literal("ai").default("ai"),
});

const deepSeekEventSchema = z.object({
  title: z.string().default(""),
  city: z.string().default(""),
  venue: z.string().default(""),
  hall: z.string().default(""),
  startTime: z.string().default(""),
  endTime: z.string().default(""),
  price: z.string().default(""),
  ticketUrl: z.string().default(""),
  description: z.string().max(500).default(""),
  ensemble: z.string().default(""),
  conductor: z.string().default(""),
  performers: z.array(z.string()).default([]),
  program: z.array(deepSeekProgramSchema).default([]),
  tags: z.array(z.string()).default([]),
});

const deepSeekResponseSchema = z.object({ events: z.array(deepSeekEventSchema).min(1).max(30) });

function isLikelyComposer(value: string) {
  const label = value.trim();
  return label.length <= 24 && !ignoredLabels.test(label) && !/时间|地点|场馆|票|指挥|演奏|主办/.test(label);
}

function stripBookMarks(value: string) {
  return value.trim().replace(/^《|》$/g, "").trim();
}

function parseWorkText(value: string) {
  const opus = value.match(/(?:作品\s*\d+(?:\s*之\s*\d+)?|Op\.?\s*\d+(?:\s*No\.?\s*\d+)?|BWV\s*\d+|K\.?\s*\d+|D\.?\s*\d+)/i)?.[0];
  const title = value
    .replace(opus ?? /$^/, "")
    .replace(/《([^》]+)》/g, "$1")
    .replace(/^[,，;；\s]+|[,，;；\s]+$/g, "")
    .trim();
  return { title: stripBookMarks(title), opus };
}

function splitNames(value: string) {
  return value.split(/[、，,;/；]/).map(clean).filter(Boolean);
}

function dedupeProgram(items: ProgramItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.composer ?? ""}:${item.title}`.replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
    if (!item.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeCandidates(items: WechatImportCandidate[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.event.startTime}:${item.event.title}:${item.event.venue}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeText(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[\t\u00a0\u200b]+/g, " ")
    .split("\n")
    .map(clean)
    .filter(Boolean)
    .join("\n")
    .slice(0, 300_000);
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function hash(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
