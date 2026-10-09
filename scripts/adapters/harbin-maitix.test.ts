import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getHarbinMaitixPriceTiers,
  parseHarbinMaitixDetail,
  parseHarbinMaitixSeedFile,
  parseHarbinMaitixProgram,
  parseLoneComposer,
} from "./harbin-maitix";
import { normalizeProgramItemCredits } from "../data-store";

const parsed = parseHarbinMaitixDetail({
  projectName: "四重奏回响：贝多芬·舒曼室内乐之夜",
  projectDetail: `
    <p>四位优秀青年演奏家联袂演出</p>
    <p><strong>一. 罗伯特·舒曼：A大调第三弦乐四重奏</strong></p>
    <p>Op.41 No.3</p>
    <p>Robert Schumann:</p>
    <p>String Quartet No.3 in A Major, Op.41 No.3</p>
    <p><strong>I. Andante espressivo</strong></p>
    <p><strong>富有表情的行板</strong></p>
    <p><strong>II. Introduzione: Andante con moto –</strong></p>
    <p><strong>Allegro vivace</strong></p>
    <p><strong>引子：流动的行板 — 活泼的快板</strong></p>
    <p><strong>二、路德维希·凡·贝多芬：C大调第九弦乐四重奏</strong></p>
    <p>Op.59 No.3《拉兹莫夫斯基》</p>
    <p>Ludwig van Beethoven: String Quartet No.9 in C Major, Op.59 No.3</p>
  `,
  eventVoList: [{ eventToken: "1", showTime: 1786863600000 }],
});

assert.equal(parsed.program.length, 2);
assert.equal(parsed.program[0].composer, "罗伯特·舒曼");
assert.equal(parsed.program[0].movements?.[0].title, "富有表情的行板");
assert.deepEqual(parsed.program[0].movements?.[0].alternateTitles, ["Andante espressivo"]);
assert.deepEqual(parsed.program[0].movements?.[1].alternateTitles, ["Introduzione: Andante con moto – Allegro vivace"]);
assert.match(parsed.program[0].alternateTitles?.[0] || "", /String Quartet No\.3/);
assert.equal(parsed.program[1].composer, "路德维希·凡·贝多芬");
assert.equal(parsed.description, "四位优秀青年演奏家联袂演出");
assert.deepEqual(getHarbinMaitixPriceTiers({ priceVoList: [
  { price: "80", priceType: 0 }, { price: "120", priceType: 0 },
  { price: "192", priceType: 2 }, { price: "80", priceType: 0 },
] }), [80, 120]);

const annotatedProgram = parseHarbinMaitixDetail({
  projectName: "弦•击 室内乐音乐会",
  projectDetail: `
    <p>精彩曲目&曲目赏析</p>
    <p>巴赫《G大调三重奏鸣曲》BWV 1039</p>
    <p>Trio Sonata in G major, BWV 1039</p>
    <p>第一乐章：柔板</p>
    <p>Adagio</p>
    <p>第二乐章：快板</p>
    <p>Allegro ma non presto</p>
    <p>海顿《G大调弦乐三重奏第二首》Op.5 Hob.V:20</p>
    <p>第一乐章：快板 Allegro</p>
    <p>德沃夏克《小品集》</p>
    <p>Antonin Dvorak: Bagatelles</p>
    <p>维瓦尔第《福利亚——D小调第12号弦乐三重奏与鼓奏鸣曲》</p>
    <p>全称：《D小调第12号三重奏“福利亚”》</p>
    <p>作曲家：安东尼奥·维瓦尔第</p>
    <p>出版：1705年</p>
    <p>编制：2把小提琴 + 大提琴</p>
  `,
  eventVoList: [{ eventToken: "2", showTime: 1787482800000 }],
});
assert.deepEqual(annotatedProgram.program.map((item) => item.composer), ["巴赫", "海顿", "德沃夏克", "维瓦尔第"]);
assert.equal(annotatedProgram.program[0].movements?.length, 2);
assert.ok(!annotatedProgram.program.some((item) => /^(?:全称|作曲家|出版|编制|第二乐章)$/.test(item.composer || "")));

const seededProjects = parseHarbinMaitixSeedFile(JSON.parse(
  readFileSync(resolve(process.cwd(), "data/source-seeds/harbin-maitix.json"), "utf8"),
));
assert.deepEqual(seededProjects.map((project) => String(project.projectToken)), ["238906060", "239358001"]);
const seededClassic = parseHarbinMaitixDetail(seededProjects[0]);
assert.equal(seededClassic.events[0].showTime, 1786791600000);
assert.equal(seededClassic.conductor, "李心草");
assert.equal(seededClassic.ensemble, "哈尔滨交响乐团");
assert.deepEqual(seededClassic.program.map((item) => item.composer), ["贝多芬", "莱尼克", "柴可夫斯基"]);

const seededAugust = parseHarbinMaitixDetail(seededProjects[1]);
assert.equal(seededAugust.events[0].showTime, 1787914800000);
assert.equal(seededAugust.conductor, "陈琳");
assert.deepEqual(seededAugust.performers, ["玛丽安娜·特切里安"]);
assert.equal(seededAugust.program.length, 3);
assert.deepEqual(seededAugust.program[0].movements?.[0].alternateTitles, ["En bateau. Andantino"]);

