# HARP Governance

**Status:** v0.1 (draft)
**Applies to:** the HARP specification, schemas, reference implementation, SDKs, and conformance suite.
**License:** MIT (see "Licensing" below).

HARP (Healthcare Agent Registration and Connection Profile) is an open standard. This document describes how it is governed: who decides, how changes are proposed and accepted, how versions are cut, the vendor-neutral principle, and the committed path to hand the standard to a neutral body once adoption thresholds are met.

The short version: the spec is open and free to adopt, decisions are made in public through a written RFC process, and Neomics is the originator and reference implementer but does not own the standard's direction once it has traction.

---

## 1. Principles

1. **Vendor-neutral by design.** HARP is a profile of open building blocks (auth.md, OAuth RFCs, ID-JAG, MCP, A2A). Any service can publish HARP and any agent can read it with no account, contract, or fee with Neomics or anyone else. The spec names no required vendor. "Neomics" is the reference implementation, not the brand on the standard.
2. **Open process.** Every normative change is proposed in writing, discussed in public, and recorded. Decisions and their rationale live in the repository, not in private channels.
3. **Compose, do not reinvent.** Changes that add a new field or section to an existing standard are preferred over changes that fork or replace one. Backward compatibility with generic auth.md agents is a hard requirement (see section 7).
4. **Least privilege and provability stay central.** Any change must keep purpose-bound, minimum-necessary scoping and verifiable receipts intact. A change that weakens these needs a strong, documented justification.
5. **Conformance is the test of truth.** A claim of HARP compliance means passing the public conformance suite. Spec text and the suite move together; neither is authoritative alone.

---

## 2. Roles

HARP uses a light structure that grows with adoption. At v0.1 the structure is small on purpose.

| Role | Who | Responsibility |
|---|---|---|
| **Maintainers** | Named in `MAINTAINERS` (Neomics authors at v0.1, broadening over time) | Triage issues, review RFCs and PRs, cut releases, run the conformance suite. |
| **Editors** | A subset of maintainers | Hold the pen on spec text and schemas. Keep field names, endpoints, and flows consistent across `/spec`, `/schemas`, `/reference`, and `/sdks`. |
| **Working Group** | Implementers who adopt HARP (providers, payers, clearinghouses, EHRs, agent builders) | Bring real-world requirements, co-sign major versions, vote when consensus is contested (section 5). |
| **Contributors** | Anyone | File issues, write RFCs, send PRs (see `CONTRIBUTING.md`). |

The Working Group forms as design partners and early adopters implement the standard. Co-authored standards get adopted; standards dictated by one vendor get ignored. As the Working Group forms, maintainer and editor seats open to people outside Neomics.

---

## 3. The RFC and change process

All normative changes go through an RFC. A normative change is anything that affects what a conforming service or agent must do: field names, endpoints, the three flows, the BAA gate, scope grammar, identity-proofing levels, the receipt format, SET events, or conformance criteria.

Non-normative changes (typos, prose clarity, examples, docs) go through a regular PR and do not need an RFC.

### RFC lifecycle

1. **Issue.** Open an issue describing the problem or gap. Discussion happens here first. Not every issue becomes an RFC.
2. **Draft RFC.** Open a PR adding a numbered file under `/rfcs` (`rfcs/NNNN-short-title.md`) using the RFC template. The draft states the motivation, the proposed spec change, schema impact, backward-compatibility analysis, security and PHI impact, and the conformance-suite change required to test it.
3. **Review.** Maintainers and the Working Group review in the open. The author revises. Review stays open at least 14 calendar days for a minor change and at least 30 for a major one, so implementers have time to weigh in.
4. **Decision.** A maintainer records **Accepted**, **Rejected**, or **Deferred** in the RFC with a written rationale (section 5 covers how the decision is reached).
5. **Land.** An accepted RFC ships as one or more PRs that update spec text, JSON Schemas, the reference server, the affected SDKs, and the conformance suite together. An accepted RFC is not "done" until conformance can test it.
6. **Release.** The change appears in the next version cut (section 6) and the public changelog.

Every accepted normative change touches the conformance suite. This is the rule that keeps the spec and the implementations from drifting.

---

## 4. Decision-making

Decisions are made by **consensus of the maintainers**, informed by Working Group input on the RFC. Consensus here means no maintainer has a sustained, reasoned objection that the author has not addressed, not that everyone is enthusiastic.

When consensus cannot be reached:

- The maintainers call a vote. Each maintainer gets one vote. A simple majority decides a minor change.
- A **major** change (a new MAJOR version, a break in backward compatibility, or a change to the open/proprietary boundary in section 8) needs a two-thirds majority of maintainers **and** sign-off from a majority of the active Working Group.
- A tie or a failed major vote means the change is **Deferred**, not forced through.

All votes and their rationale are recorded in the RFC. Until the Working Group has formed, the originating maintainers hold these decisions and document them in public so the record is reviewable later.

---

## 5. Versioning

HARP versions the standard with SemVer, tracked in the `harp.version` field in the `agent_auth` block (`"version": "0.1"` at draft).

- **MAJOR** (for example 1.0 to 2.0): a breaking change to the manifest, a flow, the BAA gate, scope grammar, or the receipt format that a conforming implementation cannot ignore. Needs the major-change process in section 4.
- **MINOR** (for example 0.1 to 0.2): additive, backward-compatible changes. New optional fields, new scope tiers, new SET event types, new optional sections in `/auth.md`.
- **PATCH** (for example 0.1.0 to 0.1.1): clarifications, prose fixes, example fixes, schema annotations that do not change validation behavior.

