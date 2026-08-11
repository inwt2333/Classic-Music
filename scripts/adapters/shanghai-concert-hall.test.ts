import assert from "node:assert/strict";
import {
  parseShanghaiConcertHallContent,
  parseShanghaiConcertHallPrices,
} from "./shanghai-concert-hall";

const numbered = parseShanghaiConcertHallContent(`
  <p>这是一段演出简介。</p>
  <p><strong>曲目单</strong></p>
  <p>1.《水手致狄奥斯库里兄弟之歌》Op.65 No.1，D.360（1816）</p>
  <p>Lied eines Schiffers an die Dioskuren op.65 n.1, D.360</p>
  <p>2.《夜曲》Op.36 No.2，D.672（1819）</p>
  <p>Nachtstück op.36 n.2, D.672</p>
  <p>——中场休息——</p>
  <p>3.《群星》Op.96 No.1，D.939（1828）</p>
  <p>* 曲目以现场为准</p>
  <p><strong>艺术家</strong></p>
  <p><strong>玛丽亚·克里斯蒂娜·基尔</strong></p>
  <p>女高音</p>
`);
assert.equal(numbered.program.length, 3);
assert.equal(numbered.program[0].title, "水手致狄奥斯库里兄弟之歌");
assert.deepEqual(numbered.program[0].alternateTitles, ["Lied eines Schiffers an die Dioskuren op.65 n.1, D.360"]);
assert.deepEqual(numbered.program[1].alternateTitles, ["Nachtstück op.36 n.2, D.672"]);
assert.match(numbered.program[0].opus || "", /Op\.65/);
assert.deepEqual(numbered.performers, ["玛丽亚·克里斯蒂娜·基尔"]);
assert.equal(numbered.description, "这是一段演出简介。");

const bilingual = parseShanghaiConcertHallContent(`
  <p>音乐会介绍。</p>
  <p><strong>曲目单</strong></p>
  <p><strong>Johannes Brahms</strong></p>
  <p>4 Klavierstücke, Op.119</p>
  <p><strong>约翰内斯·勃拉姆斯</strong></p>
  <p>《四首钢琴小品》（作品119）</p>
  <p><strong>Liszt</strong></p>
  <p>Après une lecture de Dante</p>
  <p><strong>李斯特</strong></p>
  <p>《但丁读后感——奏鸣曲风幻想曲》</p>
  <p><strong>Debussy</strong></p>
  <p>Suite bergamasque</p>
  <p><strong>德彪西</strong></p>
  <p>《贝加莫组曲》</p>
  <p><strong>艺术家</strong></p>
`);
assert.deepEqual(
  bilingual.program.map((item) => [item.composer, item.title]),
  [
    ["约翰内斯·勃拉姆斯", "四首钢琴小品（作品119）"],
    ["李斯特", "但丁读后感——奏鸣曲风幻想曲"],
    ["德彪西", "贝加莫组曲"],
  ],
);
assert.deepEqual(
  bilingual.program.map((item) => item.alternateTitles),
  [["4 Klavierstücke, Op.119"], ["Après une lecture de Dante"], ["Suite bergamasque"]],
);

const inlineAndCredit = parseShanghaiConcertHallContent(`
  <p>演出曲目</p>
  <p>1、肖斯塔科维奇 c小调第一钢琴三重奏 Op.8</p>
  <p>2、贝多芬 D大调第五钢琴三重奏“鬼魂” Op.70 No.1</p>
  <p>3、《云瑶》</p>
  <p>作曲：刘铁山、茅沅</p>
  <p>*曲目以现场演出为准</p>
  <p>艺术家</p>
`);
assert.deepEqual(
  inlineAndCredit.program.map((item) => item.composer),
  ["肖斯塔科维奇", "贝多芬", "刘铁山、茅沅"],
);

