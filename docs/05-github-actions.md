# 05. GitHub Actions Generator

The daily generator runs in GitHub Actions.

Workflow file:

```text
.github/workflows/daily-generate.yml
```

It runs:

```bash
npm run generate:daily
```

## Schedule

The workflow is scheduled at:

```text
23 5 * * *
```

This is 05:23 UTC. In Berlin, that is around morning time depending on daylight saving. Exact timing is not important for this project.

You can also run it manually from GitHub:

1. Open the repository on GitHub.
2. Go to `Actions`.
3. Choose `Daily content generation`.
4. Click `Run workflow`.

## Required GitHub Secrets

Add these under:

```text
GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret
```

Required:

- `OPENAI_API_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `D1_DATABASE_ID`
- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `PUBLIC_SITE_URL`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_CONTACT_EMAIL`

## Cloudflare API Token Permissions

The generator needs to query/write D1.

The deploy workflow needs to deploy Pages.

Create a Cloudflare API token with only the permissions needed for:

- D1 edit access for the target account/database.
- Pages edit access if using the GitHub deploy workflow.

If that is annoying at first, use a broader account token for testing, then narrow it later.

## Duplicate Protection

The generator checks whether an item already exists for today's Europe/Berlin date.

If it exists, the workflow skips generation.

To force replacement, run with:

```text
FORCE_GENERATE=true
```

That can be added temporarily to the workflow environment or used locally.

