import type { ChangeDataset, ConcertDataset } from "../src/types";

const SITE_URL = "https://inwt233.cn/Classic-Music/";

const citySlugs: Record<string, string> = {
  "上海": "shanghai",
  "北京": "beijing",
  "苏州": "suzhou",
  "广州": "guangzhou",
  "深圳": "shenzhen",
  "杭州": "hangzhou",
  "西安": "xian",
  "哈尔滨": "harbin",
};

export function cityFeedSlug(city: string) {
  return citySlugs[city] ?? `city-${encodeURIComponent(city)}`;
}

function icsEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldLine(line: string) {
  if (line.length <= 74) return line;
  const parts: string[] = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length) {
    parts.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  return parts.join("\r\n");
}

function icsDateTime(iso: string) {
  return `${new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`;
}

function icsLine(name: string, value: string) {
  return foldLine(`${name}:${value}`);
}

export function buildCalendarFeed(
  events: ConcertDataset["events"],
  options: { name: string; generatedAt: string },
) {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Classic-Music//Concert Calendar//ZH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    icsLine("X-WR-CALNAME", options.name),
  ];
  for (const event of events) {
    const description = [
      event.ensemble,
      event.conductor ? `指挥：${event.conductor}` : "",
      event.price,
      ...event.program.slice(0, 5).map((item) => `${item.composer ? `${item.composer}·` : ""}${item.title}`),
    ].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      icsLine("UID", `${event.id}@classic-music`),
      icsLine("DTSTAMP", icsDateTime(options.generatedAt)),
      icsLine("DTSTART", icsDateTime(event.startTime)),
      icsLine("DTEND", icsDateTime(event.endTime ?? new Date(new Date(event.startTime).getTime() + 2 * 3600_000).toISOString())),
      icsLine("SUMMARY", event.title),
      icsLine("LOCATION", [event.venue, event.hall].filter(Boolean).join(" ")),
      icsLine("DESCRIPTION", icsEscape(description)),
      icsLine("URL", event.ticketUrl ?? event.sourceUrl),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822Date(iso: string) {
  return new Date(iso).toUTCString();
}

const changeLabels: Record<string, string> = {
  added: "新演出",
  removed: "已下架",
  rescheduled: "改期",
  cancelled: "取消",
  lineup: "阵容变化",
  program: "曲目变化",
  price: "票价变化",
};

export function buildChangesRss(changes: ChangeDataset, limit = 60) {
  const items = changes.changes
    .slice()
    .sort((left, right) => right.detectedAt.localeCompare(left.detectedAt))
    .slice(0, limit)
    .map((change) => {
      const label = changeLabels[change.type] ?? change.type;
      return [
        "    <item>",
        `      <title>${xmlEscape(`[${label}] ${change.summary}`)}</title>`,
        `      <link>${xmlEscape(`${SITE_URL}?event=${change.eventId}`)}</link>`,
        `      <guid isPermaLink="false">${xmlEscape(change.id)}</guid>`,
        `      <pubDate>${rfc822Date(change.detectedAt)}</pubDate>`,
        `      <description>${xmlEscape(change.summary)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>古典音乐演出日历 · 数据变更</title>
    <link>${SITE_URL}</link>
    <description>新增、取消、改期与票价变化（每 8 小时更新）</description>
    <language>zh-CN</language>
    <lastBuildDate>${rfc822Date(changes.generatedAt)}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

export function buildFeedIndex(dataset: ConcertDataset) {
  const cities = [...new Set(dataset.events.map((event) => event.city))];
  const sourceIndex = new Map<string, string>();
  for (const event of dataset.events) {
    for (const source of event.sources ?? []) {
      if (!sourceIndex.has(source.sourceId)) sourceIndex.set(source.sourceId, source.sourceName);
    }
  }
  return {
    schemaVersion: 1,
    generatedAt: dataset.generatedAt,
    calendar: SITE_URL,
    all: "feeds/all.ics",
    cities: Object.fromEntries(cities.map((city) => [city, `feeds/cities/${cityFeedSlug(city)}.ics`])),
    sources: Object.fromEntries([...sourceIndex].map(([id, name]) => [id, { name, path: `feeds/sources/${id}.ics` }])),
    changesRss: "feeds/changes.rss.xml",
  };
}
