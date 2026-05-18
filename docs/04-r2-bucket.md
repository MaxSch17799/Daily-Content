# 04. R2 Bucket Setup

R2 stores generated PNG images.

## Create Bucket

```bash
npx wrangler r2 bucket create daily-content-images
```

The Worker binding name must be:

```text
IMAGES
```

The bucket name defaults to:

```text
daily-content-images
```

## Create R2 API Token

The GitHub generator uploads images to R2 using S3-compatible credentials.

In Cloudflare:

1. Open R2.
2. Go to `Manage R2 API tokens`.
3. Create an API token.
4. Scope it to this bucket if Cloudflare offers that option.
5. Copy the Access Key ID and Secret Access Key.

Add these GitHub Actions secrets:

- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

## Image Serving

Images are not served directly from a public R2 bucket in the MVP.

The site uses:

```text
/api/image/:key
```

That route reads from R2 through the `IMAGES` binding and returns long cache headers.

This means no public R2 domain is required for the first version.

