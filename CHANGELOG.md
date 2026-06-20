# Changelog

All notable changes to HARP (Healthcare Agent Registration and Connection Profile) are recorded here. The format follows Keep a Changelog, and HARP versions follow SemVer as described in `GOVERNANCE.md` section 5. Each version is tagged in the repository and matched by a versioned conformance suite.

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
