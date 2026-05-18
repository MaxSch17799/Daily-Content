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
VAPID_PUBLIC_KEY=BKMUeuRpsIpT_aheckXaIoZIpTeJI6JgatsJInVgLnJE1M1K8q9nSBc0ynWbM9MmH409a1GWPYl-_xk5g825bqU
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
- `VAPID_PRIVATE_KEY`
- `VAPID_CONTACT_EMAIL`

`VAPID_PRIVATE_KEY` and `VAPID_CONTACT_EMAIL` are only needed for sending notifications. Generation still works without them, but subscribed devices will not receive pushes.

## Current Secret Status

These GitHub Actions secrets have been added:

- `OPENAI_API_KEY`
- `VAPID_PRIVATE_KEY`
- `CLOUDFLARE__R2_API_TOKEN_VALUE`

`CLOUDFLARE__R2_API_TOKEN_VALUE` is saved for possible future use, but the current image upload code does not use it. The generator uploads to R2 through Cloudflare's S3-compatible API, so the secrets it actually needs for image upload are:

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Do not commit actual secret values to this repository. GitHub Actions should store the values.

## Add GitHub Secrets Step By Step

Open:

```text
https://github.com/MaxSch17799/Daily-Content/settings/secrets/actions
```

Then click `New repository secret` for each value below.

### 1. OpenAI API Key

You already added this one.

```text
Name: OPENAI_API_KEY
Value: your OpenAI API key
```

### 2. Cloudflare API Token

This token lets GitHub Actions deploy Pages and write to D1.

Create it:

1. Open `https://dash.cloudflare.com/profile/api-tokens`.
2. Click `Create Token`.
3. Use `Edit Cloudflare Workers` if you want the quickest broad setup, or create a custom token.
4. For a custom token, include permissions for:
   - Account -> Cloudflare Pages -> Edit
   - Account -> D1 -> Edit
   - Account -> Workers Scripts -> Edit
   - Account -> Account Settings -> Read
5. Scope it to your account.
6. Create the token and copy it once.

Add it to GitHub:

```text
Name: CLOUDFLARE_API_TOKEN
Value: the Cloudflare API token
```

### 3. R2 Access Keys

These let GitHub Actions upload generated images into the `images` bucket.

Create them:

1. Open Cloudflare dashboard.
2. Go to `R2`.
3. Click `Manage R2 API tokens`.
4. Click `Create API token`.
5. Give it object read/write access to the `images` bucket.
6. Copy the generated `Access Key ID` and `Secret Access Key`.

Add both to GitHub:

```text
Name: R2_ACCESS_KEY_ID
Value: the R2 Access Key ID
```

```text
Name: R2_SECRET_ACCESS_KEY
Value: the R2 Secret Access Key
```

Optional token you already stored for future reference:

```text
Name: CLOUDFLARE__R2_API_TOKEN_VALUE
Value: the R2 API token value
```

This optional token is not currently read by `.github/workflows/daily-generate.yml`.

### 4. VAPID Private Key

The VAPID public key is already configured. The private key is needed so GitHub Actions can send browser push notifications.

Use the generated private key from local setup:

```text
Name: VAPID_PRIVATE_KEY
Value: the generated VAPID private key
```

This one has already been added in GitHub.

### 5. VAPID Contact Email

This identifies the sender for Web Push. Use your email address.

```text
Name: VAPID_CONTACT_EMAIL
Value: your email address
```

## Check Whether Secrets Are Ready

After adding the secrets:

1. Open `https://github.com/MaxSch17799/Daily-Content/actions`.
2. Open `Deploy Cloudflare Pages`.
3. Click `Run workflow`.
4. Open `Daily content generation`.
5. Click `Run workflow`.

If a workflow says it skipped because secrets are missing, re-check the secret names exactly.

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
