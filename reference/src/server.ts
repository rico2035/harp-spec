/**
 * HARP reference server. A minimal, runnable, HARP-compliant service built on
 * @harp-standard/sdk. It serves the discovery documents, the three registration
 * flows, the BAA gate, a sample protected resource, and receipt verification.
 *
 * Dev-only helpers (clearly marked) let you run the entire flow on one machine
 * without an external identity provider:
 *   - GET  /jwks.json            public keys for ID-JAG and receipt verification
 *   - POST /dev/mint-id-jag      issue a test ID-JAG signed by this server
 *   - GET  /dev/verify           the user verification page (claim ceremony)
 *   - POST /dev/approve          approve a pending claim ceremony
 *
 * Storage is in-memory. Do not deploy as-is.
 */

import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  SignJWT,
  exportJWK,
  exportSPKI,
  generateKeyPair,
  jwtVerify,
  type JWTPayload,
} from "jose";
import { randomUUID } from "node:crypto";
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  inputsDigest,
  issueReceipt,
  mintAccessToken,
  renderAuthMd,
  verifyIdJag,
  verifyReceiptSignature,
  type Receipt,
  type ServiceConfig,
} from "@harp-standard/sdk";
import { buildServiceConfig, phiScopes } from "./config.js";
import { MemoryStore } from "./store.js";

const PORT = Number(process.env.PORT ?? 4000);
const BASE = process.env.HARP_BASE_URL ?? `http://localhost:${PORT}`;
const ALG = "ES256";
const KID = "harp-ref-1";

interface AuthedRequest extends Request {
  harp?: JWTPayload;
}

