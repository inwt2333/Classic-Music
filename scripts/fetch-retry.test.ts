import assert from "node:assert/strict";
import { fetchWithRetry, isRetriableFetchError } from "./fetch-retry";

async function main() {
  let attempts = 0;
  let initCalls = 0;
  const delays: number[] = [];
  const retries: number[] = [];
  const response = await fetchWithRetry(
    "https://example.com/data",
    () => {
      initCalls += 1;
      return { signal: AbortSignal.timeout(1_000) };
    },
    {
      retryDelayMs: 25,
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("fetch failed");
        return new Response("ok", { status: 200 });
      },
      sleep: async (delay) => {
        delays.push(delay);
      },
      onRetry: (_error, attempt) => retries.push(attempt),
    },
  );
  assert.equal(await response.text(), "ok");
  assert.equal(attempts, 2);
  assert.equal(initCalls, 2);
  assert.deepEqual(delays, [25]);
  assert.deepEqual(retries, [2]);

  let httpAttempts = 0;
  const httpResponse = await fetchWithRetry("https://example.com/missing", {}, {
    fetchImpl: async () => {
      httpAttempts += 1;
      return new Response("missing", { status: 404 });
    },
    sleep: async () => assert.fail("HTTP responses must not trigger a network retry"),
  });
  assert.equal(httpResponse.status, 404);
  assert.equal(httpAttempts, 1);

  const timeout = new Error("request timed out");
  timeout.name = "TimeoutError";
  assert.equal(isRetriableFetchError(timeout), true);
  const aborted = new Error("cancelled");
  aborted.name = "AbortError";
  assert.equal(isRetriableFetchError(aborted), false);
  assert.equal(isRetriableFetchError(new Error("invalid response")), false);

  console.log("Fetch retry tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
