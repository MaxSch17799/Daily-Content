# 11. Daily Content Trades Plan

## Goal

Add a protected trading-advice area for a personal Trade Republic portfolio.

The system should:

- Store a local copy of the portfolio: cash, holdings, transactions, and trade history.
- Support Trade Republic stocks, ETFs, and crypto for now.
- Fetch current or latest available quote data for every holding and relevant recommendation candidate.
- Run once per day and send the current portfolio state, cash position, fees, previous advice, and actual trade history to the OpenAI API.
- Ask for structured buy/sell/hold suggestions with short reasons.
- Display the advice to the user in a password-protected trading area.
- Send an Android Chrome Web Push notification when new advice is ready.
- Let the user confirm which recommended trades were actually made, including actual price, quantity, and fees.
- Update the portfolio from actual confirmed trades, not from AI recommendations alone.
- Stay modular so later each friend can have a separate portfolio and separate advice history.

This should be decision-support only. It must not place trades automatically.

## Confirmed Product Decisions

- Route: `/trades` on the existing `daily-content.pages.dev` site.
- Default advice time: `07:00 Europe/Berlin`.
- Schedule must be editable inside the trading page.
- Advice cadence: weekdays only.
- Asset scope: Trade Republic stocks, ETFs, and crypto for now.
- Default enabled assets: stocks and ETFs.
- Default disabled assets: crypto.
- Crypto can be recommended as a new buy only if it is enabled in the system editor.
- If crypto is enabled, treat it as an equal candidate beside stocks and ETFs rather than as a lower-priority asset class.
- The AI may recommend selling 100% of a position.
- Default risk profile: balanced, with custom risk profile available.
- Default maximum cash deployment: `100%`, with custom limit available.
- Default minimum trade size: `25 EUR`, with custom amount available.
- Default fractional-share increment: `0.5`.
- Derivatives are out of scope for now.
- Future friend/user access: one password per user; the password effectively acts as the user identity.
- Remembered device login duration: 30 days.
- Users can mark recommendations as unavailable on Trade Republic, and the system should avoid suggesting them again.
- The unavailable-on-Trade-Republic list should be editable.
- MVP starts with one portfolio named `Max`, protected by password `MAX`; friend passwords/users come later.
- The plain-text portfolio parser should infer asset type when `Stock:`, `ETF:`, or `Crypto:` prefixes are missing.
- Include a manual `Run advice now` button in v1.
- The system editor is accessible after the normal trading login; no extra admin password for now.
- Starting portfolio import only needs quantity and current holding value. Average buy price is optional for v1.
- Manual deposits and withdrawals are included in v1 so cash can be corrected without fake trades.
- Advice should include a benchmark comparison section at the end.
- Default benchmark: MSCI World ETF-style benchmark.
- New assets can be suggested as direct buys, with Trade Republic availability warnings when not confirmed.
- Stale quote policy: warn for quotes older than 1 trading day; block advice only if a required current holding quote is missing or older than 5 trading days.
- Imported current holding value becomes starting cost basis for simple P/L until real buy history is entered.
- Target OpenAI budget for this feature: about `5 EUR/month`.
- No fixed maximum number of trades per day, but the prompt and backend should keep the `1 EUR` per-transaction fee visible.
- German taxes are ignored for the MVP.
- Notifications should only say that advice is ready, without exact buy/sell details.
- First portfolio import method: plain text paste with standard parsing and a clear input guide.
- Login should be remembered on a device. A "Log in as different user" action should clear the local session and return to the password screen.

## Current System Fit

The existing app already has most of the platform pieces this feature needs:

- React + Vite frontend.
- Cloudflare Pages hosting.
- Cloudflare Pages Functions API routes in `functions/api`.
- Cloudflare D1 database.
- Web Push subscription flow for Android Chrome.
- GitHub Actions or local Node scripts for scheduled generation.
- OpenAI Responses API usage with structured JSON.
- Simple password-gated admin/subscription flows.

The trading feature should reuse these patterns, but it should have its own tables, routes, password, notification scope, and generation script.

## URL And Route

This should be a subpage of the existing site, not a new domain.

Target route:

```text
https://daily-content.pages.dev/trades
```

Implementation:

- Add `/trades` to the existing React router.
- Add trading API routes under `/api/trades/*`.
- Keep trading tables prefixed with `trade_`.
- Reuse the existing Cloudflare Pages project, D1 binding, and Web Push infrastructure.
- Keep trading data separated in code and schema so it can later be moved to a separate D1 database if needed.

## Password And Access

For the first version:

- Add a new secret named `TRADES_PASSWORD`.
- Set it to `MAX` for now.
- Require this password before any trading portfolio data is fetched.
- Store the entered password in local storage like the current admin/viewer password flow.
- Send it to trading API routes as `x-trades-password`.
- Create a default portfolio named `Max`.
- Treat password `MAX` as the first user identity for that default portfolio.
- Do not add a second admin password for the system editor in v1.

For later friends:

- Add `trade_users`.
- Add one or more `trade_portfolios` per user.
- Scope every position, transaction, advice run, and push subscription by `user_id` and `portfolio_id`.
- Store a remembered local session on each device after successful login.
- Add a top-bar action named `Log in as different user`.
- When clicked, clear the remembered local session and return to the trading password screen.
- Sessions should last 30 days for simplicity.
- In the multi-user version, each user gets one password. The password identifies which user/portfolio area to open.
- Keep server-side authorization checks on every trading API route. Local remembered login is only a convenience, not the security boundary.

## Main Pages

The trading app should have these views:

- Locked entry screen: password prompt.
- Dashboard: current portfolio value, cash, latest cash recommendation, latest advice, and key risk metrics.
- Start portfolio wizard: guided setup for cash, base currency, holdings, broker fee rules, and risk preferences.
- Portfolio editor: edit holdings, symbols, ISINs, quantities, average costs, cash, and provider symbols.
- Advice page: current AI buy/sell/hold suggestions with short explanations.
- Confirm actual trades page: shows recommended buys/sells and lets the user mark each as done, skipped, edited, or partially done.
- Trade history: all actual buys, sells, deposits, withdrawals, dividends, fees, and AI recommendations.
- Analytics page: allocation, value over time, cash vs invested, concentration, sector/country split if data exists, realized/unrealized profit and loss.
- Trading subscription section: separate notification button for trade-advice notifications.
- Import/manual input page: paste or upload current portfolio text, then review parsed positions before saving.
- System editor: tune schedule, allowed assets, trade limits, fractional-share rules, prompt settings, and advanced prompt text.

The "input actual trades" button should live directly under the advice panel.

## Portfolio Setup Wizard

The "Start portfolio" flow should ask:

