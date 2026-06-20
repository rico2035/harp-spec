# RFC NNNN: <short title>

- **Status:** Draft
- **Author(s):** <name, affiliation>
- **Created:** <YYYY-MM-DD>
- **Type:** Normative | Non-normative
- **Affects:** spec | schemas | reference | sdks | conformance (list all that apply)

> Copy this file to `rfcs/NNNN-short-title.md`, take the next free number, and open a pull request. Normative changes (anything that affects what a conforming service or agent must do) require an RFC. Typos, prose, and examples do not. See `GOVERNANCE.md` section 3.

## Summary

One paragraph. What changes and why, in plain language.

## Motivation

The problem or gap this solves. What breaks or is impossible today. Who feels it (provider, payer, patient, agent builder).

## Proposed change

The concrete spec change. Quote the current text and the proposed text. Be precise about field names, endpoints, flows, scope grammar, the BAA gate, identity-proofing levels, the receipt format, or SET events as relevant.

## Schema impact

Which JSON Schemas change and how. Include the new or modified URI if a schema version is cut (`https://schemas.harp-standard.org/...`).

## Backward compatibility

Does a generic auth.md agent that knows nothing about healthcare still register and work for its non-PHI paths? If this breaks compatibility, it is a major change and carries the burden of proof in `GOVERNANCE.md` section 4. State the migration path.

## Security and PHI impact

How this affects least-privilege scoping, minimum-necessary data, the BAA gate, identity proofing, and verifiable receipts. A change that weakens any of these needs a strong, documented justification.

## Conformance change

The conformance-suite change required to test this. An accepted RFC is not done until conformance can test it.

## Alternatives considered

What else was considered and why this approach won.

## Open questions

Anything unresolved that reviewers should weigh in on.
