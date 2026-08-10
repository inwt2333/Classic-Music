import assert from "node:assert/strict";
import type { ProgramItem } from "../../src/types";
import { isShanghaiGrandTheatreClassical, parseShanghaiGrandTheatreDetail } from "./shanghai-grand-theatre";
import { parseBeijingConcertHallDetail } from "./beijing-concert-hall";
import {
  discoverGuangzhouSymphonySeasonUrls,
  discoverGuangzhouSymphonySupplementalUrls,
  parseGuangzhouSymphonyDetail,
} from "./guangzhou-symphony";
import {
  buildShenzhenConcertHallListUrl,
  discoverShenzhenConcertHallDetailUrls,
  parseShenzhenConcertHallDetail,
} from "./shenzhen-concert-hall";
import { parseZhongshanMusicHallDetail } from "./zhongshan-music-hall";
import { parseZhejiangSymphonyCalendar, parseZhejiangSymphonyProgram } from "./zhejiang-symphony";
import { isXianConcertHallClassical } from "./xian-concert-hall";
import { parseXinghaiConcertHallDetail } from "./xinghai-concert-hall";

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
assert.deepEqual(
  discoverGuangzhouSymphonySeasonUrls(
    `
      <a href="/music-season-2025-26-subscription/index.html">旧乐季</a>
      <a href="/music-season-2026-27-subscription/index.html">新乐季</a>
      <a href="/music-season-2026-27-pops/index.html">新乐季流行</a>
    `,
    "https://www.gso.org.cn/",
  ),
  [
    "https://www.gso.org.cn/music-season-2026-27-subscription/index.html",
    "https://www.gso.org.cn/music-season-2026-27-pops/index.html",
  ],
);
assert.deepEqual(
  discoverGuangzhouSymphonySupplementalUrls(
    '<a href="/events/neweventdetail.php?id=5101">new season</a>',
    "https://www.concerthall.com.cn/events/newindexhm_gso.php",
  ),
  ["https://www.concerthall.com.cn/events/neweventdetail.php?id=5101"],
);

assert.equal(
  buildShenzhenConcertHallListUrl("https://szyyt.com/performance", 3),
  "https://szyyt.com/performance/0/0000-00-00/0000-00-00/0/0/key%5E/3",
);
assert.deepEqual(
  discoverShenzhenConcertHallDetailUrls(
    '<a href="/performance/show_1000001.html">concert</a>',
    "https://szyyt.com/performance",
  ),
  ["https://szyyt.com/performance/show_1000001.html"],
);

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

const szyytConcertos = parseShenzhenConcertHallDetail(`
  <h1>深圳交响乐团2026-2027乐季——乐圣与师徒--纪念贝多芬逝世200周年</h1>
  <div>2027年04月09日（星期五）19:30 深圳音乐厅演奏大厅</div>
  <ul><li>演出：指挥/林大叶、钢琴/格哈德·奥皮茨、钢琴/袁芳、深圳交响乐团</li></ul>
  <div class="tabContent2">
    <strong>演出曲目：</strong><br>
    <strong>路德维希·凡·贝多芬：C大调第一钢琴协奏曲，作品15</strong><br>
    <span>Ⅰ. 有活力的快板</span><br><span>Ⅱ. 广板</span><br><span>Ⅲ. 回旋曲：快板</span><br>
    <strong>路德维希·凡·贝多芬：降B大调第二钢琴协奏曲，作品19</strong><br>
    <span>Ⅰ. 有活力的快板</span><br><span>Ⅱ. 柔板</span><br><span>Ⅲ. 回旋曲：很快的快板</span><br>
    <strong>路德维希·凡·贝多芬：c小调第三钢琴协奏曲，作品37</strong><br>
    <span>Ⅰ. 有活力的快板</span><br><span>Ⅱ. 广板</span><br><span>Ⅲ. 回旋曲：快板</span><br>
    <strong>----中场休息----</strong><br>
    <strong>路德维希·凡·贝多芬：G大调第四钢琴协奏曲，作品58</strong><br>
    <span>Ⅰ. 中庸的快板</span><br><span>Ⅱ. 稍快的行板</span><br><span>Ⅲ. 回旋曲：有活力的</span><br>
    <strong>路德维希·凡·贝多芬：降E大调第五钢琴协奏曲“皇帝”，作品73</strong><br>
    <span>Ⅰ. 快板</span><br><span>Ⅱ. 稍快的柔板</span><br><span>Ⅲ. 回旋曲：快板</span><br>
    <span>*曲目以演出当日为准</span>
  </div>
`);
assert.deepEqual(szyytConcertos.program.map((item) => item.title), [
  "C大调第一钢琴协奏曲，作品15",
  "降B大调第二钢琴协奏曲，作品19",
  "c小调第三钢琴协奏曲，作品37",
  "G大调第四钢琴协奏曲，作品58",
  "降E大调第五钢琴协奏曲“皇帝”，作品73",
]);
assert.deepEqual(szyytConcertos.program.map((item) => item.composer), Array(5).fill("路德维希·凡·贝多芬"));
assert.deepEqual(szyytConcertos.performers, ["林大叶", "格哈德·奥皮茨", "袁芳"]);
assert.deepEqual(szyytConcertos.program.map((item) => item.movements?.map((movement) => movement.title)), [
  ["有活力的快板", "广板", "回旋曲：快板"],
  ["有活力的快板", "柔板", "回旋曲：很快的快板"],
  ["有活力的快板", "广板", "回旋曲：快板"],
  ["中庸的快板", "稍快的行板", "回旋曲：有活力的"],
  ["快板", "稍快的柔板", "回旋曲：快板"],
]);

