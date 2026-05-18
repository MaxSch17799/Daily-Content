# 01. Local Development

## Prerequisites

Install:

1. Node.js 22 or newer.
2. Git.
3. A Cloudflare account.

On this Windows machine, PowerShell may block `npm.ps1`. Use `npm.cmd` if that happens.

## Install Dependencies

```bash
npm install
```

PowerShell fallback:

```powershell
npm.cmd install
```

## Run Frontend Only

This starts Vite without Cloudflare bindings:

```bash
npm run dev
```

It is enough to inspect the frontend shell, but API calls will fail unless the backend is running.

## Build

```bash
npm run build
```

PowerShell fallback:

```powershell
npm.cmd run build
```

## Cloudflare Local Dev

After D1 and R2 are configured in `wrangler.jsonc`, run:

```bash
npm run cf:dev
```

This builds the frontend and starts Cloudflare Pages local development with Pages Functions.

## Local Secrets

Create `.dev.vars` for local Cloudflare Pages Functions testing:

```text
VIEWER_PASSWORD=choose-local-viewer-password
SUBSCRIBE_PASSWORD=choose-local-subscribe-password
ADMIN_PASSWORD=choose-local-admin-password
VAPID_PUBLIC_KEY=your-public-vapid-key
```

Create `.env` only for local generator testing:

```text
OPENAI_API_KEY=...
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
D1_DATABASE_ID=...
R2_BUCKET_NAME=daily-content-images
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
PUBLIC_SITE_URL=https://your-project.pages.dev
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_CONTACT_EMAIL=you@example.com
```

Do not commit `.env` or `.dev.vars`.

