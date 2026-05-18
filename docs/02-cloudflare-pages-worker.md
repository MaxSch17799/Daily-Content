# 02. Cloudflare Pages And Worker API

Cloudflare Pages hosts the site and automatically deploys the Pages Functions in the `functions/` folder.

## Current Pages Project

The current project is already created and deployed:

```text
Project name: daily-content
Production URL: https://daily-content.pages.dev
```

The latest local deployment command used:

```powershell
npx.cmd wrangler pages deploy dist --project-name daily-content --branch main
```

## Create The Pages Project

Option A: Cloudflare dashboard Git integration.

1. Open Cloudflare dashboard.
2. Go to `Workers & Pages`.
3. Choose `Create application`.
4. Choose `Pages`.
5. Connect the GitHub repo.
6. Select this repository.
7. Set build command:

```bash
npm run build
```

8. Set build output directory:

```text
dist
```

Option B: GitHub Actions deploy workflow.

The repo includes `.github/workflows/deploy-pages.yml`. It deploys with Wrangler after every push to `main`.

For that workflow, add these GitHub secrets:

- `CLOUDFLARE_API_TOKEN`

`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_PAGES_PROJECT_NAME` are already wired into the workflow.

## Pages Functions

API routes are in `functions/api`.

Important routes:

- `GET /api/today`
- `GET /api/archive`
- `GET /api/item/:id`
- `GET /api/image/:key`
- `GET /api/config`
- `POST /api/subscribe`
- `DELETE /api/subscribe`
- `GET /api/admin/summary`
- `POST /api/admin/settings`
- `POST /api/admin/dispatch-generation`

## Bindings

The Pages project needs these bindings:

- D1 binding named `DB`.
- R2 binding named `IMAGES`.

The included `wrangler.jsonc` already defines the binding names and real resource IDs:

```text
DB -> db
IMAGES -> images
```

## Cloudflare Secrets

Set these for the Pages Functions:

```bash
wrangler pages secret put VIEWER_PASSWORD --project-name YOUR_PAGES_PROJECT_NAME
wrangler pages secret put SUBSCRIBE_PASSWORD --project-name YOUR_PAGES_PROJECT_NAME
wrangler pages secret put ADMIN_PASSWORD --project-name YOUR_PAGES_PROJECT_NAME
wrangler pages secret put VAPID_PUBLIC_KEY --project-name YOUR_PAGES_PROJECT_NAME
```

Current status for `daily-content`:

- `VIEWER_PASSWORD`: set.
- `SUBSCRIBE_PASSWORD`: set.
- `ADMIN_PASSWORD`: set.
- `VAPID_PUBLIC_KEY`: set.

Optional admin manual generation button:

```bash
wrangler pages secret put GITHUB_DISPATCH_TOKEN --project-name YOUR_PAGES_PROJECT_NAME
```

`GITHUB_DISPATCH_TOKEN` must be a GitHub token allowed to dispatch workflows for this repository.

## Public Limit Behavior

The Worker API tracks dynamic API requests in D1. If usage gets close to the planned free-tier cap, public endpoints can require `VIEWER_PASSWORD`.

The admin page can turn public lock on or off.
