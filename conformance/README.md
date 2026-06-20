# HARP conformance suite

A runnable test suite that checks whether a service meets the HARP standard. Point it at a service, read the report, and if it passes you may display the HARP-compliant badge.

This is **v0.1**. The suite is intentionally minimal. It covers the normative requirements in [`../CONFORMANCE.md`](../CONFORMANCE.md) and validates payloads against the JSON Schemas in [`../schemas`](../schemas). It will grow through the RFC process: every accepted normative change to the spec lands with a matching test in the same change, so the words and the tests do not drift.

Zero runtime dependencies. Node 18 or newer (it uses built-in `fetch`). The JSON Schema check is a small built-in validator scoped to the keywords the HARP schemas use.

## Run it

```bash
# against the bundled reference server (start it first; see ../reference/README.md)
node runner.mjs http://localhost:4000

# against your own service
node runner.mjs https://your-service.example.com

# include the optional receipts tier
node runner.mjs https://your-service.example.com --receipts
```

Default base URL is `http://localhost:4000` (the reference server). The runner prints a `PASS` / `FAIL` / `SKIP` / `MANUAL` line per check and a summary, then exits:

- `0` when the requested tier(s) pass
- `1` when a check in a requested tier fails
- `2` when the target is unreachable or the runner cannot start

Set `NO_COLOR=1` for plain output (useful in CI).

## The two tiers

| Tier | What it certifies | How to run |
|---|---|---|
| **CORE** | Registration. Discovery, the three flows, the BAA gate, least-privilege tokens, self-healing errors, PHI safety. | default |
| **RECEIPTS** | Optional. Consequential actions emit verifiable receipts that reference digests, not raw PHI, and a working verify endpoint. | add `--receipts` |

A service is **HARP-compliant (core)** when every CORE check is `PASS` or a confirmed `MANUAL` (see below). There is no partial core badge. A service is **HARP-compliant (receipts)** when it also passes every RECEIPTS check.

## What each check means

### 1. Discovery and manifest
- `/auth.md` is served and includes the two HARP sections (Compliance/BAA and Receipts).
- A protected endpoint returns `401` with a `WWW-Authenticate` header (RFC 9728 path to metadata).
- The `agent_auth` block is discoverable (in authorization-server or protected-resource metadata) and validates against `agent-auth.schema.json`.
- Every offered scope carries a `purpose`, a `phi` flag, and a `min_necessary` value (`scope.schema.json`).

### 2. The three registration flows
- `anonymous` returns a pre-claim token limited to the free tier.
- `service_auth` returns a claim token, user code, and `verification_uri`.
- `identity_assertion` accepts a valid ID-JAG and mints a token, and rejects a tampered assertion.

Identity requests are validated against `identity-request.schema.json` before they are sent.

### 3. The BAA gate (PHI)
- A PHI scope requested before BAA acceptance is refused, and the refusal points at the `accept_endpoint`.
- `POST /agent/baa/accept` returns a `baa_acceptance_id` and `scopes_unlocked` (validated against `baa-acceptance-event.schema.json`).
- After acceptance, the PHI scope becomes obtainable.

### 4. Least-privilege tokens
- The token is short-lived and audience-bound.
- A narrow request yields a narrow token (no over-grant).
- The token carries its purpose of use.
- A call outside the token's scope is refused.

### 5. Self-healing errors
- A missing-scope error names the required scope and how to obtain it, so an agent can recover without a human.

### 6. Receipts (receipts tier)
- A consequential action emits a receipt that validates against `receipt.schema.json`.
- The receipt references an inputs **digest**, never raw PHI.
- The verify endpoint validates a genuine receipt and rejects a tampered one, and returns the signed content rather than any altered outer copy.

### 7. PHI safety (cross-cutting)
- Discovery documents carry no PHI-like values.

## MANUAL and SKIP: honest by design

Some requirements cannot be fully proven from the outside at v0.1. Rather than fake a `PASS`, the runner is explicit:

- **MANUAL** means the check is a self-attestation. The runner exercised what it could and is telling you the rest is on you to confirm for your service. The current MANUAL checks are:
  - **stale `baa_version_hash` is rejected** when the service returns success for a hash that differs from its published `version_hash`. Confirm your service binds acceptance to the current hash.
  - **BAA acceptance recorded as a signed, append-only event.** This is an internal audit property not observable over the wire. Attest that acceptances are signed and immutable.
  - **an agent can self-heal end to end without a human.** The BAA-gate path exercises this in part. Attest the error bodies are sufficient to close the loop.
  - **no PHI in error bodies or receipts.** The runner does a shallow scan, which cannot prove absence. Attest that error bodies and receipts carry digests only.
- **SKIP** means the target service does not expose the endpoint a check needs, so the check did not run (for example, no protected path to probe). A SKIP is not a pass and not a fail.

For the core badge, every MANUAL check must be confirmed true for your service. Keep your evidence with the run report.

## Self-certification

1. **Get the suite.** Use this directory at the spec version you target (currently `0.1`).
2. **Point it at your service.** Run the reference server first to see a clean pass, then run against your own base URL.
3. **Provide test inputs.** Edit `fixtures/test-inputs.json`. For the `identity_assertion` flow against your own service, supply a trusted ID-JAG issuer the service accepts. The reference server ships a dev ID-JAG minter, so the suite mints one automatically when it is present; against a third-party service that check is reported MANUAL until you wire your issuer.
4. **Run the core tier**, then `--receipts` if you claim that tier.
5. **Read the report and fix failures.** Re-run until the requested tier is clean.
6. **Record the result.** The report plus your MANUAL attestations are your evidence for the version and tier you certified against. Re-certify when you change behavior or when a new spec version ships.

No one needs to certify you. The suite is public, so a partner, auditor, or customer can run it against your live service and confirm your claim.

## The badge

Pass the core tier and you may display **HARP-compliant**. Pass the receipts tier too and you may display **HARP-compliant (receipts)**. State the version next to the badge, for example "HARP-compliant, v0.1".

```html
<a href="https://github.com/.../HARP/conformance">HARP-compliant, v0.1</a>
```

Rules: display the badge only while you pass the current suite for the version you state, the badge claims conformance and not endorsement, and if you change behavior so the suite no longer passes, stop displaying it until you re-certify. See [`../CONFORMANCE.md`](../CONFORMANCE.md) for the full badge policy and [`../GOVERNANCE.md`](../GOVERNANCE.md) for the mark.

## Files

```
package.json              @harp-standard/conformance, zero deps
runner.mjs                the CLI: node runner.mjs <base-url> [--receipts]
lib/validate.mjs          tiny JSON Schema validator (subset the schemas use)
lib/schemas.mjs           loads ../schemas and builds the $id registry
fixtures/test-inputs.json synthetic, fictional test inputs (no PHI)
```

## Honesty rule

Do not weaken a test to pass. If a test is wrong, raise it as an issue or RFC. Changing a test's intent is a normative change and goes through the RFC process described in [`../CONTRIBUTING.md`](../CONTRIBUTING.md). The reference server is held to the full suite, so there is always one known-good implementation to compare against.
