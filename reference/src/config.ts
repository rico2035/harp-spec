/**
 * Sample service configuration for the reference server: "Acme Health RCM".
 * Replace these values to model your own service.
 */

import type { AgentAuthMetadata, ServiceConfig } from "@harp-standard/sdk";

export function buildAgentAuth(base: string): AgentAuthMetadata {
  return {
    skill: `${base}/auth.md`,
    identity_endpoint: `${base}/agent/identity`,
    claim_endpoint: `${base}/agent/identity/claim`,
    events_endpoint: `${base}/agent/event/notify`,
    identity_types_supported: ["anonymous", "identity_assertion", "service_auth"],
    identity_assertion: {
      assertion_types_supported: ["urn:ietf:params:oauth:token-type:id-jag"],
    },
    events_supported: [
      "https://schemas.harp-standard.org/events/identity/assertion/revoked",
    ],
    harp: {
      version: "0.1",
      baa: {
        required_for_phi: true,
        terms_uri: `${base}/legal/baa`,
        accept_endpoint: `${base}/agent/baa/accept`,
        version_hash: "sha256:demo-baa-v1",
      },
      identity_proofing: {
        deidentified: { ial: 1, aal: 1 },
        phi_read: { ial: 2, aal: 2 },
        phi_write: { ial: 2, aal: 2 },
      },
      purpose_of_use_supported: ["TREATMENT", "PAYMENT", "HEALTHCARE_OPERATIONS"],
      scopes: [
        { name: "rcm.eligibility:read", purpose: "PAYMENT", phi: true, min_necessary: "coverage" },
        { name: "rcm.claims:read", purpose: "PAYMENT", phi: true, min_necessary: "claim" },
        { name: "rcm.claims:write", purpose: "PAYMENT", phi: true, min_necessary: "claim" },
      ],
      autonomy: {
        auto: ["rcm.eligibility:read", "rcm.claims:read"],
        human_review_required: ["medical_necessity_denial"],
        note: "Human-review actions follow applicable state law and tenant policy.",
      },
      delegation: {
        chain_required: true,
        claims: ["act"],
        format: "rfc8693",
      },
      payment_mandates_supported: ["ap2", "stripe-acp", "x402"],
      receipts: {
        supported: true,
        format_uri: "https://schemas.harp-standard.org/receipt/0.1",
        verify_uri: `${base}/agent/receipt/verify`,
      },
      free_tier: {
        scopes: [],
        data: "synthetic_or_deidentified",
        rate_limit: "100/day",
      },
    },
  };
}

export function buildServiceConfig(base: string): ServiceConfig {
  return {
    resourceBaseUrl: base,
    resourceName: "Acme Health RCM",
    authBaseUrl: base,
    issuer: base,
    agentAuth: buildAgentAuth(base),
  };
}

/** Scopes that touch PHI, derived from config. */
export function phiScopes(cfg: ServiceConfig): Set<string> {
  return new Set(
    cfg.agentAuth.harp.scopes.filter((s) => s.phi).map((s) => s.name),
  );
}