1. Portfolio name.
2. Base currency, probably `EUR`.
3. Starting cash.
4. Broker fee per transaction: default `1.00 EUR`.
5. Whether Trade Republic fractional shares are allowed for this portfolio.
6. If fractional shares are allowed, the minimum increment: whole shares only, `0.5`, `0.25`, `0.1`, or custom decimal step.
7. Asset types allowed: stocks, ETFs, and crypto.
8. Holdings: asset type, symbol, ISIN if available, name, exchange, provider symbol, quantity, current holding value, optional average buy price, currency.
9. Optional pasted text input: user can paste a free-form list copied from Trade Republic or written manually.
10. Optional risk rules: max single-position weight, max daily turnover, sectors to avoid, stocks/ETFs/crypto to never sell, assets to never buy.

After setup, the first AI prompt should ask for an initial deployment plan: what to buy with available cash, whether to keep some or all cash uninvested, and what to avoid.

There is no hard cash-reserve rule for now. The AI may recommend staying in cash, partially investing, or fully investing, but the backend must still enforce that buys cannot exceed available cash after fees.

## Plain Text Portfolio Import

The first import flow should be plain text only.

It should show a short guide and example formats before the text box:

```text
Cash: 1250 EUR

Stock: Apple | AAPL | US0378331005 | 3.5 shares | value 650 EUR
ETF: iShares Core MSCI World | EUNL | IE00B4L5Y983 | 12 shares | value 1033 EUR
Crypto: Bitcoin | BTC | 0.025 coins | value 1550 EUR
```

Parser behavior:

- Accept one holding per line.
- Support `Stock:`, `ETF:`, and `Crypto:` prefixes.
- Infer the asset type when the prefix is missing.
- Extract name, symbol, optional ISIN, quantity, current holding value, and optional average buy price when possible.
- Put uncertain rows into a review table instead of silently guessing.
- Let the user edit parsed rows before saving.
- Save the original pasted text with the import record for audit/debugging.

CSV and account-statement parsing stays later.

## System Editor

The system editor should be a clear control surface for how the trading AI works.

Schedule controls:

- Advice time, default `07:00`.
- Time zone, default `Europe/Berlin`.
- Weekdays-only toggle, default on.
- Manual "run advice now" button, protected by the trading password/session.
- System editor access requires the trading login only. No separate admin login in v1.

Asset controls:

- Stocks allowed: default on.
- ETFs allowed: default on.
- Crypto allowed: default off.
- Derivatives are not included in the first version.
- Bonds/commodities/leverage/options are also out of scope unless explicitly added later.
- If an asset type is disabled and that setting is active, the backend must reject AI recommendations for that type even if the model suggests them.
- If the user manually edits the prompt block tied to an asset setting, that setting becomes overridden/inactive. In that case, the backend should still reject technically unsupported assets, but it should not pretend the original checkbox rule is still active.

Trading limit controls:

- Allow selling 100% of a position: default on.
- Maximum percentage of available cash that can be invested in one advice run: default `100%`, configurable, with an option for no limit if we later distinguish no limit from 100% available cash.
- Minimum trade size: default `25 EUR`, configurable amount in EUR, with an option for no minimum.
- Maximum single-position weight: optional.
- Maximum daily turnover: optional.
- No hard max trade count by default, but the prompt should explicitly remind the model that every buy or sell costs `1 EUR`.

Fractional-share controls:

- Allow fractional shares: on/off.
- Minimum share increment: default `0.5`; options should include whole shares, `0.5`, `0.25`, `0.1`, or custom.
- Apply increment checks to stock and ETF recommendations.
- Crypto can use its own decimal precision setting.

Prompt controls:

- Risk profile selector: conservative, balanced, aggressive, or custom. Default is balanced.
- Checkboxes that directly affect the prompt, such as:
  - prefer fewer trades
  - prefer diversification
  - allow full cash deployment
  - allow full position sells
  - avoid high-volatility assets
  - include crypto as equal candidate
  - prefer ETFs for broad exposure
- Numeric inputs that directly affect the prompt, such as:
  - maximum cash deployment percentage
  - minimum trade size
  - fractional-share increment
  - maximum single-position weight
  - maximum daily turnover
- A full generated prompt editor showing the exact prompt sections and rules that will be sent to OpenAI.
- A reset-to-default button.
- Prompt versioning so each advice run records which settings and custom text produced it.

The editor should make the prompt understandable without requiring the user to read raw JSON. The full prompt text is still shown for transparency and advanced control.

## Prompt Editor Behavior

The prompt should be built from named sections and setting-linked blocks.

Example sections:

- Role and objective.
- Broker and fee assumptions.
- Enabled asset types.
- Disabled asset types.
- Cash deployment rules.
- Minimum trade size.
- Fractional-share rules.
- Risk profile.
- Diversification preferences.
- Previous advice and actual trade context.
- Output format.
- Custom user instructions.

Each generated block in the prompt should carry internal metadata:

- `block_id`
- `section`
- linked `setting_key`
- generated text
- current edited text
- state: `active`, `overridden`, `disabled`, or `custom`

Visual behavior:

- The full prompt text field should show visible markers around generated sections, for example:

```text
[setting: asset.crypto_allowed]
Crypto is disabled. Do not recommend crypto buys.
[/setting]
```

- The marker style can later be upgraded to chips or highlighted blocks in the UI, but the text format should remain copyable and understandable.
- When the user edits text inside a block that is linked to a setting, that setting becomes greyed out and marked inactive/overridden.
- The greyed-out setting should show a button: `Reactivate this setting`.
- Reactivating a setting should restore the generated setting block above the user's edited/custom text for that setting.
- Reactivating a setting should not delete the user's custom edited text. The user's text should remain as a custom block unless the user deletes it manually.
- The editor should warn if active settings and custom text appear to conflict, but it should not silently delete custom instructions.
- `Reset all` should only reset the prompt text field by regenerating it from the current checkbox/input settings. It should not reset the settings themselves.
- `Reset to defaults` should reset settings and prompt text to the product defaults.

Custom prompt override policy:

- The user is allowed to override safety/risk wording in the editable prompt.
- The backend should still enforce hard technical constraints that protect data integrity and impossible trades, such as available cash, current holding quantity, technically supported asset types, provider quote availability requirements, and numeric schema validation.
- Risk/preference settings such as cash deployment limit, minimum trade size, asset-type preference, diversification style, or sell-100%-allowed can be overridden by editing their linked prompt blocks. When overridden, the UI should show the setting as inactive and the backend should use the effective prompt profile rather than the stale checkbox/input value.
- If the user explicitly edits the prompt to contradict a setting, the UI should treat the setting as overridden rather than trying to merge both.

Storage:

- Save prompt block metadata separately from the flattened prompt text.
- Store the flattened prompt text used for each advice run in `trade_advice_runs`.
- Store overridden setting keys so the UI can show which controls are inactive because the prompt was manually edited.
- Store prompt versions so old advice can be audited later.

## Data Model

Suggested D1 tables:

