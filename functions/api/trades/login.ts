import type { FunctionContext } from "../../_lib/context";
import { errorResponse, jsonResponse, readJson } from "../../_lib/response";
import { createTradeSession, tradesPasswordMatches } from "../../_lib/trades";

export const onRequestPost = async ({ env, request }: FunctionContext) => {
  const body = await readJson<{ password?: string }>(request);
  if (!tradesPasswordMatches(env, body.password)) {
    return errorResponse(401, "bad_trades_password", "Trading password is incorrect.");
  }

  const session = await createTradeSession(env, request);
  return jsonResponse({
    ok: true,
    token: session.token,
    expiresAt: session.expiresAt,
    user: { id: "max", label: "Max" },
    portfolio: { id: "max", name: "Max", baseCurrency: "EUR" }
  });
};
