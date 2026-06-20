# Contributing to HARP

Thanks for helping build HARP (Healthcare Agent Registration and Connection Profile). HARP is an open standard and it gets better when people who actually run healthcare services and build agents tell us where it falls short.

This document covers how to file issues, propose changes through RFCs, send pull requests, work with the conformance suite, and sign off your commits. Governance (who decides, versioning, the donation path) lives in `GOVERNANCE.md`.

HARP is a v0.1 draft. Expect the design to move while it settles.

---

## Ways to contribute

You do not have to write spec text to be useful. In rough order of how often each is needed:

1. **Implement HARP and report back.** Stand up the reference server, run an agent against it, or make your own service compliant. Real implementation feedback is the most valuable input a draft standard can get.
2. **File issues.** Found a gap, an ambiguity, a security concern, or a place where the spec and a schema disagree? Open an issue.
3. **Write RFCs.** Propose a normative change: a new field, a new scope tier, a change to a flow, a fix to the BAA gate or the receipt format.
4. **Send PRs.** Fix prose, examples, schema annotations, SDK bugs, or conformance tests.
5. **Join the Working Group.** If your organization adopts HARP, bring your requirements and help co-sign versions (see `GOVERNANCE.md`).

---

## Before you start

- Read `README.md` (the spec draft) and `GOVERNANCE.md`.
- Search existing issues and `/rfcs` so you are not duplicating work.
- Keep changes consistent with the field names, endpoints, and flows already in the README. If your change needs to alter one of those, that is a normative change and goes through an RFC.

---

## Filing an issue

Open an issue when you have found a problem or a question, not yet a full proposal. A good issue states:

- What you were trying to do (build an agent that uses a HARP service, or make a service compliant).
- What you expected from the spec.
- What actually happened, or what is missing or ambiguous.
- The version (`harp.version`, for example `0.1`) and which file or section.

Security issues are different: do not open a public issue. See "Reporting a vulnerability" below.

---

## The RFC process (normative changes)

A **normative change** is anything that affects what a conforming service or agent must do: field names, endpoints, the three registration flows, the BAA gate, scope grammar, identity-proofing levels (IAL/AAL), the receipt format, SET events, or conformance criteria. Normative changes go through an RFC.

A **non-normative change** (typos, prose, examples, docs, SDK internals that do not change behavior) goes straight to a PR.

### Steps

1. Open an issue first to discuss the problem. Not every issue becomes an RFC.
2. Copy `rfcs/0000-template.md` to `rfcs/NNNN-short-title.md` and open a PR. The RFC states:
   - **Motivation.** The problem in concrete terms, ideally from a real implementation.
   - **Proposal.** The exact spec change. Show the new or changed `agent_auth` fields, `/auth.md` sections, flow steps, or schema.
   - **Schema impact.** Which JSON Schemas under `/schemas` change, and how.
   - **Backward compatibility.** Confirm a generic auth.md agent still registers and works for non-PHI paths. A break here makes this a major change (see `GOVERNANCE.md`).
   - **Security and PHI impact.** What changes for purpose-of-use scoping, minimum-necessary, the BAA gate, identity proofing, delegation, or audit.
   - **Conformance.** The conformance-suite test(s) that will prove the change.
3. Review stays open in public: at least 14 days for a minor change, 30 for a major one.
4. A maintainer records Accepted, Rejected, or Deferred with a written rationale.
5. An accepted RFC lands as PRs that update spec text, schemas, the reference server, affected SDKs, and the conformance suite **together**. An RFC is not done until conformance can test it.

Decision-making and voting rules are in `GOVERNANCE.md`.

---

## Pull requests

- Branch from `main`. Use a descriptive branch name.
- Keep PRs focused. One change per PR.
- For a normative change, link the accepted RFC.
- Update everything the change touches: spec text, `/schemas`, `/reference`, the affected SDKs in `/sdks`, `/examples`, and `/conformance`. A PR that changes a field name in the spec but not in the schema and the reference server will be sent back.
- Run the conformance suite locally and confirm it passes (see below).
- Match the existing style. Plain, developer-facing prose. No marketing language. No em dashes; use periods, commas, parentheses, or colons.
- Every commit needs a DCO sign-off (see below).

A maintainer reviews, you revise, and it lands when consistent with the spec and passing conformance.

---

## The conformance suite

The public conformance suite in `/conformance` is the test of truth for what "HARP-compliant" means. See `CONFORMANCE.md` for the test categories and self-certification.

If you contribute:

- **Adding or changing behavior?** Add or update a conformance test in the same PR. The suite and the spec move together. This is the single rule that keeps implementations from drifting from the words.
- **Run it before you push.** Point the suite at the reference server (or your own service) and confirm a clean pass.
- **Do not weaken a test to make your change pass.** If a test is wrong, say so in the PR and explain why; changing a test's intent is a normative change and needs an RFC.

The suite checks the things a HARP service must do: a valid `/auth.md` and `agent_auth` block, the three flows, the BAA gate on PHI scopes, purpose-bound least-privilege tokens, and (for the receipts tier) verifiable receipts.

---

## Sign-off (DCO)

HARP uses the Developer Certificate of Origin. Every commit must be signed off, which certifies you wrote the change or have the right to submit it under the project's MIT license. The full DCO text is at https://developercertificate.org.

Add the sign-off with `-s`:

```bash
git commit -s -m "fix(schemas): correct min_necessary enum for denials scope"
```

This appends a line to the commit message:

```
Signed-off-by: Your Name <you@example.com>
```

The name and email must be real and match your git identity. PRs with unsigned commits will be asked to amend.

Commit message format follows the same convention as the spec repo: `feat|fix|docs|refactor|test(scope): message`.

---

## Code of conduct

HARP follows the Contributor Covenant. The full text is in `CODE_OF_CONDUCT.md` at the repository root. It applies to issues, RFCs, PRs, and any HARP discussion space. Be direct, be kind, assume good faith.

To report a Code of Conduct concern, contact the maintainers at the address listed in `CODE_OF_CONDUCT.md`. Reports are handled in confidence.

---

## Reporting a vulnerability

Do not open a public issue for a security problem, especially anything touching PHI handling, the BAA gate, token scoping, or delegation. Email the maintainers privately at the address in `SECURITY.md` with a description and, if possible, a reproduction. You will get an acknowledgement and a coordinated-disclosure timeline. Security fixes are prioritized and credited (with your consent) once a fix ships.

---

## Licensing of contributions

By contributing, you agree your contribution is licensed under the project's **MIT License** and that you have signed it off under the DCO. The proprietary Neomics platform, models, and data are out of scope for this repository.

---

*Questions about a contribution? Open an issue. HARP is a v0.1 draft and the Neomics sandbox at `api.goneomics.com/auth.md` is planned.*