async function main(): Promise<void> {
  const cfg: ServiceConfig = buildServiceConfig(BASE);
  const phi = phiScopes(cfg);
  const offered = new Set(cfg.agentAuth.harp.scopes.map((s) => s.name));
  const store = new MemoryStore();

  // One signing key for tokens, receipts, and dev ID-JAGs. A real service uses
  // separate keys per purpose and a managed KMS or HSM.
  const { publicKey, privateKey } = await generateKeyPair(ALG, {
    extractable: true,
  });
  const publicPem = await exportSPKI(publicKey);
  const publicJwk = { ...(await exportJWK(publicKey)), kid: KID, alg: ALG, use: "sig" };

  // This server trusts itself as an ID-JAG issuer for local testing only.
  const trustedIssuers: Record<string, string> = { [cfg.issuer]: `${BASE}/jwks.json` };

  const app = express();
  app.use(express.json());

  // ---- Discovery ----
  app.get("/auth.md", (_req, res) => {
    res.type("text/markdown").send(renderAuthMd(cfg));
  });

  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    res.json(buildProtectedResourceMetadata(cfg));
  });

  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.json(buildAuthorizationServerMetadata(cfg));
  });

  app.get("/jwks.json", (_req, res) => {
    res.json({ keys: [publicJwk] });
  });

  // ---- Registration: POST /agent/identity ----
  app.post("/agent/identity", async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const type = body.type;

    if (type === "anonymous") {
      const agentId = `agent_${randomUUID()}`;
      store.putAgent({
        agentId,
        issuer: "anonymous",
        subject: agentId,
        emailVerified: false,
        createdAt: new Date().toISOString(),
      });
      const token = await mintToken(agentId, [], false, undefined);
      return res.json(tokenResponse(token, ""));
    }

    if (type === "identity_assertion") {
      const assertion = String(body.assertion ?? "");
      try {
        const v = await verifyIdJag(assertion, {
          trustedIssuers,
          audience: cfg.resourceBaseUrl,
        });
        const orgId = typeof v.payload.org_id === "string" ? v.payload.org_id : undefined;
        const agentId = `agent_${randomUUID()}`;
        store.putAgent({
          agentId,
          issuer: v.issuer,
          subject: v.subject,
          orgId,
          emailVerified: v.emailVerified,
          createdAt: new Date().toISOString(),
        });
        // Base credential with no PHI scopes. PHI scopes come from the token
        // endpoint after the BAA is accepted.
        const token = await mintToken(agentId, [], false, orgId);
        return res.json(tokenResponse(token, ""));
      } catch (e) {
        return fail(res, 401, "invalid_assertion", String((e as Error).message));
      }
    }

    if (type === "service_auth") {
      const loginHint = String(body.login_hint ?? "");
      const agentId = `agent_${randomUUID()}`;
      const claimToken = randomUUID();
      const userCode = randomUUID().slice(0, 8).toUpperCase();
      store.putAgent({
        agentId,
        issuer: "service_auth",
        subject: loginHint,
        emailVerified: false,
        createdAt: new Date().toISOString(),
      });
      store.putCeremony({ claimToken, userCode, loginHint, approved: false, agentId });
      return res.json({
        claim_token: claimToken,
        user_code: userCode,
        verification_uri: `${BASE}/dev/verify?code=${userCode}`,
        interval: 2,
      });
    }

    return fail(res, 400, "unsupported_identity_type", "type must be one of anonymous, identity_assertion, service_auth.");
  });

  // ---- BAA acceptance ----
  app.post("/agent/baa/accept", (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const orgId = String(body.org_id ?? "");
    if (!orgId) return fail(res, 400, "invalid_request", "org_id is required.");
    if (!body.accepted_by || !body.signature) {
      return fail(res, 400, "invalid_request", "accepted_by and signature are required.");
    }

    // Acceptance binds to the current BAA terms. A stale or mismatched hash is
    // rejected with a self-healing body pointing at the current version.
    const currentHash = cfg.agentAuth.harp.baa.version_hash;
    if (body.baa_version_hash !== currentHash) {
      return res.status(400).json({
        error: "stale_baa_version",
        error_description:
          "baa_version_hash does not match the current BAA terms. Re-read the manifest and accept the current version.",
        current_version_hash: currentHash,
        terms_uri: cfg.agentAuth.harp.baa.terms_uri,
      });
    }

    const acceptanceId = `baa_${randomUUID()}`;
    store.recordBaa({
      acceptanceId,
      orgId,
      versionHash: String(body.baa_version_hash ?? ""),
      acceptedBy: String(body.accepted_by ?? ""),
      acceptedAt: new Date().toISOString(),
    });
    return res.json({
      org_id: orgId,
      baa_version_hash: body.baa_version_hash,
      accepted_by: body.accepted_by,
      signature: body.signature,
      baa_acceptance_id: acceptanceId,
      scopes_unlocked: [...phi],
      accepted_at: new Date().toISOString(),
    });
  });

  // ---- Token endpoint ----
  app.post("/oauth2/token", async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const grant = body.grant_type;

    if (grant === "urn:ietf:params:oauth:grant-type:jwt-bearer") {
      const assertion = String(body.assertion ?? "");
      const requested = String(body.scope ?? "").split(" ").filter(Boolean);
      try {
        const v = await verifyIdJag(assertion, {
          trustedIssuers,
          audience: cfg.resourceBaseUrl,
        });
        const orgId = typeof v.payload.org_id === "string" ? v.payload.org_id : undefined;

        for (const s of requested) {
          if (!offered.has(s)) {
            return fail(res, 400, "invalid_scope", `Unknown scope: ${s}`);
          }
          if (phi.has(s) && !store.hasBaa(orgId)) {
            return baaRequired(res);
          }
        }

        const baaOk = store.hasBaa(orgId);
        const token = await mintToken(v.subject, requested, baaOk, orgId);
        return res.json(tokenResponse(token, requested.join(" ")));
      } catch (e) {
        return fail(res, 401, "invalid_assertion", String((e as Error).message));
      }
    }

    if (grant === "urn:harp:params:grant-type:claim") {
      const claimToken = String(body.claim_token ?? "");
      const ceremony = store.getCeremony(claimToken);
      if (!ceremony) return fail(res, 400, "invalid_grant", "Unknown claim_token.");
      if (!ceremony.approved) {
        return fail(res, 428, "authorization_pending", "Waiting for the user to verify.");
      }
      const token = await mintToken(ceremony.agentId, [], false, undefined);
      return res.json(tokenResponse(token, ""));
    }

    return fail(res, 400, "unsupported_grant_type", `Unsupported grant_type: ${String(grant)}`);
  });

  app.post("/agent/identity/claim", (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const claimToken = String(body.claim_token ?? "");
    const ceremony = store.getCeremony(claimToken);
    if (!ceremony) return fail(res, 400, "invalid_grant", "Unknown claim_token.");
    ceremony.approved = true;
    return res.json({ claimed: true });
  });

  // ---- Protected resource: eligibility ----
  app.get(
    "/eligibility",
    requireScope("rcm.eligibility:read"),
    async (req: AuthedRequest, res: Response) => {
      const payload = req.harp as JWTPayload;
      const member = String(req.query.member ?? "demo-member");

      // Synthetic response. A real service would query coverage here.
      const data = {
        member_id: member,
        status: "active",
        plan: "Acme PPO",
        copay: 25,
        deductible_remaining: 500,
      };

      const receipt = await issueReceipt({
        privateKey,
        action: "eligibility.checked",
        agentId: String(payload.sub),
        delegationChain: readChain(payload),
        purposeOfUse: "PAYMENT",
        inputsDigest: inputsDigest(JSON.stringify({ member })),
        policyApplied: "harp:reference/eligibility@v1",
        model: "reference-server",
        evidence: [{ source: "payer:acme-ppo", ref: "coverage-rules-2026" }],
        conclusion: `Coverage active for ${member}.`,
      });

      res.json({ data, receipt });
    },
  );

  // ---- Receipt verification ----
  app.post("/agent/receipt/verify", async (req: Request, res: Response) => {
    const receipt = (req.body as { receipt?: Receipt }).receipt;
    if (!receipt) return fail(res, 400, "invalid_request", "receipt is required.");
    try {
      const embedded = await verifyReceiptSignature(receipt, publicKey);
      return res.json({ valid: true, receipt: embedded });
    } catch {
      return res.status(400).json({ valid: false, error: "invalid_signature" });
    }
  });

  // ---- Dev-only helpers ----
  app.post("/dev/mint-id-jag", async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const assertion = await new SignJWT({
      email_verified: body.email_verified !== false,
      org_id: String(body.org_id ?? "org_demo"),
    })
      .setProtectedHeader({ alg: ALG, kid: KID, typ: "oauth-id-jag+jwt" })
      .setIssuer(cfg.issuer)
      .setSubject(String(body.sub ?? "user_demo"))
      .setAudience(cfg.resourceBaseUrl)
      .setIssuedAt()
      .setExpirationTime("5m")
      .setJti(randomUUID())
      .sign(privateKey);
    res.json({ assertion });
  });

  app.get("/dev/verify", (req: Request, res: Response) => {
    // User codes are alphanumeric; strip anything else before rendering HTML.
    const code = String(req.query.code ?? "").replace(/[^A-Za-z0-9-]/g, "");
    res
      .type("html")
      .send(
        `<h1>Acme Health RCM</h1><p>Approve agent registration for code <b>${code}</b>.</p>` +
          `<p>Dev only: POST /dev/approve with the matching claim_token to approve.</p>`,
      );
  });

  app.post("/dev/approve", (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const ceremony = store.getCeremony(String(body.claim_token ?? ""));
    if (!ceremony) return fail(res, 404, "not_found", "Unknown claim_token.");
    ceremony.approved = true;
    return res.json({ approved: true });
  });

  app.listen(PORT, () => {
    console.log(`HARP reference server on ${BASE}`);
    console.log(`Public key (PEM) for receipt verification:\n${publicPem}`);
  });

  // ---- helpers ----
  function requireScope(scope: string) {
    return async (req: AuthedRequest, res: Response, next: NextFunction) => {
      const auth = req.headers.authorization ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!token) {
        res.setHeader("WWW-Authenticate", `Bearer realm="harp"`);
        return fail(res, 401, "unauthorized", "Provide a bearer token. Register via /auth.md.");
      }
      try {
        const { payload } = await jwtVerify(token, publicKey, {
          issuer: cfg.issuer,
          audience: cfg.resourceBaseUrl,
        });
        const tokenScopes = String(payload.scope ?? "").split(" ").filter(Boolean);
        if (!tokenScopes.includes(scope)) {
          res.setHeader("WWW-Authenticate", `Bearer error="insufficient_scope", scope="${scope}"`);
          return res.status(403).json({
            error: "insufficient_scope",
            required_scope: scope,
            error_description: `This call needs the ${scope} scope. Obtain it at the token endpoint.`,
          });
        }
        if (phi.has(scope) && payload.baa !== true) {
          return baaRequired(res);
        }
        req.harp = payload;
        next();
      } catch {
        return fail(res, 401, "invalid_token", "Token verification failed.");
      }
    };
  }

  async function mintToken(
    subject: string,
    scopes: string[],
    baa: boolean,
    orgId: string | undefined,
  ): Promise<string> {
    const base = await mintAccessToken({
      privateKey,
      issuer: cfg.issuer,
      audience: cfg.resourceBaseUrl,
      subject,
      scopes,
      purposeOfUse: "PAYMENT",
      delegationChain: orgId ? [orgId, subject] : [subject],
    });
    if (!baa) return base;
    // Re-sign with the baa claim set. Kept simple for the reference server.
    const { payload } = await jwtVerify(base, publicKey);
    return new SignJWT({ ...payload, baa: true })
      .setProtectedHeader({ alg: ALG, typ: "at+jwt" })
      .sign(privateKey);
  }

  function baaRequired(res: Response) {
    res.setHeader("WWW-Authenticate", `Bearer error="baa_required"`);
    return res.status(403).json({
      error: "baa_required",
      accept_endpoint: cfg.agentAuth.harp.baa.accept_endpoint,
      error_description: "PHI scopes require an accepted BAA. Accept it, then request the scope again.",
    });
  }
}

function tokenResponse(accessToken: string, scope: string) {
  return { access_token: accessToken, token_type: "Bearer", scope, expires_in: 900 };
}

function readChain(payload: JWTPayload): string[] {
  const act = payload.act as { chain?: unknown } | undefined;
  return Array.isArray(act?.chain) ? (act.chain as string[]) : [String(payload.sub)];
}

function fail(res: Response, status: number, error: string, description: string) {
  return res.status(status).json({ error, error_description: description });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
