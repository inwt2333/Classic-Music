import assert from "node:assert/strict";
import {
  parseOrientalArtCenterContent,
  parseOrientalArtCenterOcrText,
  parseOrientalArtCenterPrices,
} from "./shanghai-oriental-art-center";

const content = parseOrientalArtCenterContent(`
  <p>*请留意确认所购场次和票档，票品一经售出，恕不退换。</p>
  <p>钢琴 | 安德烈·皮萨列夫</p>
  <p>低男中音 | 张闻歌</p>
  <p>音乐会曲目 PROGRAM</p>
  <p>拉赫玛尼诺夫 | G小调第一钢琴三重奏</p>
  <p>Rachmaninoff | Piano Trio No. 1 in G Minor</p>
  <p>门德尔松 | D小调第一钢琴三重奏，作品49</p>
  <p>Mendelssohn | Piano Trio No. 1 in D Minor, Op. 49</p>
  <p>1. 激动的甚快板</p>
  <p>Ⅰ. Molto allegro ed agitato</p>
  <p>巫中杰 Wu Zhong Jie | 英剧主题曲，选自《神探夏洛克》配乐 “Mysteries from Sherlock”</p>
  <p>*曲目以现场为准 Program is subject to change</p>
  <p>艺术家简介</p>
  <p>安德烈·皮萨列夫现任莫斯科国立柴科夫斯基音乐学院钢琴系主任。</p>
`);

assert.deepEqual(content.performers, ["安德烈·皮萨列夫", "张闻歌"]);
assert.equal(content.program.length, 3);
assert.deepEqual(content.program[1], {
  composer: "门德尔松",
  title: "D小调第一钢琴三重奏，作品49",
  alternateTitles: ["Piano Trio No. 1 in D Minor, Op. 49"],
  movements: [{
    number: "1",
    title: "激动的甚快板",
    alternateTitles: ["Molto allegro ed agitato"],
  }],
  confidence: "official",
});
assert.deepEqual(content.program[2], {
  composer: "巫中杰",
  title: "英剧主题曲，选自《神探夏洛克》配乐",
  alternateTitles: ["“Mysteries from Sherlock”"],
  confidence: "official",
});
assert.match(content.description || "", /现任莫斯科国立柴科夫斯基音乐学院/);
assert.doesNotMatch(content.description || "", /请留意确认/);

const pricing = parseOrientalArtCenterPrices([
  {
    ticketPriceList: [
      { price: 480, basisPrice: 480, discount: 100 },
      { price: 380, basisPrice: 380, discount: 100 },
      { price: 384, basisPrice: 480, discount: 80 },
      { price: 304, basisPrice: 380, discount: 80 },
    ],
  },
]);

assert.deepEqual(pricing.priceTiers, [380, 480]);
assert.equal(pricing.price, "¥380 - ¥480");

const numberedProgram = parseOrientalArtCenterContent(`
  <p>本次交响音乐会节目单: (每一首曲目由交响乐团协奏)</p>
  <p>1.小提琴独奏&交响乐团：《维瓦尔第·A小调小提琴协奏曲RV356》第一乐章 快板</p>
  <p>演 奏：侯睿翹 HAU RAFAEL</p>
  <p>2.钢琴独奏&交响乐团：《贝多芬·升c小调14钢琴奏鸣曲Op.27, No.2 – 月光奏鸣曲》第三乐章</p>
  <p>演 奏：方芷兮 SARAH FANG 钢琴导师：肖立</p>
  <p>3.指 挥&交响乐团：《比才·卡门第一组曲》（选段）</p>
  <p>1）前奏曲；2）阿拉贡舞曲；3）斗牛士之歌</p>
  <p>指 挥：张沐恩 MOSES ZHANG 指挥导师：张国勇</p>
  <p>*曲目以现场最终曲目为定</p>
`);
assert.equal(numberedProgram.program.length, 3);
assert.deepEqual(numberedProgram.performers, ["侯睿翹", "方芷兮", "张沐恩"]);
assert.deepEqual(numberedProgram.program[1], {
  composer: "贝多芬",
  title: "升c小调14钢琴奏鸣曲Op.27, No.2 – 月光奏鸣曲 第三乐章",
  confidence: "official",
});
assert.equal(numberedProgram.program[2].movements?.length, 3);

