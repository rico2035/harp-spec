/**
 * HARP server helpers. A service uses these to publish discovery documents,
 * verify ID-JAG assertions, mint scoped purpose-bound tokens, and issue
 * Verifiable Reasoning Receipts. Storage and routing are left to the host
 * (see /reference for a runnable example).
 */

import { createHash, randomUUID } from "node:crypto";
import {
  SignJWT,
  jwtVerify,
  createRemoteJWKSet,
  type JWTPayload,
  type KeyLike,
} from "jose";
import type {
  AgentAuthMetadata,
  AuthorizationServerMetadata,
  ProtectedResourceMetadata,
  PurposeOfUse,
  Receipt,
  ReceiptEvidence,
} from "./types.js";

/** Everything a HARP service needs to describe itself. */
export interface ServiceConfig {
  /** Resource server base, e.g. https://api.example.com */
  resourceBaseUrl: string;
  resourceName: string;
  /** Authorization server base. May equal resourceBaseUrl. */
  authBaseUrl: string;
  agentAuth: AgentAuthMetadata;
  /** Issuer string placed in minted tokens and AS metadata. */
  issuer: string;
}

export function buildProtectedResourceMetadata(
  cfg: ServiceConfig,
): ProtectedResourceMetadata {
  return {
    resource: cfg.resourceBaseUrl,
    resource_name: cfg.resourceName,
    authorization_servers: [cfg.authBaseUrl],
    scopes_supported: cfg.agentAuth.harp.scopes.map((s) => s.name),
    bearer_methods_supported: ["header"],
  };
}

export function buildAuthorizationServerMetadata(
  cfg: ServiceConfig,
): AuthorizationServerMetadata {
  return {
    issuer: cfg.issuer,
    token_endpoint: `${cfg.authBaseUrl}/oauth2/token`,
    grant_types_supported: [
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
      "urn:harp:params:grant-type:claim",
    ],
    agent_auth: cfg.agentAuth,
  };
}

/** Render the /auth.md manifest from config. A procedural recipe for agents. */
export function renderAuthMd(cfg: ServiceConfig): string {
  const a = cfg.agentAuth;
  const scopeRows = a.harp.scopes
    .map(
      (s) =>
        `| \`${s.name}\` | ${s.purpose} | ${s.phi ? "yes" : "no"} | ${s.min_necessary} |`,
    )
    .join("\n");

  return `# auth.md: ${cfg.resourceName}

This is the agent registration manifest for ${cfg.resourceName}. It follows the
auth.md profile and the HARP healthcare extension (version ${a.harp.version}). An
agent can read this file, register, prove who it acts for, and start working
without a human filling out a form.

- Resource server: ${cfg.resourceBaseUrl}
- Authorization server: ${cfg.authBaseUrl}

## Discover

Read the Protected Resource Metadata at
\`${cfg.resourceBaseUrl}/.well-known/oauth-protected-resource\`, then the
authorization-server metadata at
\`${cfg.authBaseUrl}/.well-known/oauth-authorization-server\`. The \`agent_auth\`
block lists the endpoints and the \`harp\` extension.

## Pick a method

- \`identity_assertion\` if you hold an ID-JAG from a trusted provider.
- \`service_auth\` if you only have a verified email (claim ceremony follows).
- \`anonymous\` to try the free tier and claim ownership later.

## Compliance (BAA)

PHI scopes require a Business Associate Agreement. Accept it at
\`${a.harp.baa.accept_endpoint}\` (terms: ${a.harp.baa.terms_uri}). PHI scopes stay locked
until acceptance completes.

## Register

POST to \`${a.identity_endpoint}\`. Example (ID-JAG):

\`\`\`http
POST ${a.identity_endpoint}
Content-Type: application/json

{ "type": "identity_assertion", "assertion": "<ID-JAG>" }
\`\`\`

## Exchange and use

Exchange your assertion at the token endpoint for a scoped, purpose-bound access
token, then call the API with \`Authorization: Bearer <token>\`.

## Scopes

| scope | purpose | phi | minimum necessary |
| --- | --- | --- | --- |
${scopeRows}

## Receipts

Consequential actions return Verifiable Reasoning Receipts. Verify a receipt at
\`${a.harp.receipts.verify_uri}\` without trusting the issuer.

## Revocation

Credentials are revocable (RFC 7009). Registration-layer events are delivered to
\`${a.events_endpoint}\` as Security Event Tokens.
`;
}

export interface VerifyIdJagOptions {
  /** Map of trusted issuer -> JWKS URI. */
  trustedIssuers: Record<string, string>;
  /** This service's audience identifier. */
  audience: string;
}

