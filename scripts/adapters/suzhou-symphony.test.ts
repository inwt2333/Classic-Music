import assert from "node:assert/strict";
import {
  discoverSuzhouSymphonySeasonUrl,
  discoverSuzhouSymphonySections,
  extractSuzhouSymphonyDates,
  parseSuzhouSymphonyContent,
  parseSuzhouSymphonyVenue,
} from "./suzhou-symphony";

const seasonHome = `
  <a href="/2025-26musicseason.html">2025-26音乐季</a>
  <a href="https://www.szsorch.com/26-27-music-season.html">2026-27音乐季</a>
`;
assert.equal(
  discoverSuzhouSymphonySeasonUrl(seasonHome, "https://www.szsorch.com/"),
  "https://www.szsorch.com/26-27-music-season.html",
);

const seasonSections = `
  <!-- getMusicDataList("obsolete-season",0,0) -->
  <li onclick="getMusicDataList(&quot;2026-27-Music-Season&quot;,1,0)">音乐季</li>
  <li onclick="getMusicDataList(&quot;specially-curated-26-27&quot;,2,0)">格调室内乐</li>
  <li onclick="getMusicDataList(&quot;Special-scheme-26-27&quot;,3,0)">特别策划</li>
  <script>
    // getMusicDataList("obsolete-season", 0, 0)
    getMusicDataList("2026-27-Music-Season", 1, 0)
  </script>
`;
assert.deepEqual(discoverSuzhouSymphonySections(seasonSections), [
  { slug: "2026-27-Music-Season", index: 1 },
  { slug: "specially-curated-26-27", index: 2 },
  { slug: "Special-scheme-26-27", index: 3 },
]);

const openingConcert = parseSuzhouSymphonyContent(`
  <p><strong>炽热</strong></p>
  <p><strong>苏州交响乐团2025-26音乐季开幕音乐会</strong></p>
  <p>2025.09.13（周六/SAT）19：30</p>
  <p>苏州文化艺术中心/金鸡湖音乐厅</p>
  <p>指挥</p><p><strong>许忠</strong></p>
  <p>女高音</p><p><strong>周晓琳</strong></p>
  <p><strong>理查·施特劳斯</strong></p>
  <p>《查拉图斯特拉如是说》，Op. 30</p>
  <p><strong>瓦格纳</strong></p>
  <p>《魏森东克之歌》</p>
  <p><strong>斯特拉文斯基</strong></p>
  <p>《火鸟组曲》（1919版）</p>
  <p><strong>观演须知</strong></p>
  <p>1. 本场演出全长约92分钟。</p>
  <p>今晚的音乐会将引领我们穿越晚期浪漫主义。</p>
`);
assert.equal(openingConcert.conductor, "许忠");
assert.deepEqual(openingConcert.performers, ["许忠", "周晓琳"]);
assert.deepEqual(
  openingConcert.program.map((item) => [item.composer, item.title]),
  [
    ["理查·施特劳斯", "查拉图斯特拉如是说"],
    ["瓦格纳", "魏森东克之歌"],
    ["斯特拉文斯基", "火鸟组曲（1919版）"],
  ],
);
assert.equal(openingConcert.description, "今晚的音乐会将引领我们穿越晚期浪漫主义。");

const ravel = parseSuzhouSymphonyContent(`
  <p>许忠演绎拉威尔——苏州交响乐团音乐会</p>
  <p>2025.12.06（周六）19 : 30</p>
  <p>苏州文化艺术中心/金鸡湖音乐厅</p>
  <p>指挥</p><p><strong>许忠</strong></p>
  <p><strong>拉威尔</strong></p>
  <p>《海上孤舟》选自组曲《镜子》，M. 43/3</p>
  <p>G大调钢琴协奏曲，M.83</p>
  <p>《堂吉诃德致杜尔西内娅》，M. 84</p>
  <p>《茨冈狂想曲》，M.76</p>
  <p>《高贵而伤感的圆舞曲》，M. 61</p>
  <p>观演须知</p>
`);
assert.equal(ravel.program.length, 5);
assert.ok(ravel.program.every((item) => item.composer === "拉威尔"));

const special = parseSuzhouSymphonyContent(`
  <p>苏州交响乐团 交响音画《红楼梦·回响》</p>
  <p>演奏|苏州交响乐团</p>
  <p>二胡|朱昌耀</p>
  <p>作曲 王立平 作词 曹雪芹</p>
  <p>引子：太虚幻境</p>
  <p>第一幕：宝黛</p>
  <p>《枉凝眉》</p>
  <p>《红豆曲》</p>
  <p>观演须知</p>
`);
assert.equal(special.ensemble, "苏州交响乐团");
assert.deepEqual(
  special.program.map((item) => [item.composer, item.title]),
  [
    ["王立平", "枉凝眉"],
    ["王立平", "红豆曲"],
  ],
);

assert.deepEqual(
  extractSuzhouSymphonyDates(`
    <p>2025.11.26（周三）19 : 30</p>
    <p>2025.11.28（周五）19 : 30</p>
  `),
  ["2025-11-26 19:30", "2025-11-28 19:30"],
);
assert.deepEqual(extractSuzhouSymphonyDates("<p>2025.12.20（周六）14：00 / 19 : 30</p>"), [
  "2025-12-20 14:00",
  "2025-12-20 19:30",
]);

assert.deepEqual(parseSuzhouSymphonyVenue("苏州文化艺术中心/金鸡湖音乐厅"), {
  venue: "苏州文化艺术中心",
  hall: "金鸡湖音乐厅",
});
assert.deepEqual(parseSuzhouSymphonyVenue("苏州文化艺术中心大剧院"), {
  venue: "苏州文化艺术中心",
  hall: "大剧院",
});

const operaExcerpts = parseSuzhouSymphonyContent(`
  <p><strong>罗西尼</strong></p>
  <p>《序曲》选自《塞维利亚的理发师》</p>
  <p>《快给大忙人让路》选自《塞维利亚的理发师》</p>
  <p>观演须知</p>
`);
assert.deepEqual(operaExcerpts.program.map((item) => [item.composer, item.title]), [
  ["罗西尼", "序曲选自《塞维利亚的理发师》"],
  ["罗西尼", "快给大忙人让路选自《塞维利亚的理发师》"],
]);

console.log("Suzhou Symphony adapter tests passed.");
