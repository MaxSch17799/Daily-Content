# 03. D1 Database Setup

D1 stores:

- Generated items.
- Archive history.
- Modes.
- Settings.
- Push subscriptions.
- Usage counters.
- Generation run logs.

## Create The Database

```bash
npx wrangler d1 create daily-content-db
```

Cloudflare returns a `database_id`.

Copy that ID into `wrangler.jsonc`:

```json
"database_id": "YOUR_D1_DATABASE_ID"
```

Also save it as a GitHub Actions secret named:

```text
D1_DATABASE_ID
```

## Apply Migrations

```bash
npm run db:migrate:remote
```

PowerShell fallback:

```powershell
npm.cmd run db:migrate:remote
```

## Sync Mode Configs

The editable mode files live in `modes/en/*.yaml`.

After changing mode files, sync them to D1:

```bash
npm run modes:sync
```

This command needs these local environment variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `D1_DATABASE_ID`

## Important Tables

- `items`: generated content.
- `modes`: mode metadata.
- `settings`: active mode, public lock, timezone.
- `push_subscriptions`: Android Chrome Web Push subscriptions.
- `generation_runs`: daily generator log.
- `usage_counters`: daily route-level request counters.

## Default Settings

The migration sets:

- `active_mode = fictional_satire_news`
- `active_language = en`
- `public_lock = 0`
- `timezone = Europe/Berlin`

