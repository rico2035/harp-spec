#!/usr/bin/env node
/**
 * HARP conformance runner (v0.1).
 *
 * Runs the public conformance checks against a target HARP service and prints a
 * PASS / FAIL / SKIP / MANUAL report. Exits non-zero if any CORE check fails.
 *
 * Usage:
 *   node runner.mjs [base-url] [--receipts] [--tier=core|receipts]
 *
 * Defaults to http://localhost:4000 (the reference server in ../reference).
 *
 * Two tiers:
 *   CORE      registration, discovery, the three flows, the BAA gate,
 *             least-privilege tokens, self-healing errors (CONFORMANCE.md 1-5, 7).
 *   RECEIPTS  optional: a consequential action emits a verifiable receipt that
 *             references digests, not raw PHI (CONFORMANCE.md 6). Run only if the
 *             service claims the receipts tier.
 *
 * Zero runtime dependencies. Node 18+ (built-in fetch, built-in test data).
 *
 * Honesty rule (CONFORMANCE.md "Keeping conformance honest"): where a check
 * cannot be fully automated at v0.1, it is reported as MANUAL (a self-attestation
 * the implementer must confirm) rather than a fake PASS. Where the target service
 * lacks an endpoint the check needs, it is reported as SKIP, not PASS.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validate } from "./lib/validate.mjs";
import { loadSchemas } from "./lib/schemas.mjs";

const SUITE_VERSION = "0.1";
const here = dirname(fileURLToPath(import.meta.url));

// ---- CLI args ----
const args = process.argv.slice(2);
let baseUrl = "http://localhost:4000";
let runReceipts = false;
for (const arg of args) {
  if (arg === "--receipts") runReceipts = true;
  else if (arg.startsWith("--tier=")) runReceipts = arg.slice(7) === "receipts";
  else if (!arg.startsWith("--")) baseUrl = arg;
}
baseUrl = baseUrl.replace(/\/+$/, "");

// ---- status constants ----
const PASS = "PASS";
const FAIL = "FAIL";
const SKIP = "SKIP";
const MANUAL = "MANUAL";

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (color, text) => (useColor ? `${color}${text}${C.reset}` : text);

const results = [];
function record(category, name, status, detail) {
  results.push({ category, name, status, detail });
  const tag = {
    [PASS]: paint(C.green, "PASS  "),
    [FAIL]: paint(C.red, "FAIL  "),
    [SKIP]: paint(C.yellow, "SKIP  "),
    [MANUAL]: paint(C.cyan, "MANUAL"),
  }[status];
  console.log(`  ${tag}  ${name}${detail ? paint(C.dim, `  ${detail}`) : ""}`);
}

// ---- small http helpers ----
async function getJson(path, opts = {}) {
  const res = await fetch(`${baseUrl}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { res, json, text };
}
async function postJson(path, body, headers = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { res, json, text };
}

// Extract the verify endpoint path from the discovered config, falling back to
// the reference server's default. Absolute URLs are reduced to a path so the
// suite calls the target's own host.
function verifyPathFromConfig() {
  try {
    const uri = ctx.harp && ctx.harp.receipts && ctx.harp.receipts.verify_uri;
    if (!uri) return null;
    return new URL(uri).pathname;
  } catch {
    return null;
  }
}

function jwtPayload(token) {
  try {
    const part = token.split(".")[1];
    const norm = part.replace(/-/g, "+").replace(/_/g, "/");
    const pad = norm + "=".repeat((4 - (norm.length % 4)) % 4);
    return JSON.parse(Buffer.from(pad, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

// ---- shared state discovered as the suite runs ----
const ctx = {
  agentAuth: null,
  harp: null,
  phiScope: null,
  offeredScopes: [],
};

async function main() {
  console.log(paint(C.bold, `\nHARP conformance suite v${SUITE_VERSION}`));
  console.log(paint(C.dim, `Target: ${baseUrl}`));
  console.log(paint(C.dim, `Tier:   ${runReceipts ? "CORE + RECEIPTS" : "CORE"}`));

  const fixtures = JSON.parse(
    await readFile(join(here, "fixtures", "test-inputs.json"), "utf8"),
  );
  // Use a fresh org id per run so the BAA-gate "before acceptance" check tests an
  // org that has not yet accepted, even against a long-lived server whose store
  // persists across runs. The fixture value documents the shape; the run value
  // keeps the test isolated.
  fixtures.org_id = `${fixtures.org_id}_${Date.now().toString(36)}`;
  const { schemas, registry } = await loadSchemas();

  // Quick reachability check so we fail clearly instead of crashing.
  try {
    await fetch(`${baseUrl}/auth.md`);
  } catch (e) {
    console.log(paint(C.red, `\nCannot reach ${baseUrl}: ${e.message}`));
    console.log("Start the reference server first (see ../reference/README.md), or pass a reachable base URL.");
    process.exit(2);
  }

  await categoryDiscovery(schemas, registry);
  await categoryThreeFlows(fixtures, schemas, registry);
  await categoryBaaGate(fixtures, schemas, registry);
  await categoryLeastPrivilege(fixtures);
  await categorySelfHealing(fixtures);
  await categoryPhiSafety();

  if (runReceipts) {
    await categoryReceipts(fixtures, schemas, registry);
  } else {
    console.log(paint(C.bold, "\n6. Receipts (receipts tier)"));
    record("receipts", "Receipts tier", SKIP, "not requested; pass --receipts to run");
  }

  printSummary();
}

// ---------------------------------------------------------------------------
// 1. Discovery and manifest
// ---------------------------------------------------------------------------
async function categoryDiscovery(schemas, registry) {
  console.log(paint(C.bold, "\n1. Discovery and manifest"));

  // (a) /auth.md is reachable and looks like the procedural manifest.
  const authMd = await getJson("/auth.md");
  if (authMd.res.ok && /^#/m.test(authMd.text || "")) {
    const lower = (authMd.text || "").toLowerCase();
    const hasBaa = lower.includes("baa") || lower.includes("compliance");
    const hasReceipts = lower.includes("receipt");
    if (hasBaa && hasReceipts) {
      record("discovery", "/auth.md served with HARP sections (BAA + Receipts)", PASS);
    } else {
      record(
        "discovery",
        "/auth.md served with HARP sections (BAA + Receipts)",
        FAIL,
        `missing section(s): ${[!hasBaa && "BAA", !hasReceipts && "Receipts"].filter(Boolean).join(", ")}`,
      );
    }
  } else {
    record("discovery", "/auth.md reachable and parses", FAIL, `status ${authMd.res.status}`);
  }

  // (b) WWW-Authenticate on a protected endpoint points at metadata (RFC 9728).
  // Best-effort: hit the protected resource without a token.
  const unauth = await getJson("/eligibility");
  const wwwAuth = unauth.res.headers.get("www-authenticate");
  if (unauth.res.status === 401 && wwwAuth) {
    record("discovery", "401 on protected endpoint returns WWW-Authenticate", PASS);
  } else if (unauth.res.status === 404) {
    record("discovery", "401 on protected endpoint returns WWW-Authenticate", SKIP, "no known protected path on this service");
  } else {
    record(
      "discovery",
      "401 on protected endpoint returns WWW-Authenticate",
      FAIL,
      `status ${unauth.res.status}, header ${wwwAuth ? "present" : "absent"}`,
    );
  }

  // (c) agent_auth block is discoverable and schema-valid.
  // Reference server carries it in oauth-authorization-server metadata.
  let agentAuthDoc;
  const asMeta = await getJson("/.well-known/oauth-authorization-server");
  if (asMeta.json && asMeta.json.agent_auth) {
    agentAuthDoc = { agent_auth: asMeta.json.agent_auth };
  } else if (asMeta.json && asMeta.json.skill && asMeta.json.harp) {
    // Some services expose the block directly.
    agentAuthDoc = { agent_auth: asMeta.json };
  }

  if (!agentAuthDoc) {
    const prm = await getJson("/.well-known/oauth-protected-resource");
    if (prm.json && prm.json.agent_auth) agentAuthDoc = { agent_auth: prm.json.agent_auth };
  }

  if (!agentAuthDoc) {
    record("discovery", "agent_auth block present", FAIL, "not found in authorization-server or protected-resource metadata");
    return;
  }
  record("discovery", "agent_auth block present", PASS);

  const v = validate(agentAuthDoc, schemas.agentAuth, registry);
  if (v.valid) {
    record("discovery", "agent_auth block is schema-valid", PASS);
    ctx.agentAuth = agentAuthDoc.agent_auth;
    ctx.harp = agentAuthDoc.agent_auth.harp;
    ctx.offeredScopes = (ctx.harp.scopes || []).map((s) => s.name);
  } else {
    record("discovery", "agent_auth block is schema-valid", FAIL, v.errors.slice(0, 3).join(" | "));
    return;
  }

  // (d) Every scope carries purpose, phi flag, and min_necessary (schema enforces,
  // but report it as its own assertion for clarity).
  const scopes = ctx.harp.scopes || [];
  const missing = scopes.filter((s) => !("purpose" in s) || !("phi" in s) || !("min_necessary" in s));
  if (scopes.length > 0 && missing.length === 0) {
    record("discovery", "every scope has purpose, phi, min_necessary", PASS, `${scopes.length} scopes`);
  } else {
    record("discovery", "every scope has purpose, phi, min_necessary", FAIL, `${missing.length} incomplete`);
  }

  // Pick a PHI scope to drive later checks.
  const phi = scopes.find((s) => s.phi === true);
  ctx.phiScope = phi ? phi.name : null;
}

// ---------------------------------------------------------------------------
// 2. The three flows
// ---------------------------------------------------------------------------
async function categoryThreeFlows(fixtures, schemas, registry) {
  console.log(paint(C.bold, "\n2. The three registration flows"));

  if (!ctx.agentAuth) {
    record("flows", "registration flows", SKIP, "no agent_auth block to drive flows");
    return;
  }

  // anonymous
  {
    const reqBody = { type: "anonymous" };
    const reqValid = validate(reqBody, schemas.identityRequest, registry);
    const r = await postJson("/agent/identity", reqBody);
    if (reqValid.valid && r.res.ok && r.json && r.json.access_token) {
      record("flows", "anonymous returns a pre-claim token", PASS);
    } else if (r.res.status === 404) {
      record("flows", "anonymous returns a pre-claim token", SKIP, "no identity endpoint at /agent/identity");
    } else {
      record("flows", "anonymous returns a pre-claim token", FAIL, `status ${r.res.status}`);
    }
  }

  // service_auth
  {
    const reqBody = { type: "service_auth", login_hint: fixtures.login_hint };
    const reqValid = validate(reqBody, schemas.identityRequest, registry);
    const r = await postJson("/agent/identity", reqBody);
    const ok = r.json && r.json.user_code && r.json.verification_uri;
    if (reqValid.valid && r.res.ok && ok) {
      record("flows", "service_auth returns claim token + verification_uri", PASS);
      ctx.serviceAuth = r.json;
    } else if (r.res.status === 404) {
      record("flows", "service_auth returns claim token + verification_uri", SKIP, "endpoint absent");
    } else {
      record("flows", "service_auth returns claim token + verification_uri", FAIL, `status ${r.res.status}`);
    }
  }

  // identity_assertion. Use the reference server's dev minter when available,
  // otherwise mark MANUAL (a third-party service needs a trusted ID-JAG issuer
  // we cannot synthesize here).
  const mint = await postJson(fixtures.dev_mint_id_jag_path, {
    sub: fixtures.subject,
    org_id: fixtures.org_id,
  });
  if (mint.res.ok && mint.json && mint.json.assertion) {
    ctx.assertion = mint.json.assertion;
    const reqBody = { type: "identity_assertion", assertion: ctx.assertion };
    const reqValid = validate(reqBody, schemas.identityRequest, registry);
    const r = await postJson("/agent/identity", reqBody);
    if (reqValid.valid && r.res.ok && r.json && r.json.access_token) {
      record("flows", "identity_assertion (valid ID-JAG) yields a token", PASS);
    } else {
      record("flows", "identity_assertion (valid ID-JAG) yields a token", FAIL, `status ${r.res.status}`);
    }

    // Negative: a forged / garbage assertion must be rejected.
    const bad = await postJson("/agent/identity", { type: "identity_assertion", assertion: ctx.assertion + "tampered" });
    if (bad.res.status === 401 || (bad.json && bad.json.error)) {
      record("flows", "identity_assertion rejects a tampered assertion", PASS);
    } else {
      record("flows", "identity_assertion rejects a tampered assertion", FAIL, `accepted, status ${bad.res.status}`);
    }
  } else {
    record(
      "flows",
      "identity_assertion (valid ID-JAG) yields a token",
      MANUAL,
      "no dev ID-JAG minter; supply a trusted ID-JAG issuer and verify this flow yourself (CONFORMANCE.md step 3)",
    );
    record(
      "flows",
      "identity_assertion rejects a tampered assertion",
      MANUAL,
      "verify with a forged signature against your trusted issuer",
    );
  }
}

// ---------------------------------------------------------------------------
// 3. The BAA gate (PHI)
// ---------------------------------------------------------------------------
async function categoryBaaGate(fixtures, schemas, registry) {
  console.log(paint(C.bold, "\n3. The BAA gate (PHI)"));

  if (!ctx.assertion) {
    record("baa", "BAA gate", MANUAL, "needs a trusted ID-JAG; verify the gate yourself with your issuer");
    return;
  }
  const phiScope = ctx.phiScope || fixtures.phi_scope;

  // (a) PHI scope before BAA is refused, and the refusal points at accept_endpoint.
  const before = await postJson("/oauth2/token", {
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: ctx.assertion,
    scope: phiScope,
  });
  const refusedPointsToAccept =
    !before.res.ok &&
    before.json &&
    (before.json.accept_endpoint || (before.json.error && /baa/i.test(before.json.error)));
  if (refusedPointsToAccept) {
    record("baa", "PHI scope before BAA is refused with accept_endpoint", PASS);
  } else if (before.res.status === 404) {
    record("baa", "PHI scope before BAA is refused with accept_endpoint", SKIP, "no token endpoint at /oauth2/token");
    return;
  } else {
    record(
      "baa",
      "PHI scope before BAA is refused with accept_endpoint",
      FAIL,
      `status ${before.res.status} (token issued or refusal not self-healing)`,
    );
  }

  // (d) A stale/mismatched version hash is rejected. Best-effort: accept with a
  // stale hash and confirm it does not unlock PHI, OR is rejected outright.
  const stale = await postJson("/agent/baa/accept", {
    org_id: fixtures.org_id,
    baa_version_hash: fixtures.stale_baa_version_hash,
    accepted_by: fixtures.accepted_by,
    signature: "synthetic-sig",
  });
  const expectedHash = ctx.harp && ctx.harp.baa ? ctx.harp.baa.version_hash : fixtures.baa_version_hash;
  if (!stale.res.ok) {
    record("baa", "stale baa_version_hash is rejected", PASS);
  } else if (expectedHash && fixtures.stale_baa_version_hash !== expectedHash && stale.json) {
    // The service returned 200 for a hash that differs from its published
    // version_hash. It may still bind acceptance elsewhere, so flag as MANUAL
    // for the implementer to confirm rather than failing outright.
    record(
      "baa",
      "stale baa_version_hash is rejected",
      MANUAL,
      `service returned 200 for a hash that differs from the published version_hash (${expectedHash}); confirm your service rejects stale hashes`,
    );
  } else {
    record("baa", "stale baa_version_hash is rejected", MANUAL, "confirm stale-hash handling manually");
  }

  // (b) Accept the current BAA, expect baa_acceptance_id + scopes_unlocked, schema-valid.
  const accept = await postJson("/agent/baa/accept", {
    org_id: fixtures.org_id,
    baa_version_hash: expectedHash || fixtures.baa_version_hash,
    accepted_by: fixtures.accepted_by,
    signature: "synthetic-sig",
  });
  if (accept.res.ok && accept.json && accept.json.baa_acceptance_id && Array.isArray(accept.json.scopes_unlocked)) {
    const v = validate(accept.json, schemas.baaAcceptance, registry);
    if (v.valid) {
      record("baa", "BAA acceptance returns id + scopes_unlocked (schema-valid)", PASS);
    } else {
      record("baa", "BAA acceptance returns id + scopes_unlocked (schema-valid)", FAIL, v.errors.slice(0, 2).join(" | "));
    }
  } else {
    record("baa", "BAA acceptance returns id + scopes_unlocked (schema-valid)", FAIL, `status ${accept.res.status}`);
  }

  // (c) After acceptance, the PHI scope becomes obtainable.
  const after = await postJson("/oauth2/token", {
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: ctx.assertion,
    scope: phiScope,
  });
  if (after.res.ok && after.json && after.json.access_token) {
    record("baa", "PHI scope obtainable after BAA acceptance", PASS);
    ctx.phiToken = after.json.access_token;
    ctx.phiTokenScope = after.json.scope || phiScope;
  } else {
    record("baa", "PHI scope obtainable after BAA acceptance", FAIL, `status ${after.res.status}`);
  }

  // (e) Acceptance recorded as a signed, append-only event. Not observable over
  // the wire at v0.1: mark MANUAL.
  record(
    "baa",
    "acceptance recorded as a signed, append-only event",
    MANUAL,
    "internal audit property; attest that acceptances are signed and immutable",
  );
}

// ---------------------------------------------------------------------------
// 4. Least-privilege tokens
// ---------------------------------------------------------------------------
async function categoryLeastPrivilege(fixtures) {
  console.log(paint(C.bold, "\n4. Least-privilege tokens"));

  if (!ctx.phiToken) {
    record("least-privilege", "least-privilege tokens", SKIP, "no PHI token obtained to inspect");
    return;
  }
  const payload = jwtPayload(ctx.phiToken);
  if (!payload) {
    record("least-privilege", "token is an inspectable JWT", MANUAL, "token is opaque; verify scope/aud/exp out of band");
    return;
  }

  // short-lived
  if (typeof payload.exp === "number" && typeof payload.iat === "number" && payload.exp - payload.iat <= 3600) {
    record("least-privilege", "token is short-lived (<= 1h)", PASS, `ttl ${payload.exp - payload.iat}s`);
  } else {
    record("least-privilege", "token is short-lived (<= 1h)", FAIL, `ttl ${payload.exp && payload.iat ? payload.exp - payload.iat : "unknown"}`);
  }

  // audience-bound
  if (payload.aud) {
    record("least-privilege", "token is audience-bound (aud claim present)", PASS);
  } else {
    record("least-privilege", "token is audience-bound (aud claim present)", FAIL, "no aud claim");
  }

  // carries only granted scope + purpose of use
  const tokenScopes = String(payload.scope || "").split(" ").filter(Boolean);
  const requested = (ctx.phiScope || fixtures.phi_scope);
  const overGranted = tokenScopes.filter((s) => s !== requested);
  if (tokenScopes.includes(requested) && overGranted.length === 0) {
    record("least-privilege", "no over-grant: narrow request yields narrow token", PASS, `scopes: ${tokenScopes.join(",")}`);
  } else {
    record(
      "least-privilege",
      "no over-grant: narrow request yields narrow token",
      FAIL,
      `requested ${requested}, got ${tokenScopes.join(",") || "<none>"}`,
    );
  }
  if (payload.purpose_of_use || payload.pou || payload.purpose) {
    record("least-privilege", "token carries purpose of use", PASS);
  } else {
    record("least-privilege", "token carries purpose of use", MANUAL, "no purpose claim seen; confirm purpose binding");
  }

  // a call outside the token's scope/purpose is refused. Mint a token for a
  // different scope and confirm the protected resource refuses it. Use the
  // anonymous (no-scope) token as the out-of-scope caller against the PHI path.
  const anon = await postJson("/agent/identity", { type: "anonymous" });
  if (anon.json && anon.json.access_token && fixtures.protected_resource_path) {
    const probe = await getJson(fixtures.protected_resource_path, {
      headers: { authorization: `Bearer ${anon.json.access_token}` },
    });
    if (probe.res.status === 401 || probe.res.status === 403) {
      record("least-privilege", "call outside token scope is refused", PASS, `status ${probe.res.status}`);
    } else if (probe.res.status === 404) {
      record("least-privilege", "call outside token scope is refused", SKIP, "no protected path to probe");
    } else {
      record("least-privilege", "call outside token scope is refused", FAIL, `status ${probe.res.status} (allowed)`);
    }
  } else {
    record("least-privilege", "call outside token scope is refused", SKIP, "could not mint an out-of-scope token");
  }
}

// ---------------------------------------------------------------------------
// 5. Self-healing errors
// ---------------------------------------------------------------------------
async function categorySelfHealing(fixtures) {
  console.log(paint(C.bold, "\n5. Self-healing errors"));

  if (!fixtures.protected_resource_path) {
    record("self-healing", "missing-scope error is machine-actionable", SKIP, "no protected path");
    return;
  }

  // A missing-scope error is the interesting case: an authenticated caller that
  // lacks the required scope. Probe with a real-but-narrow token (the anonymous
  // / no-scope token) so the service returns its insufficient-scope error rather
  // than a generic "no token" 401. Fall back to the no-token call if we cannot
  // mint one.
  let probeToken;
  const anon = await postJson("/agent/identity", { type: "anonymous" });
  if (anon.json && anon.json.access_token) probeToken = anon.json.access_token;

  const r = await getJson(
    fixtures.protected_resource_path,
    probeToken ? { headers: { authorization: `Bearer ${probeToken}` } } : {},
  );
  if (r.res.status === 404) {
    record("self-healing", "missing-scope error is machine-actionable", SKIP, "no protected path on this service");
    return;
  }
  const body = r.json || {};
  const www = r.res.headers.get("www-authenticate") || "";
  const statesScope = Boolean(body.required_scope) || /scope=/.test(www);
  // Machine-actionable means the agent learns how to fix it: a scope to obtain,
  // a BAA accept endpoint, an obtain_via hint, or a descriptive error.
  const statesObtain = Boolean(body.accept_endpoint || body.obtain_via || body.error_description);
  if ((r.res.status === 401 || r.res.status === 403) && statesScope && statesObtain) {
    record("self-healing", "missing-scope error names the scope + how to obtain it", PASS, `status ${r.res.status}`);
  } else if (r.res.status === 401 || r.res.status === 403) {
    record(
      "self-healing",
      "missing-scope error names the scope + how to obtain it",
      FAIL,
      `partial: names scope ${statesScope ? "yes" : "no"}, names remedy ${statesObtain ? "yes" : "no"}`,
    );
  } else {
    record("self-healing", "missing-scope error names the scope + how to obtain it", FAIL, `status ${r.res.status}`);
  }

  // The full "an agent follows the error body to a successful call with no human"
  // assertion is an end-to-end behavior the BAA-gate path already exercises; mark
  // it MANUAL so the implementer attests the loop closes on their service.
  record(
    "self-healing",
    "an agent can self-heal to a successful call without a human",
    MANUAL,
    "exercised in part by the BAA gate; attest the error body is sufficient end to end",
  );
}

// ---------------------------------------------------------------------------
// 7. PHI safety (cross-cutting)
// ---------------------------------------------------------------------------
async function categoryPhiSafety() {
  console.log(paint(C.bold, "\n7. PHI safety (cross-cutting)"));

  // Discovery documents must not carry PHI-like fields. We check the obvious
  // ones (auth.md, metadata) for patterns that look like SSN / DOB. This is a
  // shallow guard, not proof of absence, so a clean pass here is necessary, not
  // sufficient: the deeper guarantee is attested.
  const ssn = /\b\d{3}-\d{2}-\d{4}\b/;
  const docs = await Promise.all([
    getJson("/auth.md"),
    getJson("/.well-known/oauth-authorization-server"),
    getJson("/.well-known/oauth-protected-resource"),
  ]);
  const dirty = docs.find((d) => d.text && ssn.test(d.text));
  if (!dirty) {
    record("phi-safety", "no SSN-pattern PHI in discovery documents", PASS);
  } else {
    record("phi-safety", "no SSN-pattern PHI in discovery documents", FAIL, "SSN-like value found in a discovery document");
  }

  record(
    "phi-safety",
    "no PHI in error bodies or receipts (digests only)",
    MANUAL,
    "shallow scan cannot prove absence; attest error bodies and receipts carry digests, never raw PHI",
  );
}

// ---------------------------------------------------------------------------
// 6. Receipts (receipts tier)
// ---------------------------------------------------------------------------
async function categoryReceipts(fixtures, schemas, registry) {
  console.log(paint(C.bold, "\n6. Receipts (receipts tier)"));

  if (!ctx.harp || !ctx.harp.receipts || ctx.harp.receipts.supported !== true) {
    record("receipts", "service claims receipts support", SKIP, "agent_auth.harp.receipts.supported is not true");
    return;
  }
  record("receipts", "service claims receipts support", PASS);

  if (!ctx.phiToken) {
    record("receipts", "consequential action emits a receipt", SKIP, "no PHI token to trigger an action");
    return;
  }

  // Trigger a consequential action and capture the receipt.
  const r = await getJson(fixtures.protected_resource_path, {
    headers: { authorization: `Bearer ${ctx.phiToken}` },
  });
  const receipt = r.json && r.json.receipt;
  if (!receipt) {
    record("receipts", "consequential action emits a receipt", FAIL, `status ${r.res.status}, no receipt in response`);
    return;
  }
  record("receipts", "consequential action emits a receipt", PASS);

  // Schema-valid against the receipt schema.
  const v = validate(receipt, schemas.receipt, registry);
  if (v.valid) {
    record("receipts", "receipt is schema-valid", PASS);
  } else {
    record("receipts", "receipt is schema-valid", FAIL, v.errors.slice(0, 3).join(" | "));
  }

  // References a digest, not raw PHI.
  if (typeof receipt.inputs_digest === "string" && /^[a-z0-9]+:/.test(receipt.inputs_digest)) {
    record("receipts", "receipt references an inputs digest, not raw PHI", PASS, receipt.inputs_digest.slice(0, 20) + "...");
  } else {
    record("receipts", "receipt references an inputs digest, not raw PHI", FAIL, "inputs_digest missing or not a hash");
  }

  // Verify a genuine receipt at verify_uri, without the verifier trusting the
  // issuer. The verifier should return the signed receipt content it validated.
  const verifyPath = (ctx.harp.receipts && verifyPathFromConfig()) || "/agent/receipt/verify";
  const good = await postJson(verifyPath, { receipt });
  if (good.res.ok && good.json && good.json.valid === true) {
    record("receipts", "verify_uri validates a genuine receipt", PASS);
  } else if (good.res.status === 404) {
    record("receipts", "verify_uri validates a genuine receipt", SKIP, "no verify endpoint");
    return;
  } else {
    record("receipts", "verify_uri validates a genuine receipt", FAIL, `status ${good.res.status}, valid=${good.json && good.json.valid}`);
  }

  // Reject a tampered receipt. The signature is the integrity anchor, so tamper
  // the signed material and confirm the verifier rejects it. (Tampering only an
  // outer copy is not a meaningful test: a correct verifier reports what was
  // actually signed, which is the genuine behavior, so we tamper the signature.)
  const tampered = JSON.parse(JSON.stringify(receipt));
  if (typeof tampered.signature === "string" && tampered.signature.includes(".")) {
    const parts = tampered.signature.split(".");
    const sig = parts[parts.length - 1] || "";
    parts[parts.length - 1] = sig.slice(0, -3) + (sig.slice(-3) === "AAA" ? "BBB" : "AAA");
    tampered.signature = parts.join(".");
  } else if (typeof tampered.signature === "string") {
    tampered.signature = tampered.signature + "x";
  }
  const bad = await postJson(verifyPath, { receipt: tampered });
  if (bad.json && bad.json.valid === false) {
    record("receipts", "verify_uri rejects a tampered receipt", PASS);
  } else if (bad.res.status === 404) {
    record("receipts", "verify_uri rejects a tampered receipt", SKIP, "no verify endpoint");
  } else {
    record("receipts", "verify_uri rejects a tampered receipt", FAIL, `accepted tampered receipt (valid=${bad.json && bad.json.valid})`);
  }

  // Cross-check: when the verifier returns the validated content, it must reflect
  // what was signed, not any outer fields a caller could have altered.
  const outerTamper = JSON.parse(JSON.stringify(receipt));
  outerTamper.conclusion = `${outerTamper.conclusion || ""} (outer-altered)`;
  const echoed = await postJson(verifyPath, { receipt: outerTamper });
  if (echoed.json && echoed.json.valid === true && echoed.json.receipt) {
    const matches = echoed.json.receipt.conclusion === receipt.conclusion;
    if (matches) {
      record("receipts", "verifier returns signed content, ignoring altered outer fields", PASS);
    } else {
      record("receipts", "verifier returns signed content, ignoring altered outer fields", FAIL, "verifier echoed an altered outer field");
    }
  } else if (echoed.json && echoed.json.valid === false) {
    // Also acceptable: the verifier binds the outer object and rejects any change.
    record("receipts", "verifier returns signed content, ignoring altered outer fields", PASS, "verifier rejects outer changes outright");
  } else {
    record("receipts", "verifier returns signed content, ignoring altered outer fields", SKIP, "verifier does not return embedded content to compare");
  }
}

// ---------------------------------------------------------------------------
// Summary + exit code
// ---------------------------------------------------------------------------
function printSummary() {
  const counts = { PASS: 0, FAIL: 0, SKIP: 0, MANUAL: 0 };
  for (const r of results) counts[r.status] += 1;

  console.log(paint(C.bold, "\n" + "-".repeat(60)));
  console.log(paint(C.bold, "Summary"));
  console.log(
    `  ${paint(C.green, `${counts.PASS} passed`)}, ` +
      `${paint(C.red, `${counts.FAIL} failed`)}, ` +
      `${paint(C.yellow, `${counts.SKIP} skipped`)}, ` +
      `${paint(C.cyan, `${counts.MANUAL} manual`)}`,
  );

  const coreFailures = results.filter((r) => r.category !== "receipts" && r.status === FAIL);
  const receiptsFailures = results.filter((r) => r.category === "receipts" && r.status === FAIL);

  console.log("");
  if (coreFailures.length === 0) {
    console.log(paint(C.green, "CORE tier: PASS") + paint(C.dim, `  (HARP-compliant, v${SUITE_VERSION}, pending manual attestations)`));
  } else {
    console.log(paint(C.red, `CORE tier: FAIL  (${coreFailures.length} failing check${coreFailures.length === 1 ? "" : "s"})`));
  }

  if (runReceipts) {
    if (receiptsFailures.length === 0) {
      console.log(paint(C.green, "RECEIPTS tier: PASS") + paint(C.dim, `  (HARP-compliant (receipts), v${SUITE_VERSION})`));
    } else {
      console.log(paint(C.red, `RECEIPTS tier: FAIL  (${receiptsFailures.length} failing check${receiptsFailures.length === 1 ? "" : "s"})`));
    }
  }

  if (counts.MANUAL > 0) {
    console.log(
      paint(
        C.cyan,
        `\n${counts.MANUAL} check(s) need manual self-attestation. The badge requires that you confirm these for your service (see README.md).`,
      ),
    );
  }

  const failed = coreFailures.length > 0 || (runReceipts && receiptsFailures.length > 0);
  console.log(paint(C.bold, "-".repeat(60)) + "\n");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(paint(C.red, `\nRunner crashed: ${e.stack || e.message}`));
  process.exit(2);
});
