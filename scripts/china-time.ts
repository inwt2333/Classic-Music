const chinaDateLabelFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function parseChinaDate(value: string) {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return new Date(`${normalized}+08:00`);
}

export function formatChinaDateLabels(date: Date) {
  const parts = chinaDateLabelFormatter.formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: getPart("weekday"),
    dateLabel: `${getPart("month")}/${getPart("day")}`,
    timeLabel: `${getPart("hour")}:${getPart("minute")}`,
  };
}
