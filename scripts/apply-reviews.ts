import "dotenv/config";
import { resolve } from "node:path";
import { reapplyManualReviewsAndPersist } from "./data-store";

const root = process.cwd();

async function main() {
  const prepared = await reapplyManualReviewsAndPersist(
    resolve(root, "public/data/events.json"),
    resolve(root, "data/classic-music.db"),
  );
  const reviewedCount = prepared.dataset.events.filter((event) => event.review).length;
  console.log(`Applied ${reviewedCount} manual review decision(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