- `trade_users`: future-proof user records.
- `trade_portfolios`: one portfolio per user, with base currency, broker, fee rule, optional cash policy, and risk profile JSON.
- `trade_cash_balances`: cash by portfolio and currency.
- `trade_positions`: current open holdings by portfolio, including `asset_type` values such as `stock`, `etf`, and `crypto`.
- `trade_transactions`: actual confirmed events such as buy, sell, deposit, withdrawal, dividend, fee, and manual adjustment.
- `trade_market_quotes`: cached quotes by symbol/provider/source/currency/timestamp.
- `trade_portfolio_snapshots`: daily portfolio value, cash, holdings value, weights, and metrics.
- `trade_advice_runs`: each AI run with model, prompt version, input snapshot JSON, output JSON, status, and token usage.
- `trade_ai_logs`: every OpenAI request/response pair, including prompt text, structured input JSON, raw response JSON, parsed output JSON, model, tool usage, and status.
- `trade_ai_log_parts`: searchable/exportable prompt sections and response sections linked to `trade_ai_logs`.
- `trade_news_contexts`: source-backed web-search summaries, queries, source URLs, and source titles used for a run.
- `trade_recommendations`: normalized recommendations from an advice run.
- `trade_push_subscriptions`: push subscriptions scoped to trading, user, and portfolio.
- `trade_candidate_assets`: tradable candidates the AI may choose from, including source, symbol, asset type, provider symbol, and last validation date.
- `trade_unavailable_assets`: assets the user marked unavailable on Trade Republic, editable later.
- `trade_settings`: provider choice, run time, weekday-only flag, enabled flag, and other trading settings.
- `trade_prompt_profiles`: editable prompt settings, checkboxes, custom instructions, and prompt version metadata.
- `trade_prompt_blocks`: generated and custom prompt blocks, linked settings, edited text, and active/overridden state.
- `trade_imports`: pasted portfolio import text, parse result, status, and review metadata.
- `trade_sessions`: remembered device sessions for future multi-user login, expiring after 30 days.
- `trade_audit_exports`: optional export log rows so generated text exports can be found again.

Every core table should have `portfolio_id`. Future multi-user support will be much easier if this is included from day one.

## Prompt And Response Archive

Every AI interaction must be stored for troubleshooting and later agent review.

Store for each OpenAI call:

- run id and portfolio id
- call type: `web_context`, `advice_json`, `prompt_repair`, or `manual_test`
- model
- tool settings, including web search mode and search context size
- full flattened prompt text sent to OpenAI
- structured input JSON used to build the prompt
- raw OpenAI response JSON
- parsed output JSON
- validation errors, if parsing failed
- input tokens, output tokens, and web search tool call count when returned by the API
- created timestamp and status

Search behavior:

- MVP search can use normal D1 `LIKE` queries over title, prompt text, response text, source URLs, symbols, and run date.
- Add filters for date range, call type, model, status, symbol, and recommendation status.
- If D1 full-text search is available and worth the complexity later, add an FTS table as an upgrade. Do not block the MVP on it.

Export behavior:

- Add an export button on the audit page.
- Export one run or a date range as a `.txt` or Markdown document.
- Include:
  - portfolio snapshot summary
  - quote table and quote timestamps
  - web-search queries and sources
  - full prompt text
  - raw response text/JSON
  - parsed recommendations
  - validation errors if any
  - user accepted/edited/skipped decisions
  - actual trades generated from the advice
- API route should return `text/plain; charset=utf-8` or `text/markdown; charset=utf-8`.
- Export should not include API keys, passwords, push subscription secrets, or hidden environment values.

Recommended routes:

- `GET /api/trades/audit`
- `GET /api/trades/audit/:id`
- `GET /api/trades/audit/export?runId=...`
- `GET /api/trades/audit/export?from=YYYY-MM-DD&to=YYYY-MM-DD`

This archive is useful for debugging, but also for later sending the exact history to another agent or reviewing why the system made a recommendation.

## Quote Data API Options

Recommendation for MVP:

- Use a provider chain rather than one provider:
  1. Stooq free CSV data for European/EUR stock and ETF historical/latest-close coverage where the symbol is available.
  2. Twelve Data free Basic for US stocks/ETFs, forex, crypto, reference data, batch requests, and any covered symbols.
  3. EODHD free tier as a fallback for European end-of-day data if Stooq/Twelve Data coverage is missing.
  4. CoinGecko for crypto quote data if Twelve Data crypto coverage or symbol mapping is not sufficient.
  5. Alpha Vantage as an emergency fallback only, because the free daily request limit is much tighter.
- Use ECB euro foreign exchange reference rates for currency conversion into EUR when quotes are not already in EUR.

Reason:

- The free Basic plan currently advertises 8 API credits per minute and 800 per day.
- It supports batch requests.
- It includes US equities and ETFs on the free tier.
- It also lists real-time crypto market data and reference data on the free Basic tier.
- It is much more practical for a daily portfolio than Alpha Vantage's 25 requests/day.
- Stooq publishes free historical market-data downloads covering multiple European markets and ETFs, which can help with EUR-denominated holdings.
- EODHD currently offers a free API plan with 20 calls/day and end-of-day historical access, including European coverage.
- CoinGecko's free Demo API currently advertises 10,000 monthly calls and 100 calls/minute, which is enough for a small daily crypto portfolio.
- ECB reference rates are free official EUR FX rates, updated on working days around 16:00 CET, and are good enough for portfolio valuation conversion.

Implementation notes:

- Store the API key as `TWELVE_DATA_API_KEY`.
- Store an EODHD key as `EODHD_API_KEY` only if we need the fallback.
- Store a CoinGecko key as `COINGECKO_API_KEY` if using the Demo API.
- Stooq does not need an API key, but the app should cache results and avoid excessive requests.
- Fetch quotes server-side only.
- Cache each quote in `trade_market_quotes`.
- Do not call the provider directly from the browser.
- Store provider symbols separately from display symbols, because Trade Republic holdings may need mapping by exchange or ISIN.
- Mark quotes as stale if they are older than the configured maximum age.
- If the source gives USD prices for US stocks, convert values into EUR before sending the portfolio to AI.
- For crypto, store the Trade Republic display name and the provider coin id separately, for example `Bitcoin` and `bitcoin`.

Important EUR/Trade Republic caveat:

- Trade Republic executes many instruments through venues such as LS Exchange/Lang & Schwarz, and free APIs may quote Xetra, Frankfurt, LSE, NASDAQ, NYSE, or another venue.
- For morning advice, latest close/delayed indicative data is usually enough for portfolio valuation and suggestion sizing.
- The UI should show quote source, venue/provider symbol, currency, and timestamp so it is clear the final execution price in Trade Republic can differ.
- Actual portfolio updates must use the user's confirmed Trade Republic execution price, not the free quote estimate.

Quote freshness:

- A quote is "fresh" when it comes from the latest available trading day or a recent delayed quote.
- A quote is "stale" when the newest available provider price is older than expected, for example older than 1 trading day for normal stocks/ETFs.
- Stale quotes can happen on weekends, holidays, API outages, wrong provider symbols, or illiquid assets.
- Stale data does not always mean "wrong", but the advice should show a warning because the price may be too old for sizing trades.
- V1 policy: warn for quotes older than 1 trading day, and block advice only if a required current holding quote is older than 5 trading days or missing entirely.

