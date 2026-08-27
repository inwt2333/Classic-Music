import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  extractPolytProgram,
  mapPolytTicketStatus,
  parsePolytRecommendList,
  parsePolytShowList,
} from "./poly-theatre";

async function main() {
  const fixtureDir = resolve(process.cwd(), "scripts/fixtures/poly-theatre-wuhan");
  const list = parsePolytRecommendList(await readFile(resolve(fixtureDir, "list-page1.json"), "utf8"));

  assert.equal(list.total, 15);
  assert.equal(list.products.length, 15);
  const phantom = list.products.find((product) => product.productId === "9218700");
  assert.ok(phantom, "列表应包含剧院魅影");
  assert.equal(phantom!.name, "英文原版音乐剧《剧院魅影》武汉站", "应剥离[武汉]城市前缀");
  assert.equal(phantom!.category, "音乐剧");
  assert.equal(phantom!.place, "武汉琴台大剧院");
  const fanren = list.products.find((product) => product.productId === "9479000");
  assert.equal(fanren!.subCategory, "交响乐/管弦乐");

  const project = JSON.parse(await readFile(resolve(fixtureDir, "project-9218700.json"), "utf8"));
  const shows = parsePolytShowList(JSON.stringify({ code: "200", data: project.shows }));
  assert.equal(shows.length, 14);
  assert.equal(shows[0].showId, "15907500");
  assert.equal(shows[0].happenAt.toISOString(), "2026-08-27T11:30:00.000Z");
  assert.ok(shows[0].priceTiers.length >= 4, "场次应带票价档");
  assert.ok(shows[0].priceTiers.every((price, index) => index === 0 || price > shows[0].priceTiers[index - 1]));

  assert.equal(mapPolytTicketStatus({ showStatusName: "售票中" }), "on-sale");
  assert.equal(mapPolytTicketStatus({ showStatusName: "已售罄" }), "sold-out");
  assert.equal(mapPolytTicketStatus({ showStatusName: "停售" }), "off-sale");
  assert.equal(mapPolytTicketStatus({ showStatusName: "未开售" }), "pre-sale");
  assert.equal(mapPolytTicketStatus({ showStatusName: "" }), undefined);

  assert.deepEqual(extractPolytProgram({ introduces: null }), []);
  assert.deepEqual(extractPolytProgram(project.detail), [], "无 introduces 内容时返回空而非报错");

  const fanrenProject = JSON.parse(await readFile(resolve(fixtureDir, "project-9479000.json"), "utf8"));
  assert.ok(fanrenProject.detail.productName.includes("凡人修仙传"));

  console.log("Poly theatre parser tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
