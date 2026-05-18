import type { Env } from "./types";

export interface FunctionContext<Params extends Record<string, unknown> = Record<string, unknown>> {
  env: Env;
  request: Request;
  params: Params;
  waitUntil: (promise: Promise<unknown>) => void;
}

