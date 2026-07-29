import assert from "node:assert/strict";
import { parseChinaNationalSymphonyDetail } from "./china-national-symphony";

const parsed = parseChinaNationalSymphonyDetail(`
  <div class="daew_title">
    <span id="lbtitle">庆祝中央乐团—中国交响乐团建团70周年交响音乐会</span>
    <span id="lbaddtime">2026-07-19</span>
    <span id="lbaddress">国家大剧院音乐厅</span>
    <span id="lbyuetype">CNSO</span>
  </div>
  <div class="daew_kuai">
    <p>演出时间：2026年7月19日 星期日 19:30</p>
    <p>演出地点：国家大剧院音乐厅</p>
    <p>演出：中国交响乐团、中国交响乐团合唱团</p>
    <p>指挥：戴维·霍斯</p>
    <p>曲目Programme：</p>
    <p>拉赫玛尼诺夫 《钟声》，作品35号</p>
    <p>Rachmaninoff: "The Bells", Op. 35</p>
    <p>肖斯塔科维奇 g小调第十一交响曲“1905 年”，作品103号</p>
    <p>Shostakovich: Symphony No. 11 in G Minor "The Year 1905", Op. 103</p>
  </div>
`);

assert.equal(parsed.startTime, "2026-07-19 19:30");
assert.equal(parsed.venue, "国家大剧院音乐厅");
assert.equal(parsed.conductor, "戴维·霍斯");
assert.equal(parsed.program.length, 2);
assert.equal(parsed.program[0].composer, "拉赫玛尼诺夫");
assert.deepEqual(parsed.program[0].alternateTitles, ['Rachmaninoff: "The Bells", Op. 35']);

console.log("China National Symphony parser tests passed.");
