import assert from "node:assert/strict";
import { parseNcpaDetail, parseNcpaPriceTiers } from "./national-centre-performing-arts";

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

console.log("NCPA parser tests passed.");
