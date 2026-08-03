import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ChangeDataset, ConcertEvent } from "../src/types";
import { buildChangeEventSnapshot } from "./data-store";

async function main() {
  const [, , beforeRevision, afterRevision, detectedAt] = process.argv;
  if (!beforeRevision || !afterRevision) {
    throw new Error("Usage: tsx scripts/backfill-change-snapshots.ts <before-revision> <after-revision> [detected-at]");
  }
  for (const revision of [beforeRevision, afterRevision]) {
    if (!/^[A-Za-z0-9._/-]+$/.test(revision)) throw new Error(`Invalid Git revision: ${revision}`);
  }

  const historyPath = resolve(process.cwd(), "public/data/changes.json");
  const history = JSON.parse(await readFile(historyPath, "utf8")) as ChangeDataset;
  let updated = 0;
  for (const item of history.changes) {
    if (detectedAt && item.detectedAt !== detectedAt) continue;
    if (!/^[A-Za-z0-9_-]+$/.test(item.eventId)) continue;
    const before = readEventAtRevision(beforeRevision, item.eventId);
    const after = readEventAtRevision(afterRevision, item.eventId);
    if (!before && !after) continue;
    item.before = before ? buildChangeEventSnapshot(before) : undefined;
    item.after = after ? buildChangeEventSnapshot(after) : undefined;
    updated += 1;
  }

  await writeFile(historyPath, `${JSON.stringify(history)}\n`, "utf8");
  console.log(`Backfilled ${updated} change snapshots.`);
}

function readEventAtRevision(revision: string, eventId: string) {
  try {
    const raw = execFileSync(
      "git",
      ["show", `${revision}:public/data/events/${eventId}.json`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return JSON.parse(raw) as ConcertEvent;
  } catch {
    return undefined;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