const bracketHeading = parseOrientalArtCenterContent(`
  <p>【曲目】</p>
  <p>李斯特:《六首安慰曲》</p>
  <p>Liszt: Consolations, S172/R12</p>
  <p>车尔尼:《引子、辉煌变奏曲与狩猎回旋曲》</p>
  <p>*曲目以现场为准 Program is subject to change</p>
`);
assert.deepEqual(
  bracketHeading.program.map((item) => [item.composer, item.title]),
  [
    ["李斯特", "六首安慰曲"],
    ["车尔尼", "引子、辉煌变奏曲与狩猎回旋曲"],
  ],
);
assert.deepEqual(bracketHeading.program[0].alternateTitles, ["Liszt: Consolations, S172/R12"]);

const englishProgram = parseOrientalArtCenterContent(`
  <p>曲目单</p>
  <p>Think Fast</p>
  <p>Pole Star</p>
  <p>Spirit Fall</p>
  <p>*曲目以现场演奏为准</p>
`);
assert.deepEqual(
  englishProgram.program.map((item) => item.title),
  ["Think Fast", "Pole Star", "Spirit Fall"],
);

const multilingualProgram = parseOrientalArtCenterContent(`
  <p>曲目单</p>
  <p>柴科夫斯基 | 六月：船歌</p>
  <p>Июнь: Баркарола</p>
  <p>*曲目以现场演奏为准</p>
`);
assert.deepEqual(multilingualProgram.program[0].alternateTitles, ["Июнь: Баркарола"]);

const alternatingCredits = parseOrientalArtCenterContent(`
  <p>曲目 Program</p>
  <p>冷澈之光 Fria Claridade</p>
  <p>佩德罗·奥梅姆·德梅洛 & 若泽·曼沙 Pedro Homem de Mello & José Mancha</p>
  <p>云之河 Rio de Nuvens</p>
  <p>纳塔利娅·科雷亚 & 拉乌尔·费朗 Natália Correia & Raúl Ferrão</p>
  <p>自由 Liberdade</p>
  <p>特雷西尼亚·兰代鲁 & 阿曼多·弗雷雷 Teresinha Landeiro & Armando Freire</p>
  <p>*曲目以现场为准</p>
`);
assert.deepEqual(
  alternatingCredits.program.map((item) => item.title),
  ["冷澈之光", "云之河", "自由"],
);
assert.deepEqual(
  alternatingCredits.program.map((item) => item.alternateTitles),
  [["Fria Claridade"], ["Rio de Nuvens"], ["Liberdade"]],
);

const datedProgramHtml = `
  <p>曲目 PROGRAMS</p>
  <p>2026/10/19</p>
  <p>贝多芬∣G大调第四钢琴协奏曲，作品58</p>
  <p>2026/10/20</p>
  <p>莫扎特 | G小调第四十交响曲，作品550</p>
  <p>*曲目以现场为准</p>
`;
assert.deepEqual(
  parseOrientalArtCenterContent(datedProgramHtml, {
    showDate: new Date("2026-10-19T11:30:00.000Z"),
  }).program.map((item) => item.composer),
  ["贝多芬"],
);
assert.deepEqual(
  parseOrientalArtCenterContent(datedProgramHtml, {
    showDate: new Date("2026-10-20T11:30:00.000Z"),
  }).program.map((item) => item.composer),
  ["莫扎特"],
);

const labeledProgram = parseOrientalArtCenterContent(`
  <p>演出曲目（以演出当晚为准）75分钟无中场休息</p>
  <p>开场：《上元灯火中秋月》 周漪泓改编</p>
  <p>【壹】春莺啭 唐大曲</p>
  <p>《春莺啭》为唐代四大曲之一，描绘清晨莺声。</p>
  <p>【贰】四合如意 浙派传统筝曲</p>
  <p>演奏家介绍：</p>
  <p>孙文妍</p>
`);
assert.deepEqual(
  labeledProgram.program.map((item) => item.title),
  ["上元灯火中秋月", "春莺啭 唐大曲", "四合如意 浙派传统筝曲"],
);

