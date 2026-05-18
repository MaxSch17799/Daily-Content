# Sloppy Toppy Project Plan

## Goal

Build a daily AI-generated website that shows:

- A new AI-generated text item every day.
- A matching AI-generated image.
- An archive of previous days.
- Easy mode switching for facts, jokes, fictional Onion-style satire, and historical events.
- Optional browser notifications on Android Chrome after the user grants permission and enters a subscription password.
- A protected admin page for history, usage limits, mode changes, and generation status.

The current preferred MVP is a Cloudflare-hosted web app instead of a native Android app. This is a better first version because it works on phone and computer, is easy to share with friends, and can later become an installable PWA or native app if needed.

## Updated Product Direction

Use Cloudflare as the public app platform:

- Cloudflare Pages for the website frontend.
- Cloudflare Worker for API routes, admin actions, public gating, and notification subscription endpoints.
- Cloudflare D1 for generated item history, modes, settings, and push subscriptions.
- Cloudflare R2 for generated images.
- OpenAI API for text and image generation.
- GitHub Actions as the recommended fallback or primary daily generator if the Cloudflare Worker CPU limit is too tight.

The user experience:

1. Visit the `pages.dev` site from Android Chrome, desktop Chrome, or any browser.
2. The homepage shows today's generated item.
3. The archive page shows previous items.
4. Optional: tap "enable notifications", enter the subscription password, and grant Android Chrome notification permission.
5. Every day around 06:00 Europe/Berlin, the scheduled generator creates new satire content and, if notifications are enabled, sends a Web Push notification linking to today's item.

## Current Product Decisions

- Phone target: Android.
- Website visibility: public for now, with automatic soft limits and password gating if usage gets close to free-tier thresholds.
- Notification subscription: protected by a simple subscription password.
- Daily generation time: 06:00 Europe/Berlin.
- Default mode: fictional satire news.
- Image quality: medium.
- Language: English.
- Archive: yes.
- Fact/history verification: prompt-only for now, no source verification system yet.

## Key API Reality

The 20 EUR/month ChatGPT subscription is for the ChatGPT app, not for API usage. OpenAI says ChatGPT Plus is for ChatGPT and API usage is separate and billed independently.

This project should use the OpenAI API because it is the supported interface for code.

Requirements:

- OpenAI Platform account.
- OpenAI API key stored as a GitHub Actions secret, or as a Cloudflare Worker secret only if generation runs inside Cloudflare.
- Separate API billing budget.
- Optional OpenAI project or dashboard spend limit.

## Do Not Automate The ChatGPT Website

A local "clicking automatizer" that logs into ChatGPT and drives the normal web app is not a good path.

Reasons:

- It is brittle: browser UI changes, login checks, captchas, rate limits, and session expiry can break it.
- It is hard to deploy on Cloudflare because it needs a real browser session.
- It is slower and less observable than the API.
- It may violate OpenAI's Terms of Use. The Europe Terms of Use prohibit "automatically or programmatically extracting data or Output" and also prohibit circumventing rate limits or restrictions.

Manual supervised usage of ChatGPT is fine for experimenting with prompts, but production automation should use the API.

## Plain-English Cloudflare Terms

- Concurrent build: how many Cloudflare Pages deployments can be built at the same time. Free means one build at a time. If two code pushes happen close together, the second waits. This is about deployments, not visitors.
- MiB: a binary megabyte-like unit. `1 MiB` is 1,048,576 bytes. So `20 MiB` is about 20.97 MB. Cloudflare Pages currently lists a 25 MiB maximum for a single static site asset.
- Cron: a scheduled job. A Cron Trigger tells Cloudflare or GitHub to run code on a schedule, such as every day at 06:00.
- Dynamic request: a request handled by code, such as a Worker API route like `/api/today`, `/api/archive`, `/api/subscribe`, or `/api/admin`. Static files like the HTML, CSS, and JavaScript bundle are served by Pages and are not the same thing as dynamic Worker requests.

## Can Websites Send Phone Notifications?

Yes, on Android Chrome this is realistic.

The website can use Web Push:

- The site must be served over HTTPS. Cloudflare Pages provides HTTPS.
- The site registers a service worker.
- The user grants notification permission.
- The browser creates a push subscription.
- The backend stores that subscription in D1.
- The daily generator sends a push message using VAPID/Web Push.
- The service worker displays a notification with a title, body, icon, optional image, and link.

For Android, Chrome and installable PWAs are a good fit. The notification can work even when the website tab is not open, because the service worker can be started to handle the push event.

Limitations:

- The user must grant notification permission.
- Notifications can be disabled in Android or Chrome settings.
- Rich notification image display is browser/device dependent.
- The push subscription can expire or change, so the app must handle resubscription.
- iPhone support is more constrained, but the current target is Android.

## Recommended MVP Architecture

```text
GitHub Actions schedule, once per day around 06:00 Europe/Berlin
  -> generator script
      -> read active mode and language config from D1/static config
      -> read recent history from D1
      -> call OpenAI text model for structured JSON
      -> call OpenAI image model
      -> save image to R2
      -> save generated item metadata to D1
      -> send Web Push notifications to subscribed browsers

Cloudflare Pages frontend
  -> homepage fetches today's item
  -> archive page fetches previous items
  -> item page displays image and full text
  -> admin page changes modes and shows limits

Cloudflare Worker API
  -> public read endpoints with caching and soft limits
  -> protected admin endpoints
  -> protected subscription endpoints
  -> optional manual generation trigger
```

Cloudflare-only generation is still possible, but the recommended free-safe architecture uses GitHub Actions for the daily AI generation and notification fan-out. That avoids putting image decoding, OpenAI response parsing, and Web Push encryption inside the 10 ms CPU limit of Workers Free.

## Worker 10 ms CPU Estimate

Cloudflare measures CPU time as time spent executing Worker code. Waiting on network calls does not count, so time spent waiting for OpenAI, D1, or R2 is not the main issue.

Estimated CPU cost for a Cloudflare-only daily generation run:

- Read settings and recent history from D1: 0.5-2 ms CPU.
- Build prompts and request bodies: 0.5-2 ms CPU.
- Parse OpenAI text JSON: 0.5-2 ms CPU.
- Process generated image response: 5-40 ms CPU if base64 decoding is needed.
- Store image metadata and item row: 0.5-2 ms CPU.
- Web Push encryption and VAPID signing: roughly 1-5 ms per subscribed device.
- Logging and limit counters: 0.5-2 ms CPU.

Best-case total with one subscriber and no heavy image decoding: about 4-10 ms CPU.

Realistic total with image decoding and several subscribers: about 15-80 ms CPU.

Conclusion: the normal public API endpoints should fit Workers Free. The daily generation job is close or likely over the 10 ms CPU limit, mostly because of image processing and push-notification cryptography. We should either:

1. Start with GitHub Actions for daily generation, which is my recommendation.
2. Start Cloudflare-only and move generation to GitHub Actions if Cloudflare logs show `exceededCpu`.
3. Use Workers Paid later if we want everything inside Cloudflare.

## GitHub Actions Offload Plan

GitHub Actions can run a scheduled Node.js script with normal runtime headroom.

Proposed flow:

1. GitHub Actions runs daily around 06:00 Europe/Berlin.
2. The workflow installs dependencies.
3. The script calls OpenAI for text and image generation.
4. The script uploads the image to R2 using Cloudflare's S3-compatible R2 API.
5. The script calls a protected Cloudflare Worker admin endpoint or uses Wrangler/API calls to write metadata into D1.
6. The script sends Web Push notifications using a Node Web Push library.
7. The Cloudflare website immediately shows the new item.

Why this is good:

- Daily runs should be far below GitHub Free private-repo limits. Even a slow 10-minute run every day is about 310 minutes/month, below the 2,000 included minutes for private repositories.
- A public GitHub repo has free standard GitHub-hosted runner usage, but a private repo is cleaner if we do not want the project code public yet.
- Secrets stay in GitHub Actions secrets and Cloudflare secrets, not in the browser.

Caveats:

- GitHub scheduled workflows can be delayed during high load, especially near the top of the hour.
- If exact 06:00 delivery matters, Cloudflare Cron is better for the trigger and can call a protected GitHub `workflow_dispatch`, but it is still not a hard real-time guarantee.
- The simplest target is "around 06:00", for example 06:05 or 06:07 Europe/Berlin.

## Scheduling 06:00 Europe/Berlin

The target schedule is 06:00 Europe/Berlin.

Because daylight saving time changes the UTC offset, the implementation should include a local-time check and a daily duplicate guard:

- Store one `generation_runs` row per local date.
- Before generating, check whether today's local date already has a successful run.
- If the scheduler fires at the wrong UTC hour, exit without generating.
- Prefer a slightly offset minute, such as 06:05 or 06:07, if exact minute precision is not important.

If using Cloudflare Cron, use UTC cron expressions and handle Berlin time in code. A robust free-plan setup can use two cron triggers, one for winter UTC and one for summer UTC, with the code deciding whether it is actually 06:00 in Europe/Berlin.

If using GitHub Actions, use a scheduled workflow and keep the same duplicate guard. Scheduled GitHub workflows can be delayed, so "around 06:00" is the realistic promise.

## Cloudflare Free-Tier Fit

As of 2026-05-18, this project should fit comfortably inside Cloudflare free usage for personal use and sharing with friends, as long as it does not go viral and the Worker code stays light.

### Pages

Relevant free limits:

- 500 builds per month.
- 1 concurrent build.
- 20,000 files per site.
- 25 MiB maximum single static asset file.
- Pages Functions count toward Workers quotas.

This project does not need daily Pages builds because daily content lives in D1/R2, not in committed static files.

### Workers

Relevant free limits:

- 100,000 Worker requests per day.
- 10 ms CPU time per invocation on Workers Free.
- 10 ms CPU time per Cron Trigger on Workers Free.
- Cron Trigger wall-clock duration limit is 15 minutes.
- 5 Cron Triggers per account on Workers Free.
- 50 external subrequests per invocation.
- 1,000 internal Cloudflare-service subrequests per invocation.

Fit estimate:

- One daily cron run is trivial for the request limit.
- A small site for you and friends is far below 100,000 dynamic requests/day.
- Static assets served by Pages are not the same as Worker requests.
- The main risk is CPU time, not request count. Waiting on OpenAI, D1, or R2 network calls does not count as CPU time, but JSON parsing, base64 image handling, validation, and notification fan-out do.
- If the cron job repeatedly exceeds the 10 ms CPU limit, the first upgrade is Workers Paid or moving the generation job to GitHub Actions/small VPS while keeping the Cloudflare site.

### D1

Relevant free limits:

- 5 million rows read per day.
- 100,000 rows written per day.
- 5 GB total storage.

Fit estimate:

- One generated item per day plus a few config and notification rows is tiny.
- Archive browsing will stay far below the read limit if queries are indexed and paginated.
- D1 is a good fit for history, modes, push subscriptions, and lightweight admin settings.

### R2

Relevant free limits:

- 10 GB-month storage.
- 1 million Class A operations per month.
- 10 million Class B operations per month.
- Free egress.

Fit estimate:

- One generated image per day is likely fine for years unless images are very large.
- Example: at 2 MB/image, one year is about 730 MB.
- Uploading one image per day is far below Class A limits.
- Image reads are Class B operations, but 10 million/month is enough for a small public site.
- Use cache headers so repeated image views are served from Cloudflare cache where possible.

### Overall Cloudflare Free Verdict

For the intended MVP, Cloudflare should be free except for OpenAI API usage.

The likely free-tier pressure points are:

1. Worker CPU limit if the scheduled generation job runs inside Cloudflare instead of GitHub Actions.
2. R2 Class B reads if many people view many images.
3. D1 row reads if archive queries are unindexed or badly paginated.

All three are manageable in the design.

## Usage Guardrails

The public site should include automatic limits so a shared link cannot accidentally burn through free-tier usage.

Important design point: counting every visit can itself create database writes. So the guardrails should protect expensive paths, cache public reads, and avoid per-request database writes where possible.

