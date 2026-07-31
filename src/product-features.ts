import type { ConcertEvent, ConcertEventSummary, ProgramCredit, ProgramItem } from "./types";
import { formatEventVenue } from "./utils";

const personalEventKey = "classic-music.personal-events.v1";

export type PersonalEventStatus = "interested" | "attended";
export type PersonalEventMap = Record<string, PersonalEventStatus>;

const aliasMap: Array<[string, string[]]> = [
  ["贝五", ["贝多芬 第五交响曲 命运", "贝多芬 5"]],
  ["贝九", ["贝多芬 第九交响曲 合唱", "贝多芬 9"]],
  ["贝七", ["贝多芬 第七交响曲", "贝多芬 7"]],
  ["贝小协", ["贝多芬 小提琴协奏曲"]],
  ["柴小协", ["柴科夫斯基 小提琴协奏曲"]],
  ["柴一", ["柴科夫斯基 第一钢琴协奏曲", "柴科夫斯基 钢琴协奏曲 第一"]],
  ["柴四", ["柴科夫斯基 第四交响曲"]],
  ["柴五", ["柴科夫斯基 第五交响曲"]],
  ["柴六", ["柴科夫斯基 第六交响曲 悲怆"]],
  ["拉二", ["拉赫玛尼诺夫 第二钢琴协奏曲", "拉赫玛尼诺夫 钢琴协奏曲 第二"]],
  ["拉三", ["拉赫玛尼诺夫 第三钢琴协奏曲", "拉赫玛尼诺夫 钢琴协奏曲 第三"]],
  ["拉二交", ["拉赫玛尼诺夫 第二交响曲"]],
  ["马一", ["马勒 第一交响曲 巨人"]],
  ["马二", ["马勒 第二交响曲 复活"]],
  ["马四", ["马勒 第四交响曲"]],
  ["马五", ["马勒 第五交响曲"]],
  ["马九", ["马勒 第九交响曲"]],
  ["德九", ["德沃夏克 第九交响曲 新世界"]],
  ["德八", ["德沃夏克 第八交响曲"]],
  ["布九", ["布鲁克纳 第九交响曲"]],
  ["肖一", ["肖邦 第一钢琴协奏曲"]],
  ["肖二", ["肖邦 第二钢琴协奏曲"]],
  ["门小协", ["门德尔松 小提琴协奏曲"]],
  ["勃一", ["勃拉姆斯 第一交响曲"]],
  ["勃二", ["勃拉姆斯 第二交响曲"]],
  ["勃小协", ["勃拉姆斯 小提琴协奏曲"]],
  ["莫安魂", ["莫扎特 安魂曲"]],
  ["莫小协", ["莫扎特 小提琴协奏曲"]],
];

export function expandSearchQuery(query: string) {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  if (!normalized) return [];
  const expansions = new Set([normalized]);
  for (const [alias, values] of aliasMap) {
    if (normalized.includes(alias.toLocaleLowerCase("zh-CN"))) {
      for (const value of values) expansions.add(value.toLocaleLowerCase("zh-CN"));
    }
  }
  return [...expansions];
}

export function matchesExpandedSearch(searchText: string, expandedQueries: string[]) {
  if (!expandedQueries.length) return true;
  return expandedQueries.some((query) => {
    if (searchText.includes(query)) return true;
    const tokens = query.split(/\s+/).filter(Boolean);
    return tokens.length > 1 && tokens.every((token) => searchText.includes(token));
  });
}

export function readPersonalEvents(): PersonalEventMap {
  try {
    const value = window.localStorage.getItem(personalEventKey);
    return value ? JSON.parse(value) as PersonalEventMap : {};
  } catch {
    return {};
  }
}

export function writePersonalEvents(events: PersonalEventMap) {
  window.localStorage.setItem(personalEventKey, JSON.stringify(events));
}

export function setPersonalEventStatus(
  events: PersonalEventMap,
  eventId: string,
  status: PersonalEventStatus | null,
) {
  const next = { ...events };
  if (status) next[eventId] = status;
  else delete next[eventId];
  writePersonalEvents(next);
  return next;
}

export function copyEventText(event: ConcertEvent) {
  const program = event.program
    .slice(0, 5)
    .map((item) => `- ${formatProgramLine(item)}`)
    .join("\n");
  return [
    event.title,
    `${event.dateLabel} ${event.weekday} ${event.timeLabel}`,
    formatEventVenue(event),
    event.price,
    event.ticketUrl ? `购票：${event.ticketUrl}` : undefined,
    `官网：${event.sourceUrl}`,
    program ? `节目单：\n${program}` : undefined,
  ].filter(Boolean).join("\n");
}

export function downloadEventsIcs(events: Array<ConcertEvent | ConcertEventSummary>, filename: string) {
  const ics = buildIcsCalendar(events);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function buildIcsCalendar(events: Array<ConcertEvent | ConcertEventSummary>) {
  const now = formatIcsDate(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Classic Music//Concert Calendar//ZH-CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const event of events) {
    const start = new Date(event.startTime);
    const end = event.endTime ? new Date(event.endTime) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
    const location = formatEventVenue(event);
    const description = [
      "古典乐演出日历",
      event.price ? `票价：${event.price}` : undefined,
      "sourceUrl" in event ? `官网：${event.sourceUrl}` : undefined,
      "ticketUrl" in event && event.ticketUrl ? `购票：${event.ticketUrl}` : undefined,
      "program" in event && event.program.length
        ? `节目单：${event.program.slice(0, 8).map(formatProgramLine).join("；")}`
        : undefined,
    ].filter(Boolean).join("\\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(event.id)}@classic-music.local`,
      `DTSTAMP:${now}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `LOCATION:${escapeIcsText(location)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(`明天演出：${event.title}`)}`,
      "END:VALARM",
      "BEGIN:VALARM",
      "TRIGGER:-PT2H",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(`两小时后演出：${event.title}`)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function formatProgramLine(item: Pick<ProgramItem, "composer" | "title" | "credits">) {
  const main = [item.composer, item.title].filter(Boolean).join(" · ");
  const credits = item.credits?.length ? `（${item.credits.map(formatProgramCredit).join(" / ")}）` : "";
  return `${main}${credits}`;
}

function formatProgramCredit(credit: ProgramCredit) {
  return `${credit.name} ${credit.role}`;
}

function formatIcsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
