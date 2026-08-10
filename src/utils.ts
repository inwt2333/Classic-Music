import type { ConcertEventSummary } from "./types";

const chinaDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const weekdayFormatter = new Intl.DateTimeFormat("zh-CN", { weekday: "short" });

export function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

export function formatEventVenue(event: Pick<ConcertEventSummary, "venue" | "hall">) {
  const venue = normalizeVenueName(event.venue);
  return event.hall ? `${venue} · ${event.hall}` : venue;
}

export function normalizeVenueName(value: string) {
  const aliases: Record<string, string> = {
    "Beijing Concert Hall": "北京音乐厅",
    "Concert Hall of National Centre for the Performing Arts": "国家大剧院",
  };
  return aliases[value.trim()] ?? value;
}

export function normalizeEnsembleName(value?: string) {
  if (!value) return undefined;
  if (value.includes("新加坡交响乐团")) return "新加坡交响乐团";
  if (value.includes("中国交响乐团")) return "中国交响乐团";
  if (value.includes("爱乐男声合唱团")) return "爱乐男声合唱团";
  if (value.includes("上海交响乐团")) return "上海交响乐团";
  if (value.includes("苏州交响乐团")) return "苏州交响乐团";
  const cleaned = (value.includes("与") ? value.split("与").at(-1) : value)?.replace(/^与/, "").trim() ?? "";
  if (
    cleaned.length <= 24
    && !/[丨|]/.test(cleaned)
    && /(?:交响乐团|爱乐乐团|管弦乐团|室内乐团|合唱团|四重奏)$/.test(cleaned)
  ) return cleaned;
  return undefined;
}

export function eventDateKey(value: string | Date) {
  const parts = chinaDateFormatter.formatToParts(value instanceof Date ? value : new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function formatMonth(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function formatDayHeading(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return `${month}月${day}日 ${weekdayFormatter.format(new Date(year, month - 1, day))}`;
}

export function buildCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  return Array.from(
    { length: 42 },
    (_, index) => new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset + index),
  );
}

export function getInitialCalendarMonth(events: ConcertEventSummary[]) {
  const currentMonth = monthKey(new Date());
  const nextEvent =
    events.find((event) => eventDateKey(event.startTime).startsWith(currentMonth)) ??
    events.find((event) => new Date(event.startTime).getTime() >= Date.now()) ??
    events[0];
  if (!nextEvent) return startOfMonth(new Date());
  const [year, month] = eventDateKey(nextEvent.startTime).split("-").map(Number);
  return new Date(year, month - 1, 1);
}

export function dateMatchesPreset(
  value: string,
  preset: "all" | "week" | "weekend" | "month",
) {
  if (preset === "all") return true;
  const eventKey = eventDateKey(value);
  const todayKey = eventDateKey(new Date());
  if (preset === "month") return eventKey.startsWith(todayKey.slice(0, 7));

  const [year, month, day] = todayKey.split("-").map(Number);
  const today = new Date(year, month - 1, day);
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(year, month - 1, day - mondayOffset);
  const sunday = new Date(year, month - 1, day + 6 - mondayOffset);
  const inWeek = eventKey >= localDateKey(monday) && eventKey <= localDateKey(sunday);
  if (preset === "week") return inWeek;

  const eventDate = new Date(`${eventKey}T12:00:00`);
  return inWeek && [0, 6].includes(eventDate.getDay());
}

export function bilibiliSearchUrl(keyword: string) {
  return `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`;
}

export function localizedMusicSourceUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname !== "music.apple.com") return value;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length && /^[a-z]{2}$/i.test(segments[0])) segments[0] = "cn";
    else segments.unshift("cn");
    url.pathname = `/${segments.join("/")}`;
    return url.toString();
  } catch {
    return value;
  }
}

export function resourceSearchUrl(keyword: string) {
  return `https://cn.bing.com/search?q=${encodeURIComponent(`${keyword} 古典音乐 作品介绍`)}`;
}

export function imslpSearchUrl(keyword: string) {
  return `https://imslp.org/wiki/Special:Search?search=${encodeURIComponent(keyword)}`;
}

export function musicBrainzWorkSearchUrl(keyword: string) {
  return `https://musicbrainz.org/search?query=${encodeURIComponent(keyword)}&type=work&method=indexed`;
}
