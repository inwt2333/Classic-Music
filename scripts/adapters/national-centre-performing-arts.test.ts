import assert from "node:assert/strict";
import { parseNcpaDetail, parseNcpaPriceTiers } from "./national-centre-performing-arts";

const parsed = parseNcpaDetail({
  introduce: [
    {
      type: "70",
      contents: [{
        content: `
          <p>花之乐章（选自D大调第一号交响曲） 马勒 曲</p>
          <p>G大调第四号交响曲 马勒 曲</p>
          <p>第一乐章：从容地；非常闲适地</p>
          <p>女高音：李晶晶</p>
          <p>二胡独奏：崔璨</p>
          <p>女高音领唱：王欢</p>
          <p>*以上内容可能变更</p>
        `,
      }],
    },
  ],
});

assert.equal(parsed.program.length, 2);
assert.equal(parsed.program[0].composer, "马勒");
assert.equal(parsed.program[1].movements?.[0].title, "从容地；非常闲适地");
assert.deepEqual(parsed.performers, ["李晶晶", "崔璨", "王欢"]);
assert.deepEqual(
  parseNcpaPriceTiers({
    sessionPrices: [{ name: "480" }, { name: "380(满3张打8折)" }, { name: "80" }],
  }),
  [80, 380, 480],
);

console.log("NCPA parser tests passed.");