export interface VerifiedAssertion {
  issuer: string;
  subject: string;
  emailVerified: boolean;
  payload: JWTPayload;
}

/**
 * Verify an ID-JAG assertion: the issuer must be allow-listed, the signature
 * must validate against the issuer's JWKS, and the audience must match.
 */
export async function verifyIdJag(
  assertion: string,
  opts: VerifyIdJagOptions,
): Promise<VerifiedAssertion> {
  const issuer = readIssuerUnsafe(assertion);
  const jwksUri = opts.trustedIssuers[issuer];
  if (!jwksUri) {
    throw new Error(`Issuer not trusted: ${issuer}`);
  }

  const jwks = createRemoteJWKSet(new URL(jwksUri));
  const { payload } = await jwtVerify(assertion, jwks, {
    issuer,
    audience: opts.audience,
  });

  if (!payload.sub) throw new Error("ID-JAG missing sub claim.");

  return {
    issuer,
    subject: payload.sub,
    emailVerified: payload.email_verified === true,
    payload,
  };
}

export interface MintTokenParams {
  privateKey: KeyLike;
  issuer: string;
  audience: string;
  subject: string;
  scopes: string[];
  purposeOfUse?: PurposeOfUse;
  /** org -> workforce member -> agent, carried as the act delegation claim. */
  delegationChain?: string[];
  /** Seconds. Default 900 (15 minutes). */
  ttlSeconds?: number;
  alg?: string;
}

/** Mint a short-lived, audience-bound, purpose-bound access token. */
export async function mintAccessToken(params: MintTokenParams): Promise<string> {
  const ttl = params.ttlSeconds ?? 900;
  const builder = new SignJWT({
    scope: params.scopes.join(" "),
    ...(params.purposeOfUse ? { purpose_of_use: params.purposeOfUse } : {}),
    ...(params.delegationChain ? { act: { chain: params.delegationChain } } : {}),
  })
    .setProtectedHeader({ alg: params.alg ?? "ES256", typ: "at+jwt" })
    .setIssuer(params.issuer)
    .setAudience(params.audience)
    .setSubject(params.subject)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .setJti(randomUUID());

  return builder.sign(params.privateKey);
}

/** SHA-256 digest of arbitrary input, hex-encoded, prefixed per the receipt format. */
export function inputsDigest(input: string | Uint8Array): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return `sha256:${hash}`;
}

export interface IssueReceiptParams {
  privateKey: KeyLike;
  action: string;
  agentId: string;
  delegationChain: string[];
  purposeOfUse: PurposeOfUse;
  inputsDigest: string;
  policyApplied: string;
  model: string;
  evidence: ReceiptEvidence[];
  conclusion: string;
  alg?: string;
}

/**
 * Build and sign a Verifiable Reasoning Receipt. The signature is a JWT over
 * the receipt content (without the signature field), verifiable by anyone with
 * the service public key.
 */
export async function issueReceipt(
  params: IssueReceiptParams,
): Promise<Receipt> {
  const base: Omit<Receipt, "signature"> = {
    receipt_id: randomUUID(),
    action: params.action,
    actor: { agent_id: params.agentId, delegation_chain: params.delegationChain },
    purpose_of_use: params.purposeOfUse,
    inputs_digest: params.inputsDigest,
    policy_applied: params.policyApplied,
    model: params.model,
    evidence: params.evidence,
    conclusion: params.conclusion,
    issued_at: new Date().toISOString(),
  };

  const signature = await new SignJWT({ receipt: base })
    .setProtectedHeader({ alg: params.alg ?? "ES256", typ: "harp-receipt+jwt" })
    .setIssuedAt()
    .sign(params.privateKey);

  return { ...base, signature };
}

/**
 * Verify a receipt signature with a public key and return the embedded receipt
 * content. Throws if the signature is invalid.
 */
export async function verifyReceiptSignature(
  receipt: Receipt,
  publicKey: KeyLike,
): Promise<Omit<Receipt, "signature">> {
  const { payload } = await jwtVerify(receipt.signature, publicKey);
  return (payload as { receipt: Omit<Receipt, "signature"> }).receipt;
}

/** Read the iss claim without verifying. Used only to pick the JWKS. */
function readIssuerUnsafe(jwt: string): string {
  const parts = jwt.split(".");
  if (parts.length < 2 || !parts[1]) throw new Error("Malformed assertion.");
  const json = Buffer.from(parts[1], "base64url").toString("utf8");
  const claims = JSON.parse(json) as { iss?: string };
  if (!claims.iss) throw new Error("Assertion missing iss claim.");
  return claims.iss;
}
