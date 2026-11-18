// POST the gazette payload to a webhook. Errors never carry the URL or the response body.
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal; redirect: "error" }) => Promise<{ ok: boolean; status: number }>;

export const SEND_TIMEOUT_MS = 10_000;

export interface SendInput {
  payload: unknown;
  url: string;
  /** The caller injects fetch, so this module holds no network client. */
  fetchImpl: FetchLike;
  timeoutMs?: number;
}

export function isHttpsUrl(u: string): boolean {
  try {
    return new URL(u).protocol === "https:";
  } catch {
    return false;
  }
}

/** Sends once. Nothing is retried. Throws an Error whose message holds no URL and no response body. */
export async function sendGazette(input: SendInput): Promise<void> {
  if (!isHttpsUrl(input.url)) throw new Error("the webhook URL is not a secure (TLS) URL. Nothing was sent.");
  const f = input.fetchImpl;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), input.timeoutMs ?? SEND_TIMEOUT_MS);
  try {
    const res = await f(input.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input.payload), signal: ctl.signal, redirect: "error" });
    if (!res.ok) throw new Error(`the webhook answered HTTP ${Number.isInteger(res.status) ? res.status : "?"}. Nothing was retried.`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("the webhook answered")) throw e;
    throw new Error(ctl.signal.aborted ? "the webhook did not answer in time. Nothing was retried." : "the webhook could not be reached. Nothing was retried.");
  } finally {
    clearTimeout(timer);
  }
}
