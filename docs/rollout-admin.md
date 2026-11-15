# Rolling out the Admin page (November 2026)

What ships: an **Admin** page at `/admin` where an admin adds, pauses and deletes scholar
accounts without opening Supabase. Sign-up stays closed to the public.

| An admin can | What it does |
|---|---|
| See every account | Email, name, joined, last sign-in, and a status: Admin, Active, Not signed in yet or Paused. **Never anyone's records**: the "own rows only" rules are unchanged. |
| Add a scholar | Creates the account (email confirmed) and shows a message to send them: sign in at the usual page with that email. Live sign-in links only work in the browser that asked for them, so the scholar asks for their own. |
| Pause / Resume | Pause blocks sign-in and stops a signed-in session renewing (it ends within the hour). Nothing is deleted. Resume undoes it. |
| Delete | Their stored files, then the account and every record. Only after typing their email. Can't be undone. |
| See the activity log | Who added, paused, resumed or deleted whom, and when. Kept after accounts are deleted. |

Guard rails: nobody can pause or delete themselves or another admin. Nobody becomes an admin
from the app; it's granted by SQL only.

## How it's kept safe

- Admins are listed in `app.admins` (private schema), not on the profile, which everyone can edit.
- Every admin page load and action asks the database `app.is_admin()`, so removing an admin
  takes effect on their next click. Non-admins get "page not found".
- Website sessions only: a ChatGPT / Codex connection can never act as an admin.
- Adding, pausing and deleting need Supabase's **secret key**. It's read in
  `src/server/admin.ts` only, by functions that take an admin the database has just confirmed.
  `tests/unit/admin.test.ts` fails if any other file reads it.

One migration: `supabase/migrations/20261119000001_admin.sql`. It only adds tables and
functions; nothing existing changes.

## Order

1. **Migration:** `npx supabase db push`. Safe with the old app running (it adds, never changes).
2. **Secret key on Vercel:** Project → Settings → Environment Variables → `SUPABASE_SECRET_KEY`
   = Supabase → Settings → API keys → secret key. Production only, not Preview.
3. **App:** merge into `master`; Vercel deploys it (a new deploy also picks up the key).
4. **Make yourself an admin** (Supabase → SQL editor). Your account must exist first: create it in
   Supabase → Authentication → Users → Add user, or use an account you already have.

   ```sql
   insert into app.admins (user_id) select id from auth.users where email = 'you@example.com';
   ```

   To remove an admin: `delete from app.admins where user_id = (select id from auth.users where email = '…');`

## Checks after deploying

- Sign in, open `/admin`: every account is listed with the right status; you're marked Admin.
- The sidebar (or More on a phone) shows **Admin** for you, and not for a scholar.
- A scholar opening `/admin` gets "page not found".
- Add a test account, pause it, resume it, delete it; the activity log shows all four.
- An admin without a PhD space of their own lands on `/admin` after signing in; "Set up your own
  PhD space" leads to the usual welcome.

## If something goes wrong

- **Page says adding and removing is off:** the secret key isn't set, or the app wasn't
  redeployed after setting it.
- **Remove the feature's power quickly:** delete `SUPABASE_SECRET_KEY` from Vercel and redeploy.
  The list still shows; nothing can be changed.
