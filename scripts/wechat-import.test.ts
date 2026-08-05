import assert from "node:assert/strict";
import {
  extractWechatArticleHtml,
  parseWechatArticle,
  parseWechatProgram,
} from "./wechat-import";
import { buildWechatManualEvent } from "./manual-event-store";

const html = `
  <meta property="og:title" content="金秋古典音乐会预告">
  <meta name="author" content="城市爱乐">
  <div id="js_content">
    <p>城市爱乐第一场音乐会</p>
    <p>演出时间：2026年9月12日 19:30</p>
    <p>演出地点：上海音乐厅</p>
    <p>指挥：张三</p>
    <p>曲目</p>
    <p>门德尔松：《仲夏夜之梦》组曲，作品61</p>
    <p>1. 谐谑曲</p>
    <p>7. 夜曲</p>
    <p>演出阵容</p>
    <p>城市爱乐第二场音乐会</p>
    <p>演出时间：2026年9月13日 14:00</p>
    <p>地点：上海音乐厅</p>
    <p>节目单</p>
    <p>贝多芬：C小调第五交响曲，作品67</p>
  </div>
`;

const article = extractWechatArticleHtml(html, "https://mp.weixin.qq.com/s/example");
assert.equal(article.articleTitle, "金秋古典音乐会预告");
assert.equal(article.accountName, "城市爱乐");
assert.match(article.rawText, /仲夏夜之梦/);

const parsed = parseWechatArticle(article, new Date("2026-08-05T00:00:00.000Z"));
assert.equal(parsed.candidates.length, 2);
assert.equal(parsed.candidates[0].event.title, "城市爱乐第一场音乐会");
assert.equal(parsed.candidates[1].event.title, "城市爱乐第二场音乐会");
assert.equal(parsed.candidates[0].event.city, "上海");
assert.equal(parsed.candidates[0].event.venue, "上海音乐厅");
assert.equal(parsed.candidates[0].event.conductor, "张三");
assert.equal(parsed.candidates[0].event.program[0].title, "仲夏夜之梦组曲");
assert.equal(parsed.candidates[0].event.program[0].opus, "作品61");
assert.equal(parsed.candidates[0].event.program[0].movements?.length, 2);
assert.equal(parsed.candidates[1].event.program[0].composer, "贝多芬");

const bilingual = parseWechatProgram([
  "曲目",
  "拉威尔：《圆舞曲》",
  "La Valse",
  "票价：80元",
]);
assert.deepEqual(bilingual[0].alternateTitles, ["La Valse"]);

const approvedCandidate = {
  ...parsed.candidates[0],
  event: {
    ...parsed.candidates[0].event,
    program: parsed.candidates[0].event.program.map((item) => ({ ...item, confidence: "manual" as const })),
  },
};
const event = buildWechatManualEvent(parsed, approvedCandidate, "2026-08-05T02:00:00.000Z");
assert.equal(event.dataQuality, "manual-reviewed");
assert.equal(event.sourceName, "城市爱乐（公众号人工导入）");
assert.equal(event.sources?.[0].sourceUrl, "https://mp.weixin.qq.com/s/example");
assert.equal(event.program[0].confidence, "manual");

console.log("WeChat import tests passed.");
