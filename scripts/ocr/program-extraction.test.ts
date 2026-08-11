import assert from "node:assert/strict";
import { parseOrientalArtCenterOcrText } from "../adapters/shanghai-oriental-art-center";
import {
  evaluateOcrProgram,
  normalizeOcrText,
  selectOcrProgramForDate,
  type OcrPageResult,
} from "./program-extraction";

function page(text: string, confidence = 90): OcrPageResult {
  return {
    url: "https://example.com/program.jpg",
    text,
    confidence,
    imageHash: "image-hash",
    cacheHit: false,
  };
}

const accepted = evaluateOcrProgram(
  [
    page(
      `音乐会精选曲目 Programme
Wellerman;
Be What You Wanna Be;
披头士乐队曲目串烧;
爱之初体验;
甜蜜蜜;
我的小绿仙人掌`,
    ),
  ],
  parseOrientalArtCenterOcrText,
);
assert.equal(accepted.accepted, true);
assert.equal(accepted.program.length, 6);
assert.equal(accepted.confidence, 90);

const lowConfidence = evaluateOcrProgram(
  [page("曲目\n贝多芬：第五交响曲\n莫扎特：第四十交响曲", 42)],
  parseOrientalArtCenterOcrText,
);
assert.equal(lowConfidence.accepted, false);
assert.match(lowConfidence.reasons.join(" "), /置信度/);

const missingHeading = evaluateOcrProgram(
  [page("贝多芬：第五交响曲\n莫扎特：第四十交响曲")],
  parseOrientalArtCenterOcrText,
);
assert.equal(missingHeading.accepted, false);
assert.match(missingHeading.reasons.join(" "), /节目单标题/);

const tooFewItems = evaluateOcrProgram(
  [page("节目单\n贝多芬：第五交响曲")],
  parseOrientalArtCenterOcrText,
);
assert.equal(tooFewItems.accepted, false);
assert.match(tooFewItems.reasons.join(" "), /可信节目项/);

const prosePollution = evaluateOcrProgram(
  [page(`节目单
蓝色多瑙河圆舞曲
1867年2月9日，这部作品在维也纳首演。
据说作者是在一个晚上即兴创作出此曲的
这首作品后来传遍世界各大城市
春之声圆舞曲
当时作者已年近六旬，但此曲依然充满活力
拉德斯基进行曲
每年维也纳新年音乐会总是以这首曲子作为结束曲`) ],
  parseOrientalArtCenterOcrText,
);
assert.equal(prosePollution.accepted, false);
assert.match(prosePollution.reasons.join(" "), /说明文字/);

const wrappedLines = evaluateOcrProgram(
  [page(`节目单\n${Array.from({ length: 46 }, (_, index) => `曲目 ${index + 1}`).join("\n")}`)],
  parseOrientalArtCenterOcrText,
);
assert.equal(wrappedLines.accepted, false);
assert.match(wrappedLines.reasons.join(" "), /误拆/);

const structured = evaluateOcrProgram(
  [{
    ...page("节目单\n4/21\n模型原始文字可能不适合规则解析"),
    programSections: [
      {
        date: "4/21",
        time: "19:45",
        program: [{
          composer: "亨德米特",
          title: "奏鸣曲",
          alternateTitles: ["Sonata"],
          movements: [{ number: "I", title: "相当适中的", alternateTitles: ["Ziemlich lebhaft"] }],
          confidence: "ocr",
        }],
      },
      {
        date: "2026.8.11",
        time: "19:45",
        program: [{ composer: "莫扎特", title: "A大调单簧管五重奏", confidence: "ocr" }],
      },
    ],
  }],
  () => [{ composer: "错误日期", title: "错误解析", confidence: "ocr" }],
  { minProgramItems: 1 },
);
assert.equal(structured.accepted, true);
assert.equal(structured.program[0].composer, "亨德米特");
assert.deepEqual(
  selectOcrProgramForDate(structured, new Date("2026-08-11T11:45:00.000Z")).map((item) => item.title),
  ["A大调单簧管五重奏"],
);
assert.deepEqual(
  selectOcrProgramForDate(structured, new Date("2026-09-09T11:45:00.000Z")),
  [],
);

const scheduleOverview = evaluateOcrProgram(
  [{
    ...page("4/21 竖琴专场音乐会\n8/11 单簧管三重奏音乐会"),
    programSections: [
      { date: "4/21", program: [{ title: "竖琴专场音乐会", confidence: "ocr" }] },
      { date: "8/11", program: [{ title: "单簧管三重奏音乐会", confidence: "ocr" }] },
    ],
  }],
  () => [],
);
assert.equal(scheduleOverview.accepted, false);
assert.equal(scheduleOverview.programSections.length, 0);

const scheduleOverviewWithoutConcertSuffix = evaluateOcrProgram(
  [{
    ...page("4/21 竖琴专场\n5/12 弦乐五重奏\n5/26 钢琴三重奏\n6/09 歌剧选段"),
    programSections: [
      { date: "4/21", program: [{ title: "竖琴专场", confidence: "ocr" }] },
      { date: "5/12", program: [{ title: "弦乐五重奏", confidence: "ocr" }] },
      { date: "5/26", program: [{ title: "钢琴三重奏", confidence: "ocr" }] },
      { date: "6/09", program: [{ title: "歌剧选段", confidence: "ocr" }] },
    ],
  }],
  () => [],
);
assert.equal(scheduleOverviewWithoutConcertSuffix.programSections.length, 0);

const multiDateWithContinuation = evaluateOcrProgram(
  [
    {
      ...page("曲目\n9/09"),
      programSections: [{ date: "9/09", program: [{ title: "九月作品", confidence: "ocr" }] }],
    },
    {
      ...page("曲目\n10/13 节目\n11/03 节目"),
      programSections: [
        { program: [{ title: "十月作品", confidence: "ocr" }] },
        { date: "11/03", program: [{ title: "十一月作品", confidence: "ocr" }] },
      ],
    },
    {
      ...page("十一月节目续页"),
      programSections: [{ program: [{ title: "十一月续篇", confidence: "ocr" }] }],
    },
  ],
  () => [],
  {
    minProgramItems: 1,
    targetDates: [
      new Date("2026-09-09T11:45:00.000Z"),
      new Date("2026-10-13T11:45:00.000Z"),
      new Date("2026-11-03T11:45:00.000Z"),
    ],
  },
);
assert.deepEqual(
  selectOcrProgramForDate(multiDateWithContinuation, new Date("2026-10-13T11:45:00.000Z")).map((item) => item.title),
  ["十月作品"],
);
assert.deepEqual(
  selectOcrProgramForDate(multiDateWithContinuation, new Date("2026-11-03T11:45:00.000Z")).map((item) => item.title),
  ["十一月作品", "十一月续篇"],
);

assert.equal(
  normalizeOcrText("节 目 单\n曲 目 ；  贝多芬"),
  "节目单\n曲目; 贝多芬",
);

console.log("OCR extraction quality-gate tests passed.");
