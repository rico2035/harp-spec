/**
 * HARP client. Lets an agent discover a HARP service, register through one of
 * the three flows, accept a BAA to unlock PHI scopes, exchange for a token,
 * call the protected API, and verify receipts.
 *
 * Network calls use the global fetch by default. Pass a custom fetch for tests.
 */

import { jwtVerify, importSPKI } from "jose";
import { HarpError, harpErrorFromResponse } from "./errors.js";
import type {
  AgentAuthMetadata,
  AuthorizationServerMetadata,
  BaaAcceptanceEvent,
  BaaAcceptanceRequest,
  IdentityRequest,
  IdentityResponse,
  ProtectedResourceMetadata,
  PurposeOfUse,
  Receipt,
} from "./types.js";

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface HarpClientOptions {
  /** Base URL of the resource server, e.g. https://api.goneomics.com */
  baseUrl: string;
  fetchImpl?: FetchLike;
}

export interface DiscoveryResult {
  authMd: string;
  prm: ProtectedResourceMetadata;
  asMetadata: AuthorizationServerMetadata;
  agentAuth: AgentAuthMetadata;
}

export class HarpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private discovery?: DiscoveryResult;

  constructor(opts: HarpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    const f = opts.fetchImpl ?? (globalThis.fetch as FetchLike | undefined);
    if (!f) throw new Error("No fetch implementation available. Pass fetchImpl.");
    this.fetchImpl = f;
  }

  /** Discover /auth.md, the Protected Resource Metadata, and the AS metadata. */
  async discover(): Promise<DiscoveryResult> {
    const authMdRes = await this.fetchImpl(`${this.baseUrl}/auth.md`);
    const authMd = authMdRes.ok ? await authMdRes.text() : "";

    const prm = await this.getJson<ProtectedResourceMetadata>(
      `${this.baseUrl}/.well-known/oauth-protected-resource`,
    );
    const asUrl = prm.authorization_servers[0];
    if (!asUrl) throw new Error("PRM has no authorization_servers entry.");

    const asMetadata = await this.getJson<AuthorizationServerMetadata>(
      `${asUrl.replace(/\/+$/, "")}/.well-known/oauth-authorization-server`,
    );

    this.discovery = { authMd, prm, asMetadata, agentAuth: asMetadata.agent_auth };
    return this.discovery;
  }

  private requireDiscovery(): DiscoveryResult {
    if (!this.discovery) {
      throw new Error("Call discover() before registering.");
    }
    return this.discovery;
  }

  /** Register anonymously. Returns a pre-claim token limited to the free tier. */
  async registerAnonymous(): Promise<IdentityResponse> {
    return this.postIdentity({ type: "anonymous" });
  }

  /** Register with an ID-JAG assertion. Synchronous, no human. */
  async registerWithIdJag(assertion: string): Promise<IdentityResponse> {
    return this.postIdentity({ type: "identity_assertion", assertion });
  }

  /** Begin the verified-email flow. Hand the user_code to the user. */
  async registerWithEmail(email: string): Promise<IdentityResponse> {
    return this.postIdentity({ type: "service_auth", login_hint: email });
  }

  /**
   * Exchange an ID-JAG assertion at the token endpoint for a scoped,
   * purpose-bound access token (JWT bearer grant, RFC 7523). Use this after
   * accepting the BAA to obtain PHI scopes.
   */
  async exchangeAssertion(
    assertion: string,
    scopes: string[],
  ): Promise<IdentityResponse> {
    const { asMetadata } = this.requireDiscovery();
    const res = await this.fetchImpl(asMetadata.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
        scope: scopes.join(" "),
      }),
    });
    if (!res.ok) throw await harpErrorFromResponse(res);
    return (await res.json()) as IdentityResponse;
  }

  /** Accept the BAA for an organization to unlock PHI scopes. */
  async acceptBaa(req: BaaAcceptanceRequest): Promise<BaaAcceptanceEvent> {
    const { agentAuth } = this.requireDiscovery();
    const res = await this.fetchImpl(agentAuth.harp.baa.accept_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw await harpErrorFromResponse(res);
    return (await res.json()) as BaaAcceptanceEvent;
  }

  /**
   * Poll the token endpoint for a service_auth or anonymous claim ceremony.
   * Resolves once the user completes verification.
   */
  async pollToken(
    claimToken: string,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<IdentityResponse> {
    const { asMetadata } = this.requireDiscovery();
    const interval = opts.intervalMs ?? 2000;
    const deadline = Date.now() + (opts.timeoutMs ?? 120_000);

    for (;;) {
      const res = await this.fetchImpl(asMetadata.token_endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "urn:harp:params:grant-type:claim",
          claim_token: claimToken,
        }),
      });
      if (res.ok) return (await res.json()) as IdentityResponse;

      const err = await harpErrorFromResponse(res);
      const pending = err.code === "authorization_pending" || err.status === 428;
      if (!pending || Date.now() > deadline) throw err;
      await delay(interval);
    }
  }

  /** Call a protected resource with a bearer token. Throws HarpError on failure. */
  async request(
    path: string,
    opts: {
      token: string;
      method?: string;
      purposeOfUse?: PurposeOfUse;
      body?: unknown;
    },
  ): Promise<Response> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${opts.token}`,
    };
    if (opts.purposeOfUse) headers["x-harp-purpose-of-use"] = opts.purposeOfUse;
    if (opts.body !== undefined) headers["content-type"] = "application/json";

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) throw await harpErrorFromResponse(res);
    return res;
  }

  /**
   * Verify a Verifiable Reasoning Receipt against a public key (PEM SPKI).
   * The signature covers the receipt with the signature field removed, so the
   * outer fields must equal the signed embedded content: a genuine signature
   * attached to altered outer fields is not a valid receipt.
   */
  async verifyReceipt(
    receipt: Receipt,
    publicKeyPem: string,
    alg = "ES256",
  ): Promise<boolean> {
    try {
      const key = await importSPKI(publicKeyPem, alg);
      const { payload } = await jwtVerify(receipt.signature, key);
      const embedded = (payload as { receipt?: Omit<Receipt, "signature"> })
        .receipt;
      if (!embedded) return false;
      const { signature: _signature, ...outer } = receipt;
      return stableStringify(outer) === stableStringify(embedded);
    } catch {
      return false;
    }
  }

  private async postIdentity(req: IdentityRequest): Promise<IdentityResponse> {
    const { agentAuth } = this.requireDiscovery();
    const res = await this.fetchImpl(agentAuth.identity_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw await harpErrorFromResponse(res);
    return (await res.json()) as IdentityResponse;
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new HarpError(res.status, `discovery_failed`, {
        kind: "unknown",
        message: `Discovery request to ${url} failed with ${res.status}.`,
      });
    }
    return (await res.json()) as T;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** JSON.stringify with object keys sorted, so key order never affects equality. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}
