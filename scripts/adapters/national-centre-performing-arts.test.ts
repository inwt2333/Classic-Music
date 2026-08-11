import assert from "node:assert/strict";
import { extractNcpaProgramEvidence, parseNcpaDetail, parseNcpaPriceTiers } from "./national-centre-performing-arts";

const parsed = parseNcpaDetail({
  introduce: [
    {
      type: "70",
      contents: [{
        content: `
          <p>花之乐章（选自D大调第一号交响曲） 马勒 曲</p>
          <p>G大调第四号交响曲 马勒 曲</p>
          <p>第一乐章：从容地；非常闲适地</p>
          <p>女高音：李晶晶</p>
          <p>二胡独奏：崔璨</p>
          <p>女高音领唱：王欢</p>
          <p>*以上内容可能变更</p>
        `,
      }],
    },
  ],
}, "2026-08-01 周六 19:30");

assert.equal(parsed.program.length, 2);
assert.equal(parsed.program[0].composer, "马勒");
assert.equal(parsed.program[1].movements?.[0].title, "从容地；非常闲适地");
assert.deepEqual(parsed.performers, ["李晶晶", "崔璨", "王欢"]);

const noteAfterWork = parseNcpaDetail({
  introduce: [{
    type: "70",
    contents: [{
      content: `
        <p>前奏曲</p>
        <p>前奏曲集 第二册 德彪西 曲</p>
        <p>注：德彪西前奏曲第二册，共演奏11首。演奏者将省略其中一首。</p>
      `,
    }],
  }],
});
assert.deepEqual(noteAfterWork.program.map((item) => item.title), ["前奏曲", "前奏曲集 第二册"]);

const rogerRecital = parseNcpaDetail({
  introduce: [{
    type: "70",
    contents: [{
      content: `
        <p>三首玄秘曲 E.萨蒂 曲</p>
        <p>三首新事曲 F.普朗克 曲</p>
        <p>那泽尔之夜 F.普朗克 曲</p>
        <p>前奏曲</p><p>贵客满座</p><p>深情地握手</p><p>朴素和大方</p>
        <p>烦恼的滋味</p><p>灵活的老人</p><p>华彩乐段</p><p>终曲</p>
        <p>中场</p>
        <p>前奏曲集 第二册 C.德彪西 曲</p>
        <p>迷雾</p><p>枯叶</p><p>维诺之门</p><p>善舞的仙女</p><p>欧石楠</p>
        <p>怪癖的拉文将军</p><p>月光满亭台</p><p>水妖</p><p>向匹克威克先生致敬</p>
        <p>埃及古壶</p><p>焰火</p>
      `,
    }],
  }],
});
assert.deepEqual(
  rogerRecital.program.map((item) => [item.composer, item.title, item.movements?.length ?? 0]),
  [
    ["E.萨蒂", "三首玄秘曲", 0],
    ["F.普朗克", "三首新事曲", 0],
    ["F.普朗克", "那泽尔之夜", 8],
    ["C.德彪西", "前奏曲集 第二册", 11],
  ],
);
assert.equal(rogerRecital.program[2].movements?.[0].title, "前奏曲");
assert.equal(rogerRecital.program[3].movements?.at(-1)?.title, "焰火");

const swanLake = parseNcpaDetail({
  introduce: [{
    type: "70",
    contents: [{
      content: `
        <p>《天鹅湖》第二幕　柴科夫斯基 曲</p>
        <p>1.场景（天鹅湖畔）</p><p>2.王子登场，初遇奥杰塔</p><p>3.群鹅出场</p>
        <p>4.天鹅之舞</p><p>圆舞曲</p><p>奥杰塔独舞（女变奏）</p><p>四小天鹅舞</p>
        <p>《天鹅湖》第三幕　柴科夫斯基 曲</p>
        <p>1.引子-宫廷进行曲</p><p>2.王子的萨拉班德舞</p><p>3.场景-候选新娘的圆舞曲</p>
        <p>指挥：张艺</p><p>导聆：曹舒慈</p>
      `,
    }],
  }],
});
assert.deepEqual(swanLake.program.map((item) => item.title), ["天鹅湖第二幕", "天鹅湖第三幕"]);
assert.equal(swanLake.program[0].movements?.length, 7);
assert.equal(swanLake.program[1].movements?.length, 3);
assert.deepEqual(swanLake.performers, ["张艺", "曹舒慈"]);
assert.deepEqual(
  parseNcpaPriceTiers({
    sessionPrices: [{ name: "480" }, { name: "380(满3张打8折)" }, { name: "80" }],
  }),
  [80, 380, 480],
);

