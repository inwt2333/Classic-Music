import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { loadKnowledgeRegistry } from "./knowledge-store";
import {
  buildAuditPrompt,
  buildAutomatedMapping,
  buildCompletionPrompt,
  buildGenerationPrompt,
  buildIdentityPrompt,
  compareKnowledgeCandidates,
  collectKnowledgeEvidence,
  discardUnsupportedRecordings,
  discoverKnowledgeCandidates,
  discoverIncompleteGeneratedWorks,
  generatedAuditSchema,
  generatedIdentitySchema,
  generatedKnowledgeSchema,
  findKnownComposer,
  loadAutomationState,
  materializeGeneratedKnowledge,
  missingCompleteFields,
  parseAutomationConfig,
  repairRecordingNotes,
  requestDeepSeekJson,
  resolveExistingWork,
  saveJson,
  type AutomationState,
} from "./knowledge-automation";

const root = process.cwd();
const datasetPath = resolve(root, argumentValue("--dataset") ?? "public/data/events.json");
const configPath = resolve(root, argumentValue("--config") ?? "knowledge/automation.json");
const statePath = resolve(root, argumentValue("--state") ?? "knowledge/automation-state.json");
const skillPath = resolve(root, "skills/deepseek-knowledge-curator/SKILL.md");
const mappingsPath = resolve(root, "knowledge/mappings/auto-generated.json");
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