Free quote implementation plan:

1. Create server-only quote clients:
   - `scripts/lib/trades/stooq.ts`
   - `scripts/lib/trades/twelve-data.ts`
   - `scripts/lib/trades/eodhd.ts`
   - `scripts/lib/trades/coingecko.ts`
   - `scripts/lib/trades/ecb-fx.ts`
2. Add secrets:
   - `TWELVE_DATA_API_KEY`
   - `EODHD_API_KEY` if using EODHD fallback
   - `COINGECKO_API_KEY` if using CoinGecko Demo API
3. Resolve provider symbols:
   - Store display symbol, ISIN, exchange, provider, and provider symbol separately.
   - Let the user edit provider mapping in the portfolio editor if an API lookup is wrong.
4. Fetch quotes in batches:
   - Refresh holdings first.
   - Refresh candidate assets only when needed for advice.
   - Respect provider rate limits.
5. Cache every quote in `trade_market_quotes`:
   - symbol
   - provider
   - price
   - currency
   - market timestamp
   - fetched timestamp
   - stale/fresh status
6. Use cached prices in the browser:
   - Browser calls `/api/trades/portfolio` and `/api/trades/advice`.
   - Browser never calls Twelve Data or CoinGecko directly.
7. Before the market opens:
   - Use latest available close/last price.
   - Show the quote timestamp clearly.
   - Tell the AI not to assume live execution at that exact price.

Other providers checked:

- Alpha Vantage: free stock API service is currently listed as up to 25 requests/day. Good fallback, but tight for a full portfolio.
- Polygon.io: free Stocks Basic is currently listed with 5 API calls/minute and end-of-day oriented data. Good for US market history, weaker for Trade Republic/EU coverage.
- Marketstack: free plan currently lists 100 requests/month, too low for daily portfolio use.
- Finnhub: useful quote API and broad docs, but the current free pricing page emphasizes US coverage; broader international market data appears to be in paid stock-market-data plans, so it is not the best free EUR-stock base.
- Financial Modeling Prep: free plan is commonly listed at 250 requests/day, worth considering as a fallback, but licensing and coverage should be checked against the final portfolio holdings.
- Yahoo/yfinance and unofficial Trade Republic APIs: avoid for production. They can break, and their licensing/terms are not a clean base for a hosted app.

Trade Republic availability:

- Trade Republic's public support says the full crypto list is available inside the app.
- Trade Republic ETF support points users to Trade Republic and Lang & Schwarz selections, with the caveat that not every partner-listed ETF is tradable with Trade Republic.
- There does not appear to be a clean official public API for "all assets currently buyable on Trade Republic."

Practical MVP approach:

- Let the AI suggest broadly available stocks/ETFs/crypto, but mark recommendations as "needs Trade Republic availability check" unless the asset is already in our candidate table.
- Build `trade_candidate_assets` from the user's current holdings, a manually curated Trade Republic candidate list, and any assets the user confirms are buyable.
- Add a field on each recommendation: `trade_republic_availability = confirmed | likely | needs_check | unavailable`.
- If the user marks a suggested asset as unavailable, store that so the model does not suggest it again.
- Keep an editable unavailable-assets list in the system editor.
- Let the user remove an asset from the unavailable list if Trade Republic availability changes later.

Open question: if the portfolio contains mostly German/EU stocks or ETFs identified by ISIN, provider-symbol mapping is the hardest part. We should collect the starting portfolio first and verify coverage before committing to one provider.

## Analytics Library Choice

Use `recharts/recharts` for the first analytics UI.

Why:

- It fits the existing React app.
- It is MIT-licensed.
- It has pie, bar, line, area, and treemap charts suitable for portfolio breakdowns.
- It avoids pulling in a full separate portfolio app with another backend.

Use cases:

- Allocation by position.
- Allocation by sector/country if metadata is available.
- Cash vs invested.
- Portfolio value over time.
- Daily advice impact.
- Realized and unrealized P/L.
- Trade count and fee drag.

Optional later addition: `TanStack/table` for a more powerful trade-history table with sorting, filtering, and editable rows.

Projects not recommended as direct dependencies:

- Portfolio Performance: strong desktop portfolio analytics, but it is a Java desktop application and not a good fit to embed in this React/Cloudflare app.
- Ghostfolio: strong open-source portfolio tracker, but it is a full Angular/NestJS/Postgres application. Pulling it in would be a separate product, not a small module.

## Daily Advice Flow

Daily scheduled job:

1. Load active portfolios where trading advice is enabled.
2. Fetch or refresh quotes for all holdings and watchlist symbols.
3. Build a portfolio snapshot:
   - cash by currency
   - holding quantities
   - latest prices
   - market values
   - portfolio weights
   - realized and unrealized P/L
   - fees paid
   - current free cash
   - previous advice and actual follow-through
4. Save the snapshot in `trade_portfolio_snapshots`.
5. Build an AI input packet with the snapshot, previous advice, actual trades, constraints, and prompt version.
6. Call the OpenAI Responses API with structured output.
7. Validate the JSON response with Zod.
8. Reject or flag impossible recommendations, especially buys that exceed available cash after fees.
9. Save the advice run and individual recommendations.
10. Send a Web Push notification that says the advice is ready and links to the advice page.

Run time: before markets open.

Trade Republic support currently lists stock/ETF/bond trading hours as weekdays from 07:30 to 23:00 CET, while crypto trades 24/7. For the MVP, schedule advice at 07:00 Europe/Berlin on weekdays, before Trade Republic stock/ETF trading starts. Crypto advice can be included in the same morning run, but the scheduler should still run weekdays only unless this is changed later.

The schedule must be editable in the system editor without code changes.

## Previous Advice Context

Previous advice should be part of every new AI run, but it should be compact.

Store these fields for every advice run:

- prompt version
- flattened prompt text
- input snapshot JSON
- output advice JSON
- quote timestamps
- generated recommendations
- user decisions: accepted, edited, partially accepted, skipped, or unavailable
- actual trades created from the advice
- differences between suggested quantity/price and actual quantity/price

Send this context to the AI:

- Current portfolio snapshot.
- Yesterday's advice run, always included if available.
- Last 10 advice summaries.
- Last 30 actual transactions.
- Any recommendations still pending or skipped.
- Assets marked unavailable on Trade Republic.
- A compact "what happened after previous advice" list:
  - suggested buy/sell
  - user accepted/edited/skipped
  - actual trade quantity/price/fee if done
  - resulting portfolio change

Prompt goal:

- Avoid flip-flopping without a clear reason.
- Explain when today reverses yesterday's advice.
- Learn from unavailable Trade Republic assets.
- Keep cash, fees, and actual portfolio state consistent with confirmed trades, not old suggestions.

## AI Prompt Contract

The prompt should tell the model:

