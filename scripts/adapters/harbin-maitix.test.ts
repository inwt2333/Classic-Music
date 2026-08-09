import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getHarbinMaitixPriceTiers,
  parseHarbinMaitixDetail,
  parseHarbinMaitixSeedFile,
} from "./harbin-maitix";

const parsed = parseHarbinMaitixDetail({
  projectName: "四重奏回响：贝多芬·舒曼室内乐之夜",
  projectDetail: `
    <p>四位优秀青年演奏家联袂演出</p>
    <p><strong>一. 罗伯特·舒曼：A大调第三弦乐四重奏</strong></p>
    <p>Op.41 No.3</p>
    <p>Robert Schumann:</p>
    <p>String Quartet No.3 in A Major, Op.41 No.3</p>
    <p><strong>I. Andante espressivo</strong></p>
    <p><strong>富有表情的行板</strong></p>
    <p><strong>II. Introduzione: Andante con moto –</strong></p>
    <p><strong>Allegro vivace</strong></p>
    <p><strong>引子：流动的行板 — 活泼的快板</strong></p>
    <p><strong>二、路德维希·凡·贝多芬：C大调第九弦乐四重奏</strong></p>
    <p>Op.59 No.3《拉兹莫夫斯基》</p>
    <p>Ludwig van Beethoven: String Quartet No.9 in C Major, Op.59 No.3</p>
  `,
  eventVoList: [{ eventToken: "1", showTime: 1786863600000 }],
});

assert.equal(parsed.program.length, 2);
assert.equal(parsed.program[0].composer, "罗伯特·舒曼");
assert.equal(parsed.program[0].movements?.[0].title, "富有表情的行板");
assert.deepEqual(parsed.program[0].movements?.[0].alternateTitles, ["Andante espressivo"]);
assert.deepEqual(parsed.program[0].movements?.[1].alternateTitles, ["Introduzione: Andante con moto – Allegro vivace"]);
assert.match(parsed.program[0].alternateTitles?.[0] || "", /String Quartet No\.3/);
assert.equal(parsed.program[1].composer, "路德维希·凡·贝多芬");
assert.equal(parsed.description, "四位优秀青年演奏家联袂演出");
assert.deepEqual(getHarbinMaitixPriceTiers({ priceVoList: [
  { price: "80", priceType: 0 }, { price: "120", priceType: 0 },
  { price: "192", priceType: 2 }, { price: "80", priceType: 0 },
] }), [80, 120]);

const seededProjects = parseHarbinMaitixSeedFile(JSON.parse(
  readFileSync(resolve(process.cwd(), "data/source-seeds/harbin-maitix.json"), "utf8"),
));
assert.deepEqual(seededProjects.map((project) => String(project.projectToken)), ["238906060", "239358001"]);
const seededClassic = parseHarbinMaitixDetail(seededProjects[0]);
assert.equal(seededClassic.events[0].showTime, 1786791600000);
assert.equal(seededClassic.conductor, "李心草");
assert.equal(seededClassic.ensemble, "哈尔滨交响乐团");
assert.deepEqual(seededClassic.program.map((item) => item.composer), ["贝多芬", "莱尼克", "柴可夫斯基"]);

const seededAugust = parseHarbinMaitixDetail(seededProjects[1]);
assert.equal(seededAugust.events[0].showTime, 1787914800000);
assert.equal(seededAugust.conductor, "陈琳");
assert.deepEqual(seededAugust.performers, ["玛丽安娜·特切里安"]);
assert.equal(seededAugust.program.length, 3);
assert.deepEqual(seededAugust.program[0].movements?.[0].alternateTitles, ["En bateau. Andantino"]);

console.log("Harbin Maitix parser tests passed.");