const szyytSemicolonCast = parseShenzhenConcertHallDetail(`
  <h1>《长征组歌》专场音乐会</h1>
  <div>2027年04月10日19:30 深圳音乐厅演奏大厅</div>
  <ul><li>演出：指挥：张国勇；特邀嘉宾：王志昕；演出：深圳歌剧舞剧院合唱团；深圳技术大学瓦蓝合唱团；双钢琴</li></ul>
`);
assert.deepEqual(szyytSemicolonCast.performers, ["张国勇", "王志昕"]);

const szyytCredits = parseShenzhenConcertHallDetail(`
  <h1>多民族童声合唱音乐会</h1><div>2026年08月28日 20:00 深圳音乐厅二楼演奏大厅</div>
  <div class="tabContent2"><p>演出曲目</p>
    <p>《大山小事》</p><p>黄摩崖 词，张阿雅 曲</p>
    <p>演出：深圳音乐厅“小金树”多民族童声合唱团</p>
    <p>《茉莉花》（江苏民歌）</p><p>何崇志 改编合唱</p>
    <p>伴奏：罗诗祺、李东南</p><p>（曲目以演出当日为准）</p>
  </div>
`);
assert.deepEqual(szyytCredits.program.map((item) => item.title), ["大山小事", "茉莉花（江苏民歌）"]);
assert.equal(szyytCredits.program[0].composer, "张阿雅");
assert.deepEqual(szyytCredits.program[0].credits, [{ name: "黄摩崖", role: "词" }]);
assert.deepEqual(szyytCredits.performers, ["深圳音乐厅“小金树”多民族童声合唱团", "罗诗祺", "李东南"]);

const szyytNumberedWorks = parseShenzhenConcertHallDetail(`
  <h1>奥斯卡·罗曼耶卓钢琴独奏音乐会-深圳站</h1>
  <div class="tabContent2"><p>演出曲目</p>
    <p>1. 诀别书</p><p>2. 曹操</p><p>3. 月光</p><p>4. 卡农幻想曲</p>
    <p>5. 这世界那么多人</p><p>6. 青花瓷</p><p>7. 派对动物</p><p>8. 暗香</p><p>9. Lemon</p>
    <p>10. 《海上钢琴师》组曲</p><p>11. Grand Escape</p><p>12. 圣诞快乐，劳伦斯先生</p>
    <p>13. 《星际穿越》组曲</p><p>14. 《爱乐之城》组曲</p>
    <p>*曲目以演出当天为准。</p>
  </div>
`);
assert.equal(szyytNumberedWorks.program.length, 14);
assert.deepEqual(szyytNumberedWorks.program.slice(-5).map((item) => item.title), [
  "海上钢琴师组曲",
  "Grand Escape",
  "圣诞快乐，劳伦斯先生",
  "星际穿越组曲",
  "爱乐之城组曲",
]);
assert.ok(szyytNumberedWorks.program.every((item) => item.composer !== "组"));

