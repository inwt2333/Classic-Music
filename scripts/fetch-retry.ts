const defaultRetryDelayMs = 60_000;
const networkErrorCodes = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENETDOWN",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type FetchRetryOptions = {
  retries?: number;
  retryDelayMs?: number;
  fetchImpl?: FetchLike;
  sleep?: (delayMs: number) => Promise<void>;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
};

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit | (() => RequestInit) = {},
  options: FetchRetryOptions = {},
) {
  const retries = options.retries ?? 1;
  const retryDelayMs = options.retryDelayMs ?? defaultRetryDelayMs;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sleep = options.sleep ?? wait;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchImpl(input, typeof init === "function" ? init() : init);
    } catch (error) {
      if (attempt >= retries || !isRetriableFetchError(error)) throw error;
      const nextAttempt = attempt + 2;
      if (options.onRetry) options.onRetry(error, nextAttempt, retryDelayMs);
      else {
        console.warn(
          `[fetch] ${describeInput(input)} failed: ${describeError(error)}; retrying in ${Math.round(retryDelayMs / 1000)}s (${nextAttempt}/${retries + 1}).`,
        );
      }
      await sleep(retryDelayMs);
    }
  }
}

export function isRetriableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TimeoutError") return true;
  if (error.name === "AbortError") return false;
  if (error instanceof TypeError && /fetch failed|network|terminated/i.test(error.message)) return true;

  const code = (error as Error & { code?: string }).code;
  if (code && networkErrorCodes.has(code)) return true;
  const cause = (error as Error & { cause?: unknown }).cause;
  return cause ? isRetriableFetchError(cause) : false;
}

function describeInput(input: RequestInfo | URL) {
  const value = input instanceof Request ? input.url : String(input);
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

function describeError(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}
