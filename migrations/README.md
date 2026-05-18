# D1 Migrations

Run the migrations after creating the Cloudflare D1 database.

```bash
npm run db:migrate:remote
```

For local testing with Wrangler:

```bash
npm run db:migrate:local
```

The first migration creates:

- `items`
- `modes`
- `settings`
- `push_subscriptions`
- `generation_runs`
- `usage_counters`
- `admin_sessions`