const multiDateDetail = {
  introduce: [
    {
      type: "70",
      contents: [{
        content: `
          <p>指挥：安东尼奥·帕帕诺</p>
          <b>9月16日安东尼奥·帕帕诺与伦敦交响乐团音乐会</b><br />
          小提琴与中提琴协奏交响曲　莫扎特 曲<br />
          小提琴独奏：本杰明·马奎斯·吉尔摩<br />
          第九交响曲　布鲁克纳 曲<br />
          <b>9月17日安东尼奥·帕帕诺、刘晓禹与伦敦交响乐团音乐会</b><br />
          第三钢琴协奏曲　贝多芬 曲<br />
          钢琴独奏：刘晓禹<br />
          第五交响曲　肖斯塔科维奇 曲<br />
          <b>9月18日安东尼奥·帕帕诺、刘晓禹与伦敦交响乐团音乐会</b><br />
          魔法湖　利亚多夫 曲<br />
          第三钢琴协奏曲　普罗科菲耶夫 曲<br />
          钢琴独奏：刘晓禹<br />
          第五交响曲　柴科夫斯基 曲<br />
          *以上内容可能变更
        `,
      }],
    },
  ],
};

const september16 = parseNcpaDetail(multiDateDetail, "2026-09-16 周三 19:30");
const september17 = parseNcpaDetail(multiDateDetail, "2026-09-17 周四 19:30");
const september18 = parseNcpaDetail(multiDateDetail, "2026-09-18 周五 19:30");

assert.deepEqual(
  september16.program.map((item) => item.title),
  ["小提琴与中提琴协奏交响曲", "第九交响曲"],
);
assert.equal(september16.conductor, "安东尼奥·帕帕诺");
assert.deepEqual(september16.performers, ["安东尼奥·帕帕诺", "本杰明·马奎斯·吉尔摩"]);
assert.deepEqual(
  september17.program.map((item) => item.title),
  ["第三钢琴协奏曲", "第五交响曲"],
);
assert.deepEqual(september17.performers, ["安东尼奥·帕帕诺", "刘晓禹"]);
assert.deepEqual(
  september18.program.map((item) => item.title),
  ["魔法湖", "第三钢琴协奏曲", "第五交响曲"],
);
assert.deepEqual(september18.performers, ["安东尼奥·帕帕诺", "刘晓禹"]);
assert.equal(parseNcpaDetail(multiDateDetail).program.length, 7);
assert.equal(parseNcpaDetail(multiDateDetail, "2026-09-19 周六 19:30").program.length, 7);

const nationalOrchestraGala = parseNcpaDetail({
  introduce: [{
    type: "70",
    contents: [{
      content: `
        <p>《节日序曲》 施万春 曲 罗麦朔 编配</p>
        <p>二胡协奏曲《巾帼》 王云飞 曲</p><p>二胡：宋飞、马可、王啸、谭欣、张敬然、马子迪</p>
        <p>《若一去不回》选自歌剧《冷月无声》 王晓岭 词 栾凯 曲</p><p>演唱：孙砾</p>
        <p>《快给大忙人让路》选自罗西尼歌剧《塞维利亚的理发师》</p><p>演唱：孙砾、林子豪</p>
        <p>京剧曲牌《夜深沉》 吴华 编曲</p><p>京胡：沈诚</p><p>京二胡：晏璐婷</p>
        <p>《沂蒙山，永远的爹娘》 王晓岭、李文绪 词 栾凯 曲</p><p>演唱：王丽达</p>
        <p>小提琴协奏曲《梁山伯与祝英台》（选段） 何占豪、陈钢 曲</p><p>小提琴：吕思清</p>
        <p>——中场休息——</p>
        <p>钢琴与乐队《祭献之舞》（选自芭蕾舞剧《春之祭》） 伊戈尔·斯特拉文斯基 曲</p>
        <p>钢琴：韩冰、韩寒北、李博文、田容</p>
        <p>《Ｇ小调双大提琴协奏曲》第一乐章 维瓦尔第 曲</p><p>大提琴：刘蔓、张又嘉</p>
        <p>《红星照我去战斗》 邬大为、魏宝贵 词 傅庚辰 曲</p><p>演唱：王宏伟</p>
        <p>《情话》选自歌剧《尘埃落定》 冯必烈、冯柏铭 词 孟卫东 曲</p>
        <p>古筝与乐队《汉江韵》 任清芝 传谱 王中山 改编 陈哲 配器</p>
        <p>古筝：王中山、宋心馨、曹照照、倪一鸣</p>
        <p>《上下求索》 屈原 词 老锣 曲</p><p>演唱：龚琳娜</p>
        <p>《幽兰操》 韩愈 词 赵季平 曲</p><p>演唱：吴碧霞、周彬</p>
        <p>《卜算子·咏梅》 毛泽东 词 孙玄龄 曲</p><p>演唱：吴碧霞</p>
        <p>《我的井冈 我的家》选自歌剧《摇篮》 赵大鸣 词 胡廷江 曲</p><p>演唱：吴碧霞、陈滢竹、周彬</p>
      `,
    }],
  }],
});
assert.equal(nationalOrchestraGala.program.length, 16);
assert.equal(nationalOrchestraGala.program.some((item) => ["二胡", "京胡", "京二胡", "古筝"].includes(item.composer ?? "")), false);
assert.ok(nationalOrchestraGala.performers.includes("宋飞"));
assert.ok(nationalOrchestraGala.performers.includes("沈诚"));
assert.ok(nationalOrchestraGala.performers.includes("王中山"));