const szyytBarbie = parseShenzhenConcertHallDetail(`
  <h1>芭比与室内乐之梦 刘一诺Noral＆她的朋友们</h1>
  <div class="tabContent2"><p>演出曲目</p>
    <p>上半场</p><p>莎米娜德《小协奏曲》</p>
    <p>克拉拉·舒曼《g小调钢琴三重奏，作品17》（第一乐章）</p>
    <p>亨莉耶特·雷尼耶《静谧行板》</p><p>莉莉·布朗热《夜曲》</p><p>中场休息</p>
    <p>芭比之真假公主</p><p>自由</p><p>如果你为我而爱我</p><p>我是一个像你一样的女孩</p>
    <p>芭比之森林公主</p><p>就在我怀里</p><p>我需要知道</p>
    <p>芭比之天鹅湖</p><p>《天鹅湖主题曲》</p>
    <p>芭比之胡桃夹子</p><p>柴可夫斯基-胡桃夹子-花之圆舞曲</p>
    <p>芭比之十二芭蕾舞公主</p><p>阿格里斯</p><p>公主的命运</p>
    <p>*曲目以演出当天为准。</p>
  </div>
`);
assert.equal(szyytBarbie.program.length, 13);
assert.deepEqual(szyytBarbie.program.slice(0, 4).map((item) => item.composer), [
  "莎米娜德",
  "克拉拉·舒曼",
  "亨莉耶特·雷尼耶",
  "莉莉·布朗热",
]);
assert.equal(szyytBarbie.program.some((item) => item.title.startsWith("芭比之")), false);
assert.deepEqual(szyytBarbie.program.at(-3), {
  composer: "柴可夫斯基",
  title: "胡桃夹子-花之圆舞曲",
  confidence: "official",
});

const xinghai = parseXinghaiConcertHallDetail(`
  <h1>石进钢琴音乐会---星海音乐厅</h1>
  <div class="fl fblack lh21">演出地点：交响乐演奏大厅</div>
  <div id="artists">钢琴：石进</div>
  <div id="program">一个人的时光<br>1981<br>夜的钢琴曲五<br>* 曲目以演出现场为准</div>
  <div>如果有，那一定少不了石进的《夜的钢琴曲五》，这首作品陪伴了许多听众。</div>
  <div>年度音乐大赏 某乐团《四季》[2026-11-13 20:00]</div>
`, "https://www.concerthall.com.cn/events/neweventdetail.php?id=4989");
assert.deepEqual(xinghai.program.map((item) => item.title), ["一个人的时光", "1981", "夜的钢琴曲五"]);
assert.deepEqual(xinghai.performers, ["石进"]);
assert.equal(xinghai.title, "石进钢琴音乐会");
assert.equal(xinghai.venue, "星海音乐厅");
assert.equal(xinghai.hall, "交响乐演奏大厅");

const xinghaiBilingual = parseXinghaiConcertHallDetail(`
  <h1>芭比与室内乐之梦---星海音乐厅</h1>
  <div id="program">
    莉莉·布朗热：夜曲<br>
    芭比之梦幻仙境<br>
    Fairytopia Theme<br>
    芭比之真假公主<br>
    自由<br>
    Free<br>
    如果你为我而爱我<br>
    If you love me for me<br>
    芭比之天鹅湖<br>
    柴科夫斯基：天鹅湖主题曲
  </div>
`, "https://www.concerthall.com.cn/events/neweventdetail.php?id=5055");
assert.deepEqual(xinghaiBilingual.program.map((item) => item.title), ["夜曲", "Fairytopia Theme", "自由", "如果你为我而爱我", "天鹅湖主题曲"]);
const xinghaiBilingualProgram = xinghaiBilingual.program as ProgramItem[];
assert.equal(xinghaiBilingualProgram[0].alternateTitles, undefined);
assert.deepEqual(xinghaiBilingualProgram[2].alternateTitles, ["Free"]);
assert.deepEqual(xinghaiBilingualProgram[3].alternateTitles, ["If you love me for me"]);

const xinghaiComposerHeading = parseXinghaiConcertHallDetail(`
  <h1>柴科夫斯基作品音乐会---星海音乐厅</h1>
  <div id="program">
    柴科夫斯基：<br>
    弗兰切斯卡·达·里米尼，作品32<br>
    洛可可主题变奏曲，作品33<br>
    E小调第五交响曲，作品64
  </div>
`, "https://www.concerthall.com.cn/events/neweventdetail.php?id=5080");
assert.deepEqual(xinghaiComposerHeading.program.map((item) => item.title), [
  "弗兰切斯卡·达·里米尼，作品32",
  "洛可可主题变奏曲，作品33",
  "E小调第五交响曲，作品64",
]);
assert.deepEqual(xinghaiComposerHeading.program.map((item) => item.composer), Array(3).fill("柴科夫斯基"));

const xinghaiMozart = parseXinghaiConcertHallDetail(`
  <h1>杨洋演绎莫扎特---星海音乐厅</h1>
  <div id="program">
    莫扎特：<br>
    歌剧《女人心》序曲，K. 588<br>
    降E大调交响协奏曲，K. 297b<br>
    C大调第四十一交响曲“朱庇特”，K. 551
  </div>
`, "https://www.concerthall.com.cn/events/neweventdetail.php?id=5081");
assert.deepEqual(xinghaiMozart.program.map((item) => item.composer), Array(3).fill("莫扎特"));
assert.equal(xinghaiMozart.program[0].title, "歌剧女人心序曲，K. 588");

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
