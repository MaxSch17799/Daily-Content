# 10. Testing The System

Use this document to verify the system end to end.

## Current Known State

These checks have already passed:

- `https://daily-content.pages.dev` returns `200`.
- `https://daily-content.pages.dev/api/config` returns `200` and includes the VAPID public key.
- `https://daily-content.pages.dev/api/admin/summary` returns `200` when called with the admin password.
- The remote D1 migration has been applied.
- Cloudflare Pages secrets have been set for admin, viewer, subscriber, and VAPID public key.

This check currently returns `404` until the first generated item exists:

```text
https://daily-content.pages.dev/api/today
```

That `404` is expected before the first successful `Daily content generation` workflow run.

## Test Order

### 1. Test The Site

Open:

```text
https://daily-content.pages.dev
```

Expected result:

- The app shell loads.
- It may show no item yet if generation has not run.

### 2. Test The Admin Page

Open:

```text
https://daily-content.pages.dev/admin
```

Enter the admin password.

Expected result:

- Admin dashboard loads.
- Active mode is `fictional_satire_news`.
- Usage counters and generation runs are visible.

### 3. Run The Generator

Recommended first run:

1. Open `https://github.com/MaxSch17799/Daily-Content/actions`.
2. Select `Daily content generation`.
3. Click `Run workflow`.
4. Wait until the run is green.

Expected result:

- The workflow creates one item in D1.
- The workflow uploads one PNG image to R2.
- The workflow logs a successful `generation_runs` row.
- If there are push subscribers, it sends notifications.

### 4. Verify Today's Item

Open:

```text
https://daily-content.pages.dev
```

Expected result:

- Today's satire item appears with image and text.

Also check:

```text
https://daily-content.pages.dev/archive
```

Expected result:

- The generated item appears in the archive.

### 5. Test Android Notifications

On Android Chrome, open:

```text
https://daily-content.pages.dev/subscribe
```

Enter the subscriber password and allow notifications.

Expected result:

- The subscription is saved.
- The next successful daily generation sends a notification to that device.

## About The Admin Run Button

The admin page has a `Run generator` button.

It only works if this Cloudflare Pages secret is configured:

```text
GITHUB_DISPATCH_TOKEN
```

That token must be a GitHub token with permission to dispatch workflows in this repository.

Until that optional token is set, use the GitHub Actions page to run `Daily content generation` manually.

## If Generation Fails

Open the failed GitHub Actions run and check the failing step.

Common causes:

- Missing `CLOUDFLARE_API_TOKEN`.
- Missing `R2_ACCESS_KEY_ID`.
- Missing `R2_SECRET_ACCESS_KEY`.
- Missing `OPENAI_API_KEY`.
- OpenAI API billing not enabled.
- R2 token does not have write access to the `images` bucket.

After fixing secrets, re-run the workflow.
