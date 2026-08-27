import * as cheerio from "cheerio";
import { parseChinaDate } from "../china-time";

export type GzdjyListRow = {
  id: string;
  link: string;
  name: string;
  dateText: string;
  place: string;
  image: string;
  priceText: string;
  category: string;
};

function decodeField(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseGzdjyListResponse(raw: string): { total: number; rows: GzdjyListRow[] } {
  const parsed = JSON.parse(raw) as { d: string };
  const payload = JSON.parse(parsed.d) as Array<Array<unknown>>;
  const header = payload?.[0];
  const total = Number(header?.[0] ?? 0);
  const rawRows = Array.isArray(header?.[5]) ? (header[5] as string[][]) : [];
  const rows = rawRows.map((row) => ({
    link: String(row[0] ?? ""),
    name: decodeField(String(row[1] ?? "")).replace(/\+/g, " ").trim(),
    dateText: decodeField(String(row[2] ?? "")),
    place: decodeField(String(row[3] ?? "")).replace(/\+/g, " ").trim(),
    image: String(row[4] ?? ""),
    priceText: String(row[5] ?? "").trim(),
    category: decodeField(String(row[10] ?? "")),
    id: String(row[16] ?? row[0]?.match(/(\d+)\.html/)?.[1] ?? ""),
  }));
  return { total, rows };
}

export function parseGzdjyFirstShowTime(dateText: string): Date | undefined {
  // 官网列表把多场次用 “+” 拼接，如「9月16-18日（周三-周五）19:30+9月19日（周六）14:30」，
  // 也有「（周日）+19:30」的写法，因此先统一替换为空格再取第一组完整日期时间。
  const normalized = dateText.replace(/\+/g, " ");
  const match = normalized.match(
    /(?:(\d{4})\s*年)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?(?:\s*[-–—~]\s*(?:\d{1,2}\s*月)?\s*\d{1,2}\s*日?)?[^0-9:]{0,14}(\d{1,2}):(\d{2})/,
  );
  if (!match) return undefined;
  const year = Number(match[1] ?? new Date().getFullYear());
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = parseChinaDate(
    `${year}-${pad(Number(match[2]))}-${pad(Number(match[3]))} ${pad(Number(match[4]))}:${pad(Number(match[5]))}:00`,
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseGzdjyPriceTiers(priceText: string): number[] {
  const prices = (priceText.match(/\d+/g) ?? []).map(Number).filter((price) => price > 0);
  return [...new Set(prices)].sort((left, right) => left - right);
}

export function extractGzdjyProgramLines(html: string): string[] {
  const markerIndex = html.lastIndexOf("演出曲目");
  if (markerIndex < 0) return [];
  let section = html.slice(markerIndex);
  const endMatch = section.slice(10).search(/温馨提示|以.{0,8}为准|【温馨提示】/);
  if (endMatch >= 0) section = section.slice(0, endMatch + 10);

  const withBreaks = section.replace(/<br\s*\/?>/gi, "\n");
  const $ = cheerio.load(`<div>${withBreaks}</div>`);
  const lines = $("div").first().text().split("\n").map((line) => line.replace(/\u00a0/g, " ").trim());

  return lines.filter((line) => {
    if (!line || line.length > 80) return false;
    if (/^[\*＊]/.test(line)) return false;
    if (/演出曲目|Programme/i.test(line)) return false;
    if (/中场休息|Intermission/i.test(line)) return false;
    if (/温馨提示|仅供参考|版权所有/.test(line)) return false;
    // 只保留「《曲名》…」形态的行，演奏家介绍、致谢等文本一律不当作曲目。
    return /《.+》/.test(line);
  });
}