- This is decision support, not automatic trading.
- Use only the provided portfolio and quote data for calculations.
- Treat stale or missing quotes as a risk and do not invent current prices.
- Trade Republic fee is `1.00 EUR` per buy or sell transaction.
- A buy is affordable only if `cash >= shares * price + 1.00`.
- A sell produces usable cash of `shares * price - 1.00`, before any tax assumptions.
- If a recommendation requires selling first, explicitly mark it as a linked sell-to-fund-buy plan.
- Do not recommend buying more than available cash after fees.
- Prefer fewer, higher-conviction trades because the 1 EUR fee matters.
- There is no hard maximum trade count, but every trade should have enough expected value to justify its fee.
- Respect the configured minimum trade size if one is set.
- Respect the configured maximum cash deployment percentage if one is set.
- Consider previous advice and actual confirmed trades to avoid flip-flopping.
- Decide whether cash should be kept uninvested, partly invested, or fully invested; explain why.
- Only recommend asset types currently enabled in the system editor.
- By default, only stocks and ETFs are enabled.
- By default, crypto is disabled.
- If crypto is enabled, treat crypto as an equal candidate beside stocks and ETFs.
- Ignore German taxes for the MVP.
- The model may recommend selling 100% of a position if the reason is strong.
- Prefer assets likely available on Trade Republic; mark any availability uncertainty.
- Explain every buy/sell in short plain English.
- Include a confidence level and main risk for each recommendation.
- Include a `no_trade_reason` when the best action is to hold.

Structured output shape:

```json
{
  "schema_version": "1",
  "summary": "Short overall advice.",
  "cash_after_plan": 0,
  "cash_position_reason": "Short explanation.",
  "estimated_total_fees": 0,
  "recommendations": [
    {
      "client_recommendation_id": "rec_1",
      "action": "buy",
      "asset_type": "stock",
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "isin": "US0378331005",
      "quantity": 0,
      "estimated_price": 0,
      "price_currency": "EUR",
      "estimated_gross_amount": 0,
      "estimated_fee": 1,
      "estimated_cash_effect": 0,
      "trade_republic_availability": "likely",
      "uses_fractional_quantity": true,
      "linked_recommendation_ids": [],
      "reason": "Short explanation.",
      "risk": "Main risk.",
      "confidence": "low"
    }
  ],
  "hold_notes": [
    {
      "symbol": "MSFT",
      "reason": "Short explanation."
    }
  ],
  "warnings": [
    "Missing quote for XYZ, so no recommendation was made."
  ],
  "benchmark": {
    "benchmark_symbol": "EUNL",
    "benchmark_name": "iShares Core MSCI World ETF",
    "comparison_summary": "Short comparison of the proposed portfolio stance against the benchmark.",
    "relative_risk": "similar",
    "relative_diversification": "less diversified",
    "reason": "Short explanation."
  }
}
```

The backend should still validate affordability after receiving the model response.

Backend validation should also enforce:

- Enabled asset types.
- Minimum trade size.
- Maximum cash deployment percentage.
- Fractional-share setting and minimum increment.
- Sell quantity cannot exceed current position quantity.
- Buy quantity cannot exceed available cash after fees.

## Parsable Advice Contract

The AI advice must be easy for the system to turn into UI rows and editable trade confirmations.

Implementation:

- Use OpenAI Structured Outputs through the Responses API with a strict JSON schema.
- Define the schema in TypeScript with Zod first.
- Generate the JSON schema from the Zod schema or keep the JSON schema and Zod schema side by side.
- Require `additionalProperties: false`.
- Require all fields needed by the UI.
- Avoid a root-level `anyOf`; use a root object with arrays of recommendation objects.
- Parse and validate the response before saving it.
- If parsing or validation fails, mark the run as failed and do not notify the user as if advice is ready.
- Normalize the model output into `trade_recommendations` rows.

Recommended normalized recommendation fields:

- `id`
- `advice_run_id`
- `portfolio_id`
- `action`: `buy`, `sell`, `hold`, or `watch`
- `asset_type`: `stock`, `etf`, or `crypto`
- `symbol`
- `name`
- `isin`
- `provider_symbol`
- `trade_republic_availability`
- `suggested_quantity`
- `suggested_price`
- `price_currency`
- `suggested_gross_amount`
- `suggested_fee`
- `suggested_cash_effect`
- `reason`
- `risk`
- `confidence`
- `status`: `pending`, `accepted`, `edited`, `partial`, `skipped`, or `unavailable`
- `created_transaction_id`

This gives the UI a clean list like:

- Buy AAPL, 0.5 shares, estimated 95 EUR plus 1 EUR fee.
- Sell TSLA, 1 share, estimated 210 EUR minus 1 EUR fee.
- Hold MSFT, reason only.

The user should not have to copy anything manually from prose.

Benchmark section:

- Add a benchmark object to each advice run.
- Default benchmark should be an MSCI World ETF-like proxy if quote coverage is available.
- If benchmark data is missing, still include a short qualitative benchmark note and mark the data as unavailable.
- The benchmark section is informational and should not create trades by itself.

## Actual Trade Confirmation

Under the advice, add a button:

```text
Input actual trades
```

The confirmation screen should show each recommendation with:

- Done/skipped/edited status.
- Actual transaction date.
- Actual quantity.
- Actual price.
- Actual currency.
- Actual fee, default `1.00 EUR`.
- Actual trade total, calculated live.
- Difference from the AI recommendation.
- Notes.

When saved:

- Insert actual records into `trade_transactions`.
- Recalculate `trade_positions`.
- Recalculate cash balances.
- Mark each recommendation as `accepted`, `partial`, `edited`, or `skipped`.
- Store the delta between AI suggestion and actual trade for future context.

The portfolio must be updated from actual trades only. AI recommendations should never mutate holdings directly.

Accept/edit workflow:

1. Advice page shows structured recommendations as cards or table rows.
2. User clicks `Input actual trades`.
3. Each buy/sell row becomes an editable confirmation form prefilled from AI advice.
4. User can:
   - accept as suggested
   - change quantity
   - change actual price
   - change fee
   - mark partially done
   - skip
   - mark unavailable on Trade Republic
5. The form shows cash impact before saving.
6. Save creates actual `trade_transactions`.
7. Portfolio positions and cash are recalculated from transactions.
8. Recommendation statuses are updated.
9. The next AI prompt receives both the original advice and what was actually done.

Important validation:

- The UI can allow edits, but the backend must reject impossible transactions.
- A sell cannot exceed the current holding quantity.
- A buy cannot exceed available cash after fees.
- Quantity must respect the active fractional-share increment unless that rule is overridden.
- If a recommendation is marked unavailable, the asset is added to the editable unavailable list.

## OpenAI API Design

Use the same Responses API pattern already used in `scripts/lib/openai.ts`.

Recommended first model:

- `gpt-5.4-mini` for lower cost and good structured reasoning.

Optional stronger model:

