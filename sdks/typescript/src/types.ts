/**
 * HARP type definitions. These mirror the JSON Schemas in /schemas and the
 * field names in the HARP README (v0.1). Keep them in sync.
 */

export type PurposeOfUse = "TREATMENT" | "PAYMENT" | "HEALTHCARE_OPERATIONS";

export type IdentityType = "anonymous" | "identity_assertion" | "service_auth";

export type CredentialType = "api_key" | "access_token";

/** Protected Resource Metadata (RFC 9728), the fields HARP relies on. */
export interface ProtectedResourceMetadata {
  resource: string;
  resource_name: string;
  authorization_servers: string[];
  scopes_supported: string[];
  bearer_methods_supported: string[];
}

/** A single scope, bound to a purpose of use and a minimum-necessary data class. */
export interface HarpScope {
  name: string;
  purpose: PurposeOfUse;
  phi: boolean;
  /** Comma-separated minimum-necessary data classes, e.g. "claim,clinical_excerpt". */
  min_necessary: string;
}

/** NIST SP 800-63 identity-proofing levels required for a scope tier. */
export interface ProofingLevel {
  ial: number;
  aal: number;
}

export interface HarpBaaConfig {
  required_for_phi: boolean;
  terms_uri: string;
  accept_endpoint: string;
  version_hash: string;
}

export interface HarpAutonomy {
  /** Actions the service performs without a human. */
  auto: string[];
  /** Actions gated behind human review (law or tenant policy). */
  human_review_required: string[];
  note?: string;
}

export interface HarpDelegation {
  chain_required: boolean;
  claims: string[];
  /** Token format used to carry delegation, e.g. "rfc8693". */
  format: string;
}

export interface HarpReceiptsConfig {
  supported: boolean;
  format_uri: string;
  verify_uri: string;
}

export interface HarpFreeTier {
  scopes: string[];
  data: string;
  rate_limit: string;
}

/** The HARP healthcare extension carried inside the agent_auth block. */
export interface HarpExtension {
  version: string;
  baa: HarpBaaConfig;
  identity_proofing: {
    deidentified: ProofingLevel;
    phi_read: ProofingLevel;
    phi_write: ProofingLevel;
  };
  purpose_of_use_supported: PurposeOfUse[];
  scopes: HarpScope[];
  autonomy: HarpAutonomy;
  delegation: HarpDelegation;
  payment_mandates_supported: string[];
  receipts: HarpReceiptsConfig;
  free_tier: HarpFreeTier;
}

/** The agent_auth metadata block (base auth.md fields + the HARP extension). */
export interface AgentAuthMetadata {
  skill: string;
  identity_endpoint: string;
  claim_endpoint: string;
  events_endpoint: string;
  identity_types_supported: IdentityType[];
  identity_assertion: {
    assertion_types_supported: string[];
  };
  events_supported: string[];
  harp: HarpExtension;
}

/** OAuth authorization-server metadata, trimmed to what HARP reads/writes. */
export interface AuthorizationServerMetadata {
  issuer: string;
  token_endpoint: string;
  grant_types_supported: string[];
  agent_auth: AgentAuthMetadata;
}

/** POST /agent/identity request bodies (one per identity type). */
export type IdentityRequest =
  | { type: "anonymous" }
  | { type: "identity_assertion"; assertion: string }
  | { type: "service_auth"; login_hint: string };

export interface IdentityResponse {
  /** Present for identity_assertion once exchanged, or pre-claim for anonymous. */
  access_token?: string;
  token_type?: "Bearer";
  scope?: string;
  expires_in?: number;
  /** Present for service_auth and anonymous claim ceremonies. */
  claim_token?: string;
  user_code?: string;
  verification_uri?: string;
  interval?: number;
}

export interface BaaAcceptanceRequest {
  org_id: string;
  baa_version_hash: string;
  accepted_by: string;
  signature: string;
}

export interface BaaAcceptanceEvent extends BaaAcceptanceRequest {
  baa_acceptance_id: string;
  scopes_unlocked: string[];
  accepted_at?: string;
}

export interface ReceiptEvidence {
  source: string;
  ref: string;
}

/** A Verifiable Reasoning Receipt. References digests, never raw PHI. */
export interface Receipt {
  receipt_id: string;
  action: string;
  actor: {
    agent_id: string;
    delegation_chain: string[];
  };
  purpose_of_use: PurposeOfUse;
  inputs_digest: string;
  policy_applied: string;
  model: string;
  evidence: ReceiptEvidence[];
  conclusion: string;
  issued_at: string;
  signature: string;
}