const astronomyConcert = parseNcpaDetail({
  introduce: [{
    type: "70",
    contents: [{
      content: `
        <p>上半场：人类与星辰</p>
        <p>查拉图斯特拉如是说 理查德·施特劳斯 曲</p>
        <p>日出 选自《培尔金特》 格里格 曲</p><p>月光 德彪西 曲</p>
        <p>四季（春、夏、秋、冬） 维瓦尔第 曲</p>
        <p>春：第一乐章，快板</p><p>夏：第三乐章，急板</p><p>秋：第一乐章，快板</p><p>冬：第一乐章，不太快的快板</p>
        <p>行星组曲之木星 霍尔斯特 曲</p><p>——中场休息——</p>
        <p>下半场：天文学与音乐中的人类思想进化</p>
        <p>降E大调前奏曲，BWV552a 巴赫 曲</p><p>D大调第十二号交响曲 威廉·赫谢尔 曲</p>
        <p>降E大调前奏曲与赋格，Op.99 No.3 圣-桑 曲</p><p>《星际穿越》配乐 汉斯·季默 曲</p>
      `,
    }],
  }],
});
assert.equal(astronomyConcert.program.length, 9);
assert.equal(astronomyConcert.program.some((item) => /上半场|下半场/.test(item.title)), false);
assert.equal(astronomyConcert.program.find((item) => item.composer === "圣-桑")?.title, "降E大调前奏曲与赋格，Op.99 No.3");

const redRibbon = parseNcpaDetail({
  introduce: [{
    type: "70",
    contents: [{
      content: `
        <p>长路当歌</p><p>第一乐章 血战湘江</p><p>第二乐章 四渡赤水</p>
        <p>第三乐章 泡桐岗之夜</p><p>第四乐章 雪山草地</p><p>第五乐章 胜利会师</p>
        <p>——中场休息——</p>
        <p>英雄的黎明</p><p>第一乐章 天际</p><p>第二乐章 瑞流</p>
        <p>第三乐章 寒碑</p><p>第四乐章 烈焰</p>
        <p>取材自魏巍同名长篇小说、沈尧伊同名连环画</p>
        <p>作曲：商沛雷（特邀）、罗麦朔（特邀）</p>
        <p>（中央芭蕾舞团、上海爱乐乐团、浙江交响乐团、四川爱乐乐团联合创作）</p>
        <p>艺术顾问：沈尧伊</p>
      `,
    }],
  }],
});
assert.deepEqual(redRibbon.program.map((item) => [item.composer, item.title, item.movements?.length]), [
  ["商沛雷、罗麦朔", "长路当歌", 5],
  ["商沛雷、罗麦朔", "英雄的黎明", 4],
]);
assert.equal(redRibbon.program.some((item) => item.composer === "艺术顾问"), false);