- `gpt-5.5` if recommendation quality matters more than cost.

The OpenAI docs currently recommend the Responses API for direct model requests, and structured outputs are the right fit because the app needs validated JSON rather than free-form prose.

Budget:

- Target monthly budget: about `5 EUR`.
- This feature is text-only, so normal daily runs should be comfortably below that unless there are many manual test runs, retries, or stronger-model experiments.
- Store token usage for every advice run and show approximate monthly usage in the system editor.
- Add a soft monthly budget guard:
  - warn at 3 EUR estimated usage
  - require manual confirmation for extra runs after 5 EUR estimated usage
  - keep scheduled runs active unless the user explicitly disables them

## Web Search Cost And Scope

The OpenAI API can use web search through the Responses API, but it is not free.

Current OpenAI pricing checked:

- Web search tool call: `10 USD / 1,000 calls`, plus search content tokens billed at the selected model's input-token rate.
- Web search preview with non-reasoning models: `25 USD / 1,000 calls`, with search content tokens free.
- The Responses API itself is not priced separately; model input/output tokens are billed at the selected model's token rates.

Practical estimate for this trading project:

- 1 web search call per weekday run: about `0.01 USD` per run before model tokens.
- 3 web search calls per weekday run: about `0.03 USD` per run before model tokens.
- With `gpt-5.4-mini`, the normal text tokens for a compact daily run should usually be only a few cents or less.
- A reasonable weekday-only monthly estimate is roughly `1-4 USD/month` for light-to-normal web-search usage, plus some extra for manual `Run advice now` tests.
- The `5 EUR/month` soft budget is realistic if the system avoids heavy per-ticker searches and limits manual test runs.

Recommended daily search scope:

- Do not search the internet separately for every possible stock.
- Use a two-stage process:
  1. Web-search context run: collect concise market/news context and sources.
  2. Structured advice run: use portfolio, quotes, previous advice, actual trades, and the saved news context to produce strict JSON advice.
- Search topics for the context run:
  - broad pre-market market news
  - major Europe/US macro items
  - news for current holdings and any candidate assets
  - crypto market context only when crypto is enabled
- Target scope:
  - light mode: 1-2 web search calls, 5-10 source snippets
  - normal mode: 3-5 web search calls, 10-20 source snippets
  - heavy mode: disabled by default; per-ticker research is too expensive and noisy for the MVP

Store for every search-backed advice run:

- search mode: none, light, normal, or heavy
- search queries used
- source URLs/titles returned
- compact news summary sent into the advice prompt
- token/tool-call usage

The advice page should show that the news context is source-backed, but also make clear that it is not exhaustive market research.

Important: OpenAI should receive a compact portfolio snapshot and recent history, not the entire database forever. Start with:

- Current snapshot.
- Last 10 advice runs.
- Last 30 actual transactions.
- Any user risk settings.

## Notifications

The existing Web Push setup can be reused, but trading notifications should be scoped separately.

Notification payload:

- Title: `Daily trade advice is ready`
- Body: `Your trading advice is ready.`
- URL: `/trades/advice`

The trading site needs a separate subscription button because browser push subscriptions are tied to the site origin and the user should control trading notifications separately from daily content notifications.

## Safety And Product Guardrails

Required guardrails:

- No automatic trading.
- Clear "not financial advice" language in the trading area.
- Human confirmation required for every actual trade.
- Backend affordability checks after AI output.
- Quote staleness checks.
- Cash affordability enforced outside the model.
- Fee calculation enforced outside the model.
- Active asset-type allowlist enforced outside the model.
- Hard platform support enforced outside the model, even if custom prompt text asks for something unsupported.
- Active fractional-share increment enforced outside the model.
- Active minimum trade size and maximum cash deployment settings enforced outside the model.
- Trade Republic availability status shown clearly when not confirmed.
- Never expose OpenAI or market-data API keys to the browser.
- Store prompts and outputs for auditability.
- Keep deleted/edited transaction history auditable rather than silently overwriting it.

Recommended risk settings:

- Maximum single position weight.
- Maximum daily turnover.
- Whether the AI may suggest new symbols outside current holdings.
- Whether ETFs are allowed.
- Whether crypto is allowed.
- Maximum percentage of cash that can be invested in one run.
- Minimum order size.
- Fractional-share increment.

## Build Phases

Phase 1: planning and schema

- Add trading plan document.
- Confirm `/trades` as the route.
- Decide quote provider.
- Decide starting risk rules.
- Create D1 migration for trading tables.

Phase 2: protected trading shell

- Add `TRADES_PASSWORD`.
- Add protected trading route/app shell.
- Add start portfolio wizard.
- Add portfolio editor.
- Add pasted text input import and review flow.
- Add remembered device login and `Log in as different user`.
- Add manual portfolio save/load APIs.
- Add manual deposit and withdrawal transaction types.
- Add system editor shell for schedule and rule settings.

Phase 3: quote data and analytics

- Add Stooq and ECB clients first because they require no payment details.
- Add Twelve Data, EODHD, and CoinGecko clients as optional key-backed providers.
- Implement the quote provider chain.
- Cache quotes in D1.
- Add quote freshness/staleness display.
- Add editable provider symbol mapping.
- Add portfolio snapshot calculations.
- Add Recharts analytics panels.

Phase 4: AI advice generation

- Add trading prompt builder.
- Add prompt profile editor with setting-linked prompt blocks.
- Add full editable prompt preview with markers, override states, per-setting reactivation, and reset behavior.
- Add structured output schema and Zod validator.
- Normalize valid advice into `trade_recommendations`.
- Add previous-advice context builder.
- Add full prompt/response archive logging.
- Add audit search and text/Markdown export.
- Add benchmark comparison section to advice output.
- Add daily trading generator script.
- Add manual `Run advice now` action.
- Store advice runs and recommendations.
- Add advice page.

Phase 5: actual trade workflow

- Add "Input actual trades" flow.
- Update positions and cash from confirmed trades.
- Feed previous advice and actual trade deltas into future prompts.

Phase 6: notifications

- Add trading subscription button.
- Store trading subscriptions separately.
- Send push notifications after advice generation.

Phase 7: future multi-user support

- Add real users and sessions.
- Add separate portfolio areas.
- Add one password per user, where the password selects the user area.
- Remember device login for 30 days.
- Add per-user notification subscriptions.

## Implementation Blueprint

This section turns the plan into concrete code work.

### Migration

Add a new migration:

```text
migrations/0005_trades.sql
```

Tables to create in the first implementation:

- `trade_users`
- `trade_portfolios`
- `trade_sessions`
- `trade_settings`
- `trade_prompt_profiles`
- `trade_prompt_blocks`
- `trade_cash_balances`
- `trade_positions`
- `trade_transactions`
- `trade_imports`
- `trade_market_quotes`
- `trade_candidate_assets`
- `trade_unavailable_assets`
- `trade_portfolio_snapshots`
- `trade_news_contexts`
- `trade_advice_runs`
- `trade_ai_logs`
- `trade_ai_log_parts`
- `trade_recommendations`
- `trade_push_subscriptions`
- `trade_audit_exports`

