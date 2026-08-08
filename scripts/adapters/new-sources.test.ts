import assert from "node:assert/strict";
import { isShanghaiGrandTheatreClassical, parseShanghaiGrandTheatreDetail } from "./shanghai-grand-theatre";
import { parseBeijingConcertHallDetail } from "./beijing-concert-hall";
import { parseGuangzhouSymphonyDetail } from "./guangzhou-symphony";
import { parseShenzhenConcertHallDetail } from "./shenzhen-concert-hall";
import { parseZhongshanMusicHallDetail } from "./zhongshan-music-hall";
import { parseZhejiangSymphonyCalendar, parseZhejiangSymphonyProgram } from "./zhejiang-symphony";
import { isXianConcertHallClassical } from "./xian-concert-hall";

assert.equal(isShanghaiGrandTheatreClassical({ category: "音乐剧 MUSICAL", fullCnName: "摇滚音乐剧" }), false);
assert.equal(isShanghaiGrandTheatreClassical({ category: "音乐会 CONCERT", fullCnName: "肖邦钢琴独奏音乐会" }), true);

const shg = parseShanghaiGrandTheatreDetail(`
  <p>票价｜Tickets</p><p>￥100/180/280/380</p>
  <p><strong>约翰内斯·勃拉姆斯</strong></p><p>四首小品，作品119</p>
  <p><strong>罗伯特·舒曼</strong></p><p>克莱斯勒偶记</p>
  <p>*曲目及时长或有变动，请以现场演出为准</p>
  <p>演出介绍：</p><p>钢琴家介绍正文。</p>
`);
assert.deepEqual(shg.program.map((item) => item.title), ["四首小品，作品119", "克莱斯勒偶记"]);
assert.equal(shg.description, "钢琴家介绍正文。");

const bj = parseBeijingConcertHallDetail(`
  <p>演出时间：2026年9月12日（星期六）10:30</p><p>演出地点：北京音乐厅</p>
  <p>票价：VIP/199/149/99/69元</p><h3>【曲目介绍】</h3>
  <p>1.格里格 霍尔堡组曲选段</p><p>2.李劭晟改编 《咏月三则》：</p>
  <p>（1）彝族民歌 阿细跳月</p><p>（2）任光曲 彩云追月</p><h3>【阵容介绍】</h3>
`);
assert.equal(bj.program.length, 2);
assert.equal(bj.program[1].movements?.length, 2);
assert.deepEqual(bj.priceTiers, [69, 99, 149, 199]);

const gso = parseGuangzhouSymphonyDetail(`
  <h1 class="post-title">广州交响乐团2025/2026音乐季闭幕音乐会</h1>
  <div class="av_promobox">时间：2026年7月12日 20:00 地点：星海音乐厅 票价：80/180/280元</div>
  <div id="tab-id-1-container"><div class="tab_inner_content"><p>曲目</p>
    <p>柴科夫斯基</p><p>《D大调小提琴协奏曲》</p><p>马勒</p><p>《第五交响曲》</p>
  </div></div><div id="tab-id-2-container"><p>第五交响曲的长篇介绍</p></div>
`);
assert.equal(gso.program.length, 2);
assert.equal(gso.program[0].composer, "柴科夫斯基");

const szyyt = parseShenzhenConcertHallDetail(`
  <h1>青年钢琴家古典独奏音乐会</h1><div>2026年08月07日 19:30 深圳音乐厅五楼小剧场</div>
  <div class="tabContent2"><p>演出介绍</p><p>很长的正文</p></div>
  <div class="tabContent2"><p>演出曲目</p><p>巴赫：《意大利协奏曲》</p><p>拉威尔：《水之嬉戏》《夜之幽灵》</p></div>
`);
assert.equal(szyyt.program.length, 3);
assert.equal(szyyt.venue, "深圳音乐厅");
assert.equal(szyyt.hall, "五楼小剧场");
const szyytOrganizer = parseShenzhenConcertHallDetail(`
  <h1>深圳音乐厅特别呈现 室内乐音乐会</h1>
  <div>2026年08月14日 19:30 深圳音乐厅、吴氏国际演出（北京）有限公司</div>
`);
assert.equal(szyytOrganizer.venue, "深圳音乐厅");
assert.equal(szyytOrganizer.hall, undefined);

const zhongshan = parseZhongshanMusicHallDetail(`
  <div class="pp_l"><img class="pp_pic" src="/concert-poster.jpg"></div>
  <div class="wz2"><img src="/unrelated-recommendation.jpg"></div>
`, "https://xhmpw.com/t48086.html");
assert.deepEqual(zhongshan.imageUrls, ["https://xhmpw.com/concert-poster.jpg"]);

const ical = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART;TZID=Asia/Shanghai:20261113T193000\nDTEND;TZID=Asia/Shanghai:20261113T210000\nUID:8554@test\nSUMMARY:浙江交响乐团2026年音乐季\nDESCRIPTION:音乐会曲目\\n上半场\\n《悲剧序曲》\\n勃拉姆斯\\n《第五交响曲》\\n肖斯塔科维奇\nURL:https://www.zjso.org/event/8554\nLOCATION:杭州运河大剧院歌剧厅\\, 浙江省杭州市\nEND:VEVENT\nEND:VCALENDAR`;
const calendar = parseZhejiangSymphonyCalendar(ical);
assert.equal(calendar.length, 1);
assert.equal(parseZhejiangSymphonyProgram(calendar[0].description).length, 2);

assert.equal(isXianConcertHallClassical({ category: "戏剧", fullCnName: "古典戏剧" }), false);
assert.equal(isXianConcertHallClassical({ category: "音乐会", fullCnName: "阿格里奇钢琴独奏音乐会" }), true);

console.log("New source parser tests passed.");
