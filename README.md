# Daily Content

A Cloudflare-hosted daily AI content site.

The app generates one English daily item, stores it in Cloudflare D1, stores the image in Cloudflare R2, displays it on a public Pages site, keeps an archive, and can send Android Chrome Web Push notifications to password-approved subscribers.

## Current MVP

- Frontend: React + Vite on Cloudflare Pages.
- API: Cloudflare Pages Functions.
- Database: Cloudflare D1.
- Images: Cloudflare R2.
- Daily generation: GitHub Actions.
- AI: OpenAI Responses API for structured text and OpenAI Images API for the image.
- Default mode: fictional satire news.
- Default image quality: medium.
- Target schedule: around 06:00 Europe/Berlin, but exact timing is intentionally not critical.

## First Read

Start with these docs:

1. [Project overview](docs/00-overview.md)
2. [Local development](docs/01-local-development.md)
3. [Cloudflare Pages and Worker API](docs/02-cloudflare-pages-worker.md)
4. [D1 database setup](docs/03-d1-database.md)
5. [R2 bucket setup](docs/04-r2-bucket.md)
6. [GitHub Actions generator](docs/05-github-actions.md)
7. [OpenAI API setup](docs/06-openai-api.md)
8. [Android notifications](docs/07-android-notifications.md)
9. [Admin and limits](docs/08-admin-and-limits.md)
10. [Deployment checklist](docs/09-deploy-checklist.md)
11. [Testing the system](docs/10-testing.md)

## Current Deployment Status

- Production site: https://daily-content.pages.dev
- Cloudflare Pages project: `daily-content`
- D1 database: `db`
- R2 bucket: `images`
- D1 migration: applied.
- Cloudflare Pages secrets: admin, viewer, subscriber, and VAPID public key are set.
- GitHub Actions generation: first manual run succeeded.
- First generated item date: `2026-05-19`.
- Generated image delivery: verified with `image/png` response.

Current live state:

- `/` loads the app.
- `/api/config` returns the VAPID public config.
- `/api/admin/summary` works with admin password.
- `/api/today` returns today's generated item.

## Useful Commands

```bash
npm install
npm run build
npm run db:migrate:remote
npm run modes:sync
npm run generate:daily
npm run vapid:generate
```

On Windows PowerShell, if `npm` is blocked by execution policy, use `npm.cmd` instead.
