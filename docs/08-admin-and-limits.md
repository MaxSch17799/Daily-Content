# 08. Admin And Limits

The admin page is:

```text
/admin
```

It requires `ADMIN_PASSWORD`.

Current production admin page:

```text
https://daily-content.pages.dev/admin
```

## Admin Features

The first version supports:

- View active mode.
- Change active mode.
- Pause or resume AI generation.
- Choose whether the homepage shows the newest item or a daily rotating archive item.
- Turn public lock on/off.
- See recent generated items with thumbnails.
- Hide or show generated items in the public archive.
- Create and edit D1-backed modes.
- Import YAML mode files into the editor.
- Export the current mode as YAML.
- See usage counters.
- See generation runs.
- Try to dispatch the GitHub generation workflow if optional GitHub dispatch is configured.

## Mode Editor

The admin mode editor writes to the D1 `modes` table. The generator reads the active mode from D1 first, so changes made here affect the next generation run without changing files in GitHub.

The YAML files in `modes/en/*.yaml` remain as templates. Use the admin import button to load a YAML file into the editor, then save it to store it in D1. Use the export button to download the current editor values in the same YAML shape.

## Pause And Archive Rotation

`Pause generation` stops the daily generator before it calls OpenAI, uploads to R2, or sends push notifications. Scheduled GitHub Actions may still start, but the script records a skipped run and exits.

`Homepage display` controls `/api/today`:

- `Newest item`: show the newest published item.
- `Daily archive rotation`: choose one published archive item based on the current date, changing once per day.

The archive page continues to show all published items in normal newest-first order.

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

If generation is paused, the button is disabled and the dispatch API returns `generation_paused`.

To enable it, add Cloudflare secret:

```bash
wrangler pages secret put GITHUB_DISPATCH_TOKEN --project-name YOUR_PAGES_PROJECT_NAME
```

The token must be allowed to dispatch workflows in this GitHub repository.

If this is not configured, use the GitHub Actions UI to run the generator manually.

Current status: `GITHUB_DISPATCH_TOKEN` has not been documented as set, so use GitHub Actions manual run for the first generation test.

The system can generate daily content without this button. The scheduled GitHub Actions workflow and the manual `Run workflow` button in GitHub work independently.

To make the admin button work:

1. Create a GitHub fine-grained personal access token for `MaxSch17799/Daily-Content`.
2. Give it permission to run workflows, usually `Actions: Read and write`.
3. Copy the token.
4. Set it as a Cloudflare Pages secret:

```powershell
'YOUR_GITHUB_TOKEN' | npx.cmd wrangler pages secret put GITHUB_DISPATCH_TOKEN --project-name daily-content
```

5. Redeploy the Pages project if Cloudflare asks for it.
6. Open `/admin` and press `Run generator`.
