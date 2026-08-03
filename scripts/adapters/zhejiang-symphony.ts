import type { ProgramItem } from "../../src/types";

export type ZhejiangCalendarEvent = {
  uid: string;
  title: string;
  start: string;
  end?: string;
  description: string;
  url: string;
  location: string;
};

export function parseZhejiangSymphonyCalendar(ical: string) {
  const unfolded = ical.replace(/\r?\n[ \t]/g, "");
  return unfolded.split("BEGIN:VEVENT").slice(1).map((block) => {
    const field = (name: string) => unescapeIcal(block.match(new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, "m"))?.[1] ?? "");
    return {
      uid: field("UID"),
      title: field("SUMMARY"),
      start: field("DTSTART"),
      end: field("DTEND") || undefined,
      description: field("DESCRIPTION"),
      url: field("URL"),
      location: field("LOCATION"),
    } satisfies ZhejiangCalendarEvent;
  }).filter((event) => event.uid && event.title && event.start);
}

export function parseZhejiangSymphonyProgram(description: string) {
  const lines = description.split(/\n|\r/).map(cleanText).filter(Boolean);
  const marker = lines.findIndex((line) => /^音乐会曲目|^演出曲目|^节目单/.test(line));
  if (marker < 0) return [];
  const program: ProgramItem[] = [];
  for (let index = marker + 1; index < lines.length; index += 1) {
    const title = lines[index];
    if (/^(?:上半场|下半场|中场休息)$/.test(title)) continue;
    if (/指挥介绍|演奏家介绍|艺术家介绍/.test(title)) break;
    const composer = lines[index + 1];
    if (!composer || composer.length > 40 || /协奏曲|交响曲|序曲|组曲|变奏曲|狂想曲|《/.test(composer)) continue;
    program.push({ composer, title: title.replace(/[《》]/g, ""), confidence: "official" });
    index += 1;
  }
  return program;
}

function unescapeIcal(value: string) { return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim(); }
function cleanText(value: string) { return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