async function main() {
  const [dataset, config, registry, skillText, state, automatedMappings] = await Promise.all([
    readJson(datasetPath),
    readJson(configPath).then(parseAutomationConfig),
    loadKnowledgeRegistry(root),
    readFile(skillPath, "utf8"),
    loadAutomationState(statePath),
    readAutomatedMappings(mappingsPath),
  ]);
  if (process.env.DEEPSEEK_MODEL?.trim()) config.model = process.env.DEEPSEEK_MODEL.trim();
  if (!config.enabled) {
    console.log("Knowledge automation is disabled.");
    return;
  }

  const candidates = discoverKnowledgeCandidates(dataset, registry, config);
  const upgrades = discoverIncompleteGeneratedWorks(dataset, registry, config);
  const pipelineVersion = `${config.model}:${config.skillVersion}`;
  const handled = new Set(Object.entries(state.candidates)
    .filter(([, item]) => item.status === "published" || item.status === "mapped"
      || (item.pipelineVersion === pipelineVersion && (item.status === "skipped" || item.attempts >= 3)))
    .map(([fingerprint]) => fingerprint));
  const pending = candidates.filter((candidate) => !handled.has(candidate.fingerprint));
  const mappingResolutions = pending
    .map((candidate) => resolveExistingWork(candidate, registry))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const resolvedFingerprints = new Set(mappingResolutions.map((item) => item.candidate.fingerprint));
  const unresolved = pending
    .filter((candidate) => !resolvedFingerprints.has(candidate.fingerprint))
    .sort(compareKnowledgeCandidates);
  const now = Date.now();
  const dueUpgrades = upgrades.filter(({ candidate }) => {
    const entry = state.candidates[candidate.fingerprint];
    return force || !entry?.nextRetryAt || Date.parse(entry.nextRetryAt) <= now || entry.pipelineVersion !== pipelineVersion;
  });
  const requestedLimit = Number(argumentValue("--limit") ?? config.maxCandidatesPerRun);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 50)
    : config.maxCandidatesPerRun;

  console.log(`Knowledge candidates: ${candidates.length}; pending ${pending.length}; existing-work mappings ${mappingResolutions.length}; completion queue ${dueUpgrades.length}; generation queue ${unresolved.length}.`);
  if (dryRun) {
    for (const item of mappingResolutions.slice(0, 20)) {
      console.log(`[map:${item.reason}] ${item.candidate.composer} / ${item.candidate.title} -> ${item.workId}`);
    }
    for (const { candidate, work } of dueUpgrades.slice(0, limit)) {
      console.log(`[complete] ${candidate.composer} / ${candidate.title} -> ${work.id}`);
    }
    for (const candidate of unresolved.slice(0, Math.max(0, limit - dueUpgrades.length))) {
      console.log(`[generate] ${candidate.composer} / ${candidate.title}${candidate.opus ? ` / ${candidate.opus}` : ""}`);
    }
    return;
  }

  const generatedAt = new Date().toISOString();
  let changed = false;
  let mapped = 0;
  let published = 0;
  let skipped = 0;
  let failed = 0;

  for (const resolution of mappingResolutions) {
    const rule = buildAutomatedMapping(resolution.candidate, resolution.workId, generatedAt);
    if (!automatedMappings.rules.some((item) => item.id === rule.id)) {
      automatedMappings.rules.push(rule);
      changed = true;
    }
    state.candidates[resolution.candidate.fingerprint] = stateEntry(
      state,
      resolution.candidate.fingerprint,
      "mapped",
      generatedAt,
      resolution.candidate.eventIds,
      resolution.workId,
      `matched-by-${resolution.reason}`,
      pipelineVersion,
    );
    mapped += 1;
    changed = true;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const generationQueue = [
    ...dueUpgrades.map((item) => ({ candidate: item.candidate, existingWork: item.work })),
    ...unresolved.map((candidate) => ({ candidate, existingWork: undefined })),
  ].slice(0, limit);
  if (!apiKey && generationQueue.length) {
    if (changed) {
      automatedMappings.rules.sort((left, right) => left.id.localeCompare(right.id));
      await Promise.all([saveJson(mappingsPath, automatedMappings), saveJson(statePath, state)]);
    }
    console.warn("未配置 DEEPSEEK_API_KEY；已保存确定性映射，跳过新作品生成。配置密钥后将继续处理生成队列。");
    return;
  }

  for (const { candidate, existingWork } of generationQueue) {
    try {
      const knownComposer = findKnownComposer(candidate.composer, registry);
      console.log(`[identity] ${candidate.composer} / ${candidate.title}`);
      const identity = await requestDeepSeekJson({
        apiKey: apiKey!,
        model: config.model,
        baseUrl: process.env.DEEPSEEK_BASE_URL,
        system: skillText,
        prompt: buildIdentityPrompt(candidate, knownComposer),
        schema: generatedIdentitySchema,
        maxTokens: 1_200,
        timeoutMs: 90_000,
      });
      if (identity.decision === "skip" || !identity.work) {
        const status = existingWork ? "needs_completion" : "skipped";
        state.candidates[candidate.fingerprint] = stateEntry(
          state, candidate.fingerprint, status, generatedAt, candidate.eventIds,
          existingWork?.id, identity.warnings.join("；") || `entity-level-${identity.entityLevel}`,
          pipelineVersion, existingWork ? retryAt(generatedAt) : undefined,
        );
        skipped += 1;
        changed = true;
        console.warn(`[skipped:identity] ${candidate.composer} / ${candidate.title}: ${identity.warnings.join("；") || `entity-level-${identity.entityLevel}`}`);
        continue;
      }
      console.log(`[research] ${identity.composer.originalName ?? identity.composer.name} / ${identity.work.originalTitle ?? identity.work.title}`);
      const evidence = await collectKnowledgeEvidence(candidate, globalThis.fetch, identity, knownComposer);
      console.log(`[generate] collected ${evidence.length} evidence records`);
      let generated = await requestDeepSeekJson({
        apiKey: apiKey!,
        model: config.model,
        baseUrl: process.env.DEEPSEEK_BASE_URL,
        system: skillText,
        prompt: buildGenerationPrompt(candidate, identity, evidence, knownComposer),
        schema: generatedKnowledgeSchema,
        maxTokens: 5_000,
      });
      if (knownComposer) {
        generated = {
          ...generated,
          composer: {
            name: knownComposer.name,
            originalName: knownComposer.originalName,
            aliases: knownComposer.aliases,
          },
        };
      }
      generated = repairRecordingNotes(discardUnsupportedRecordings(generated, evidence), evidence);
      const missingFields = missingCompleteFields(generated);
      if (generated.decision === "publish" && missingFields.length) {
        console.log(`[complete-fields] ${missingFields.join(", ")}`);
        generated = await requestDeepSeekJson({
          apiKey: apiKey!,
          model: config.model,
          baseUrl: process.env.DEEPSEEK_BASE_URL,
          system: skillText,
          prompt: buildCompletionPrompt(candidate, identity, generated, evidence, missingFields, knownComposer),
          schema: generatedKnowledgeSchema,
          maxTokens: 5_000,
        });
        if (knownComposer) {
          generated = {
            ...generated,
            composer: {
              name: knownComposer.name,
              originalName: knownComposer.originalName,
              aliases: knownComposer.aliases,
            },
          };
        }
        generated = repairRecordingNotes(discardUnsupportedRecordings(generated, evidence), evidence);
      }
      if (generated.decision === "skip") {
        const status = existingWork ? "needs_completion" : "skipped";
        state.candidates[candidate.fingerprint] = stateEntry(
          state, candidate.fingerprint, status, generatedAt, candidate.eventIds,
          existingWork?.id, generated.warnings.join("；") || `entity-level-${generated.entityLevel}`,
          pipelineVersion, existingWork ? retryAt(generatedAt) : undefined,
        );
        skipped += 1;
        changed = true;
        console.warn(`[skipped:generation] ${candidate.composer} / ${candidate.title}: ${generated.warnings.join("；") || `entity-level-${generated.entityLevel}`}`);
        continue;
      }
      console.log(`[audit] ${generated.work?.title ?? candidate.title}`);
      const audit = await requestDeepSeekJson({
        apiKey: apiKey!,
        model: config.model,
        baseUrl: process.env.DEEPSEEK_BASE_URL,
        system: skillText,
        prompt: buildAuditPrompt(candidate, generated, evidence, knownComposer),
        schema: generatedAuditSchema,
        maxTokens: 800,
        timeoutMs: 60_000,
      });
      if (audit.verdict === "skip") {
        const status = existingWork ? "needs_completion" : "skipped";
        state.candidates[candidate.fingerprint] = stateEntry(
          state, candidate.fingerprint, status, generatedAt, candidate.eventIds,
          existingWork?.id, audit.warnings.join("；") || "auditor-rejected",
          pipelineVersion, existingWork ? retryAt(generatedAt) : undefined,
        );
        skipped += 1;
        changed = true;
        console.warn(`[skipped:audit] ${candidate.composer} / ${candidate.title}: ${audit.warnings.join("；") || "auditor-rejected"}`);
        continue;
      }
      const materialized = materializeGeneratedKnowledge({
        candidate, generated, audit, evidence, registry, config, skillText, generatedAt, existingWork,
      });
      const existingGeneratedWork = registry.works.find((work) => work.id === materialized.work.id);
      if (existingGeneratedWork && !existingWork) {
        if (!automatedMappings.rules.some((item) => item.id === materialized.mapping.id)) automatedMappings.rules.push(materialized.mapping);
        state.candidates[candidate.fingerprint] = stateEntry(
          state, candidate.fingerprint, "mapped", generatedAt, candidate.eventIds,
          existingGeneratedWork.id, "matched-generated-id", pipelineVersion,
        );
        mapped += 1;
        changed = true;
        continue;
      }
      await saveJson(resolve(root, "knowledge/works", `auto_${materialized.work.id}.json`), materialized.work);
      if (materialized.composer) {
        await saveJson(resolve(root, "knowledge/composers", `auto_${materialized.composer.id}.json`), materialized.composer);
        registry.composers.push(materialized.composer);
      }
      if (existingWork) {
        const index = registry.works.findIndex((work) => work.id === existingWork.id);
        registry.works[index] = materialized.work;
      } else {
        registry.works.push(materialized.work);
      }
      if (!automatedMappings.rules.some((item) => item.id === materialized.mapping.id)) {
        automatedMappings.rules.push(materialized.mapping);
      }
      const status = materialized.work.completeness === "complete" ? "published" : "needs_completion";
      const effectiveScore = materialized.work.generation?.score ?? materialized.score;
      state.candidates[candidate.fingerprint] = stateEntry(
        state, candidate.fingerprint, status, generatedAt, candidate.eventIds,
        materialized.work.id, `score-${effectiveScore}`,
        pipelineVersion, status === "needs_completion" ? retryAt(generatedAt) : undefined,
      );
      published += 1;
      changed = true;
      console.log(`[${status}:${effectiveScore}] ${candidate.composer} / ${candidate.title} -> ${materialized.work.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = existingWork ? "needs_completion" : "failed";
      state.candidates[candidate.fingerprint] = stateEntry(
        state, candidate.fingerprint, status, generatedAt, candidate.eventIds,
        existingWork?.id, message,
        pipelineVersion, existingWork ? retryAt(generatedAt) : undefined,
      );
      failed += 1;
      changed = true;
      console.error(`[failed] ${candidate.composer} / ${candidate.title}: ${message}`);
    }
  }

  if (changed) {
    automatedMappings.rules.sort((left, right) => left.id.localeCompare(right.id));
    await Promise.all([
      saveJson(mappingsPath, automatedMappings),
      saveJson(statePath, state),
    ]);
  }
  console.log(`Knowledge automation finished: mapped ${mapped}, published ${published}, skipped ${skipped}, failed ${failed}.`);
}

function stateEntry(
  state: AutomationState,
  fingerprint: string,
  status: AutomationState["candidates"][string]["status"],
  updatedAt: string,
  sourceEventIds: string[],
  workId?: string,
  reason?: string,
  pipelineVersion?: string,
  nextRetryAt?: string,
) {
  return {
    status,
    workId,
    attempts: (state.candidates[fingerprint]?.attempts ?? 0) + 1,
    updatedAt,
    reason,
    sourceEventIds,
    pipelineVersion,
    nextRetryAt,
  };
}

function retryAt(value: string) {
  return new Date(Date.parse(value) + 7 * 24 * 60 * 60 * 1_000).toISOString();
}

async function readAutomatedMappings(path: string) {
  try {
    const value = await readJson(path);
    return z.object({ schemaVersion: z.literal(1), rules: z.array(z.any()) }).parse(value) as {
      schemaVersion: 1;
      rules: ReturnType<typeof buildAutomatedMapping>[];
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { schemaVersion: 1 as const, rules: [] as ReturnType<typeof buildAutomatedMapping>[] };
  }
}

async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8"));
}

function argumentValue(name: string) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
