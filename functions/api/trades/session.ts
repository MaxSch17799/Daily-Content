import type { FunctionContext } from "../../_lib/context";
import { jsonResponse } from "../../_lib/response";
import { isTradeSession, requireTradeSession } from "../../_lib/trades";

export const onRequestGet = async ({ env, request }: FunctionContext) => {
  const session = await requireTradeSession(env, request);
  if (!isTradeSession(session)) {
    return session;
  }

  return jsonResponse({
    ok: true,
    user: { id: session.userId, label: session.userId === "max" ? "Max" : session.userId },
    portfolio: { id: session.portfolioId, name: session.portfolioId === "max" ? "Max" : session.portfolioId }
  });
};
