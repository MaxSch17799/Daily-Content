import webpush from "web-push";
import type { CloudflareD1Client } from "../cloudflare-d1";

export async function sendTradePush({
  d1,
  portfolioId,
  publicKey,
  privateKey,
  contactEmail,
  siteUrl
}: {
  d1: CloudflareD1Client;
  portfolioId: string;
  publicKey: string;
  privateKey: string;
  contactEmail: string;
  siteUrl: string;
}): Promise<void> {
  if (!publicKey || !privateKey) {
    return;
  }
  webpush.setVapidDetails(`mailto:${contactEmail}`, publicKey, privateKey);
  const subscriptions = await d1.query<{ id: string; subscription_json: string }>(
    "SELECT id, subscription_json FROM trade_push_subscriptions WHERE portfolio_id = ? AND enabled = 1 LIMIT 100",
    [portfolioId]
  );
  for (const row of subscriptions.results) {
    try {
      await webpush.sendNotification(
        JSON.parse(row.subscription_json),
        JSON.stringify({
          title: "Daily trade advice is ready",
          body: "Your trading advice is ready.",
          url: `${siteUrl.replace(/\/$/, "")}/trades/advice`
        })
      );
      await d1.query("UPDATE trade_push_subscriptions SET last_success_at = ?, failure_count = 0, updated_at = ? WHERE id = ?", [
        new Date().toISOString(),
        new Date().toISOString(),
        row.id
      ]);
    } catch {
      await d1.query("UPDATE trade_push_subscriptions SET failure_count = failure_count + 1, updated_at = ? WHERE id = ?", [
        new Date().toISOString(),
        row.id
      ]);
    }
  }
}