MVP guardrails:

- Public homepage is static Pages HTML/CSS/JS.
- `/api/today` returns today's item with strong cache headers.
- `/api/archive` is paginated with a hard page size cap, such as 20 items/page and 50 max.
- `/api/item/:id` returns one item only.
- Admin endpoints always require an admin password/session.
- Notification subscription always requires a subscription password.
- Generation endpoint always requires an admin token and can run at most once per date unless forced by admin.
- D1 queries use indexes and fixed `LIMIT` values.
- R2 images get long cache headers.
- Public endpoints switch to password-required mode if soft caps are reached.

Suggested soft caps:

- Worker dynamic requests: public password gate at 50,000/day, hard block or admin-only mode at 80,000/day. Cloudflare Free limit is 100,000/day.
- D1 rows read: public password gate at 2,500,000/day, hard block or admin-only mode at 4,000,000/day. Cloudflare Free limit is 5,000,000/day.
- D1 rows written: public password gate at 50,000/day, hard block or admin-only mode at 80,000/day. Cloudflare Free limit is 100,000/day.
- R2 Class B reads: watch at roughly 250,000/day because the monthly free tier is 10,000,000 Class B operations.
- Push subscriptions: cap the MVP at 25 subscribed devices unless we deliberately raise it.
- Archive browsing: no unbounded queries, no full archive JSON dump.

Implementation details:

- Track D1 row usage from query metadata where available.
- Track approximate route-level usage in a `usage_counters` table.
- Do not count static Pages asset views in D1.
- Use Cloudflare dashboard metrics as the source of truth for account-level limits.
- Add an admin "public lock" toggle that immediately makes public API routes require the viewer password.

Password behavior:

- Normal public mode: anyone can view today's item and archive.
- Soft-limit mode: public visitors see a password prompt before API data loads.
- Subscription mode: the visitor must enter the subscription password before the browser notification permission prompt appears.
- Admin mode: separate admin password for changing modes, viewing limits, and triggering generation.

## OpenAI API Cost Estimate

Text generation is cheap at one item per day. Image generation is the main cost.

Current useful pricing examples from OpenAI docs:

- `gpt-5.4-mini`: $0.75 per 1M input tokens, $4.50 per 1M output tokens.
- `gpt-5.4-nano`: $0.20 per 1M input tokens, $1.25 per 1M output tokens.
- `gpt-image-1-mini` 1024x1024:
  - Low quality: about $0.005/image.
  - Medium quality: about $0.011/image.
  - High quality: about $0.036/image.

Rough monthly estimate for one daily item:

- Text with `gpt-5.4-mini`: probably well under $0.25/month.
- Image with `gpt-image-1-mini` low: about $0.15/month for 30 images.
- Image with `gpt-image-1-mini` medium: about $0.33/month for 30 images.
- Image with `gpt-image-1-mini` high: about $1.08/month for 30 images.

This excludes retries, experiments, prompt testing, failed generations, and any future verification/web-search calls. A practical early budget cap could be $5/month.

Recommended MVP model choices:

- Text: `gpt-5.4-nano` or `gpt-5.4-mini`.
- Image: `gpt-image-1-mini`, square 1024x1024, medium quality.
- Later quality upgrade: `gpt-image-2` or another higher-quality image model if the results justify the cost.

## Content Modes

Start with five modes:

1. `interesting_fact`
2. `daily_joke`
3. `fictional_satire_news`
4. `historical_event`
5. `absurd_tech_breakthrough`

The default active mode for the MVP is `fictional_satire_news`.

Each mode should live in a simple editable file or D1 row:

```yaml
id: interesting_fact
label: Interesting Fact
language: en
text_model: gpt-5.4-mini
image_model: gpt-image-1-mini
image_quality: medium
instructions: |
  Create one true, interesting fact in English.
  Make sure the fact is true.
  Avoid repeating recent facts.
output_style:
  title: short
  notification_text: one sentence
  full_text: 2-4 short paragraphs
image_style: cinematic editorial illustration
```

Adding a new mode should mean adding one config file or row, not changing core code.

## Language Support

