import webpush from "web-push";
import type { CloudflareD1Client } from "./cloudflare-d1";

interface PushSubscriptionRow {
  id: string;
  subscription_json: string;
}

export async function sendPushNotifications({
  d1,
  publicKey,
  privateKey,
  contactEmail,
  payload
}: {
  d1: CloudflareD1Client;
  publicKey: string;
  privateKey: string;
  contactEmail: string;
  payload: {
    title: string;
    body: string;
    url: string;
    image?: string;
  };
}): Promise<{ attempted: number; succeeded: number; failed: number }> {
  if (!publicKey || !privateKey) {
    console.log("VAPID keys missing; skipping notifications.");
    return { attempted: 0, succeeded: 0, failed: 0 };
  }

  webpush.setVapidDetails(`mailto:${contactEmail}`, publicKey, privateKey);

  const subscriptions = await d1.query<PushSubscriptionRow>(
    "SELECT id, subscription_json FROM push_subscriptions WHERE enabled = 1 LIMIT 100"
  );

  let succeeded = 0;
  let failed = 0;

  for (const row of subscriptions.results) {
    try {
      await webpush.sendNotification(JSON.parse(row.subscription_json), JSON.stringify(payload));
      succeeded += 1;
      await d1.query("UPDATE push_subscriptions SET last_success_at = ?, failure_count = 0, updated_at = ? WHERE id = ?", [
        new Date().toISOString(),
        new Date().toISOString(),
        row.id
      ]);
    } catch (error) {
      failed += 1;
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) {
        await d1.query("UPDATE push_subscriptions SET enabled = 0, failure_count = failure_count + 1, updated_at = ? WHERE id = ?", [
          new Date().toISOString(),
          row.id
        ]);
      } else {
        await d1.query("UPDATE push_subscriptions SET failure_count = failure_count + 1, updated_at = ? WHERE id = ?", [
          new Date().toISOString(),
          row.id
        ]);
      }
      console.warn(`Push notification failed for ${row.id}:`, error);
    }
  }

  return {
    attempted: subscriptions.results.length,
    succeeded,
    failed
  };
}

