# HARP Conformance

This document defines what "HARP-compliant" means, the test categories the public suite checks, how to self-certify, and the badge.

Conformance is self-serve and verifiable. No one needs Neomics to certify them. A service runs the public suite, passes, and may display the badge. The suite is the test of truth: spec text and the suite move together, so passing the suite means you match the standard, not just the prose.

HARP is a v0.1 draft, so the conformance suite is versioned alongside it. Certify against a stated version.

---

## What "HARP-compliant" means

A service is **HARP-compliant** (core) if it does all of the following, per the spec in `README.md`:

1. Hosts a valid `/auth.md` manifest.
2. Publishes a valid `agent_auth` block (with the `harp` extension) in its authorization-server metadata, discoverable via protected-resource metadata (RFC 9728).
3. Supports the three registration flows: `identity_assertion` (ID-JAG), `service_auth` (verified email), and `anonymous` (deferred ownership).
4. Enforces the BAA gate: no PHI scope is issued until the controlling org has accepted the current BAA, recorded as a signed, append-only event.
5. Issues purpose-bound, least-privilege tokens: short-lived, audience-bound, scoped to a purpose of use and minimum-necessary data.
6. Returns self-healing errors: a missing-scope or missing-prerequisite response is machine-actionable.

A service is **HARP-compliant (receipts tier)** if, on top of the core, it emits verifiable reasoning receipts in the published format and exposes a working `verify_uri`. Receipts are a separate tier so a service can be core-compliant first and add receipts later.

A service that does only part of the above is **not** HARP-compliant and must not display the badge. There is no partial badge for the core tier.

---

## Test categories

The public suite in `/conformance` is organized into categories. Each maps to a normative requirement in the spec and to a JSON Schema in `/schemas`.

### 1. Discovery and manifest

- `/auth.md` is reachable and parses, with the required sections in order, including the two HARP additions (Compliance/BAA and Receipts).
- A `401` on a protected endpoint returns a `WWW-Authenticate` header pointing at protected-resource metadata (RFC 9728).
- The `agent_auth` block validates against the schema: required base fields plus the `harp` object (`version`, `baa`, `identity_proofing`, `purpose_of_use_supported`, `scopes`, and, if claimed, `receipts` and `free_tier`).
- Every scope in `harp.scopes` carries a `purpose`, a `phi` flag, and a `min_necessary` value.

### 2. The three flows

- **identity_assertion**: a valid ID-JAG yields a scoped token; the issuer is verified via JWKS and `aud`, `exp`, `iat`, `jti`, `client_id` are validated. A forged signature, wrong `aud`, or expired assertion is rejected.
- **service_auth**: posting a `login_hint` returns a claim token, user code, and `verification_uri`; polling before verification is pending and succeeds after.
- **anonymous**: posting `{ "type": "anonymous" }` returns a pre-claim token limited to the free tier, plus a path to claim later at `claim_endpoint`.

### 3. The BAA gate (PHI)

- A request for a PHI scope without a completed BAA acceptance is refused, and the refusal points the agent at the BAA `accept_endpoint`.
- `POST /agent/baa/accept` with a matching `baa_version_hash` returns a `baa_acceptance_id` and the `scopes_unlocked`.
- After acceptance, PHI scopes the agent is entitled to become obtainable.
- A mismatched or stale `baa_version_hash` is rejected.
- Acceptance is recorded as a signed, append-only event.

### 4. Least-privilege tokens

- Tokens are short-lived and audience-bound.
- A token carries only the granted scopes and their purpose of use.
- A call outside the token's scope or purpose is refused.
- The service does not over-grant: requesting a narrow scope does not return a broad token.

### 5. Self-healing errors

- A missing-scope response is machine-actionable: it states the `required_scope`, the `purpose_of_use`, how to `obtain_via`, whether a BAA is required (and where), and the required `ial`/`aal`.
- An agent that follows the error body can reach a successful call without a human.

### 6. Receipts (receipts tier only)

- A consequential action emits a receipt matching the schema at `https://schemas.harp-standard.org/receipt/0.1`.
- The receipt references an inputs **digest**, never raw PHI.
- The receipt records the action, delegation chain, purpose of use, policy version, model, evidence references, and conclusion.
- `verify_uri` validates a genuine receipt and rejects a tampered one, without the verifier trusting the issuer.

### 7. PHI safety (cross-cutting)

- No PHI appears in error bodies, discovery documents, or receipts (digests only).
- De-identified or synthetic data paths (the free tier) never return PHI.

---

## How to self-certify

1. **Get the suite.** Clone the repo and use the suite in `/conformance`. Note the suite version (it matches a spec version, for example `0.1`).
2. **Point it at your service.** Configure the base URL of the service you want to certify (your own, or the reference server in `/reference` to see a clean pass first).
3. **Provide test inputs.** The suite needs a test ID-JAG issuer it can trust (or a mock issuer it ships), a test org for the BAA acceptance, and the free-tier configuration. The suite documents exactly what to supply.
4. **Run it.** Run the core categories (1 to 5, plus 7). Run category 6 only if you claim the receipts tier.
5. **Read the report.** The suite produces a pass/fail report per category with the failing assertions spelled out. Fix and re-run until clean.
6. **Record the result.** Keep the report. It is your evidence of the version and tier you certified against. Re-certify when you change behavior or when a new spec version ships.

Self-certification is the model on purpose: standards spread when conformance is in the implementer's hands and independently checkable, not when a single party gatekeeps it. The suite is public, so anyone (a partner, an auditor, a customer) can run it against your live service and confirm your claim.

---

## The badge

A service that passes the suite for the core tier may display the **HARP-compliant** badge. A service that also passes the receipts tier may display **HARP-compliant (receipts)**.

Rules for the badge:

- Display it only while you pass the **current** conformance suite for the version you state. State the version next to the badge (for example "HARP-compliant, v0.1").
- The badge claims conformance, not endorsement. It does not imply review or approval by Neomics or any standards body.
- If you change behavior so the suite no longer passes, stop displaying the badge until you re-certify.
- The HARP name and the badge mark are governed as described in `GOVERNANCE.md` (section 9). When HARP moves to a neutral standards body, the mark moves with it.

The badge spreads the standard peer to peer: a vendor that shows "HARP-compliant" tells every agent builder and every customer that they can connect with a known, testable path.

---

## Keeping conformance honest

- Every accepted normative change to the spec lands with a matching conformance test in the same change (see `CONTRIBUTING.md`). This is what keeps the words and the tests from drifting.
- Do not weaken a test to pass. If a test is wrong, raise it as an issue; changing a test's intent is a normative change and goes through an RFC.
- The reference server in `/reference` is held to the full suite, so there is always one known-good implementation to compare against.

---

*HARP is a v0.1 draft. The Neomics reference implementation and its planned sandbox at `https://api.goneomics.com/auth.md` are held to this suite.*