English is the MVP language.

The design should support languages through config:

- `language: en`
- mode-specific prompt text
- display labels
- notification copy

Later languages can be added by creating translated prompt/config files, for example `modes/de/interesting_fact.yaml`.

## Generated Item Shape

The text model should return structured JSON, not free-form prose:

```json
{
  "mode": "interesting_fact",
  "language": "en",
  "title": "A short title",
  "notification_text": "One punchy sentence for the notification.",
  "summary": "Short homepage text.",
  "full_text": "The complete text shown on the item page.",
  "image_prompt": "Detailed prompt for image generation.",
  "uniqueness_key": "stable phrase used to avoid repeats",
  "tags": ["science", "nature"]
}
```

For facts and history, MVP verification is prompt-only:

- Tell the model to make sure the fact/event is true.
- Store the generated claim in the archive.
- Do not build source verification yet.

Later upgrade:

- Add source-backed verification with web search.
- Store citations.
- Retry if the fact cannot be verified.

## Database Design

Minimum D1 tables:

- `items`: generated daily items.
- `modes`: available content modes and prompt config metadata.
- `settings`: active mode, language, schedule, image style.
- `push_subscriptions`: browser Web Push subscriptions.
- `generation_runs`: logs, errors, token estimates, retry count.
- `usage_counters`: approximate route-level usage and soft-limit state.
- `admin_sessions`: short-lived admin sessions if we build a login flow.

`items` fields:

- `id`
- `date`
- `mode`
- `language`
- `title`
- `notification_text`
- `summary`
- `full_text`
- `image_prompt`
- `image_r2_key`
- `uniqueness_key`
- `tags_json`
- `created_at`

## Repeat Avoidance

Do not send the full archive to OpenAI forever.

MVP:

- Query recent items for the active mode.
- Send the last 30-100 `title` and `uniqueness_key` values to the text model.
- Ask it not to repeat them.
- Locally reject exact duplicate `uniqueness_key` values.

Later:

- Add embedding similarity checks.
- Add retry if the new item is too similar.

## Frontend Pages

MVP pages:

- `/`: today's item.
- `/archive`: list of previous items.
- `/item/:id`: full image and text.
- `/subscribe`: notification permission and subscription state.
- `/admin`: password-protected history, mode picker, usage limits, generation logs, and manual generation controls.

Optional later pages:

- `/modes`: manage mode configs.
- `/random`: view a random archive item.
- `/about`: short explanation for friends.

The site should be installable as a PWA on Android:

- Web app manifest.
- App icons.
- Service worker.
- Offline shell for basic navigation.

## Notification Flow

1. User opens the site on Android Chrome.
2. User taps a clear "enable notifications" control.
3. User enters the subscription password.
4. Frontend asks for notification permission.
5. Frontend registers the service worker and creates a Push API subscription.
6. Worker stores the subscription in D1.
7. After daily content is generated, the generator sends a push message.
8. Service worker displays the notification.
9. Notification click opens today's item URL.

Use Web Push directly with VAPID keys first. Firebase Cloud Messaging is also possible, but direct Web Push keeps the architecture smaller.

## Secrets

Secrets must live in Cloudflare Worker secrets and GitHub Actions secrets:

- `OPENAI_API_KEY`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VIEWER_PASSWORD`
- `SUBSCRIBE_PASSWORD`
- `ADMIN_PASSWORD` or `ADMIN_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Never expose the OpenAI API key to the browser.

## Recommended Stack

- Language: TypeScript.
- Frontend: Vite + React, deployed on Cloudflare Pages.
- Styling: plain CSS or Tailwind later if desired; keep MVP simple.
- Worker API: Hono or a very small Cloudflare Worker router.
- Database: Cloudflare D1.
- Image storage: Cloudflare R2 Standard storage.
- Daily generator: Node.js script run by GitHub Actions.
- OpenAI calls: official OpenAI SDK in the Node generator; direct `fetch` is also possible.
- Web Push: Node `web-push` library from the GitHub generator.
- Local dev/deploy: Wrangler CLI.

Reasoning:

