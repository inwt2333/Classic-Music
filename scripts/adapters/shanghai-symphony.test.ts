import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseShanghaiSymphonyContent, parseShanghaiSymphonyPrices } from "./shanghai-symphony";

const fixturePath = (id: string) =>
  resolve(process.cwd(), "scripts/fixtures/shanghai-symphony", `shsymphony-official.${id}.json`);

async function main() {
  const snapshot = JSON.parse(await readFile(fixturePath("21756"), "utf8"));
  const program = parseShanghaiSymphonyContent(snapshot.programInfo, snapshot.showContent).program;

  assert.equal(program.length, 3);
  assert.deepEqual(program[0], {
    composer: "门德尔松",
    title: "《仲夏夜之梦》组曲，作品61",
    confidence: "official",
    movements: [
      { number: "1", title: "谐谑曲" },
      { number: "7", title: "夜曲" },
      { number: "2", title: "小精灵进行曲" },
      { number: "9", title: "婚礼进行曲" },
    ],
  });
  assert.equal(program[1].title, "e小调小提琴协奏曲，作品64");
  assert.equal(program[2].title, "D大调小提琴协奏曲，作品77");
  assert.equal(program[2].movements, undefined);
  assert.equal(program.some((item) => item.title.includes("列奥尼达斯")), false);

  const flatProgram = parseShanghaiSymphonyContent(`
    <p>曲目：</p>
    <p>贝多芬：第九交响曲，作品125</p>
    <p>1. 很快的快板</p>
    <p>2. 谐谑曲</p>
  `).program;
  assert.equal(flatProgram.length, 1);
  assert.deepEqual(flatProgram[0].movements, [
    { number: "1", title: "很快的快板" },
    { number: "2", title: "谐谑曲" },
  ]);

  const composerInitials = parseShanghaiSymphonyContent(`
    <p>曲目：</p>
    <p>泰勒曼：g小调长笛奏鸣曲，作品2之4</p>
    <p>C.P.E. 巴赫：g小调双簧管奏鸣曲，H. 549</p>
    <p style="padding-left: 40px">马林巴：林喆</p>
  `).program;
  assert.equal(composerInitials.length, 2);
  assert.equal(composerInitials[1].composer, "C.P.E. 巴赫");
  assert.equal(composerInitials[1].title, "g小调双簧管奏鸣曲，H. 549");

  const boundarySnapshot = JSON.parse(await readFile(fixturePath("21830"), "utf8"));
  const boundaryContent = parseShanghaiSymphonyContent(
    boundarySnapshot.programInfo,
    boundarySnapshot.showContent,
  );
  assert.equal(boundaryContent.program.length, 8);
  assert.equal(boundaryContent.program[0].composer, "泰勒曼");
  assert.equal(boundaryContent.program[0].title, "E大调第八无伴奏小提琴幻想曲，TWV 40:21");
  assert.equal(boundaryContent.program.some((item) => item.title.includes("购票")), false);
  assert.match(boundaryContent.description || "", /哈德利希在24\/25乐季/);
  assert.match(boundaryContent.description || "", /《布鲁斯形式》/);

  assert.deepEqual(
    parseShanghaiSymphonyPrices(boundarySnapshot, [
      { price: 1080 },
      { price: 180 },
      { price: 580 },
      { price: 180 },
    ]),
    {
      price: "¥180 - ¥1080",
      priceTiers: [180, 580, 1080],
    },
  );

  const fragmentsSnapshot = JSON.parse(await readFile(fixturePath("21851"), "utf8"));
  const fragments = parseShanghaiSymphonyContent(
    fragmentsSnapshot.programInfo,
    fragmentsSnapshot.showContent,
  );
  assert.equal(fragments.program.length, 0);
  assert.deepEqual(fragments.composers, [
    "阿利森·洛金斯-赫尔",
    "吉利·施瓦茨曼",
    "琼·陶尔",
    "约翰·塞巴斯蒂安·巴赫",
    "雷纳尔多·莫亚",
    "陈怡",
  ]);

  const choirSnapshot = JSON.parse(await readFile(fixturePath("21782"), "utf8"));
  const choir = parseShanghaiSymphonyContent(choirSnapshot.programInfo, choirSnapshot.showContent);
  assert.equal(choir.program.length, 17);
  assert.equal(choir.program.some((item) => item.composer === "领唱"), false);
  assert.equal(choir.program.some((item) => /^【.+合唱】$/.test(item.title)), false);
  assert.deepEqual(choir.program[0], {
    composer: "斯坦福",
    title: "蓝鸟",
    confidence: "official",
  });
  assert.equal(choir.program.find((item) => item.title === "月夜")?.composer, "舒曼");

  const windSnapshot = JSON.parse(await readFile(fixturePath("21810"), "utf8"));
  const wind = parseShanghaiSymphonyContent(windSnapshot.programInfo, windSnapshot.showContent);
  assert.equal(wind.program.some((item) => item.composer === "大管"), false);
  assert.equal(wind.program.some((item) => item.title === "蓝英捷"), false);

  const operaSnapshot = JSON.parse(await readFile(fixturePath("21776"), "utf8"));
  const opera = parseShanghaiSymphonyContent(operaSnapshot.programInfo, operaSnapshot.showContent);
  assert.equal(opera.program.length, 2);
  assert.equal(opera.program.some((item) => /齐格弗里德|布伦希尔德/.test(item.composer || "")), false);

  console.log("Shanghai Symphony adapter tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