Seed defaults:

- user id: `max`
- portfolio name: `Max`
- base currency: `EUR`
- broker fee: `1.00`
- schedule time: `07:00`
- schedule timezone: `Europe/Berlin`
- weekdays only: `1`
- risk profile: `balanced`
- stocks enabled: `1`
- ETFs enabled: `1`
- crypto enabled: `0`
- max cash deployment: `100`
- minimum trade size: `25`
- fractional increment: `0.5`
- web search mode: `light`

Indexes:

- portfolio/date indexes on snapshots, advice runs, AI logs, recommendations, transactions
- symbol/provider indexes on quotes and candidate assets
- status indexes on recommendations and advice runs
- search helper indexes on `trade_ai_log_parts(part_type, created_at)` and `trade_ai_logs(call_type, created_at)`

### Shared Types And Helpers

Add shared backend types:

```text
functions/_lib/trades/types.ts
functions/_lib/trades/auth.ts
functions/_lib/trades/response.ts
functions/_lib/trades/settings.ts
functions/_lib/trades/portfolio.ts
functions/_lib/trades/validation.ts
```

Add frontend API types/functions:

```text
src/trades/types.ts
src/trades/api.ts
src/trades/session.ts
src/trades/parser.ts
src/trades/promptBlocks.ts
```

Use Zod schemas for:

- pasted portfolio parse result
- settings save input
- prompt profile save input
- structured AI advice output
- actual trade confirmation input
- quote row normalization

### Pages Functions

Add Pages Functions under:

```text
functions/api/trades/
```

Recommended routes:

- `POST /api/trades/login`
  Validates password, creates a 30-day session, returns portfolio/user info.
- `POST /api/trades/logout`
  Clears current session.
- `GET /api/trades/session`
  Checks remembered session.
- `GET /api/trades/portfolio`
  Returns cash, positions, quote status, and latest snapshot.
- `POST /api/trades/import/parse`
  Parses pasted text and returns editable draft rows.
- `POST /api/trades/import/commit`
  Saves reviewed import as positions/cash.
- `POST /api/trades/transactions`
  Adds manual deposits, withdrawals, buys, sells, dividends, fees, or adjustments.
- `GET /api/trades/settings`
  Loads schedule, prompt settings, limits, unavailable assets, provider mappings.
- `POST /api/trades/settings`
  Saves system editor settings.
- `POST /api/trades/prompt/render`
  Returns the flattened prompt text and setting-linked blocks.
- `POST /api/trades/prompt/save`
  Saves edited prompt blocks and overridden setting keys.
- `GET /api/trades/advice`
  Returns latest advice run and parsed recommendations.
- `POST /api/trades/advice/run`
  Manual `Run advice now`; calls a protected workflow/API path.
- `POST /api/trades/advice/:id/confirm`
  Saves accepted/edited/skipped/unavailable recommendations and creates actual transactions.
- `GET /api/trades/unavailable-assets`
  Lists unavailable Trade Republic assets.
- `POST /api/trades/unavailable-assets`
  Adds/removes unavailable assets.
- `GET /api/trades/audit`
  Searchable AI log list.
- `GET /api/trades/audit/:id`
  Full run details.
- `GET /api/trades/audit/export`
  Text/Markdown export.
- `POST /api/trades/subscribe`
  Store trading push subscription.

### Frontend Files

Add a route family under `/trades`:

```text
src/ui/pages/trades/TradesPage.tsx
src/ui/pages/trades/TradesLogin.tsx
src/ui/pages/trades/TradesDashboard.tsx
src/ui/pages/trades/TradesImport.tsx
src/ui/pages/trades/TradesPortfolioEditor.tsx
src/ui/pages/trades/TradesAdvice.tsx
src/ui/pages/trades/TradesConfirmTrades.tsx
src/ui/pages/trades/TradesHistory.tsx
src/ui/pages/trades/TradesAnalytics.tsx
src/ui/pages/trades/TradesSystemEditor.tsx
src/ui/pages/trades/TradesAudit.tsx
src/ui/pages/trades/TradesSubscribe.tsx
```

Router updates:

- Extend `src/router.ts` with `/trades`, `/trades/advice`, `/trades/import`, `/trades/editor`, `/trades/audit`, and `/trades/settings`.
- Add a `Trades` nav button only if we want it visible from the main app shell.
- Remember the last selected trading subpage after login.

UI behavior:

- If no valid session exists, show `TradesLogin`.
- After login, show dashboard.
- Top bar includes `Log in as different user`.
- System editor is available from inside the trading area with no extra password.
- Advice cards are generated from `trade_recommendations`, not from prose.
- `Input actual trades` opens editable forms prefilled from recommendations.
- Audit page supports search, filter, view, and export.

### Generator Scripts

Add scripts:

```text
scripts/generate-trade-advice.ts
scripts/lib/trades/quotes.ts
scripts/lib/trades/stooq.ts
scripts/lib/trades/twelve-data.ts
scripts/lib/trades/eodhd.ts
scripts/lib/trades/coingecko.ts
scripts/lib/trades/ecb-fx.ts
scripts/lib/trades/snapshots.ts
scripts/lib/trades/news-context.ts
scripts/lib/trades/prompt.ts
scripts/lib/trades/openai.ts
scripts/lib/trades/advice-schema.ts
scripts/lib/trades/recommendations.ts
scripts/lib/trades/audit.ts
scripts/lib/trades/push.ts
```

Add package script:

```json
"generate:trades": "tsx scripts/generate-trade-advice.ts"
```

Generator flow:

1. Load trade settings and active portfolio.
2. Exit if not weekday unless manually forced.
3. Check local Berlin time and schedule.
4. Refresh quotes through the provider chain.
5. Build and save portfolio snapshot.
6. Build web-search context prompt.
7. Call OpenAI with web search enabled if search mode is not `none`.
8. Store full request/response in `trade_ai_logs`.
9. Build structured advice prompt using:
- current snapshot
- quote data
- benchmark comparison data
- news context
   - previous advice context
   - actual trade history
   - unavailable assets
   - rendered prompt profile
10. Call OpenAI with strict structured output.
11. Store full request/response in `trade_ai_logs`.
12. Validate response with Zod.
13. Normalize recommendations into `trade_recommendations`.
14. Store advice run status and usage.
15. Send push notification only after valid advice is saved.

### GitHub Actions

Add workflow:

```text
.github/workflows/trade-advice.yml
```

Schedule:

```text
0 5 * * 1-5
```

This is 07:00 Berlin during summer time. Because Berlin switches between CET and CEST, the script should still check `Europe/Berlin` local time and the configured schedule before generating. If exact 07:00 year-round matters, use two UTC schedules and let the script accept only the correct local time.

Workflow should run:

```bash
npm run generate:trades
```

Manual workflow dispatch should support:

