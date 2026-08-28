import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  extractGzdjyProgramLines,
  parseGzdjyFirstShowTime,
  parseGzdjyListResponse,
  parseGzdjyPriceTiers,
  parseGzdjyProgramLine,
} from "./guangzhou-grand-theatre";

async function main() {
  const fixtureDir = resolve(process.cwd(), "scripts/fixtures/guangzhou-grand-theatre");
  const listRaw = await readFile(resolve(fixtureDir, "list-page1.json"), "utf8");
  const list = parseGzdjyListResponse(listRaw);

  assert.equal(list.total, 34);
  assert.equal(list.rows.length, 10);
  const musicRow = list.rows.find((row) => row.id === "24144");
  assert.ok(musicRow, "列表应包含 24144 音乐后花园场次");
  assert.equal(musicRow!.name, "音乐后花园 德国新四重奏乐团音乐会");
  assert.equal(musicRow!.place, "广州大剧院 实验剧场");
  assert.equal(musicRow!.category, "音乐会");
  assert.equal(musicRow!.priceText, "80 180 280");
  assert.ok(musicRow!.link.startsWith("/piao/4/24144.html"));

  assert.equal(
    parseGzdjyFirstShowTime("2026年9月13日（周日）+19:30")?.toISOString(),
    "2026-09-13T11:30:00.000Z",
  );
  assert.equal(
    parseGzdjyFirstShowTime("2026年9月11-12日（周五-六）19:30")?.toISOString(),
    "2026-09-11T11:30:00.000Z",
  );
  assert.equal(
    parseGzdjyFirstShowTime("2026年9月16-18日（周三-五）19:30+9月19日（周六）14:30+19:30")?.toISOString(),
    "2026-09-16T11:30:00.000Z",
  );
  assert.equal(
    parseGzdjyFirstShowTime("2026年9月30日-10月2日（周三-五）19:30")?.toISOString(),
    "2026-09-30T11:30:00.000Z",
  );
  assert.equal(
    parseGzdjyFirstShowTime("2026年10月1-2日（周四-五）10:30/15:00")?.toISOString(),
    "2026-10-01T02:30:00.000Z",
  );
  assert.equal(parseGzdjyFirstShowTime("待定"), undefined);

  assert.deepEqual(parseGzdjyPriceTiers("180 280 480 680 880 1080 1280"), [180, 280, 480, 680, 880, 1080, 1280]);
  assert.deepEqual(parseGzdjyPriceTiers("380（茶席区）280（沉浸区）80（二层看台）"), [80, 280, 380]);
  assert.deepEqual(parseGzdjyPriceTiers(""), []);

  const program24144 = extractGzdjyProgramLines(
    await readFile(resolve(fixtureDir, "detail-24144.html"), "utf8"),
  );
  assert.ok(program24144.length >= 14, "24144 应解析出完整曲目单");
  assert.ok(program24144.includes("《桑巴姐姐》Samba di Didi"));
  assert.ok(!program24144.some((line) => /中场休息|Intermission/i.test(line)), "中场休息不应算作曲目");
  assert.ok(!program24144.some((line) => line.startsWith("*")), "曲目以…为准的备注应被排除");
  assert.ok(!program24144.some((line) => /毕业于|钢琴家/.test(line)), "艺术家介绍不应混入曲目");

  const program24143 = extractGzdjyProgramLines(
    await readFile(resolve(fixtureDir, "detail-24143.html"), "utf8"),
  );
  assert.ok(program24143.length >= 10);
  assert.ok(program24143.some((line) => line.includes("巴赫") && line.includes("BWV")));

  const program24178 = extractGzdjyProgramLines(
    await readFile(resolve(fixtureDir, "detail-24178.html"), "utf8"),
  );
  assert.deepEqual(program24178, [], "无曲目单页面应返回空数组而非噪声");

  const mutterLines = extractGzdjyProgramLines(
  readFileSync(resolve(process.cwd(), "scripts/fixtures/guangzhou-grand-theatre/mutter-24101.html"), "utf8"),
);
assert.equal(mutterLines.length, 3);
const mutterProgram = mutterLines.map((line) => parseGzdjyProgramLine(line)).filter(Boolean);
assert.deepEqual(
  mutterProgram.map((item) => [item?.composer ?? "—", item?.title]),
  [
    ["巴特沃斯", "什罗普郡少年狂想曲"],
    ["门德尔松", "E小调小提琴协奏曲"],
    ["贝多芬", "C小调第五交响曲“命运”"],
  ],
);
assert.equal(parseGzdjyProgramLine("1《托卡塔》 作品编号BWV 564——约翰·塞巴斯蒂安·巴赫")?.composer, "约翰·塞巴斯蒂安·巴赫");
assert.equal(parseGzdjyProgramLine("《桑巴姐姐》Samba di Didi")?.alternateTitles?.[0], "Samba di Didi");
assert.equal(parseGzdjyProgramLine("曼努埃尔·庞塞：《南方小奏鸣曲》——《田野》《歌谣》《节庆》")?.movements?.length, 3);
assert.equal(parseGzdjyProgramLine("《太阳升起》 约兰·索舍尔改编")?.credits?.[0].name, "约兰·索舍尔");
assert.equal(parseGzdjyProgramLine("巴赫（约翰·瑟尔谢尔改编）：《前奏曲》《阿勒芒德舞曲》")?.credits?.[0].role, "改编");
assert.equal(parseGzdjyProgramLine("贝多芬《C 小调 32 首变奏曲》WoO 80")?.composer, "贝多芬");
assert.equal(parseGzdjyProgramLine("2《第一四重奏》 ——让-巴蒂斯特·桑热莱")?.composer, "让-巴蒂斯特·桑热莱");

console.log("Guangzhou Grand Theatre parser tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
