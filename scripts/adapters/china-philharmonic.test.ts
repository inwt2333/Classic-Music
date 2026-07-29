import assert from "node:assert/strict";
import { parseChinaPhilharmonicDetail } from "./china-philharmonic";

const parsed = parseChinaPhilharmonicDetail(`
  <meta name="ArticleTitle" content="余隆与梅第扬演绎久石让与德沃夏克">
  <meta name="PubDate" content="2026-06-26 19:30">
  <div class="content"><div class="article">
    <ul class="desc"><li>2026年06月26日 星期五 19:30</li><li>国家大剧院音乐厅</li></ul>
    <p>这是一段足够长的音乐会导赏文字，用于验证详情简介能够从节目单前面的正文区域被保留下来。</p>
    <hr>
    <p><img title="QUMU.png"></p>
    <p>久石让：中提琴传奇（为管弦乐队所作）</p>
    <p>安东·德沃夏克：E小调第九交响曲《自新世界》，作品95</p>
    <p><img title="YISHUJIA.png"></p>
    <p>中提琴：梅第扬</p><p>指挥：余隆</p>
    <p><img title="PRO.png"></p>
    <p>Joe Hisaishi: Viola Saga for orchestra</p>
    <p>Antonín Dvořák: Symphony No. 9 in E minor, Op. 95</p>
    <p><img title="ART.png"></p>
  </div></div>
`);

assert.equal(parsed.title, "余隆与梅第扬演绎久石让与德沃夏克");
assert.equal(parsed.conductor, "余隆");
assert.deepEqual(parsed.performers, ["梅第扬", "余隆"]);
assert.equal(parsed.program.length, 2);
assert.deepEqual(parsed.program[0].alternateTitles, ["Joe Hisaishi: Viola Saga for orchestra"]);

console.log("China Philharmonic parser tests passed.");
