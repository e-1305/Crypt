// Audit hook for live API calls: one crypt-audit.log line per request, written before the request is sent.
// It records method and path only (never headers, bodies or the token). A failed write throws, so the request is not sent.
import { audit } from "../src/common/agent.js";
import type { Io } from "../src/common/io.js";
import type { AuditLine } from "./github-client.js";

export function apiAuditHook(io: Io, auditPath: string, now: () => Date = () => new Date()): (line: AuditLine) => void {
  return ({ method, path }) => audit(io, auditPath, now, "live-api", "-", "API_CALL", `${method} ${path}`);
}