- React + Vite gives a straightforward app with admin screens and PWA support.
- Keeping the generator in Node avoids Cloudflare's 10 ms CPU risk.
- Keeping the Worker API small keeps dynamic request CPU low.
- D1/R2 stay as the durable Cloudflare backend, so the website remains a Cloudflare app.

## What You Need To Set Up

Before deployment:

1. Create or use a Cloudflare account.
2. Create or use a GitHub account.
3. Decide whether the repository should be private or public.
4. Create an OpenAI Platform API key.
5. Add a small OpenAI monthly budget, such as $5/month.
6. Install Node.js locally.
7. Log in to Cloudflare with Wrangler from this project folder.
8. Create a Cloudflare Pages project.
9. Create a D1 database.
10. Create an R2 bucket.
11. Create a Cloudflare API token for GitHub Actions.
12. Add required secrets in Cloudflare and GitHub.
13. Test the deployed site from Android Chrome.

## Milestones

1. Scaffold Cloudflare Pages + Worker project.
2. Add local dev setup with Wrangler.
3. Add D1 schema and migrations.
4. Add R2 bucket binding.
5. Build frontend homepage, item page, archive, subscribe page, and admin page.
6. Add public API routes with caching, pagination, and usage guardrails.
7. Add mode config files for the first four modes.
8. Implement Node daily generator with structured JSON validation.
9. Implement OpenAI image generation and R2 upload.
10. Implement D1 writes for generated items and generation logs.
11. Add repeat avoidance from D1 history.
12. Add Web Push subscribe/unsubscribe.
13. Add password-protected subscription flow.
14. Add notification sending after generation.
15. Add GitHub Actions daily schedule around 06:00 Europe/Berlin.
16. Deploy to Cloudflare Pages.
17. Test on Android Chrome.
18. Tune limits and admin controls after observing real usage.

## Main Challenges

- OpenAI API costs are separate from ChatGPT Plus.
- Browser notification permission is user-controlled and can be revoked.
- Web Push subscriptions can expire and must be cleaned up.
- Worker Free CPU time is likely tight for generation plus image processing, so GitHub Actions is the recommended generation runner.
- The image generation call may fail or be slow; the cron job needs retry/error logging.
- Fact correctness is not guaranteed with prompt-only verification.
- Public sharing means the app should avoid unsafe or confusing fictional content.
- Fictional satire should be labeled as fictional/satire.
- Admin controls must be protected so friends cannot change the active mode.
- Public usage counters must not create more database writes than they save.
- Exact 06:00 delivery is best-effort, because scheduled jobs can be delayed.

## Current Open Questions

1. Do you already have a Cloudflare account, and are you okay creating one if not?
2. Do you already have a GitHub account, and should this repository be private?
3. Do you want the first deployment on a free `pages.dev` URL, or do you own a domain you want to use?
4. Is "around 06:00" acceptable, for example 06:05 or 06:07, to avoid scheduler congestion?
5. What should the public viewer password, subscription password, and admin password be, or should we generate placeholders first?
6. How many notification subscribers should the MVP allow: 5, 25, or 50 devices?
7. Should the site publish automatically every day, or should it generate a draft first and wait for approval?
8. Should old images be kept forever, or should there be a cleanup policy after a few years?

## Official References Checked

- ChatGPT Plus and API billing are separate: https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus
- OpenAI Europe Terms of Use: https://openai.com/policies/terms-of-use/
- OpenAI text generation with the Responses API: https://platform.openai.com/docs/guides/text
- OpenAI image generation guide: https://platform.openai.com/docs/guides/image-generation
- OpenAI pricing: https://developers.openai.com/api/docs/pricing
- `gpt-image-1-mini` model pricing: https://developers.openai.com/api/docs/models/gpt-image-1-mini
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare D1 pricing and free limits: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare R2 pricing and free limits: https://developers.cloudflare.com/r2/pricing/
- GitHub Actions billing and included free minutes: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- GitHub Actions scheduled workflow behavior: https://docs.github.com/actions/reference/events-that-trigger-workflows
- MDN Push API: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
- MDN service worker notifications: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification
- MDN PWA installability: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
