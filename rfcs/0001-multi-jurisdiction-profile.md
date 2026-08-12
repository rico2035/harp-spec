# RFC 0001: Multi-jurisdiction profile (HIPAA + EU)

- **Status:** Draft
- **Author(s):** Ric S Kolluri, Neomics
- **Created:** 2026-08-12
- **Type:** Normative
- **Affects:** spec | schemas | reference | sdks | conformance

## Summary

Extend the `harp` metadata block so a service can declare, and an agent can satisfy, the requirements of more than one legal regime without forking the profile. Seven additions: typed agreements (BAA and GDPR DPA through the same acceptance flow), a per-grant legal-basis declaration for EU deployments, per-trust-framework identity-proofing bindings (NIST SP 800-63-4 and eIDAS), HL7 PurposeOfUse codes behind HARP purposes including break-glass, an extended autonomy block (decision-effect classification and oversight), a residency and transfer block, and receipt lifecycle rules (retention, pseudonymous references). The research behind these choices is summarized in `COMPLIANCE.md`.

## Motivation

HARP v0.1.x is HIPAA-shaped. An EU hospital or payer cannot adopt it as-is: there is no way to express a GDPR Art. 28 processor agreement, no lawful-basis declaration (EU health data needs an Art. 6 basis and an Art. 9 exception together), no eIDAS expression of the identity tiers, and no residency metadata, which EU buyers require before any connection. Meanwhile two US gaps surfaced in the same review: HIPAA's required emergency-access procedure has no HARP path, and the BAA block does not enumerate the contract provisions 45 CFR 164.504(e)(2) requires, which is what a covered entity's counsel will ask about first. One profile should serve both markets; the alternative (a forked EU variant) breaks the promise that any agent can read any HARP service.

## Proposed change

All additions live inside the `harp` extension. Field sketches; exact schema text lands with the implementation PRs.

1. **Typed agreements.** Replace the single `baa` object with `agreements`, an array of `{ type: "hipaa-baa" | "gdpr-dpa", terms_uri, version_hash, annex_hashes?, provisions?, accept_endpoint }`. For `hipaa-baa`, `provisions` enumerates the 164.504(e)(2) elements the terms contain. For `gdpr-dpa`, `annex_hashes` carries the deployment-specific annexes (processing description, technical and organisational measures, sub-processor list) that EDPB guidance requires beyond boilerplate. Acceptance events gain `accepted_by_role` asserting authority to bind the organization. `baa` remains as a deprecated alias for one release.
2. **Legal basis per grant (EU).** Optional `legal_basis: { art6_basis, art9_condition, member_state_law_ref?, professional_secrecy_attested? }` on scope grants and tokens. Registration against an EU service that declares `legal_basis_required: true` fails without it.
3. **Trust-framework bindings for identity proofing.** `identity_proofing` tiers become abstract with per-framework statements, e.g. `phi_read: { "nist-800-63-4": { ial: 2, aal: 2 }, "eidas-2015-1502": { loa: "substantial" } }`. No equivalence between frameworks is claimed; a deployment declares which framework(s) it accepts.
4. **HL7 PurposeOfUse codes.** `purpose_of_use` values become Codings from `http://terminology.hl7.org/CodeSystem/v3-ActReason` (mapping: TREATMENT to `TREAT`, PAYMENT to `HPAYMT`, HEALTHCARE_OPERATIONS to `HOPERAT`). This adds `BTG`/`ETREAT` for a break-glass path (closing the HIPAA 164.312 emergency-access gap: elevated access, mandatory receipt, after-the-fact review event) and `HRESCH` for research/EHDS secondary use, and makes HARP tokens consumable by IHE IUA / SMART Backend Services infrastructure.
5. **Autonomy block v2.** Per action: `effect` (`none` | `significant`), `art22_exception?`, `review` (`none` | `advisory` | `determinative`), plus block-level `human_intervention_endpoint`, `oversight_contact`, `halt_endpoint`, and optional per-scope `risk_classification` (EU AI Act Annex III point, Art. 6(3) claim, or out of scope). Services MUST refuse a registration that declares a solely automated significant-effect action on health data without an Art. 9(2)(a) or 9(2)(g) basis (GDPR Art. 22(4)); this is a validatable rule.
6. **Residency block.** `residency: { processing_regions, storage_regions, transfer_mechanisms: { region: "adequacy" | "scc-2021-914" | "dpf" | "none" }, eu_data_boundary? }`.
7. **Receipt lifecycle.** Receipts and audit events MUST NOT contain direct identifiers or clinical content (pseudonymous subject references and digests only; the resolution mapping lives off-log with the controller), and services declare `receipts.retention` (floor: 6 months, per EU AI Act Arts. 19/26(6); recommended: 6 years for US accounting alignment).

## Schema impact

`agent-auth` (agreements, identity_proofing bindings, autonomy v2, residency, legal_basis_required), `scope` (Coding-valued purpose, risk_classification), `baa-acceptance-event` (type, annexes, accepted_by_role), `receipt` (Coding-valued purpose_of_use, retention). New URIs cut at `https://schemas.harp-standard.org/*/0.2`. The 0.1 schemas stay published and served.

## Backward compatibility

A generic auth.md agent still registers and works on non-PHI paths untouched; every addition is inside the `harp` extension. For HARP-aware agents, 0.2 services SHOULD accept the 0.1 string purposes and the `baa` alias for one minor release and translate internally. Breaking risk concentrates in the purpose re-coding; the migration is a fixed three-entry mapping.

## Security and PHI impact

Strengthens all five pillars: agreements become verifiably complete rather than hash-opaque, break-glass turns emergency access from an undefined bypass into a receipted, reviewed path, the Art. 22(4) rule blocks an unlawful class of autonomous actions at registration time, pseudonymous receipts remove the last PHI-adjacent content from immutable artifacts, and residency disclosure moves a hidden compliance risk into discovery. No pillar is weakened.

## Conformance change

New checks: agreements array validates and acceptance without authority-bearing `accepted_by_role` is rejected; an EU-profile service refuses registration lacking `legal_basis` when required; the Art. 22(4) unlawful combination is refused; break-glass access without a subsequent review event fails; receipts containing SSN/DOB-like patterns fail (extending the existing PHI-safety scan); residency block validates. Reference server and fixtures gain an EU-profile configuration so both postures run in CI.

## Alternatives considered

- **Separate EU fork or "HARP-EU" profile:** rejected; splits the ecosystem and the conformance story.
- **Hardcoding a GDPR module rather than typed agreements and framework bindings:** rejected; the typed pattern extends to future regimes (UK, Gulf states, US state laws) without another schema cut.
- **Claiming a NIST-to-eIDAS equivalence table:** rejected; no legal basis exists (the EU-US TTC mapping is a draft), so equivalence claims would be wrong the day a regulator disagrees.
- **Keeping the ad-hoc purpose enum:** rejected; HL7 PurposeOfUse is what FHIR, IHE, and MyHealth@EU already speak, and it ships the break-glass codes HARP needs anyway.

## Open questions

1. Should `legal_basis` bind at registration, at token issuance, or both? (Token-level binding makes every access self-describing but grows the token.)
2. Break-glass review window: fixed by the spec (e.g. 72 hours) or declared per service?
3. Should `risk_classification` be free-declared or validated against a small enum of Annex III points?
4. Do we pin SP 800-63-4 only, or allow rev-3 declarations during a transition window for CSPs that have not migrated?