Pre-1.0 caveat: at v0.x the standard is a draft and minor versions may include breaking changes while the design settles. From v1.0 the SemVer rules above are firm. Each version is tagged in the repo, recorded in the public changelog, and matched by a versioned conformance suite.

Schemas are versioned by URI (for example `https://schemas.harp-standard.org/receipt/0.1`). A new schema version gets a new URI so older receipts and manifests stay verifiable.

---

## 6. The vendor-neutral principle

HARP is built so the industry can own it.

- The spec requires no named vendor and no account with any company.
- Discovery, registration, the BAA handshake, scope grammar, and the receipt format are described in terms of open standards (auth.md, RFC 9728, RFC 7523, RFC 8628, RFC 7009, RFC 8935, RFC 8693, ID-JAG) so a second, third, or tenth implementation is possible from the spec alone.
- Schema URIs live under a neutral domain (`schemas.harp-standard.org`), not a Neomics product domain.
- The conformance suite is self-serve. No one needs Neomics to certify them.

Neomics is the originator and the first, most complete implementation. That is a position earned by authoring and shipping, not a control point. The reference implementation has no privileged path in the spec that a third party cannot also take.

---

## 7. Backward compatibility

A generic auth.md agent that knows nothing about healthcare must still register and work against a HARP service for the non-PHI paths it is entitled to. The HARP additions (the `harp` object, the BAA gate, identity-proofing levels, purpose-of-use scopes, receipts) are additive and ignorable by agents that do not understand them. Any RFC that breaks this is a major change and carries the burden of proof in section 4.

---

## 8. The open / proprietary boundary

This boundary is fixed policy. Moving it is a major change (section 4).

| Open and public (MIT, free to adopt) | Proprietary (Neomics) |
|---|---|
| The HARP specification and the RFC process | The Neomics platform and its agent fleet |
| The JSON Schemas (`agent_auth`, scopes, receipts, BAA events, SET events) | The trained and distilled models, model routing |
| The reference server | The data: cross-tenant patterns, payer behavior models |
| The client and server SDKs (TypeScript, Python) | The RCM and collections domain logic and integrations |
| The conformance suite and the HARP-compliant badge | The autonomy policies, eval sets, and operations console |
| The Verifiable Reasoning Receipt **format** | The model that generates high-quality receipts |
| The purpose-of-use scope grammar and the BAA handshake **format** | |

The rule: open the interfaces and the trust primitives so anyone can speak the language and verify the work. Keep the intelligence and the data so no one can reproduce the outcomes. Publishing the spec costs Neomics nothing and makes every adopter a path back to the reference implementation. Open the language, not the platform.

---

## 9. Licensing

The specification, schemas, reference implementation, SDKs, and conformance suite are released under the **MIT License**, the same license as auth.md. MIT was chosen for the lowest possible adoption friction: any healthcare organization, EHR, payer, clearinghouse, or agent builder can implement HARP in a proprietary product with no copyleft obligation.

Trademark on the HARP name and the HARP-compliant badge is held by the originator until the standard moves to a neutral body (section 10), at which point the mark moves with it. The badge may only be displayed by services that pass the current conformance suite.

The proprietary Neomics platform, its models, and its data are not covered by the MIT grant and are not part of this repository.

---

## 10. Path to a neutral standards body

Neomics pre-commits, here in writing, to donate HARP to a neutral standards body once it has real adoption. Donating the standard is the strongest signal that it is genuinely open, and it removes the "this is a Neomics land-grab" objection for good.

### Candidate bodies

- **HL7** (FHIR and the Da Vinci project): the natural home for a healthcare data and interoperability profile, and the body the payer-side prior-auth APIs already align to.
- **The Linux Foundation** (where A2A is already hosted): a neutral home for an agent-protocol profile with broad cross-industry membership.
- **The NIST AI Agent Standards Initiative**: a fit if the agent-registration and identity-proofing parts become the center of gravity.

The choice will be made with the Working Group based on where HARP's center of gravity sits when the thresholds are met.

### Adoption thresholds (any two of the following trigger the donation process)

1. **Independent implementations.** At least three HARP-compliant services that pass the conformance suite and are operated by organizations unaffiliated with Neomics.
2. **Independent governance.** A Working Group with a majority of seats held by people outside Neomics, having co-signed at least one major version.
3. **Production use.** At least one HARP service handling real (non-sandbox) agent traffic under a live BAA, operated by an organization other than Neomics.

### The donation process

When the thresholds are met, the maintainers open an RFC proposing the target body and the transfer terms (governance handover, trademark transfer for the HARP name and badge, continuity of the conformance suite). The RFC follows the major-change process in section 4 (two-thirds maintainer majority plus Working Group majority). On acceptance, the spec, schemas, reference, SDKs, conformance suite, name, and badge move to the chosen body. Neomics stays a contributor and reference implementer, on equal footing with every other member.

---

## 11. Code of conduct

Participation in HARP is governed by the project Code of Conduct (see `CONTRIBUTING.md` for the pointer and reporting path). It applies to issues, RFCs, PRs, and any HARP-run discussion space.

---

## 12. Amending this document

`GOVERNANCE.md` is itself changed through the RFC process. A change to the decision-making rules (section 4), the open/proprietary boundary (section 8), or the donation commitment (section 10) is a major change and needs the major-change vote.

---

*HARP is a v0.1 draft published for public review. The hosted Neomics sandbox at `api.goneomics.com/auth.md` is planned.*
