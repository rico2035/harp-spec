# HARP Quickstart

Two tracks:

- **Track A: build an agent that uses a HARP service.** Point your agent at a service, register, get a purpose-bound token, and start working. Includes a "Connect to Neomics" walkthrough.
- **Track B: make your own service HARP-compliant.** Host `/auth.md`, publish the `agent_auth` block, implement the three flows plus the BAA gate, issue least-privilege tokens, and optionally emit receipts.

HARP is a v0.1 draft. The hosted Neomics sandbox at `https://api.goneomics.com/auth.md` is planned, so the curl examples below show the shape of each call. Field names, endpoints, and flows match the spec in `README.md`.

A note on the examples: the bodies are real JSON, but token strings, hashes, and IDs are placeholders. Replace them with values your provider and the service give you.

---

## Track A: build an agent that uses a HARP service

The path is the same for any HARP service: **discover, pick a method, register, (BAA for PHI), exchange, use, read receipts.**

### A1. Discover the service

Start from any protected endpoint. A `401` carries a `WWW-Authenticate` header pointing at the protected-resource metadata (RFC 9728).

```bash
curl -i https://api.goneomics.com/v1/eligibility/check
# HTTP/1.1 401 Unauthorized
# WWW-Authenticate: Bearer resource_metadata="https://api.goneomics.com/.well-known/oauth-protected-resource"
```

Fetch the protected-resource metadata, then the authorization-server metadata, which carries the `agent_auth` block (including the `harp` extension).

```bash
curl https://api.goneomics.com/.well-known/oauth-protected-resource
curl https://api.goneomics.com/.well-known/oauth-authorization-server
```

You can also just read the human-and-agent-readable manifest directly:

```bash
curl https://api.goneomics.com/auth.md
```

The `agent_auth` block tells you the `identity_endpoint`, the `claim_endpoint`, which `identity_types_supported` the service accepts, the scopes and their purpose-of-use, the identity-proofing levels per scope tier, whether a BAA is required for PHI, and whether receipts are supported. Read `harp.scopes` to see what each scope costs you in proof and BAA terms.

### A2. Pick a method

| You have | Use this flow | Human needed? |
|---|---|---|
| An ID-JAG from your provider (your agent provider or an enterprise IdP) | `identity_assertion` | No |
| A user's verified email | `service_auth` | Yes, once, to verify |
| Nothing yet, want to try the free tier | `anonymous` | Later, to claim |

For PHI scopes you also need a completed BAA acceptance (step A4), on top of an ID-JAG assertion that meets the required identity-proofing level.

### A3. Register

**Try it now (anonymous).** Get a pre-claim token limited to the free tier. No human, no PHI.

```bash
curl -X POST https://api.goneomics.com/agent/identity \
  -H "Content-Type: application/json" \
  -d '{ "type": "anonymous" }'
# 200
# { "access_token": "<pre-claim token>", "scope": "rcm.eligibility:read",
#   "data": "synthetic_or_deidentified", "claim_uri": "https://.../agent/identity/claim" }
```

The free tier (per the manifest) is read-only against synthetic or de-identified data, rate-limited. Good enough to wire up and test the full call path before any contract.

**Register for real (ID-JAG).** Get an audience-specific ID-JAG from your provider for `aud = https://api.goneomics.com`, then post it.

```bash
curl -X POST https://api.goneomics.com/agent/identity \
  -H "Content-Type: application/json" \
  -d '{ "type": "identity_assertion",
        "assertion": "<ID-JAG JWT>" }'
```

The service verifies the issuer via JWKS and validates `aud`, `exp`, `iat`, `jti`, and `client_id`, then mints a scoped token through JWT-bearer exchange (RFC 7523). For non-PHI scopes you are done. For PHI scopes the response tells you the BAA is still required (see self-healing errors below), so do step A4 first.

**Verified-email flow (service_auth).** If you are acting for a specific user by email:

```bash
curl -X POST https://api.goneomics.com/agent/identity \
  -H "Content-Type: application/json" \
  -d '{ "type": "service_auth", "login_hint": "biller@clinic.example.com" }'
# 200 { "claim_token": "...", "user_code": "WDJB-MJHT",
#       "verification_uri": "https://.../verify", "interval": 5 }
```

Show the user the `verification_uri` and `user_code`, then poll the token endpoint until granted (device-authorization style, RFC 8628).

### A4. Accept the BAA (required before any PHI scope)

PHI scopes stay unobtainable until your controlling organization accepts the Business Associate Agreement programmatically. Read `harp.baa.terms_uri` and `harp.baa.version_hash` from the manifest, then post acceptance.

