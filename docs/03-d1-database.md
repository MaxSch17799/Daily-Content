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

Current migrations:

- `0001_initial.sql`: creates the app tables and baseline modes.
- `0002_allow_multiple_items_per_day.sql`: removes the unique-per-date item constraint.
- `0003_add_absurd_tech_breakthrough_mode.sql`: adds the absurd technology breakthrough mode.
- `0004_editable_modes.sql`: adds the editable-mode index and safely seeds current YAML mode templates without overwriting existing D1 rows.

## Sync Mode Configs

The live editable modes are stored in D1.

The YAML files in `modes/en/*.yaml` are template files. They are useful for future agents, import/export, and recovery, but the daily generator now reads the active mode from D1 first.

To seed missing YAML modes into D1 without overwriting admin edits:

```bash
npm run modes:sync
```

To force YAML files to overwrite matching D1 modes:

```bash
OVERWRITE_MODES=1 npm run modes:sync
```

This command needs these local environment variables:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `D1_DATABASE_ID`

## Important Tables

- `items`: generated content.
- `modes`: live mode configs used by the generator.
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
