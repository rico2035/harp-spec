/**
 * Self-healing errors. A HARP service returns machine-actionable error bodies
 * so an agent can fix itself (obtain a scope, accept the BAA, raise proofing)
 * without a human. This module parses those bodies into a typed error.
 */

export type HarpRemediationKind =
  | "obtain_scope"
  | "accept_baa"
  | "raise_proofing"
  | "register"
  | "retry"
  | "unknown";

export interface HarpRemediation {
  kind: HarpRemediationKind;
  /** Human-readable instruction. */
  message: string;
  /** Scope that must be obtained, when kind is obtain_scope. */
  scope?: string;
  /** Endpoint the agent should call to remediate (e.g. accept_endpoint). */
  endpoint?: string;
  /** Any extra machine-readable hints from the service. */
  details?: Record<string, unknown>;
}

export class HarpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly remediation: HarpRemediation;

  constructor(status: number, code: string, remediation: HarpRemediation) {
    super(remediation.message || code);
    this.name = "HarpError";
    this.status = status;
    this.code = code;
    this.remediation = remediation;
  }
}

/**
 * Build a HarpError from an HTTP response. Reads the JSON body and the
 * WWW-Authenticate header to infer the remediation.
 */
export async function harpErrorFromResponse(res: Response): Promise<HarpError> {
  let body: Record<string, unknown> = {};
  try {
    body = (await res.clone().json()) as Record<string, unknown>;
  } catch {
    // Non-JSON body, fall back to header parsing only.
  }

  const code = String(body.error ?? `http_${res.status}`);
  const wwwAuth = res.headers.get("WWW-Authenticate") ?? "";
  const remediation = inferRemediation(res.status, code, body, wwwAuth);
  return new HarpError(res.status, code, remediation);
}

function inferRemediation(
  status: number,
  code: string,
  body: Record<string, unknown>,
  wwwAuth: string,
): HarpRemediation {
  const message =
    typeof body.error_description === "string"
      ? body.error_description
      : typeof body.message === "string"
        ? body.message
        : code;

  if (code === "baa_required" || /baa/i.test(wwwAuth)) {
    return {
      kind: "accept_baa",
      message,
      endpoint:
        typeof body.accept_endpoint === "string" ? body.accept_endpoint : undefined,
      details: body,
    };
  }

  if (code === "insufficient_scope" || /insufficient_scope/.test(wwwAuth)) {
    const scope =
      typeof body.required_scope === "string"
        ? body.required_scope
        : parseScopeFromHeader(wwwAuth);
    return { kind: "obtain_scope", message, scope, details: body };
  }

  if (code === "insufficient_proofing") {
    return { kind: "raise_proofing", message, details: body };
  }

  if (status === 401) {
    return { kind: "register", message, details: body };
  }

  return { kind: "unknown", message, details: body };
}

function parseScopeFromHeader(wwwAuth: string): string | undefined {
  const match = /scope="([^"]+)"/.exec(wwwAuth);
  return match?.[1];
}
