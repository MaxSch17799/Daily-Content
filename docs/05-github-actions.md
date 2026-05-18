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

## Values Already Wired Into The Workflow

These values are not treated as secrets and are already in the workflow:

```text
CLOUDFLARE_ACCOUNT_ID=f564988478746167a2d9fabbad78a203
D1_DATABASE_ID=c57001e6-7d81-420f-b8b1-1f4266cb4e74
R2_BUCKET_NAME=images
PUBLIC_SITE_URL=https://daily-content.pages.dev
CLOUDFLARE_PAGES_PROJECT_NAME=daily-content
```

## Required GitHub Secrets

Add these under:

```text
GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret
```

Required:

- `OPENAI_API_KEY`
- `CLOUDFLARE_API_TOKEN`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
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