```bash
curl -X POST https://api.goneomics.com/agent/baa/accept \
  -H "Content-Type: application/json" \
  -d '{ "org_id": "org_123",
        "baa_version_hash": "sha256:<from manifest>",
        "accepted_by": "compliance@clinic.example.com",
        "signature": "<org signature>" }'
# 200
# { "baa_acceptance_id": "baa_abc",
#   "scopes_unlocked": ["rcm.eligibility:read", "rcm.claims:read", "rcm.claims:write"] }
```

The acceptance is recorded as a signed, append-only event. Now re-run the ID-JAG registration (or token exchange) to receive a token carrying the PHI scopes you are entitled to.

### A5. Get a purpose-bound token

Whichever flow you used, you end with a short-lived, audience-bound, least-privilege access token. It carries the scope and the HL7 purpose-of-use it was granted for (for example `rcm.eligibility:read` with purpose `PAYMENT`). Ask only for what you need: the token is minimum-necessary by design.

### A6. Call the service (MCP or REST)

**REST:**

```bash
curl -X POST https://api.goneomics.com/v1/eligibility/check \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d '{ "member_id": "...", "payer_id": "...", "service_type": "30" }'
```

**MCP:** point your MCP client at the Neomics MCP server using the same bearer token. The tools map to the same scopes (eligibility, claim status, denials, and the scoped writes your token allows). Use whichever surface your agent prefers; the permissions and audit are identical because both go through the same action pipeline.

### A7. Handle errors (they fix themselves)

HARP errors are machine-actionable. A `403` for a missing scope tells you exactly what to do next, so your agent can self-heal without a human.

```jsonc
// 403
{
  "error": "insufficient_scope",
  "required_scope": "rcm.claims:write",
  "purpose_of_use": "PAYMENT",
  "obtain_via": "identity_assertion",
  "baa_required": true,
  "baa_accept_endpoint": "https://api.goneomics.com/agent/baa/accept",
  "identity_proofing": { "ial": 2, "aal": 2 }
}
```

Read the body, satisfy the requirement (accept the BAA, bring a stronger assertion, request the right scope), and retry.

### A8. Read your receipts

For any consequential action, ask for or fetch the signed receipt. It references digests, never raw PHI. Verify it at the service's `verify_uri` without trusting the issuer.

```bash
curl -X POST https://api.goneomics.com/agent/receipt/verify \
  -H "Content-Type: application/json" \
  -d '{ "receipt_id": "rcpt_123" }'
# 200 { "valid": true, "policy_applied": "policy:rcm/denials@v3", "issued_at": "..." }
```

The receipt records the action, the delegation chain, the purpose of use, an inputs digest, the policy version, the model, the evidence references, and the conclusion. Keep it: it is portable, machine-checkable proof of what happened and why.

### Connect to Neomics (recap)

1. Point your agent at `https://api.goneomics.com/auth.md`.
2. Register anonymous to try against synthetic data, with no contract and no PHI.
3. For PHI: bring an ID-JAG, accept the BAA, receive a purpose-bound token.
4. Call the Neomics MCP server or REST API.
5. Read and verify your receipts.

The hosted sandbox with synthetic data is planned, so you can run the full path with zero PHI risk.

---

## Track B: make your own service HARP-compliant

You need: a `/auth.md` manifest, an `agent_auth` block (with the `harp` extension), the three registration flows, the BAA gate for PHI scopes, least-privilege purpose-bound tokens, and optionally receipts. The fastest start is the reference server in `/reference`, which gives you all of this to copy and adapt.

### B1. Host `/auth.md`

Publish a Markdown manifest at `https://your-service.example.com/auth.md`. It is a procedural recipe an agent follows: discover, pick a method, register, claim, exchange, use, handle errors, revoke. HARP adds two sections to the base auth.md outline: **Compliance (BAA)** and **Receipts**. Keep the manifest generated from your scope vocabulary so it never drifts from what your tokens actually grant.

### B2. Publish the `agent_auth` block

Serve it in your OAuth authorization-server metadata, discoverable via protected-resource metadata (RFC 9728). Include the base auth.md fields and the `harp` healthcare extension. The shape (from the spec):

