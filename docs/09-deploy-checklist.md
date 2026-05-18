# 09. Deployment Checklist

Use this when you are ready to connect the real accounts.

## Accounts

- Cloudflare account.
- GitHub account.
- OpenAI Platform account.

## Local Commands

```bash
npm install
npm run build
```

PowerShell:

```powershell
npm.cmd install
npm.cmd run build
```

## Cloudflare

1. Create Pages project.
2. Create D1 database. Done: `db`, `c57001e6-7d81-420f-b8b1-1f4266cb4e74`.
3. Create R2 bucket. Done: `images`.
4. Update `wrangler.jsonc` with the real D1 database ID. Done.
5. Add Pages bindings:
   - D1 binding `DB`
   - R2 binding `IMAGES`
6. Add Pages secrets:
   - `VIEWER_PASSWORD`. Done.
   - `SUBSCRIBE_PASSWORD`. Done.
   - `ADMIN_PASSWORD`. Done.
   - `VAPID_PUBLIC_KEY`. Done.
7. Run D1 migrations. Done.
8. Deploy Pages. Done.

## GitHub Secrets

Add:

- `OPENAI_API_KEY`
- `CLOUDFLARE_API_TOKEN`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `VAPID_PRIVATE_KEY`. Done.
- `VAPID_CONTACT_EMAIL`

Optional stored secret:

- `CLOUDFLARE__R2_API_TOKEN_VALUE`. Done, saved for possible future use but not used by the current workflow.

Already wired into workflow files:

- `CLOUDFLARE_ACCOUNT_ID = f564988478746167a2d9fabbad78a203`
- `D1_DATABASE_ID = c57001e6-7d81-420f-b8b1-1f4266cb4e74`
- `R2_BUCKET_NAME = images`
- `PUBLIC_SITE_URL = https://daily-content.pages.dev`
- `CLOUDFLARE_PAGES_PROJECT_NAME = daily-content`
- `VAPID_PUBLIC_KEY = BKMUeuRpsIpT_aheckXaIoZIpTeJI6JgatsJInVgLnJE1M1K8q9nSBc0ynWbM9MmH409a1GWPYl-_xk5g825bqU`

## First Run

1. Open `https://github.com/MaxSch17799/Daily-Content/actions`.
2. Run `Deploy Cloudflare Pages` if you want to test GitHub-based deployment.
3. Run `Daily content generation`.
4. Open `https://daily-content.pages.dev`.
5. Confirm today's satire item appears.
6. Open `https://daily-content.pages.dev/admin` and check the run log.
7. Open `https://daily-content.pages.dev/subscribe` from Android Chrome and enable notifications with the subscriber password.

Current live checks already performed:

- Homepage responds with `200`.
- `/api/config` responds with `200`.
- `/api/admin/summary` responds with `200` using the admin password.
- `/api/today` returns `404` until first generation succeeds, then returns the newest generated item.

## Testing Shortcut

Use [Testing the system](10-testing.md) for the exact test order.

## What To Give Codex Later

When you want me to wire the real deployment details into the repo, give me:

- Cloudflare Pages project name.
- D1 database ID.
- R2 bucket name if different from `images`.
- Public site URL.
- Whether the GitHub repo is private or public.

Do not paste long-lived API secrets into normal chat unless you are comfortable doing that. Prefer adding them directly in Cloudflare/GitHub dashboards.