const aCappellaSongs = parseNcpaDetail({
  introduce: [{
    type: "70",
    contents: [{
      content: `
        <p>啊，宽阔的田野 捷克传统民歌</p>
        <p>事事皆可 科尔·波特 词曲</p>
        <p>莎莉花园 爱尔兰传统民歌 威廉·巴特勒·叶芝 词曲</p>
        <p>自然男孩 伊甸·阿贝兹 词曲</p>
        <p>它也会发生在你身上 约翰尼·伯克 词 吉米·范·休森 曲</p>
        <p>茉莉花 中国传统民歌</p>
        <p>——中场休息——</p>
        <p>夜空中最亮的星 逃跑计划乐队</p>
        <p>*音乐会所有曲目均改编为阿卡贝拉版本。</p>
      `,
    }],
  }],
});
assert.deepEqual(aCappellaSongs.program.map((item) => item.title), [
  "啊，宽阔的田野",
  "事事皆可",
  "莎莉花园",
  "自然男孩",
  "它也会发生在你身上",
  "茉莉花",
  "夜空中最亮的星",
]);
assert.equal(aCappellaSongs.program.every((item) => !item.movements?.length), true);
assert.equal(aCappellaSongs.program.find((item) => item.title === "它也会发生在你身上")?.composer, "吉米·范·休森");

const oboeConcert = parseNcpaDetail({
  introduce: [{
    type: "70",
    contents: [{
      content: `
        <p>D大调双簧管协奏曲，TrV292 理查·施特劳斯 曲</p>
        <p>第一乐章：适中的快板</p>
        <p>第二乐章：行板</p>
        <p>第三乐章：活泼的—快板</p>
        <p>双簧管：徐慧静</p>
        <p>F小调第11号弦乐四重奏“庄严”，Op.95 贝多芬 曲 马勒 改编</p>
        <p>第一乐章：有活力的快板</p>
        <p>第二乐章：不太快的小快板</p>
        <p>——中场休息——</p>
        <p>C大调弦乐小夜曲，TH48 柴科夫斯基 曲</p>
        <p>第一乐章：小奏鸣曲式的小品</p>
      `,
    }],
  }],
});
assert.deepEqual(oboeConcert.program.map((item) => item.title), [
  "D大调双簧管协奏曲，TrV292",
  "F小调第11号弦乐四重奏“庄严”，Op.95",
  "C大调弦乐小夜曲，TH48",
]);
assert.deepEqual(oboeConcert.performers, ["徐慧静"]);
assert.equal(oboeConcert.program.some((item) => item.composer === "双簧管"), false);

const choralSongsAndSuite = parseNcpaDetail({
  introduce: [{
    type: "70",
    contents: [{
      content: `
        <p>Sure On This Shining Night（在这闪耀的夜晚） James Agee 词 Morten Lauridsen 曲</p>
        <p>喜欢 袁晶 词 欧阳江岸 曲 李朕 编合唱</p>
        <p>山中月 徐志摩 词 张士超 曲</p>
        <p>如此爱你 扎西拉姆·多多 诗 刘新诚 曲</p>
        <p>朴树组曲（上集） 朴树 词曲 吴昊 编合唱及钢琴</p>
        <p>new boy</p>
        <p>平凡之路</p>
        <p>生如夏花</p>
        <p>那些花儿</p>
        <p>如此爱你 扎西拉姆·多多 诗 刘新诚 曲</p>
        <p>燕歌行（两团合唱） 【唐】高适 张士超 曲</p>
      `,
    }],
  }],
});
assert.equal(choralSongsAndSuite.program.length, 6);
assert.equal(choralSongsAndSuite.program[0].title, "Sure On This Shining Night（在这闪耀的夜晚）");
assert.equal(choralSongsAndSuite.program[0].composer, "Morten Lauridsen");
assert.deepEqual(
  choralSongsAndSuite.program.find((item) => item.title === "朴树组曲（上集）")?.movements?.map((item) => item.title),
  ["new boy", "平凡之路", "生如夏花", "那些花儿"],
);
assert.equal(choralSongsAndSuite.program.filter((item) => item.title === "如此爱你").length, 1);

const scopedEvidenceDetail = {
  introduce: [
    { type: "20", contents: [{ content: "<p>\u8fd9\u662f\u6f14\u51fa\u80cc\u666f\u4ecb\u7ecd</p>" }] },
    { type: "70", contents: [{ content: "<p>\u53cc\u7c27\u7ba1\uff1a\u5f90\u6167\u9759</p><p>D\u5927\u8c03\u53cc\u7c27\u7ba1\u534f\u594f\u66f2 \u7406\u67e5\u00b7\u65bd\u7279\u52b3\u65af \u66f2</p>" }] },
  ],
};
assert.equal(
  extractNcpaProgramEvidence(scopedEvidenceDetail),
  "\u53cc\u7c27\u7ba1\uff1a\u5f90\u6167\u9759\nD\u5927\u8c03\u53cc\u7c27\u7ba1\u534f\u594f\u66f2 \u7406\u67e5\u00b7\u65bd\u7279\u52b3\u65af \u66f2",
);

console.log("NCPA parser tests passed.");
