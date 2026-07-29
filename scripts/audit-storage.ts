import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ConcertIndexDataset, EntityDataset } from "../src/types";

async function main() {
  const root = process.cwd();
  const indexPath = resolve(root, "public/data/events-index.json");
  const entityPath = resolve(root, "public/data/entities.json");
  const databasePath = resolve(root, "data/classic-music.db");
  const index = JSON.parse(await readFile(indexPath, "utf8")) as ConcertIndexDataset;
  const entities = JSON.parse(await readFile(entityPath, "utf8")) as EntityDataset;
  const database = new DatabaseSync(databasePath, { readOnly: true });

  const performanceCount = Number(
    (database.prepare("SELECT COUNT(*) AS count FROM performances").get() as { count: number }).count,
  );
  const workCount = Number(
    (database.prepare("SELECT COUNT(*) AS count FROM works").get() as { count: number }).count,
  );
  const personCount = Number(
    (database.prepare("SELECT COUNT(*) AS count FROM people").get() as { count: number }).count,
  );
  database.close();

  const failures: string[] = [];
  if (index.schemaVersion !== 2) failures.push(`索引 schemaVersion=${index.schemaVersion}`);
  if (performanceCount !== index.events.length) {
    failures.push(`SQLite performances=${performanceCount}，index events=${index.events.length}`);
  }
  if (!workCount) failures.push("SQLite works 为空");
  if (!personCount) failures.push("SQLite people 为空");
  if (!entities.entities.length) failures.push("实体索引为空");

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
    `存储审计：${index.events.length} 场；SQLite ${performanceCount} performances / ${workCount} works / ${personCount} people；索引 ${(indexSize / 1024).toFixed(1)} KB`,
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