- `force=true`
- `portfolio_id=max`

### Secrets And Config

Cloudflare Pages secrets:

```text
TRADES_PASSWORD=MAX
VAPID_PUBLIC_KEY=already set
```

GitHub Actions secrets:

```text
OPENAI_API_KEY
CLOUDFLARE_API_TOKEN
VAPID_PRIVATE_KEY
VAPID_CONTACT_EMAIL
TWELVE_DATA_API_KEY optional
EODHD_API_KEY optional
COINGECKO_API_KEY optional
```

No secret needed:

- Stooq
- ECB FX reference rates

Environment variables:

```text
TRADES_DEFAULT_PASSWORD=MAX
TRADES_DEFAULT_PORTFOLIO_ID=max
TRADES_DEFAULT_TIMEZONE=Europe/Berlin
TRADES_DEFAULT_RUN_TIME=07:00
TRADES_PUBLIC_SITE_URL=https://daily-content.pages.dev
```

### What Codex Can Implement Directly

I can implement:

- D1 migration and seeded defaults.
- `/trades` frontend pages and router.
- Password/session flow.
- Plain text portfolio parser and review UI.
- Portfolio editor, transactions, and cash corrections.
- Settings/system editor.
- Prompt block renderer/editor and reset/reactivate behavior.
- Quote cache and provider-chain structure.
- Stooq and ECB clients without API keys.
- Optional provider clients that read keys if present.
- OpenAI web-context and structured-advice calls.
- Full prompt/response audit logging.
- Audit search and text/Markdown export.
- Structured advice cards.
- Accept/edit/skip/unavailable trade confirmation flow.
- Position/cash recalculation from actual transactions.
- Trading push notifications.
- GitHub Actions workflow.
- Local build/typecheck fixes.

### What You Need To Provide Or Do

Required before production use:

1. Done: `TRADES_PASSWORD=MAX` is set as a Cloudflare Pages production secret.
2. Done by inference: `OPENAI_API_KEY` is available in GitHub Actions because the latest daily generation job did not skip and completed the generation step.
3. Done by inference: the Cloudflare API token is available to GitHub Actions because the latest deploy workflow did not skip and completed the deploy step.
4. Add or confirm `VAPID_PRIVATE_KEY` and `VAPID_CONTACT_EMAIL` if you want push notifications.
5. Enter the starting portfolio through the new text import screen.
6. Confirm provider symbol mappings for any assets the free quote sources cannot match confidently.

Optional:

1. Create a free CoinGecko Demo API key if crypto support is enabled.
2. Create a free EODHD API key if Stooq/Twelve Data coverage is insufficient.
3. Create a Twelve Data key only if it does not require payment info and coverage is useful.
4. Provide a small candidate asset list if you want the AI to choose from a known Trade Republic universe.

Do not paste long-lived API secrets into chat if you can avoid it. Put them directly into Cloudflare or GitHub secrets.

### Verification Plan

Local verification:

```powershell
npm.cmd run build
npm.cmd run db:migrate:local
npm.cmd run cf:dev
```

Functional checks:

- `/trades` shows login.
- `MAX` logs into portfolio `Max`.
- Session persists and expires after 30 days.
- `Log in as different user` clears the session.
- Text import parses sample portfolio and uncertain rows remain editable.
- Portfolio editor saves and reloads holdings.
- Quote refresh stores provider, symbol, price, currency, timestamp.
- System editor renders prompt blocks and marks edited settings overridden.
- `Reset all` regenerates prompt text from current settings.
- `Run advice now` creates an advice run.
- AI request and response appear in audit search.
- Export produces a readable text/Markdown file.
- Advice recommendations render as buy/sell/hold cards.
- Confirming actual trades updates cash and positions.
- Marking unavailable updates the editable unavailable list.
- Push notification sends only after valid advice is saved.

Production checks:

- Done: apply remote D1 migration.
- Done: add `TRADES_PASSWORD` Cloudflare Pages secret.
- Done by inference: confirm required OpenAI and Cloudflare GitHub secrets from successful workflow steps.
- Deploy Pages.
- Run trade advice workflow manually.
- Confirm `/trades/audit` shows both web-context and advice JSON calls.
- Confirm scheduled workflow runs only weekdays.

## Ready To Implement

I am ready to implement this after you confirm the remaining questions below.

The first implementation should be done in this order:

1. Database migration and backend types.
2. `/trades` login/session shell.
3. Portfolio import/editor and transaction recalculation.
4. System editor and prompt block renderer.
5. Audit log/search/export.
6. Quote provider chain.
7. OpenAI web context and structured advice generator.
8. Advice cards and actual-trade confirmation.
9. Push notifications and GitHub schedule.

## Questions To Clarify

No blocking product questions remain for the first implementation.

Nice-to-have decisions can still be tuned during implementation:

- Exact MSCI World ETF symbol/provider mapping for the benchmark.
- Whether the first screen should show the `Trades` nav button in the main app header or hide it behind a direct `/trades` URL.
- Whether web search starts in `light` mode or `normal` mode.

## References Checked

- OpenAI text generation guide: https://developers.openai.com/api/docs/guides/text
- OpenAI structured outputs guide: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI web search guide: https://platform.openai.com/docs/guides/tools-web-search
- OpenAI API pricing: https://openai.com/api/pricing/
- OpenAI Responses API reference: https://developers.openai.com/api/reference/resources/responses/methods/create
- Stooq free historical data: https://stooq.com/db/h/
- Twelve Data pricing: https://twelvedata.com/pricing
- EODHD quick start and free API plan: https://eodhd.com/financial-apis/quick-start-with-our-financial-data-apis/
- CoinGecko API pricing: https://www.coingecko.com/en/api/pricing
- ECB euro foreign exchange reference rates: https://www.ecb.europa.eu/stats/exchange/eurofxref/html/index.en.html
- Alpha Vantage support and limits: https://www.alphavantage.co/support/
- Polygon.io pricing: https://polygon.io/pricing/
- Marketstack pricing: https://marketstack.com/pricing
- Finnhub API docs: https://api.finnhub.io/docs/api/rate-limit
- Finnhub pricing: https://finnhub.io/pricing
- Trade Republic stock trading support: https://support.traderepublic.com/en-be/1346-Which-stocks-can-I-trade-at-Trade-Republic
- Trade Republic ETF trading support: https://support.traderepublic.com/en-be/42
- Trade Republic crypto support: https://support.traderepublic.com/en-be/1488-Which-crypto-can-I-trade-at-Trade-Republic
- Trade Republic trading hours support: https://support.traderepublic.com/en-gr/759-Quelles-sont-les-heures-de-trading-
- Recharts GitHub: https://github.com/recharts/recharts
- Recharts docs: https://recharts.github.io/
- TanStack Table GitHub: https://github.com/TanStack/table
- Portfolio Performance GitHub: https://github.com/portfolio-performance/portfolio
- Ghostfolio GitHub/project listing: https://github.com/ghostfolio/ghostfolio
