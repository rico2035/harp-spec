# HARP and healthcare regulation

**Status: informative.** This annex maps HARP v0.1.x onto the regulations a deploying organization answers to: HIPAA in the US, and GDPR, EHDS, eIDAS, and the AI Act in the EU. It states what HARP covers, what it deliberately leaves to the deployer, and what is proposed for v0.2 (see `rfcs/0001-multi-jurisdiction-profile.md`). Nothing here is legal advice, and HARP conformance is not a compliance certification. Legal status statements are current as of 2026-08-12; the watch items at the end are the things most likely to change.

---

## 1. HIPAA (United States)

The 2013 Omnibus Security Rule is the binding law. The January 2025 Security Rule NPRM (90 FR 898) proposing mandatory MFA and encryption has not been finalized; HHS's mid-2026 agenda targets July 2027. Items below marked "proposed" come from that NPRM and are design-ahead, not current obligations.

### 1.1 The BAA handshake and 45 CFR 164.504(e)

HHS accepts Business Associate Agreements in electronic form with electronic signatures, subject to state contract law (HHS FAQ 247). Large cloud providers already execute BAAs by online acceptance. HARP's machine acceptance (terms URI, version hash, signed append-only event) is an implementation of that established pattern, with two conditions the deploying parties must meet:

1. **The referenced document must be a complete BAA.** 45 CFR 164.504(e)(2) requires specific provisions: no use or disclosure beyond the contract, safeguards and Security Rule compliance, breach and security-incident reporting, subcontractor flow-down, individual access and amendment support, accounting support, performing the covered entity's Privacy Rule obligations where applicable, HHS access to books and records, return-or-destroy at termination, and a termination right for material breach. The hash proves which terms were accepted; it does not make incomplete terms sufficient.
2. **Acceptance must bind the organization.** The `accepted_by` party should be a person with authority to bind the controlling organization, identity-proofed at the service's `phi_write` tier or above. The agent itself cannot accept a BAA.

The return-or-destroy provision meets HARP's append-only audit log through the rule's own carve-out: where return or destruction is infeasible, the contract extends its protections to the retained information. BAA terms used with HARP should say this explicitly.

### 1.2 Security Rule technical safeguards (45 CFR 164.312)

| Safeguard | HARP mechanism |
|---|---|
| Unique user identification (required) | Per-agent identity plus the delegation chain (org, workforce member, agent) |
| Emergency access procedure (required) | Not yet in the profile. Proposed for v0.2 as a break-glass purpose of use (HL7 `BTG`/`ETREAT`) with mandatory receipts and after-the-fact review |
| Automatic logoff (addressable) | Short-lived tokens (the non-interactive equivalent of session termination) |
| Audit controls (required) | Signed append-only events plus reasoning receipts |
| Person or entity authentication (required) | Identity-proofing tiers (section 3) |
| Transmission security | All HARP flows require TLS 1.2 or later (stated in the spec as of v0.1.3) |

The proposed NPRM items map forward cleanly: HARP's revocation profile (RFC 7009 plus Security Event Tokens) is the right transport for the proposed 1-hour access termination and 24-hour cross-entity termination notice, and each registered agent is a natural entry in the proposed technology asset inventory. OCR's Risk Analysis Initiative makes one boundary worth stating plainly: HARP produces evidence for a regulated entity's risk analysis. It does not replace it, and each HARP-registered agent belongs in that analysis.

### 1.3 Minimum necessary and accounting

Purpose-bound scopes with per-scope `min_necessary` data classes implement the role-based access structure of 45 CFR 164.514(d): a class of actors mapped to the categories of PHI it needs. Minimum necessary applies with full force to PAYMENT and HEALTHCARE_OPERATIONS uses, which is HARP's revenue-cycle center of gravity. Reasoning receipts record more than a 164.528 accounting entry requires and also cover treatment, payment, and operations disclosures that current law exempts from accounting. Services that retain receipts for six years, queryable by patient, are positioned for both today's rule and any future extension of accounting to TPO disclosures.

---

## 2. GDPR (European Union)

GDPR applies today to any deployment processing EU personal data. HARP v0.1.x expresses purpose but not lawfulness; the fields that close the gap are proposed in RFC 0001. The mappings below describe the intended EU posture.

### 2.1 Legal basis comes in pairs

Health data is special category data (Art. 9). Every processing needs an Art. 6(1) lawful basis and an Art. 9(2) exception at the same time. Art. 9(2)(h) (management of health or social care systems and services) covers HARP's treatment, payment, and operations purposes, and carries the Art. 9(3) condition that processing happen under the responsibility of someone bound by professional secrecy. The correct pair differs per deployment (a public hospital and a private billing company will not declare the same bases), so the profile must let the controller declare it. RFC 0001 proposes a `legal_basis` structure bound to each scope grant.

### 2.2 The agreement layer: DPA beside BAA

GDPR Art. 28 requires a processor contract whose mandatory elements overlap heavily with a BAA: documented-instructions-only processing, confidentiality, security measures, sub-processor flow-down, assistance with data subject rights, delete-or-return, and audit access. Art. 28(9) states the contract "shall be in writing, including in electronic form," so HARP's acceptance mechanism carries a DPA the same way it carries a BAA. Two EDPB expectations shape the design: boilerplate fails (the DPA needs deployment-specific content: processing description, concrete technical and organisational measures, a sub-processor list, supported in RFC 0001 by per-deployment annex hashes), and the parties' GDPR roles (controller, processor, joint controller) must be declared, because the role determines which contract is needed at all. A dual-market deployment needs both agreements; neither substitutes for the other.

