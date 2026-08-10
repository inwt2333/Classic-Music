# Supabase account setup

The browser only uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
Never expose a secret or service-role key through a `VITE_` variable.

## Apply the identity migration

Open the Supabase SQL Editor, paste the complete contents of
`migrations/202608100001_user_identity.sql`, and run it. The migration is
idempotent and can be run again when its policies or triggers are updated.

The migration creates:

- one private profile per authenticated user;
- a separate, user-read-only role table;
- RLS policies that isolate account data;
- a trigger that provisions new users as ordinary users.

Verify the deployed schema from the repository root:

```bash
npm run auth:verify
```

The check confirms that email Auth is enabled, both tables exist, anonymous
reads are denied or return no rows, anonymous inserts fail, and the
administrator RPC cannot be called anonymously.

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

These values are intentionally public. Never add the secret key or a
service-role key to repository variables or frontend build settings.
