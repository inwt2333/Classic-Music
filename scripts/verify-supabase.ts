import { randomUUID } from "node:crypto";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !publishableKey) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required");
}

function publicHttpOrigin(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("VITE_SUPABASE_URL must use http or https");
  }
  const host = url.hostname.toLowerCase();
  const privateHost = host === "localhost" || host === "::1" || host.endsWith(".localhost")
    || /^(?:127\.|0\.|10\.|192\.168\.|169\.254\.)/.test(host)
    || /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
    || /^(?:f[cd][0-9a-f]{2}:|fe80:)/.test(host);
  if (privateHost) {
    throw new Error("VITE_SUPABASE_URL must not point at a loopback, private, or reserved address");
  }
  return url.origin;
}

const supabaseOrigin = publicHttpOrigin(supabaseUrl);

const headers = {
  apikey: publishableKey,
  authorization: `Bearer ${publishableKey}`,
};

async function request(path: string, init?: RequestInit) {
  return fetch(`${supabaseOrigin}/${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
}

type PrivateTable = "profiles" | "user_roles" | "personal_events" | "user_preferences";

async function expectPrivateTable(table: PrivateTable) {
  const response = await request(`rest/v1/${table}?select=*&limit=1`);
  if (response.status === 401 || response.status === 403) {
    const denial = await response.json() as { code?: string; message?: string };
    if (denial.code === "42501" && denial.message?.includes(table)) return;
  }
  if (!response.ok) {
    const migration = table === "profiles" || table === "user_roles"
      ? "202608100001_user_identity.sql"
      : "202608100002_personal_events.sql";
    throw new Error(`${table} is unavailable (HTTP ${response.status}); apply ${migration}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 0) {
    throw new Error(`${table} exposed rows to the anonymous role`);
  }
}

async function expectAnonymousWriteDenied(table: PrivateTable, body: Record<string, unknown>) {
  const response = await request(`rest/v1/${table}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (response.ok) throw new Error(`${table} accepted an anonymous insert`);
  if (response.status === 404) {
    const migration = table === "profiles" || table === "user_roles"
      ? "202608100001_user_identity.sql"
      : "202608100002_personal_events.sql";
    throw new Error(`${table} is unavailable; apply ${migration}`);
  }
}

async function main() {
  const settingsResponse = await request("auth/v1/settings");
  if (!settingsResponse.ok) throw new Error(`Supabase Auth is unavailable (HTTP ${settingsResponse.status})`);
  const settings = await settingsResponse.json() as { external?: { email?: boolean }; mailer_autoconfirm?: boolean };
  if (!settings.external?.email) throw new Error("Email authentication is disabled");
  if (!settings.mailer_autoconfirm) {
    throw new Error("Email confirmation is still required; turn Confirm email off before production launch");
  }

  await expectPrivateTable("profiles");
  await expectPrivateTable("user_roles");
  await expectPrivateTable("personal_events");
  await expectPrivateTable("user_preferences");

  const fakeUserId = randomUUID();
  await expectAnonymousWriteDenied("profiles", { id: fakeUserId, display_name: "anonymous-test" });
  await expectAnonymousWriteDenied("user_roles", { user_id: fakeUserId, role: "admin" });
  await expectAnonymousWriteDenied("personal_events", {
    user_id: fakeUserId,
    event_id: "anonymous-test",
    status: "attended",
    snapshot: { title: "anonymous-test" },
  });
  await expectAnonymousWriteDenied("user_preferences", {
    user_id: fakeUserId,
    follows: {},
    saved_filters: [],
  });

  const adminCheck = await request("rest/v1/rpc/is_admin", { method: "POST", body: "{}" });
  if (adminCheck.ok) throw new Error("is_admin RPC is executable by the anonymous role");

  console.log("Supabase checks passed: Auth online, identity and personal data tables isolated, anonymous writes denied.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
