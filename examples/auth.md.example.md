# auth.md: Acme Health RCM

This is the agent registration manifest for Acme Health RCM. It follows the auth.md profile and the HARP healthcare extension. An agent can read this file, register, prove who it acts for, and start working without a human filling out a form.

- Service: Acme Health RCM
- Base API: `https://api.acmehealthrcm.com`
- HARP version: 0.1
- Contact: agents@acmehealthrcm.com

## Discover

Read the protected-resource metadata to find the authorization server and scopes.

```
GET https://api.acmehealthrcm.com/.well-known/oauth-protected-resource
```

Unauthenticated calls to a protected resource return a `401` with a `WWW-Authenticate` header pointing at the authorization server. Read the `agent_auth` block from the authorization-server metadata:

```
GET https://auth.acmehealthrcm.com/.well-known/oauth-authorization-server
```

The `agent_auth.harp` block lists the BAA terms, identity-proofing levels per scope tier, purpose-bound scopes, autonomy policy, delegation format, supported payment mandates, receipt support, and the free tier.

## Pick a method

Three identity types are supported:

- `anonymous`: try the free tier now, claim ownership later.
- `identity_assertion`: present an ID-JAG from your provider for a synchronous scoped token. No human in the loop.
- `service_auth`: supply a verified email; a human approves through a device-style claim.

PHI scopes require a completed BAA acceptance before issuance. See Compliance (BAA) below.

## Register

### identity_assertion (ID-JAG)

```
POST https://auth.acmehealthrcm.com/agent/identity
Content-Type: application/json

{ "type": "identity_assertion", "assertion": "<ID-JAG>" }
```

The service verifies the issuer via JWKS and validates `aud`, `exp`, `iat`, `jti`, and `client_id`, then mints a scoped token through JWT-bearer exchange.

### service_auth (verified email)

```
POST https://auth.acmehealthrcm.com/agent/identity
Content-Type: application/json

{ "type": "service_auth", "login_hint": "biller@clinic.example.com" }
```

You receive a claim token and a user code. The user verifies at the returned `verification_uri`. Poll the token endpoint until granted.

### anonymous (deferred ownership)

```
POST https://auth.acmehealthrcm.com/agent/identity
Content-Type: application/json

{ "type": "anonymous" }
```

You receive a pre-claim token limited to the free tier (`rcm.eligibility:read`, synthetic or de-identified data, 100/day).

## Claim

A human claims an agent-created account through the claim endpoint using a device-authorization ceremony:

```
POST https://auth.acmehealthrcm.com/agent/identity/claim
```

After a successful claim the human can supervise, scope, and revoke the agent.

## Exchange

Exchange your assertion or grant for a purpose-bound access token. Delegation is carried with the `act` claim in RFC 8693 token exchange. Each PHI token carries the full chain from organization to workforce member to agent.

```
POST https://auth.acmehealthrcm.com/oauth/token
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
```

Request only the scopes you need. Tokens are least-privilege and bound to a single purpose of use.

## Use

Call the API or the MCP server with your scoped token.

```
GET https://api.acmehealthrcm.com/v1/eligibility?member_id=...
Authorization: Bearer <access_token>
X-Purpose-Of-Use: PAYMENT
```

Autonomy policy for Acme Health RCM:

- Auto (no human): `rcm.eligibility:read`, `rcm.claims:read`, `rcm.denials:work`
- Human review required: `medical_necessity_denial`

## Handle errors

Errors are self-describing so an agent can correct itself.

- `401 invalid_token`: token missing, expired, or revoked. Re-register or refresh.
- `403 baa_required`: the requested PHI scope needs a completed BAA acceptance. Run the BAA handshake, then retry.
- `403 insufficient_scope`: request the missing scope on exchange.
- `403 purpose_mismatch`: the token purpose of use does not match the action. Request a token bound to the correct purpose.
- `409 human_review_required`: the action is gated. A human must approve before it proceeds.
- `429 rate_limited`: free-tier or tenant rate limit reached.

## Revoke

Revoke a credential through token revocation (RFC 7009):

```
POST https://auth.acmehealthrcm.com/oauth/revoke
```

Registration-layer events (for example a revoked identity assertion) are signaled as security event tokens to the `events_endpoint`.

## Compliance (BAA)

Acme Health RCM is a HIPAA business associate. No PHI scope is issued until the agent's controlling organization accepts the Business Associate Agreement programmatically.

- Terms: `https://api.acmehealthrcm.com/legal/baa`
- Version hash: `sha256:8a1d4f2c9b6e0357aa2c1d8e4f6b0a3c5d7e9f1a2b4c6d8e0f1a3b5c7d9e1f2a`

```
POST https://auth.acmehealthrcm.com/agent/baa/accept
Content-Type: application/json

{
  "org_id": "org:acme-clinic-group",
  "baa_version_hash": "sha256:8a1d4f2c9b6e0357aa2c1d8e4f6b0a3c5d7e9f1a2b4c6d8e0f1a3b5c7d9e1f2a",
  "accepted_by": "compliance@acme-clinic-group.example.com",
  "signature": "<detached-signature>"
}

→ 200
{
  "baa_acceptance_id": "baa_5c1e7a9d3f0b248",
  "scopes_unlocked": ["rcm.eligibility:read", "rcm.claims:read", "rcm.claims:write", "rcm.denials:work", "rcm.collections:negotiate"]
}
```

The acceptance is recorded as a signed, append-only event. Identity proofing follows NIST SP 800-63: IAL1/AAL1 for de-identified data, IAL2/AAL2 for PHI read and PHI write. Scopes are bound to a purpose of use and the minimum data class needed.

## Receipts

For any consequential action, Acme Health RCM emits a signed Verifiable Reasoning Receipt. Anyone holding a receipt can verify the signature and the applied policy version without trusting the issuer. Receipts reference digests, never raw PHI.

- Format: `https://schemas.harp-standard.org/receipt/0.1`
- Verify: `https://api.acmehealthrcm.com/agent/receipt/verify`

```
POST https://api.acmehealthrcm.com/agent/receipt/verify
Content-Type: application/json

{ "receipt_id": "rcpt_9f24c7a1e0b34d58" }

→ 200
{ "valid": true, "policy_applied": "policy:rcm/denials@v3", "issued_at": "2026-06-17T14:22:09Z" }
```