const ocrProgram = parseOrientalArtCenterOcrText(`
  音乐会精选曲目 Programme
  Wellerman
  Be What You Wanna Be
  康定情歌
  曲目以现场为准
`);
assert.equal(ocrProgram.length, 3);
assert.ok(ocrProgram.every((item) => item.confidence === "ocr"));

const ocrTitleCredits = parseOrientalArtCenterOcrText(`
  音乐会精选曲目 Programme
  《钢铁洪流进行曲 》一一作曲: 李旭昊
  《燃情岁月 》一一 作曲: James Horner
  《The Rains of Castamere (权力的游戏) 》一一作曲: Ramin Djawadi
  曲目以现场为准
`);
assert.deepEqual(
  ocrTitleCredits.map((item) => [item.composer, item.title]),
  [
    ["李旭昊", "钢铁洪流进行曲"],
    ["James Horner", "燃情岁月"],
    ["Ramin Djawadi", "The Rains of Castamere (权力的游戏)"],
  ],
);

const standaloneOcrWork = parseOrientalArtCenterOcrText(`
节目单
小约翰·施特劳斯：《蓝色多瑙河》
《茉莉花》
`);
assert.equal(standaloneOcrWork[0].composer, "小约翰·施特劳斯");
assert.equal(standaloneOcrWork[1].composer, undefined);
assert.equal(standaloneOcrWork[1].title, "茉莉花");

const canonicalBilingualOcr = parseOrientalArtCenterOcrText(`
节目单
2026.10.13 19:30
朱塞佩·威尔第：《游吟诗人》“静谧安宁的夜色” | “Tacea la notte placida” (from Il trovatore)
2026.10.15 19:30
安东·德沃夏克：《水仙女》“月亮颂” | Měsíčku na nebi hlubokém (Song to the Moon)
`, { showDate: new Date("2026-10-15T11:30:00.000Z") });
assert.equal(canonicalBilingualOcr.length, 1);
assert.equal(canonicalBilingualOcr[0].composer, "安东·德沃夏克");
assert.match(canonicalBilingualOcr[0].title, /月亮颂/);
assert.deepEqual(canonicalBilingualOcr[0].alternateTitles, ["Měsíčku na nebi hlubokém (Song to the Moon)"]);

const uncreditedBilingualOcr = parseOrientalArtCenterOcrText(`
节目单
上半场
茉莉花 | Jasmin
下半场
北京喜讯到边寨 | Beijing News
`);
assert.deepEqual(
  uncreditedBilingualOcr.map((item) => [item.composer, item.title, item.alternateTitles]),
  [
    [undefined, "茉莉花", ["Jasmin"]],
    [undefined, "北京喜讯到边寨", ["Beijing News"]],
  ],
);

const creditedOcrProgram = parseOrientalArtCenterOcrText(`
节目单
诀别书 / 作曲:邓垚
曹操 / 作词:林秋离 作曲:林俊杰
月光 Suite bergamasque, L. 75: No. 3, Clair de lune / 作曲:克劳德·德彪西
卡农幻想曲 Fantasy on Canon in D / 作曲:约翰·帕赫贝尔 再创作:奥斯卡·罗曼耶卓
派对动物 / 作词&作曲:陈信宏
`);
assert.deepEqual(
  creditedOcrProgram.map((item) => item.composer),
  ["邓垚", "林俊杰", "克劳德·德彪西", "约翰·帕赫贝尔", "陈信宏"],
);
assert.match(creditedOcrProgram[2].title, /^月光/);

const composerHeadingProgram = parseOrientalArtCenterContent(`
  <p>音乐会曲目 PROGRAM</p>
  <p>门德尔松 Mendelssohn</p>
  <p>无词歌六首，作品67</p>
  <p>6 Songs Without Words, Op. 67</p>
  <p>随想回旋曲，作品14</p>
  <p>Rondo Capriccioso, Op. 14</p>
  <p>比才 Bizet</p>
  <p>迷醉</p>
  <p>Extase</p>
  <p>*曲目以现场为准</p>
`);
assert.deepEqual(
  composerHeadingProgram.program.map((item) => [item.composer, item.title]),
  [
    ["门德尔松", "无词歌六首，作品67"],
    ["门德尔松", "随想回旋曲，作品14"],
    ["比才", "迷醉"],
  ],
);
assert.deepEqual(
  composerHeadingProgram.program.map((item) => item.alternateTitles),
  [["6 Songs Without Words, Op. 67"], ["Rondo Capriccioso, Op. 14"], ["Extase"]],
);

