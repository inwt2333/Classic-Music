import assert from "node:assert/strict";
import { parseShanghaiPhilharmonicDetail } from "./shanghai-philharmonic";

const parsed = parseShanghaiPhilharmonicDetail(`
  <div class="detail-box">
    <h1>上海爱乐乐团2026-2027音乐季开幕音乐会</h1>
    <div class="time"><span class="time1">2026-09-06</span><span class="time2">19:30 表演</span></div>
    <div class="detail-price">￥50-￥432</div>
    <p class="address">场馆：上海东方艺术中心·音乐厅</p>
  </div>
  <div id="detail1"><div class="desc">
    <p>指挥：张艺</p><p>Conductor: Zhang Yi</p>
    <p>男高音：基里尔·波波夫</p><p>Tenor: Kirill Popov</p>
    <p>曲目：</p>
    <p>作曲：叶小纲</p>
    <p>朗诵：张三</p>
    <p>德米特里·肖斯塔科维奇：芭蕾组曲《螺栓》，作品27a</p>
    <p>Dmitri Shostakovich: Ballet Suite The Bolt, Op.27a</p>
    <p>*主办方保留更换曲目及表演者的权利</p>
  </div></div>
`);

assert.equal(parsed.dateTime, "2026-09-06 19:30");
assert.equal(parsed.venue, "上海东方艺术中心·音乐厅");
assert.equal(parsed.conductor, "张艺");
assert.deepEqual(parsed.priceTiers, [50, 432]);
assert.equal(parsed.program.length, 1);
assert.deepEqual(parsed.program[0].alternateTitles, [
  "Dmitri Shostakovich: Ballet Suite The Bolt, Op.27a",
]);

console.log("Shanghai Philharmonic parser tests passed.");