### 2.3 Automated decisions (Art. 22)

The sharpest GDPR constraint on autonomous agents: a solely automated decision with legal or similarly significant effect (denying a claim, adjusting a balance, triggering collections) needs an Art. 22(2) exception, and under Art. 22(4) it may not be based on health data unless explicit consent (9(2)(a)) or substantial-public-interest law (9(2)(g)) applies. The everyday healthcare basis 9(2)(h) is not enough. After the CJEU's SCHUFA judgment, a human review that cannot or does not override is no escape, and an upstream score a decision draws strongly on is itself the decision.

For HARP this is good news structurally: the autonomy declaration already separates autonomous from human-reviewed actions. RFC 0001 extends it with an effect classification, the exception relied on, a determinative-review flag, and a human-intervention endpoint, which makes the unlawful combination (significant effect, health data, autonomous, no qualifying exception) machine-detectable at registration time.

### 2.4 Erasure and append-only artifacts

The right to erasure (Art. 17) and immutable audit trails are reconciled by design, per the EDPB's blockchain guidelines: keep personal data off the immutable layer. HARP receipts and audit events must not contain direct identifiers or clinical content; they carry pseudonymous subject references and digests, with the resolution mapping held mutably by the controller. Erasure is then satisfied by deleting the mapping, while the signed chain keeps its integrity value. The spec states this rule as of v0.1.3.

### 2.5 Transfers and residency

No law requires publishing transfer metadata in a discovery document, but no EU hospital can lawfully connect an agent without knowing where processing happens and under which Chapter V mechanism (adequacy, the 2021 SCCs, Data Privacy Framework certification). RFC 0001 proposes a residency block (processing and storage regions, per-region mechanism, an `eu_data_boundary` flag) so that question is answered at machine speed, which is the whole point of HARP.

---

## 3. Identity assurance: NIST and eIDAS

HARP pins **NIST SP 800-63-4** (final since 2025; revision 3 is withdrawn). Under revision 4, the `deidentified` tier means: no identity proofing required, AAL1 authentication. The `phi_read` and `phi_write` tiers require IAL2/AAL2.

EU deployments will anchor identity in eIDAS assurance levels (low, substantial, high, per CIR (EU) 2015/1502) and, increasingly, the EUDI Wallet (issued at level high, member-state availability from late 2026). A draft EHDS implementing regulation would deliver health-professional attributes as wallet attestations. There is no legally recognized equivalence between the frameworks; the EU-US TTC digital identity mapping exercise (draft) supports the informal pairing of substantial with IAL2/AAL2. RFC 0001 therefore proposes per-trust-framework bindings on HARP's abstract tiers, so a deployment states its requirement in each framework's own vocabulary and claims no equivalence.

## 4. EHDS and EU interoperability

The European Health Data Space (Regulation (EU) 2025/327, in force since March 2025) applies generally from March 2027, with secondary use from March 2029. An agent acting for a patient or clinician against an EHR system is a primary-use client: expect identification via eIDAS-recognized eID (EHDS Art. 16) and access recording by the regulation's harmonised logging component, which HARP's delegation chain and purpose binding are shaped to feed. An agent doing research analytics is a secondary-use data user operating inside a secure processing environment under a data permit from a health data access body; HARP's machine-accepted agreements are the natural carrier for permit terms. Nothing is conformable yet; the implementing acts are the watch item.

On vocabulary and transport, HARP aligns with what EU healthcare already uses rather than inventing: HL7 PurposeOfUse codes (`TREAT`, `HPAYMT`, `HOPERAT`, with `BTG`/`ETREAT` for break-glass and `HRESCH` for research) as the coding system behind HARP purposes (RFC 0001), and compatibility with SMART Backend Services / IHE IUA, the OAuth profile the EU Health Data API ballot specifies for system-to-system access.

## 5. EU AI Act

Since 2 August 2026, Art. 50 transparency applies: an agent interacting with natural persons must disclose it is an AI system. The high-risk regime (Annex III) was deferred by the 2026 Digital Omnibus to 2 December 2027. Classification is per purpose: health-insurance risk assessment and pricing is high-risk (Annex III 5(c)), benefit decisions for public or statutory payers likely fall under 5(a), while routine revenue-cycle work (eligibility, claim status, drafting appeals for human review) has a credible exit under the Art. 6(3) preparatory-task filter. HARP's human-review gates are what make that exit arguable: the autonomy declaration is a machine-readable statement of exactly the posture Art. 6(3) asks providers to document.

For systems that are in scope from December 2027, HARP artifacts map onto the duties: reasoning receipts exceed the Art. 12 logging floor (retention declarations are proposed in RFC 0001, with the Act's six-month minimum), the autonomy block plus a stop/override channel and named oversight contact addresses Art. 14, and a receipt is most of an Art. 86 explanation. RFC 0001 reserves per-scope `risk_classification` and oversight fields so providers and deployers can carry their classification and duties in the profile itself.

## 6. Watch items

Revisit before v0.2 is finalized:

- HIPAA Security Rule final rule (HHS target July 2027): MFA and encryption mandates, asset inventories, termination-notice timing.
- EHDS implementing acts (identification management under Art. 16, EEHRxF) expected around March 2027.
- The draft EHDS identity-management implementing regulation (health-professional attestations in EUDI Wallets); details rest on secondary reporting and need re-verification.
- Commission guidelines finalizing Annex III classification, especially claims handling under points 5(a)/5(c).
- Finalization of the EU-US TTC identity mapping.
- US state health-privacy laws (not covered by this annex) for deployments beyond HIPAA-covered flows.
