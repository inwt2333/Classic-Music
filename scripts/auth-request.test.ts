import assert from "node:assert/strict";
import {
  authNetworkErrorMessage,
  formatAuthError,
  isAuthNetworkError,
  withAuthNetworkRetry,
} from "../src/auth/auth-request";

assert.equal(isAuthNetworkError(new TypeError("Failed to fetch")), true);
assert.equal(isAuthNetworkError(new Error("Invalid login credentials")), false);
assert.equal(formatAuthError(new TypeError("Failed to fetch")), authNetworkErrorMessage);
assert.equal(formatAuthError(new Error("Invalid login credentials")), "邮箱或密码不正确。");

async function main() {
  let attempts = 0;
  const recovered = await withAuthNetworkRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw new TypeError("Failed to fetch");
    return { data: "ok", error: null };
  }, [0, 0]);
  assert.equal(attempts, 3);
  assert.equal(recovered.data, "ok");

  await assert.rejects(
    () => withAuthNetworkRetry(async () => ({ data: null, error: new TypeError("Failed to fetch") }), [0]),
    new RegExp(authNetworkErrorMessage),
  );

  console.log("Auth request tests passed.");
}

void main();
