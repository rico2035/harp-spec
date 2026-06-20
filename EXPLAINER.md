# HARP, in one page

**For:** health system, hospital, and payer leaders.
**About:** HARP, the Healthcare Agent Registration and Connection Profile. An open standard, originated by Neomics, published as a draft for public review.

---

## What HARP is

AI agents are becoming real users of healthcare software. They check eligibility, work denials, draft appeals, post payments, and follow up on balances. The problem: almost no healthcare system has a safe way to let an agent in. The usual workaround is a raw API key, which is unscoped, hard to audit, and impossible to revoke cleanly. That is not acceptable for protected health information (PHI).

HARP is the missing on-ramp. It is a thin, open profile that lets an AI agent discover a service, register, prove who it acts for, and start working, without a human filling out a form, and with the controls a PHI-handling service needs.

HARP builds on existing, stable internet standards (OAuth, plus the auth.md manifest the generic web already uses). It adds the parts healthcare requires and the base specs leave out.

---

## Why it matters

"Agent ready" is becoming the new "enterprise ready." If your systems cannot let a trusted agent in safely, your data and workflows sit behind a door agents cannot use, and the work stays manual.

HARP closes that gap without weakening control. Five things make it healthcare-grade:

- **A Business Associate Agreement built into the handshake.** No agent gets PHI access until its controlling organization accepts the BAA programmatically and that acceptance is recorded as a signed event. To our knowledge, this is new.
- **Least-privilege, purpose-bound access.** Every scope is tied to a purpose of use (treatment, payment, operations) and the minimum data needed. PHI is gated behind a stronger identity-proofing bar than de-identified data.
- **Clear autonomy rules.** The standard states what a service will do on its own and what it routes to a human, following applicable state law and your policy.
- **Provable decisions.** Any consequential action can emit a signed receipt (inputs, policy, model, evidence, conclusion) that an auditor or payer can verify without trusting the vendor.
- **A path for delegation.** Every action proves who it was on behalf of: organization, then workforce member, then agent.

---

## What it means for a health system or payer

- **A safe front door for agents.** Let trusted agents (yours, a partner's, or a patient's assistant) transact against your systems with scoped, revocable, audited access instead of shared keys.
- **Compliance that is mechanical, not manual.** The BAA, minimum-necessary scoping, and audit obligations are part of the connection itself, not a side process to chase.
- **Less integration drag.** Adopt one open profile rather than negotiating a bespoke integration with every agent vendor.
- **An audit trail you can hand to a regulator.** Signed, verifiable receipts for consequential actions.
- **No lock-in.** HARP is open and free to adopt. You can speak it without paying Neomics or anyone else.

---

## Why it is open

The way you win trust in a regulated industry is to give the standard away and then be the best implementation of it. HARP is published under an open license: the spec, the schemas, a runnable reference server, client and server SDKs, and a public conformance suite with a "HARP-compliant" badge. Any health system, payer, EHR, clearinghouse, or agent builder can adopt it without permission.

Neomics authored HARP to be vendor-neutral and has committed to donating it to a neutral standards body (such as HL7, the Linux Foundation, or the NIST AI Agent Standards Initiative) once adoption thresholds are met. The standard belongs to the industry. Neomics intends to be its first and most complete implementation.

---

## How to get involved

- **Read the draft.** HARP 0.1 is published for review. Start with the README and the spec.
- **Try it.** A hosted sandbox with synthetic data lets your team run the full flow with no contract and no PHI risk. (Sandbox and design-partner program are planned.)
- **Shape it.** Open an issue or an RFC. We are looking for design partners (a provider, a payer or clearinghouse, and an agent provider) to co-sign version 1.
- **Talk to us.** If you are thinking about how agents will connect to your revenue operations, we would like to compare notes.

> The next step is a conversation. Tell us where HARP is right, where it is wrong, and what your organization would need to adopt it.
