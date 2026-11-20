# Judge access (one-click, read-only)

`/api/judge-login` signs a shared read-only viewer account in on the server and
redirects to `/auth/continue`, then `/admin/federal`. The landing page and the
login page show the button only when it can work. Credentials never reach the
browser: they are read from server env in the route handler only.

## Env vars (server only, set in the host's environment, never committed)

| Variable | Meaning |
|---|---|
| `JUDGE_LOGIN_EMAIL` | Email of the judge account |
| `JUDGE_LOGIN_PASSWORD` | Its password (long and random) |
| `JUDGE_EMAILS` | Must include the same email. Existing rule: first sign-in makes it a `viewer` |
| `JUDGE_ORG_ID` | Optional. Workspace the judge sees. Default: the first admin's workspace |

Without `JUDGE_LOGIN_EMAIL` and `JUDGE_LOGIN_PASSWORD` the route returns 404 and
the buttons fall back to `/login`. In offline mode (`OFFLINE=1`) the route just
redirects to `/admin/federal`; set `OFFLINE_ROLE=viewer` to preview read-only.

## One-time Supabase setup (do this by hand, in this repo's own project)

1. Supabase dashboard, Authentication, Users, "Add user", "Create new user".
   Use the judge email and the password. Tick "Auto Confirm User".
2. Set the four env vars above on the host and redeploy.
3. Open `/api/judge-login` once. `ensureProfile` creates the profile and, because
   the email is in `JUDGE_EMAILS`, sets role `viewer` in the demo workspace.
4. Check: in the dashboard, a write (for example "Sign" on a run) must be refused.
   Every mutating route calls `requireAdmin()`, which a viewer fails.

Rotate by changing the password in Supabase and the env var together.

## Limits

- Anyone with the link gets the same read-only session. That is the point; the data is synthetic.
- Attempts are limited to 8 per minute per client address, per server instance (in memory).
- The route is a GET so a QR code can use it. Pages link to it with a plain `<a>`, not `<Link>`, so it is never prefetched.
