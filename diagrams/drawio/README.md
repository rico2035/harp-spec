# HARP Diagrams (.drawio)

Editable `.drawio` versions of the HARP diagrams. They mirror the Mermaid sources one level
up in [docs/HARP/diagrams](../) so the spec has both a Markdown-rendering form (Mermaid) and
an editable, exportable form (draw.io) for decks, the docs site, and the launch blog.

Open and export with the VS Code **Draw.io Integration** extension (`hediet.vscode-drawio`)
or draw.io desktop / diagrams.net. All five pass the draw.io structural linter with zero
errors.

| File | Mirrors | What it shows |
|---|---|---|
| [01-universal-action-layer](01-universal-action-layer.drawio) | [01](../01-universal-action-layer.md) | One command bus: human / agent / Neo / voice → action envelope → one pipeline → services |
| [02-registration-flows](02-registration-flows.drawio) | [02](../02-harp-registration-sequence.md) | The three auth.md flows + the BAA handshake that gates PHI scopes |
| [03-security-layers](03-security-layers.drawio) | [03](../03-security-layers.md) | Eight-layer defense-in-depth for an autonomous workforce touching PHI |
| [04-receipt-verification](04-receipt-verification.drawio) | [04](../04-receipt-verification.md) | Verifiable Reasoning Receipt and third-party verification |
| [05-harp-stack](05-harp-stack.drawio) | (new) | What HARP builds on (the RFC/standards stack) + the healthcare extension |

Source: [docs/HARP/README.md](../../README.md) and [EXPLAINER.md](../../EXPLAINER.md).
