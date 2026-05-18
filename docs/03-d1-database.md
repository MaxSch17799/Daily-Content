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

You created this database:

```text
database_name: db
database_id: c57001e6-7d81-420f-b8b1-1f4266cb4e74
```

Cloudflare returns a `database_id`.

That ID is already wired into `wrangler.jsonc`:

```json
"database_name": "db",
"database_id": "c57001e6-7d81-420f-b8b1-1f4266cb4e74"
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