```jsonc
{
  "agent_auth": {
    "skill": "https://your-service.example.com/auth.md",
    "identity_endpoint": "https://auth.your-service.example.com/agent/identity",
    "claim_endpoint": "https://auth.your-service.example.com/agent/identity/claim",
    "events_endpoint": "https://auth.your-service.example.com/agent/event/notify",
    "identity_types_supported": ["anonymous", "identity_assertion", "service_auth"],
    "identity_assertion": {
      "assertion_types_supported": ["urn:ietf:params:oauth:token-type:id-jag"]
    },
    "harp": {
      "version": "0.1",
      "baa": {
        "required_for_phi": true,
        "terms_uri": "https://your-service.example.com/legal/baa",
        "accept_endpoint": "https://auth.your-service.example.com/agent/baa/accept",
        "version_hash": "sha256:..."
      },
      "identity_proofing": {
        "deidentified": { "ial": 1, "aal": 1 },
        "phi_read":     { "ial": 2, "aal": 2 },
        "phi_write":    { "ial": 2, "aal": 2 }
      },
      "purpose_of_use_supported": ["TREATMENT", "PAYMENT", "HEALTHCARE_OPERATIONS"],
      "scopes": [
        { "name": "rcm.eligibility:read", "purpose": "PAYMENT", "phi": true, "min_necessary": "coverage" }
      ],
      "receipts": {
        "supported": true,
        "format_uri": "https://schemas.harp-standard.org/receipt/0.1",
        "verify_uri": "https://your-service.example.com/agent/receipt/verify"
      },
      "free_tier": {
        "scopes": ["rcm.eligibility:read"],
        "data": "synthetic_or_deidentified",
        "rate_limit": "100/day"
      }
    }
  }
}
```

Validate it against the JSON Schema in `/schemas` before you ship.

### B3. Implement the three flows

At `identity_endpoint` (`POST /agent/identity`), accept the three `type` values:

- **`identity_assertion`**: verify the ID-JAG issuer via JWKS, validate `aud`, `exp`, `iat`, `jti`, `client_id`, then mint a scoped token via JWT-bearer exchange (RFC 7523). Synchronous, no human.
- **`service_auth`**: issue a claim token and user code, have the user verify at a `verification_uri`, let the agent poll the token endpoint (RFC 8628).
- **`anonymous`**: issue a pre-claim token limited to your free tier; let a human claim later at `claim_endpoint` (device-style ceremony, RFC 8628).

Wire revocation (RFC 7009) and SET events (RFC 8935) at your `events_endpoint`.

### B4. Gate PHI behind the BAA

No PHI scope is issued until the agent's controlling org has accepted the current BAA. Implement `POST /agent/baa/accept`:

```jsonc
// request
{ "org_id": "...", "baa_version_hash": "sha256:...", "accepted_by": "...", "signature": "..." }
// 200
{ "baa_acceptance_id": "...", "scopes_unlocked": ["rcm.eligibility:read", "..."] }
```

Record acceptance as a signed, append-only event. Until it completes, every PHI scope request returns the self-healing `403` (B6) pointing the agent at the BAA endpoint.

### B5. Issue least-privilege tokens

Mint short-lived, audience-bound tokens that carry only the scopes the agent is entitled to and the purpose of use each was granted for. Bind scope to purpose-of-use and to minimum-necessary data (the `min_necessary` field on each scope). Do not hand out a broad token because it is easier; minimum-necessary is the point.

### B6. Return self-healing errors

When an agent lacks a scope or a prerequisite, answer with a machine-actionable body so it can fix itself: the `required_scope`, the `purpose_of_use`, how to `obtain_via`, whether a BAA is required and where to accept it, and the required `ial`/`aal`. See A7 for the shape.

### B7. (Optional) Emit receipts

For consequential actions, emit a signed receipt in the format at `https://schemas.harp-standard.org/receipt/0.1`. Record the action, the delegation chain, the purpose of use, an inputs **digest** (never raw PHI), the policy version, the model, the evidence references, and the conclusion. Expose a `verify_uri` so a third party can check the signature and the policy version without trusting you. Receipts are a separate conformance tier; you can be HARP-compliant for the core flows first and add receipts later.

### B8. Verify with the conformance suite

Point the suite in `/conformance` at your service and confirm it passes: valid `/auth.md` and `agent_auth`, the three flows, the BAA gate on PHI scopes, purpose-bound least-privilege tokens, and (for the receipts tier) verifiable receipts. See `CONFORMANCE.md` for the categories, self-certification, and the badge.

---

## Where to go next

- `README.md`: the full spec draft (fields, flows, schemas, receipts).
- `CONFORMANCE.md`: what compliance means and how to self-certify.
- `CONTRIBUTING.md`: file issues, write RFCs, send PRs.
- `GOVERNANCE.md`: how HARP is governed and the path to a neutral standards body.
- `/reference`: a runnable HARP-compliant server to copy from.
- `/examples`: end-to-end samples (eligibility, prior auth, balance settle).

*HARP is a v0.1 draft. The Neomics sandbox at `https://api.goneomics.com/auth.md` is planned.*
