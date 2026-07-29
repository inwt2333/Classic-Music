import * as cheerio from "cheerio";
import type { ProgramItem } from "../../src/types";

export function parseChinaNationalSymphonyDetail(html: string) {
  const $ = cheerio.load(html || "");
  const title = cleanText($("#lbtitle").text());
  const summaryDate = cleanText($("#lbaddtime").text());
  const summaryVenue = cleanText($("#lbaddress").text());
  const summaryEnsemble = cleanText($("#lbyuetype").text());
  const lines = $(".daew_kuai p, .daew_kuai li")
    .map((_, element) => cleanText($(element).text()))
    .get()
    .filter(Boolean);
  const fullText = lines.join("\n");
  const dateTime =
    fullText.match(/演出时间[：:]\s*(20\d{2})年(\d{1,2})月(\d{1,2})日[^\n]*?(\d{1,2}):(\d{2})/) ??
    fullText.match(/Date[：:]\s*([^\n]*?)(\d{1,2}):(\d{2})/i);
  const startTime =
    dateTime && dateTime.length >= 6
      ? `${dateTime[1]}-${pad(dateTime[2])}-${pad(dateTime[3])} ${pad(dateTime[4])}:${dateTime[5]}`
      : summaryDate
        ? `${summaryDate} 19:30`
        : undefined;
  const venue = cleanText(
    fullText.match(/演出地点[：:]\s*([^\n]+)/)?.[1] ?? summaryVenue,
  ).replace(/\s+Venue[：:].*$/i, "");
  const ensemble =
    cleanText(fullText.match(/演出[：:]\s*([^\n]+)/)?.[1] ?? summaryEnsemble) || undefined;
  const cast = parseCast(lines);
  const program = parseProgram(lines);

  return {
    title,
    startTime,
    venue,
    ensemble,
    conductor: cast.conductor,
    performers: cast.performers,
    program,
  };
}

function parseCast(lines: string[]) {
  const performers: string[] = [];
  let conductor: string | undefined;
  for (const line of lines) {
    const match = line.match(
      /^(指挥|钢琴|小提琴|中提琴|大提琴|女高音|女中音|男高音|男中音|男低音|长笛|双簧管|单簧管|圆号|独唱|独奏|领唱|演唱|合唱|演出)[：:]\s*(.+)$/,
    );
    if (!match) continue;
    const names = match[2]
      .replace(/\s+(?:Conductor|Piano|Violin|Viola|Cello|Soprano|Tenor|Bass|Presenters?)[：:].*$/i, "")
      .split(/[、，,\/]/)
      .map(cleanText)
      .filter(Boolean);
    performers.push(...names);
    if (match[1] === "指挥") conductor = names[0];
  }
  return { conductor, performers: unique(performers) };
}

function parseProgram(lines: string[]) {
  const marker = lines.findIndex((line) => /曲目\s*Programme/i.test(line) || /^曲目[：:]?$/.test(line));
  if (marker < 0) return [];
  const program: ProgramItem[] = [];

  for (let index = marker + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^(?:首页|购票|注[：:]|演出阵容)|以上内容|subject to change/i.test(line)) break;
    if (!hasChinese(line) || /^(?:曲目|演出时间|演出地点|Date|Venue|Presenters?|Conductor)[：:]/i.test(line)) {
      continue;
    }
    const item = parseChineseWork(line);
    if (!item) continue;
    const alternate = lines[index + 1];
    if (alternate && !hasChinese(alternate) && /[A-Za-z]{3}/.test(alternate)) {
      item.alternateTitles = [alternate];
      index += 1;
    }
    program.push(item);
  }
  return dedupeProgram(program);
}

function parseChineseWork(line: string): ProgramItem | undefined {
  const cleaned = cleanText(line.replace(/^[（(]?\d+[）).、]\s*/, ""));
  if (
    !cleaned ||
    /^[-—–]+$/.test(cleaned) ||
    /^(指挥|钢琴|小提琴|中提琴|大提琴|女高音|女中音|男高音|男中音|男低音|独唱|独奏|领唱|演唱|合唱|演出)[：:]/.test(
      cleaned,
    )
  ) {
    return undefined;
  }
  let composer: string | undefined;
  let title = cleaned;

  const colon = cleaned.match(/^([^：:]{2,30})[：:]\s*(.+)$/);
  const spaced = cleaned.match(/^([\u3400-\u9fff·、]{2,24})\s+(.+)$/);
  const quoted = cleaned.match(/^([\u3400-\u9fff·、]{2,24})(《.+)$/);
  if (colon) {
    composer = cleanText(colon[1]);
    title = cleanText(colon[2]);
  } else if (spaced && looksLikeWork(spaced[2])) {
    composer = cleanText(spaced[1]);
    title = cleanText(spaced[2]);
  } else if (quoted) {
    composer = cleanText(quoted[1]);
    title = cleanText(quoted[2]);
  }
  if (!composer && !looksLikeWork(title)) return undefined;

  const opus = title.match(/(?:作品|Op\.?)\s*([\dA-Za-z./-]+)/i)?.[0];
  return {
    composer,
    title: cleanText(title.replace(/[《》]/g, "")),
    opus,
    confidence: "official",
  };
}

function looksLikeWork(value: string) {
  return /交响曲|协奏曲|序曲|组曲|乐章|圆舞曲|进行曲|歌曲|咏叹调|清唱剧|奏鸣曲|四重奏|舞曲|幻想曲|随想曲|Op\.|作品\d|选段/i.test(
    value,
  );
}

function hasChinese(value: string) {
  return /[\u3400-\u9fff]/.test(value);
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

function pad(value: string) {
  return String(Number(value)).padStart(2, "0");
}

function cleanText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
