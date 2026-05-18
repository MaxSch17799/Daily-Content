# 07. Android Notifications

Android Chrome can receive Web Push notifications from this site.

## Required Parts

- HTTPS site. Cloudflare Pages provides this.
- `public/sw.js` service worker.
- Web app manifest.
- VAPID public/private key pair.
- Push subscriptions stored in D1.
- GitHub generator sends Web Push after creating the daily item.

## Generate VAPID Keys

Run:

```bash
npm run vapid:generate
```

PowerShell fallback:

```powershell
npm.cmd run vapid:generate
```

You will get:

- public key
- private key

Set:

- `VAPID_PUBLIC_KEY` in Cloudflare Pages secrets.
- `VAPID_PRIVATE_KEY` in GitHub Actions secrets.
- `VAPID_CONTACT_EMAIL` in GitHub Actions secrets.

Only the public key is exposed to the browser.

`VAPID_PRIVATE_KEY` has already been added to GitHub Actions secrets. Keep the actual value out of committed docs and code.

Current public key already generated and configured:

```text
VAPID_PUBLIC_KEY=BKMUeuRpsIpT_aheckXaIoZIpTeJI6JgatsJInVgLnJE1M1K8q9nSBc0ynWbM9MmH409a1GWPYl-_xk5g825bqU
```

## Subscription Flow

1. Open `/subscribe` on Android Chrome.
2. Enter the subscription password.
3. Tap enable notifications.
4. Chrome asks for notification permission.
5. The push subscription is stored in D1.
6. The next generator run sends a notification.

## Required Cloudflare Secret

```bash
wrangler pages secret put SUBSCRIBE_PASSWORD --project-name YOUR_PAGES_PROJECT_NAME
```

This has already been set for the `daily-content` Pages project. The same password is not needed in GitHub.

## Limits

The MVP caps active subscriptions using:

```text
MAX_PUSH_SUBSCRIPTIONS=25
```

This is set in `wrangler.jsonc` and can be changed later.
