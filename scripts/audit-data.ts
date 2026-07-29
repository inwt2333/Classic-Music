import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ConcertDataset, ConcertEvent } from "../src/types";

type Severity = "error" | "warning";

type Issue = {
  severity: Severity;
  event: ConcertEvent;
  message: string;
};

async function main() {
const datasetArgument = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const datasetPath = resolve(process.cwd(), datasetArgument || "public/data/events.json");
const dataset = JSON.parse(await readFile(datasetPath, "utf8")) as ConcertDataset;
const issues: Issue[] = [];
const strictSources = process.argv.includes("--strict-sources");
const allowStaleSources = process.argv.includes("--allow-stale-sources");
let sourceFailure = false;
const eventKeys = new Set<string>();
const eventIds = new Set<string>();
const knownComposers = new Set(dataset.events.flatMap((event) => event.composers));
const roleOnlyPattern =
  /^(?:家|领唱|指挥|演奏|演唱|钢琴|小提琴|中提琴|大提琴|大管|合唱|混声合唱|男声合唱|女声合唱|作曲家)$/;

if (strictSources) {
  for (const source of dataset.sources) {
    if (!source.ok) {
      const recovered = allowStaleSources && source.eventCount > 0;
      const level = recovered ? "WARN" : "ERROR";
      console.error(
        `[${level}] 来源采集失败${recovered ? "，已保留上一版数据" : ""}：${source.name}${source.message ? `：${source.message}` : ""}`,
      );
      if (!recovered) sourceFailure = true;
    }
  }
}

for (const event of dataset.events) {
  if (eventIds.has(event.id)) addIssue("error", event, `重复稳定 ID：${event.id}`);
  eventIds.add(event.id);
  if (dataset.schemaVersion === 2 && !/^perf_[a-f0-9]{16}$/.test(event.id)) {
    addIssue("error", event, `稳定 ID 格式错误：${event.id}`);
  }
  if (dataset.schemaVersion === 2 && !event.projectId) addIssue("error", event, "缺少项目级稳定 ID");
  if (dataset.schemaVersion === 2 && !event.sources?.length) addIssue("error", event, "缺少来源追踪记录");
  const eventKey = `${event.title}\u0000${event.startTime}\u0000${event.venue}`;
  if (eventKeys.has(eventKey)) addIssue("error", event, "重复的标题、时间和场馆");
  eventKeys.add(eventKey);

  if (!event.title.trim()) addIssue("error", event, "标题为空");
  if (!event.sourceUrl) addIssue("error", event, "缺少来源链接");
  if (Number.isNaN(Date.parse(event.startTime))) addIssue("error", event, "开始时间无效");
  if (event.dataQuality === "scraped" && !event.program.length) {
    addIssue("error", event, "标记为 scraped 但节目单为空");
  }
  if (event.dataQuality === "manual-reviewed") {
    if (event.review?.status !== "approved") {
      addIssue("error", event, "人工确认事件缺少 approved 审核记录");
    }
    if (!event.program.length || event.program.some((item) => item.confidence !== "manual")) {
      addIssue("error", event, "人工确认事件的节目单或字段置信度异常");
    }
  }
  if (event.dataQuality === "ocr-assisted") {
    if (!event.program.length) {
      addIssue("error", event, "标记为 ocr-assisted 但节目单为空");
    }
    if (!event.program.some((item) => item.confidence === "ocr")) {
      addIssue("error", event, "OCR 辅助事件没有 OCR 来源的节目项");
    }
    if (event.extraction?.method !== "ocr" || !event.extraction.reviewRequired) {
      addIssue("error", event, "OCR 辅助事件缺少待复核的提取元数据");
    }
    const confidence = event.extraction?.confidence;
    if (confidence === undefined || confidence < 0 || confidence > 100) {
      addIssue("error", event, "OCR 置信度缺失或超出 0-100");
    }
  }
  if (event.program.length > 30) addIssue("warning", event, `节目项异常偏多：${event.program.length}`);

  const tiers = event.priceTiers ?? [];
  if (tiers.some((price) => !Number.isFinite(price) || price < 0)) {
    addIssue("error", event, "票价档位含无效值");
  }
  if (tiers.some((price, index) => index > 0 && price <= tiers[index - 1])) {
    addIssue("error", event, "票价档位未严格递增");
  }

  for (const composer of event.composers) {
    if (roleOnlyPattern.test(composer)) addIssue("error", event, `异常作曲家：${composer}`);
    if (/曾参与|演出场所|^饰/.test(composer)) addIssue("error", event, `疑似人物介绍被当作曲家：${composer}`);
  }
  for (const item of event.program) {
    if (dataset.schemaVersion === 2 && !item.workId) addIssue("error", event, `节目项缺少作品 ID：${item.title}`);
    if (item.composer && roleOnlyPattern.test(item.composer)) {
      addIssue("error", event, `节目项含异常作曲家：${item.composer}`);
    }
    if (/^【[^】]+】$/.test(item.title)) {
      addIssue("error", event, `节目项是分组标题：${item.title}`);
    }
    if (!item.composer && knownComposers.has(item.title)) {
      addIssue("warning", event, `疑似把作曲家当作作品：${item.title}`);
    }
    if (item.confidence === "title-inferred") {
      addIssue("warning", event, `节目项来自标题推断：${item.title}`);
    }
  }

  for (const performer of event.performers) {
    if (/^(?:舞蹈|钢琴|小提琴|大提琴|指挥)$/.test(performer)) {
      addIssue("error", event, `异常演出者：${performer}`);
    } else if (/[\u3400-\u9fff](?:钢琴|小提琴|大提琴)$/.test(performer)) {
      addIssue("warning", event, `演出者疑似混入乐器名：${performer}`);
    }
  }
}

const errors = issues.filter((issue) => issue.severity === "error");
const warnings = issues.filter((issue) => issue.severity === "warning");
const sourceSummary = dataset.sources
  .map((source) => `${source.name} ${source.eventCount}${source.ok ? "" : " (failed)"}`)
  .join("；");

console.log(`数据集：${dataset.events.length} 场；${sourceSummary}`);
console.log(`审计结果：${errors.length} 个错误，${warnings.length} 个警告`);
for (const issue of issues.slice(0, 80)) {
  console.log(
    `[${issue.severity.toUpperCase()}] ${issue.event.sourceName} / ${issue.event.title}: ${issue.message}`,
  );
}
if (issues.length > 80) console.log(`其余 ${issues.length - 80} 项未显示`);
if (errors.length || sourceFailure) process.exitCode = 1;

function addIssue(severity: Severity, event: ConcertEvent, message: string) {
  issues.push({ severity, event, message });
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
