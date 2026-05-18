# 00. Project Overview

This project is a Cloudflare-hosted daily content site.

It has four main systems:

1. Cloudflare Pages hosts the React website.
2. Cloudflare Pages Functions provide the API routes.
3. Cloudflare D1 stores generated text, archive rows, settings, modes, usage counters, and push subscriptions.
4. Cloudflare R2 stores generated images.
5. GitHub Actions runs the daily generator with normal Node.js runtime headroom.

The daily generator:

1. Reads the active mode from D1.
2. Reads recent history from D1.
3. Calls OpenAI for structured text.
4. Calls OpenAI for a generated image.
5. Uploads the image to R2.
6. Writes the item to D1.
7. Sends Web Push notifications to subscribed Android Chrome devices.

The default mode is `fictional_satire_news`.

## Why GitHub Actions Generates Content

Cloudflare Workers Free has a 10 ms CPU limit per invocation. Normal read APIs should fit this. Daily generation may exceed it because image response handling and Web Push encryption can cost more than 10 ms CPU.

GitHub Actions avoids that problem while keeping the website, database, bucket, and API on Cloudflare.

## Main URLs

Production deployment:

- Site: https://daily-content.pages.dev

- `/`: today
- `/archive`: previous items
- `/item/:id`: one item
- `/subscribe`: notification subscription
- `/admin`: admin dashboard

## Current Status

Completed:

- GitHub repository initialized and pushed.
- Cloudflare Pages project created as `daily-content`.
- D1 database created as `db`.
- R2 bucket created as `images`.
- D1 migration applied.
- Cloudflare Pages secrets set for admin, viewer, subscriber, and VAPID public key.
- Site deployed and responding.
- Admin API verified with `ADMIN_PASSWORD`.

Pending before the first generated item appears:

- Confirm remaining GitHub Actions secrets.
- Run the `Daily content generation` workflow once.

## Secrets Are Not Committed

All API keys and passwords must be stored in Cloudflare secrets or GitHub Actions secrets. The repo only contains placeholders and setup instructions.