const groupedTranslations = parseOrientalArtCenterContent(`
  <p>曲目 Program</p>
  <p>托斯蒂 | 理想佳人</p>
  <p>托斯蒂 | 梦</p>
  <p>Tosti | Ideale</p>
  <p>Tosti | Sogno</p>
  <p>*曲目以现场为准</p>
`);
assert.deepEqual(
  groupedTranslations.program.map((item) => item.title),
  ["理想佳人", "梦"],
);
assert.deepEqual(
  groupedTranslations.program.map((item) => item.alternateTitles),
  [["Ideale"], ["Sogno"]],
);

const organizerFooter = parseOrientalArtCenterContent(`
  <p>曲目 PROGRAM</p>
  <p>肖斯塔科维奇：芭蕾组曲《螺栓》，作品27a</p>
  <p>Dmitri Shostakovich: Ballet Suite The Bolt, Op.27a</p>
  <p>*主办方保留更换曲目及表演者的权利</p>
  <p>曾参与以下歌剧的音乐会版演出：《卡门》。</p>
`);
assert.equal(organizerFooter.program.length, 1);
assert.equal(organizerFooter.program[0].composer, "肖斯塔科维奇");
assert.equal(organizerFooter.program[0].title, "芭蕾组曲《螺栓》，作品27a");
assert.deepEqual(
  organizerFooter.program[0].alternateTitles,
  ["Dmitri Shostakovich: Ballet Suite The Bolt, Op.27a"],
);
assert.equal(organizerFooter.program.some((item) => item.title.includes("曾参与")), false);

const numberedComposerProgram = parseOrientalArtCenterContent(`
  <p>曲目单</p>
  <p>1、莫扎特：F大调快板KV1C</p>
  <p>2、莫扎特：《弦乐小夜曲》第一乐章K.525</p>
  <p>3、海顿：《惊愕交响曲》G大调第94号-第二乐章</p>
  <p>*曲目及顺序以现场为准</p>
`);
assert.deepEqual(
  numberedComposerProgram.program.map((item) => [item.composer, item.title]),
  [
    ["莫扎特", "F大调快板KV1C"],
    ["莫扎特", "弦乐小夜曲 第一乐章K.525"],
    ["海顿", "惊愕交响曲 G大调第94号-第二乐章"],
  ],
);

const unnumberedMovements = parseOrientalArtCenterContent(`
  <p>音乐会曲目 PROGRAM</p>
  <p>舒曼 | 童年情景</p>
  <p>Schumann | Kinderszenen, Op. 15</p>
  <p>异国和异国人民</p>
  <p>Von fremden Ländern und Menschen</p>
  <p>奇异的故事</p>
  <p>Kuriose Geschichte</p>
  <p>舒伯特 | 即兴曲四首，D. 899</p>
  <p>Schubert | Impromptus, D. 899</p>
  <p>C小调即兴曲</p>
  <p>Impromptu in C Minor, D. 899 No. 1</p>
  <p>*曲目以现场为准</p>
`);
assert.equal(unnumberedMovements.program.length, 2);
assert.deepEqual(
  unnumberedMovements.program[0].movements?.map((movement) => movement.title),
  ["异国和异国人民", "奇异的故事"],
);
assert.deepEqual(unnumberedMovements.program[0].alternateTitles, ["Kinderszenen, Op. 15"]);
assert.deepEqual(
  unnumberedMovements.program[0].movements?.map((movement) => movement.alternateTitles),
  [["Von fremden Ländern und Menschen"], ["Kuriose Geschichte"]],
);
assert.deepEqual(
  unnumberedMovements.program[1].movements?.map((movement) => movement.title),
  ["C小调即兴曲"],
);

