# Changelog

All notable changes to HARP (Healthcare Agent Registration and Connection Profile) are recorded here. The format follows Keep a Changelog, and HARP versions follow SemVer as described in `GOVERNANCE.md` section 5. Each version is tagged in the repository and matched by a versioned conformance suite.

## [0.1.3] - 2026-08-13

Compliance release: a researched mapping of HARP onto US and EU healthcare regulation, plus spec clarifications. The wire-level profile version stays `0.1`; schemas are unchanged. Normative multi-jurisdiction fields are proposed, not shipped: they are in RFC 0001 for public review per `GOVERNANCE.md`.

### Added
- `COMPLIANCE.md`: informative mapping of HARP v0.1.x to HIPAA (the 164.504(e) BAA provisions, 164.312 technical safeguards, minimum necessary, accounting, the January 2025 Security Rule NPRM as design-ahead), GDPR (dual legal basis, Art. 28 DPA beside the BAA, Art. 22 automated decisions, erasure-by-design for receipts, Chapter V transfers), EHDS and eIDAS timelines and identity bindings, and the EU AI Act (Art. 50 in force now; the high-risk regime deferred to December 2027), with dated watch items. Backed by a 4-lane, 70+ source research pass (2026-08-12).
- RFC 0001 (draft, normative, for v0.2): typed agreements carrying a GDPR DPA through the same acceptance flow as the BAA, per-grant legal-basis declarations, per-trust-framework identity-proofing bindings (NIST SP 800-63-4 and eIDAS), HL7 PurposeOfUse codes including a receipted break-glass path, an extended autonomy block (decision-effect classification, GDPR Art. 22(4) validation, oversight and halt channels, EU AI Act risk classification), a residency and transfer block, and receipt lifecycle rules.

### Changed (spec clarifications, no wire change)
- Identity proofing pins NIST SP 800-63-4; the `deidentified` tier is clarified as "no identity proofing required, AAL1 authentication" under revision 4's redefinition of IAL1.
- All HARP flows require TLS 1.2 or later. Transmission security was assumed but never stated.
- Receipts and audit events must not contain direct identifiers or clinical content: pseudonymous references and digests only, with resolution mappings held off-log. This states the existing design intent as a rule.
- The BAA section states the two conditions that make machine acceptance legally meaningful: complete terms per 45 CFR 164.504(e)(2) at `terms_uri`, and acceptance by a person with authority to bind the organization.

## [0.1.2] - 2026-08-12

Patch release: implementation and tooling fixes plus continuous verification. No normative spec changes. The wire-level profile version (`agent_auth.harp.version`) stays `0.1`, and the conformance suite version is unchanged.

### Fixed
- The reference server now rejects a stale or mismatched `baa_version_hash` with a self-healing `400` (`stale_baa_version`) that carries the current `version_hash` and `terms_uri`. This implements the existing conformance requirement "a mismatched or stale `baa_version_hash` is rejected". The stale-hash conformance check now passes automatically against the reference server instead of falling back to a manual attestation.
- The reference server validates that `accepted_by` and `signature` are present on BAA acceptance, matching the required fields of the BAA acceptance event schema.
- `HarpClient.verifyReceipt` now compares the outer receipt fields against the signed embedded content and returns false when they differ. Previously a receipt whose outer fields had been altered after signing still verified as true, since only the signature JWT itself was checked.
- The dev-only verification page strips non-alphanumeric characters from the user code before rendering it into HTML.

### Added
- GitHub Actions CI (`.github/workflows/ci.yml`): builds the SDK, typechecks the SDK and the reference server, boots the reference server, and runs the full conformance suite (core + receipts) on every push and pull request. The "spec and suite move together" rule is now machine-enforced on the repository itself.
- `repository` metadata in the SDK, reference server, and conformance `package.json` files, all versioned `0.1.2`.

### Notes
- `[0.1]` below corresponds to `0.1.0`. This is the first tagged release of the repository; no `0.1.1` was published.

## [0.1] - 2026-06-26

Initial public draft, published for review under the MIT License.

### Added
- The HARP specification (`README.md`): discovery, the three registration flows (identity assertion via ID-JAG, service auth via verified email, anonymous deferred), the machine-negotiable BAA handshake, purpose-of-use and minimum-necessary scopes, NIST SP 800-63 identity-proofing levels per scope tier, audit obligations, delegation chains, autonomy declarations, and Verifiable Reasoning Receipts.
- JSON Schemas: `agent-auth`, `scope`, `identity-request`, `receipt`, and `baa-acceptance-event`.
- A runnable reference server demonstrating all three flows, the BAA gate for PHI scopes, a protected eligibility endpoint, and receipt issuance.
- A TypeScript SDK with client and server helpers (discovery, registration, BAA, token exchange, receipt verification).
- Diagrams: the universal action layer, the registration sequence, the security layers, and receipt verification.
- End-to-end examples: `agent_auth` metadata, an ID-JAG identity request, a sample receipt, and a sample `/auth.md` manifest.
- Governance, contributing, and conformance documents, plus this changelog and the maintainer list.

### Notes
- v0.x is a draft. Minor versions may include breaking changes while the design settles. From v1.0 the SemVer rules in `GOVERNANCE.md` are firm.
- A hosted Neomics sandbox with synthetic data at `api.goneomics.com/auth.md` is planned.
