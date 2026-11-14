# NexusOps – Login API Key Fix

This package contains the full original Google AI Studio project with a targeted fix in `src/lib/supabase.ts`.

## What changed
- `/api/config/public` is fetched with `cache: 'no-store'` and HTTP errors are reported clearly.
- The public Supabase URL and key returned by the server (from AI Studio Secrets) now take priority over `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- This prevents stale VITE variables from silently overriding the current project's Supabase key, which can cause `Invalid API key`.
- Basic Supabase URL validation was added before creating the client.

## Required AI Studio Secrets
Keep these exact names, with values from the SAME Supabase project:
- `SUPABASE_URL`: Project URL (`https://<project-ref>.supabase.co`)
- `SUPABASE_ANON_KEY`: Publishable key (`sb_publishable_...`) OR legacy anon key (`eyJ...`)
- `SUPABASE_SERVICE_ROLE_KEY`: Secret key (`sb_secret_...`) OR legacy service_role key (`eyJ...`)

Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code or share it publicly.

## Apply
1. Import/upload this ZIP as the project in Google AI Studio.
2. Re-check the three Secrets above. Ensure URL and both keys belong to the same Supabase project.
3. Restart/run the app so the server process reloads Secrets.
4. Reload Preview and try the existing Super Admin login.

No SQL migration, account recreation, or bootstrap reset is included or required by this code patch.

If `Invalid API key` remains after this patch, the key value stored in `SUPABASE_ANON_KEY` is likely not the publishable/anon key for the URL in `SUPABASE_URL`; correct the Secret in AI Studio.