const inlineBilingualMovements = parseOrientalArtCenterContent(`
  <p>曲目 Program</p>
  <p>莫里康内 Morricone</p>
  <p>《海上钢琴师》选段</p>
  <p>Music From The Legend of 1900</p>
  <p>1900主题 1900's Theme</p>
  <p>钢琴家的传奇 The Legend of the Pianist</p>
  <p>爱的演奏 Playing Love</p>
  <p>舒伯特 Schubert</p>
  <p>F小调幻想曲，作品940</p>
  <p>Fantasy in F minor, D. 940</p>
  <p>*曲目以现场为准</p>
`);
assert.equal(inlineBilingualMovements.program.length, 2);
assert.deepEqual(
  inlineBilingualMovements.program[0].movements?.map((movement) => movement.title),
  ["1900主题", "钢琴家的传奇", "爱的演奏"],
);
assert.deepEqual(inlineBilingualMovements.program[0].alternateTitles, ["Music From The Legend of 1900"]);
assert.deepEqual(
  inlineBilingualMovements.program[0].movements?.map((movement) => movement.alternateTitles),
  [["1900's Theme"], ["The Legend of the Pianist"], ["Playing Love"]],
);
assert.equal(inlineBilingualMovements.program[1].composer, "舒伯特");

const romanMovements = parseOrientalArtCenterContent(`
  <p>曲目 Program</p>
  <p>普罗科菲耶夫 Prokofiev</p>
  <p>《罗密欧与朱丽叶》选曲，作品75</p>
  <p>Excerpts from Romeo and Juliet, Op. 75</p>
  <p>I. 民间舞蹈 Folk Dance</p>
  <p>III. 小步舞曲（宾客到来）Minuet</p>
  <p>普契尼 Puccini</p>
  <p>我亲爱的爸爸，选自《贾尼·斯基基》（牛牛改编）</p>
  <p>“O Mio Babbino Caro”, from Gianni Schicchi</p>
  <p>*曲目以现场为准</p>
`);
assert.equal(romanMovements.program.length, 2);
assert.deepEqual(romanMovements.program[0], {
  composer: "普罗科菲耶夫",
  title: "《罗密欧与朱丽叶》选曲，作品75",
  alternateTitles: ["Excerpts from Romeo and Juliet, Op. 75"],
  movements: [
    { number: "I", title: "民间舞蹈", alternateTitles: ["Folk Dance"] },
    { number: "III", title: "小步舞曲（宾客到来）", alternateTitles: ["Minuet"] },
  ],
  confidence: "official",
});

const titleCreditProgram = parseOrientalArtCenterContent(`
  <p>曲目 Program</p>
  <p>向艺术致敬！| 曲：斯克里亚宾</p>
  <p>在船上 | 曲：塔涅耶夫 词：波隆斯基</p>
  <p>愿那一天到来，让人人珍惜 | 埃什派</p>
  <p>俄罗斯歌曲连唱</p>
  <p>I. 莫斯科郊外的晚上</p>
  <p>II. 喀秋莎</p>
  <p>*曲目以现场为准</p>
`);
assert.deepEqual(
  titleCreditProgram.program.slice(0, 3).map((item) => [item.composer, item.title]),
  [
    ["斯克里亚宾", "向艺术致敬！"],
    ["塔涅耶夫", "在船上"],
    ["埃什派", "愿那一天到来，让人人珍惜"],
  ],
);
assert.deepEqual(
  titleCreditProgram.program[3].movements?.map((movement) => movement.title),
  ["莫斯科郊外的晚上", "喀秋莎"],
);

const russianRomances = parseOrientalArtCenterContent(`
  <p>曲目 Program</p>
  <p>在船上 | 曲：塔涅耶夫 词：波隆斯基</p>
  <p>在幽暗的森林里 | 编曲：斯韦什尼科夫</p>
  <p>鹤群 | 曲：弗伦克尔，词：加姆扎托夫 编曲：波捷延科</p>
  <p>*曲目以现场为准</p>
`);
assert.deepEqual(russianRomances.program, [
  {
    composer: "塔涅耶夫",
    title: "在船上",
    credits: [{ name: "波隆斯基", role: "词" }],
    confidence: "official",
  },
  {
    composer: undefined,
    title: "在幽暗的森林里",
    credits: [{ name: "斯韦什尼科夫", role: "编曲" }],
    confidence: "official",
  },
  {
    composer: "弗伦克尔",
    title: "鹤群",
    credits: [
      { name: "加姆扎托夫", role: "词" },
      { name: "波捷延科", role: "编曲" },
    ],
    confidence: "official",
  },
]);

console.log("Shanghai Oriental Art Center adapter tests passed.");
