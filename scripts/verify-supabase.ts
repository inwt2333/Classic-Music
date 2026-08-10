import { randomUUID } from "node:crypto";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !publishableKey) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required");
}

const headers = {
  apikey: publishableKey,
  authorization: `Bearer ${publishableKey}`,
};

async function request(path: string, init?: RequestInit) {
  return fetch(`${supabaseUrl}/${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
}

async function expectPrivateTable(table: "profiles" | "user_roles") {
  const response = await request(`rest/v1/${table}?select=*&limit=1`);
  if (response.status === 401 || response.status === 403) {
    const denial = await response.json() as { code?: string; message?: string };
    if (denial.code === "42501" && denial.message?.includes(table)) return;
  }
  if (!response.ok) {
    throw new Error(`${table} is unavailable (HTTP ${response.status}); apply the Supabase identity migration`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 0) {
    throw new Error(`${table} exposed rows to the anonymous role`);
  }
}

async function expectAnonymousWriteDenied(table: "profiles" | "user_roles", body: Record<string, string>) {
  const response = await request(`rest/v1/${table}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (response.ok) throw new Error(`${table} accepted an anonymous insert`);
  if (response.status === 404) throw new Error(`${table} is unavailable; apply the Supabase identity migration`);
}

async function main() {
  const settingsResponse = await request("auth/v1/settings");
  if (!settingsResponse.ok) throw new Error(`Supabase Auth is unavailable (HTTP ${settingsResponse.status})`);
  const settings = await settingsResponse.json() as { external?: { email?: boolean } };
  if (!settings.external?.email) throw new Error("Email authentication is disabled");

  await expectPrivateTable("profiles");
  await expectPrivateTable("user_roles");

  const fakeUserId = randomUUID();
  await expectAnonymousWriteDenied("profiles", { id: fakeUserId, display_name: "anonymous-test" });
  await expectAnonymousWriteDenied("user_roles", { user_id: fakeUserId, role: "admin" });

  const adminCheck = await request("rest/v1/rpc/is_admin", { method: "POST", body: "{}" });
  if (adminCheck.ok) throw new Error("is_admin RPC is executable by the anonymous role");

  console.log("Supabase identity checks passed: Auth online, private tables isolated, anonymous writes denied.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
