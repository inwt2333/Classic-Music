import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  enhanceWechatImportWithDeepSeek,
  parseWechatArticle,
  readWechatArticle,
} from "./wechat-import";
import { saveWechatImport } from "./wechat-import-store";

async function main() {
  const articleUrl = argumentValue("--url");
  const textPath = argumentValue("--text-file");
  const rawText = textPath ? await readFile(resolve(textPath), "utf8") : undefined;
  if (!articleUrl && !rawText) {
    throw new Error("用法：npm run wechat:import -- --url <公众号链接> [--text-file <正文文件>] [--ai]");
  }
  const article = await readWechatArticle({ articleUrl, rawText });
  let record = parseWechatArticle(article);
  if (process.argv.includes("--ai")) record = await enhanceWechatImportWithDeepSeek(record);
  await saveWechatImport(resolve("data/wechat-inbox.json"), record);
  console.log(`公众号导入完成：${record.articleTitle ?? record.id}，${record.candidates.length} 个候选待审核`);
}

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