const collectionAndArrangement = parseShanghaiConcertHallContent(`
  <p>曲目单</p>
  <p>2、斯克里亚宾《七首前奏曲》OP.11</p>
  <p>3、拉赫玛尼诺夫选集：</p>
  <p>《音画练习曲》Op.39 No.1</p>
  <p>《前奏曲》OP.32 No.5</p>
  <p>《前奏曲》OP.32 No.12</p>
  <p>11.《源流》</p>
  <p>民间乐曲</p>
  <p>改编：樂乐樂社</p>
  <p>12.《离歌》</p>
  <p>创编自古曲《霸王卸甲》《十面埋伏》</p>
  <p>艺术家</p>
`);
assert.deepEqual(
  collectionAndArrangement.program.map((item) => [item.composer, item.title]),
  [
    ["斯克里亚宾", "七首前奏曲"],
    ["拉赫玛尼诺夫", "音画练习曲"],
    ["拉赫玛尼诺夫", "前奏曲"],
    ["拉赫玛尼诺夫", "前奏曲"],
    ["拉赫玛尼诺夫", "源流"],
    ["拉赫玛尼诺夫", "离歌"],
  ],
);

assert.deepEqual(
  parseShanghaiConcertHallPrices(
    { projectMinPrice: 80, projectMaxPrice: 380 },
    { eventPrices: [{ price: 80 }, { price: 180 }, { price: 380 }, { price: 180 }] },
  ),
  { price: "¥80 - ¥380", priceTiers: [80, 180, 380] },
);

const noProgram = parseShanghaiConcertHallContent("<p>本场详情暂未公布节目单。</p>");
assert.equal(noProgram.program.length, 0);

const datedSeries = parseShanghaiConcertHallContent(
  `
    <p>演出曲目</p>
    <p><strong>2026/8/3 作曲家系列——巴赫专场</strong></p>
    <p>巴赫</p><p>《D小调托卡塔与赋格》BWV 565</p>
    <p><strong>2026/8/4 作曲家系列——莫扎特专场</strong></p>
    <p>莫扎特</p><p>《A大调单簧管协奏曲》K. 622</p>
  `,
  { showDate: new Date("2026-08-04T19:30:00+08:00") },
);
assert.deepEqual(datedSeries.program.map((item) => item.composer), ["莫扎特"]);
assert.equal(datedSeries.program[0].title, "A大调单簧管协奏曲");

const bachPartitas685 = parseShanghaiConcertHallContent(`
  <p><strong>曲目单：</strong></p>
  <p>巴赫：G小调第1号小提琴无伴奏奏鸣曲，BWV 1001</p>
  <p>J.S.Bach: Violin Sonata No.1 in G minor, BWV 1001</p>
  <p>巴赫：E大调第3号小提琴帕蒂塔，BWV 1006</p>
  <p>J.S.Bach: Violin Partita No.3 in E major, BWV 1006</p>
  <p>巴赫：D小调第2号小提琴帕蒂塔，BWV 1004</p>
  <p>J.S.Bach: Violin Partita No.2 in D minor, BWV 1004</p>
  <p>*曲目以现场为准</p>
  <p><strong>艺术家</strong></p>
`);
assert.deepEqual(
  bachPartitas685.program.map((item) => [item.composer, item.title, item.opus]),
  [
    ["巴赫", "G小调第1号小提琴无伴奏奏鸣曲", "BWV 1001"],
    ["巴赫", "E大调第3号小提琴帕蒂塔", "BWV 1006"],
    ["巴赫", "D小调第2号小提琴帕蒂塔", "BWV 1004"],
  ],
);
assert.deepEqual(
  bachPartitas685.program.map((item) => item.alternateTitles),
  [
    ["J.S.Bach: Violin Sonata No.1 in G minor, BWV 1001"],
    ["J.S.Bach: Violin Partita No.3 in E major, BWV 1006"],
    ["J.S.Bach: Violin Partita No.2 in D minor, BWV 1004"],
  ],
);

console.log("Shanghai Concert Hall adapter tests passed.");
