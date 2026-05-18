# 08. Admin And Limits

The admin page is:

```text
/admin
```

It requires `ADMIN_PASSWORD`.

## Admin Features

The first version supports:

- View active mode.
- Change active mode.
- Turn public lock on/off.
- See recent generated items.
- See usage counters.
- See generation runs.
- Try to dispatch the GitHub generation workflow if optional GitHub dispatch is configured.

## Set Admin Password

```bash
wrangler pages secret put ADMIN_PASSWORD --project-name YOUR_PAGES_PROJECT_NAME
```

This has already been set for the `daily-content` Pages project.

## Public Lock

Public lock makes public API data require the viewer password.

This is useful if a link gets more traffic than expected.

Set viewer password:

```bash
wrangler pages secret put VIEWER_PASSWORD --project-name YOUR_PAGES_PROJECT_NAME
```

This has already been set for the `daily-content` Pages project.

## Automatic Guardrails

The Worker API records approximate route-level dynamic request counts in D1.

Defaults:

- Soft gate: `50,000` dynamic requests/day.
- Hard gate: `80,000` dynamic requests/day.
- Cloudflare Workers Free limit: `100,000` requests/day.

Config in `wrangler.jsonc`:

```json
"PUBLIC_SOFT_DYNAMIC_REQUESTS": "50000",
"PUBLIC_HARD_DYNAMIC_REQUESTS": "80000"
```

Archive routes are paginated and capped.

Image routes use long cache headers.

## Optional Manual Generation Button

The admin button calls:

```text
POST /api/admin/dispatch-generation
```

To enable it, add Cloudflare secret:

```bash
wrangler pages secret put GITHUB_DISPATCH_TOKEN --project-name YOUR_PAGES_PROJECT_NAME
```

The token must be allowed to dispatch workflows in this GitHub repository.

If this is not configured, use the GitHub Actions UI to run the generator manually.
