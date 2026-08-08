import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ChangeDataset, ConcertIndexDataset, EntityDataset } from "../src/types";

async function main() {
  const auditStartedAt = new Date().toISOString();
  const root = process.cwd();
  const indexPath = resolve(root, "public/data/events-index.json");
  const entityPath = resolve(root, "public/data/entities.json");
  const changesPath = resolve(root, "public/data/changes.json");
  const databasePath = resolve(root, "data/classic-music.db");
  const index = JSON.parse(await readFile(indexPath, "utf8")) as ConcertIndexDataset;
  const entities = JSON.parse(await readFile(entityPath, "utf8")) as EntityDataset;
  const changes = JSON.parse(await readFile(changesPath, "utf8")) as ChangeDataset;
  try {
    await access(databasePath);
  } catch {
    console.error(`[ERROR] 缺少本地 SQLite 数据库：${databasePath}`);
    console.error("请先运行 `npm run scrape` 重新采集，或运行 `npm run reviews:apply` 从现有审核记录重建本地数据库。");
    process.exitCode = 1;
    return;
  }
  const database = new DatabaseSync(databasePath, { readOnly: true });

  const performanceCount = Number(
    (database.prepare("SELECT COUNT(*) AS count FROM performances").get() as { count: number }).count,
  );
  const futurePerformanceCount = Number(
    (
      database
        .prepare("SELECT COUNT(*) AS count FROM performances WHERE start_time >= ?")
        .get(auditStartedAt) as { count: number }
    ).count,
  );
  const workCount = Number(
    (database.prepare("SELECT COUNT(*) AS count FROM works").get() as { count: number }).count,
  );
  const personCount = Number(
    (database.prepare("SELECT COUNT(*) AS count FROM people").get() as { count: number }).count,
  );
  const changeCount = Number(
    (database.prepare("SELECT COUNT(*) AS count FROM changes").get() as { count: number }).count,
  );
  database.close();

  const failures: string[] = [];
  if (index.schemaVersion !== 2) failures.push(`索引 schemaVersion=${index.schemaVersion}`);
  if (futurePerformanceCount !== index.events.length) {
    failures.push(`SQLite future performances=${futurePerformanceCount}，index events=${index.events.length}`);
  }
  if (!workCount) failures.push("SQLite works 为空");
  if (!personCount) failures.push("SQLite people 为空");
  if (!entities.entities.length) failures.push("实体索引为空");
  if (new Set(changes.changes.map((item) => item.id)).size !== changes.changes.length) {
    failures.push("静态变化历史包含重复 ID");
  }
  const historyIds = new Set(changes.changes.map((item) => item.id));
  for (const run of changes.runs ?? []) {
    for (const id of run.changeIds) {
      if (!historyIds.has(id)) failures.push(`采集批次引用了不存在的变化：${id}`);
    }
  }
  if (changeCount < changes.changes.length) {
    failures.push(`SQLite changes=${changeCount}，静态变化历史=${changes.changes.length}`);
  }

  await Promise.all(
    index.events.map(async (event) => {
      try {
        await access(resolve(root, "public/data", event.detailPath));
      } catch {
        failures.push(`缺少详情文件：${event.detailPath}`);
      }
    }),
  );

  const indexSize = (await stat(indexPath)).size;
  console.log(
    `存储审计：${index.events.length} 场；SQLite ${performanceCount} performances / ${workCount} works / ${personCount} people / ${changeCount} changes；索引 ${(indexSize / 1024).toFixed(1)} KB`,
  );
  if (failures.length) {
    for (const failure of failures) console.error(`[ERROR] ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("存储审计：0 个错误");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
