# Supabase account setup

The browser only uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
Never expose a secret or service-role key through a `VITE_` variable.

The static SPA uses email/password authentication. Email confirmation is
disabled so registration creates a session immediately.
Password recovery still sends a reset link and uses Supabase's implicit browser
flow so the JavaScript client can consume and persist the returned session on a
static GitHub Pages site.

## Apply the migrations

Open the Supabase SQL Editor and run these files in order:

1. `migrations/202608100001_user_identity.sql`
2. `migrations/202608100002_personal_events.sql`

Both migrations are idempotent and can be run again when policies or triggers
are updated. The second migration depends on the shared `set_updated_at`
function created by the first migration.

The migration creates:

- one private profile per authenticated user;
- a separate, user-read-only role table;
- RLS policies that isolate account data;
- a trigger that provisions new users as ordinary users.

The personal-data migration creates:

- `personal_events`, with one private row per user and concert, including the
  wanted/purchased status and a durable concert snapshot;
- `user_preferences`, containing follows, saved filters, notification history,
  and read/dismissed notification state;
- per-user select, insert, update, and delete policies for both tables.

On the first successful login after deployment, the browser merges existing
account-scoped local data into these tables. Later cloud state is authoritative.
Failed writes remain in a local pending queue and are retried during the next
successful synchronization.

Verify the deployed schema from the repository root:

```bash
npm run auth:verify
```

The check confirms that email Auth is enabled, all identity and personal-data
tables exist, anonymous reads are denied or return no rows, anonymous inserts
fail, and the administrator RPC cannot be called anonymously.

In **Authentication > Providers > Email**, keep email/password sign-up enabled
and turn **Confirm email** off. Users choose a display name during
registration and receive a session immediately. Daily sign-in uses email and
password without sending an email. Password recovery still requires a custom
SMTP provider before delivery to ordinary external addresses is reliable.

## Promote the first administrator

Sign in to the website once, then run the following in the SQL Editor with the
real administrator email substituted locally:

```sql
update public.user_roles
set role = 'admin', updated_at = now()
where user_id = (
  select id from auth.users where email = 'admin@example.com'
);
```

Refresh the website after promotion. Do not place an administrator email or
role override in frontend source code.

## Auth URL configuration

Use the public site as the Site URL and allow these redirect URLs while the
corresponding environments are active:

- `https://inwt233.cn/Classic-Music/`
- `https://inwt2333.github.io/Classic-Music/`
- `http://127.0.0.1:5173/`
- the current local Vite port when it differs from `5173`

## Configure GitHub Pages

Add these repository variables under **Settings > Secrets and variables >
Actions > Variables**:

- `VITE_SUPABASE_URL`: the project URL;
- `VITE_SUPABASE_PUBLISHABLE_KEY`: the publishable key.

The Pages workflow also accepts the legacy names `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY`. For compatibility, either pair may be stored under
repository Variables or Secrets; the workflow maps the first available pair
to the Vite names during the build.

These values are intentionally public. Never add the secret key or a
service-role key to repository variables or frontend build settings.
