# Deploying Defensa to Render

Render runs the full Node server (unlike GitHub Pages or InfinityFree, which
are static-only and cannot run Defensa). The `render.yaml` in this folder does
the setup; you only supply the secrets and run the database migrations once.

## 1. Create the service

1. Go to https://render.com and sign in with GitHub (`judepolinea-sudo`).
2. **New +** -> **Blueprint**.
3. Pick the `defensa.github.io` repo. Render finds `render.yaml` and shows one
   web service named **defensa**.
4. Click **Apply**. Render will ask you to fill in every secret below before it
   builds.

## 2. Fill in the environment variables

Copy each value from your local `defensa-new/.env`.

| Key | Notes |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | the entire service-account JSON, pasted as **one line** |
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase -> Settings -> API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, the **service_role** key |
| `INITIAL_ADMIN_EMAIL` | the email of your Firebase account that becomes the admin |
| `ADMIN_SETUP_KEY` | any strong secret string you choose |
| `GEMINI_API_KEY` | at least one AI key is required |
| `OPENROUTER_API_KEY` | optional fallback |
| `GROQ_API_KEY` | optional fallback |

Do **not** set `NODE_ENV` or `PORT`. Render provides `PORT` automatically and
the start command sets `NODE_ENV`.

## 3. Run the Supabase migrations (one time)

In the Supabase dashboard -> **SQL Editor**, run the files in
`defensa-new/supabase/migrations/` in order, `001` through `010`.
If the tables do not exist, every login returns to the landing page.

## 4. First admin

The server promotes `INITIAL_ADMIN_EMAIL` to an admin automatically on startup,
as long as:

- that account exists in Firebase -> Authentication, and
- its email is verified.

If you registered through the app's own form, verify the email first (check the
inbox for the Firebase verification link), then trigger a redeploy in Render.

Alternative: once the service is live and while the `users` table is still
empty, POST to `https://<your-service>.onrender.com/api/admin/setup` with
`{ "setupKey": "<ADMIN_SETUP_KEY>", "email": "...", "password": "...", "fullName": "..." }`.

## 5. Firebase authorized domains

Firebase Console -> **Authentication** -> **Settings** -> **Authorized domains**
-> add `<your-service>.onrender.com`, or Google sign-in will fail.

## 6. Check it

- `https://<your-service>.onrender.com/api/health` should return
  `{"status":"ok","db":"supabase","auth":"firebase"}`.
  If it returns `configuration_required`, a variable is missing or the
  `FIREBASE_SERVICE_ACCOUNT` JSON is not valid one-line JSON.
- Then open the site and log in.

## Notes

- The free plan sleeps after 15 minutes of no traffic and takes about 50
  seconds to wake on the next request. That is normal for the free tier.
- The local AI model in `own-ai/` is not deployed. The server falls back to
  Gemini, OpenRouter, and Groq, so question generation and scoring still work.