// 江苏大剧院（同一麦座平台、jscpa 租户）的真实项目详情：
// 详情不用 <p>/<li> 而是 <h3>+<br> 分行，曲目在【曲目单】标记之后、艺术家介绍之前。
const jscFixtureDir = resolve(process.cwd(), "scripts/fixtures/jiangsu-centre-theatre");
const blackshaw = parseHarbinMaitixDetail(
  JSON.parse(readFileSync(resolve(jscFixtureDir, "detail-blackshaw.json"), "utf8")),
);
assert.equal(blackshaw.program.length, 3);
assert.deepEqual(
  blackshaw.program.map((item) => item.composer),
  ["莫扎特", "舒曼", "舒伯特"],
);
assert.equal(blackshaw.program[0].title, "B小调柔板，作品号K.540");
assert.deepEqual(blackshaw.program[0].alternateTitles, ["Mozart：Adagio in B minor K.540"]);

const goldberg = parseHarbinMaitixDetail(
  JSON.parse(readFileSync(resolve(jscFixtureDir, "detail-organ-goldberg.json"), "utf8")),
);
assert.equal(goldberg.program.length, 1);
assert.equal(goldberg.program[0].composer, "J.S.巴赫");
assert.ok(goldberg.program[0].title.includes("哥德堡变奏曲"));

const pappano = parseHarbinMaitixDetail(
  JSON.parse(readFileSync(resolve(jscFixtureDir, "detail-pappano.json"), "utf8")),
);
assert.ok(pappano.program.length >= 2);
assert.ok(pappano.program.some((item) => item.composer === "普罗科菲耶夫"));
assert.ok(
  !pappano.program.some((item) => /演奏|独奏$/.test(item.composer ?? "")),
  "演奏家角色词不应被识别为作曲家",
);

const jscRomeo = parseHarbinMaitixDetail(
  JSON.parse(readFileSync(resolve(jscFixtureDir, "maitix-238912026.json"), "utf8")),
);
assert.deepEqual(jscRomeo.program.map((item) => [item.composer ?? "—", item.movements?.length ?? 0]), [
  ["瓦格纳", 0],
  ["谢尔盖·谢尔盖耶维奇·普罗科菲耶夫", 3],
  ["谢尔盖·谢尔盖耶维奇·普罗科菲耶夫", 8],
]);
assert.equal(jscRomeo.program[1].title, "D大调第一小提琴协奏曲，作品19");
assert.equal(jscRomeo.program[2].movements?.[0].title, "蒙泰古家族与凯普莱特家族");

const jscArias = parseHarbinMaitixDetail(
  JSON.parse(readFileSync(resolve(jscFixtureDir, "maitix-239251010.json"), "utf8")),
);
assert.equal(jscArias.program.length, 10);
assert.deepEqual(
  jscArias.program.slice(0, 3).map((item) => [item.composer ?? "—", item.title.split(" ")[0]]),
  [
    ["比才", "卡门序曲"],
    ["威尔第", "女人善变"],
    ["雷昂卡瓦洛", "先生们，女士们，可以开始了吗？"],
  ],
);
assert.ok(jscArias.program.some((item) => item.composer === "莱哈尔" && item.title.startsWith("你是我心中的挚爱")));
assert.ok(jscArias.program.every((item) => !/拉开帷幕|将运用/.test(item.title)));

// 官网把演唱形式放在书名号前；词曲署名在书名号后。
const longMarchSongs = parseHarbinMaitixDetail({
  projectName: "《红军不怕远征难·长征组歌》合唱音乐会",
  projectDetail: `<h3>曲目单<br>
    混声合唱《没有共产党就没有新中国》 曹火星 词曲<br>
    混声合唱《十送红军》 张士燮 词 朱正本 曲<br>
    混声合唱《三大纪律八项注意》 红军革命歌曲<br>
    混声合唱《南泥湾》 贺敬之 词 马可 曲<br>
    男高音独唱《红星照我去战斗》 集体 词 傅庚辰 曲 演唱：赵天刃<br>
    男高音独唱《怀念战友》 雷振邦 词 雷振邦 赵心水 曲演唱：王超<br>
    女高音独唱《我爱你中国》 瞿琮 词 郑秋枫 曲 演唱：王一凤<br>
    混声合唱《嘉陵江上》 端木蕻良 词 贺绿汀 曲<br>
    混声合唱《追寻》 张和平 词 舒楠 曲<br>
    混声合唱《在灿烂阳光下》 集体 词 印青 曲<br>
    艺术家介绍</h3>`,
});
assert.equal(longMarchSongs.program.length, 10);
assert.ok(longMarchSongs.program.every((item) => item.composer === undefined));
assert.equal(longMarchSongs.program[0].title, "没有共产党就没有新中国 曹火星 词曲");
const farewell = normalizeProgramItemCredits(longMarchSongs.program[1]);
assert.equal(farewell.title, "十送红军");
assert.equal(farewell.composer, "朱正本");
assert.deepEqual(farewell.credits, [{ name: "张士燮", role: "词" }]);
assert.equal(longMarchSongs.program[5].title, "怀念战友 雷振邦 词 雷振邦 赵心水 曲");
assert.equal(parseLoneComposer("混声合唱："), undefined);
assert.deepEqual(parseHarbinMaitixProgram(["混声合唱：", "《黄河协奏曲》"])
  .map((item) => [item.composer, item.title]), [[undefined, "黄河协奏曲"]]);

console.log("Harbin Maitix parser tests passed.");
