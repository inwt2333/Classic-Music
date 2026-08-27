import { writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { manualReviewDecisionSchema, saveManualReview } from "./review-store";
import type { ManualReviewDecision } from "../src/types";

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "") ?? process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");
const reviewPath = resolve(process.cwd(), "data/manual-reviews.json");

type SubmissionRow = {
  id: number;
  event_id: string;
  source_record_ids: unknown;
  review_status: "approved" | "rejected";
  program: unknown;
  note: string | null;
  submitted_at: string;
};

async function main() {
  if (!supabaseUrl || !serviceKey) {
    throw new Error("需要 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY 环境变量");
  }
  const headers = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
  };
  const response = await fetch(
    `${supabaseUrl}/rest/v1/remote_review_submissions?select=id,event_id,source_record_ids,review_status,program,note,submitted_at&status=eq.pending&order=submitted_at.asc&limit=50`,
    { headers },
  );
  if (!response.ok) throw new Error(`拉取远程审核队列失败：HTTP ${response.status}`);
  const rows = await response.json() as SubmissionRow[];
  if (!rows.length) {
    console.log("没有待处理的远程审核提交。");
    return;
  }

  const applied: number[] = [];
  for (const row of rows) {
    const decision = manualReviewDecisionSchema.parse({
      eventId: row.event_id,
      sourceRecordIds: Array.isArray(row.source_record_ids) ? row.source_record_ids.map(String) : [],
      status: row.review_status,
      program: row.program,
      note: row.note ?? undefined,
      reviewedAt: row.submitted_at,
    });
    if (!dryRun) await saveManualReview(reviewPath, decision);
    applied.push(row.id);
    console.log(`[remote-review] ${decision.eventId}: ${decision.status}${decision.note ? `（${decision.note}）` : ""}`);
  }

  if (dryRun) {
    console.log(`dry-run：共 ${applied.length} 条待应用，未写入。`);
    return;
  }

  for (const id of applied) {
    const patch = await fetch(
      `${supabaseUrl}/rest/v1/remote_review_submissions?id=eq.${id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "applied", applied_at: new Date().toISOString() }),
      },
    );
    if (!patch.ok) console.warn(`[remote-review] 标记 applied 失败 id=${id}: HTTP ${patch.status}`);
  }
  const file = JSON.parse(await readFile(reviewPath, "utf8"));
  await writeFile(reviewPath, JSON.stringify({ ...file, updatedAt: new Date().toISOString() }, null, 2) + "\n", "utf8");
  console.log(`已应用 ${applied.length} 条远程审核提交到 ${reviewPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
