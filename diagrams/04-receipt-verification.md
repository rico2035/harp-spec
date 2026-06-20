# Receipt Verification

Every consequential agent decision emits a signed Verifiable Reasoning Receipt: the inputs digest, the policy applied, the model and version, the evidence and citations, the conclusion, and a signature. A payer, auditor, or patient can verify the signature and the policy at the verify URI without trusting Neomics. The receipt references digests, never raw PHI, so justification is provable, portable, and machine-checkable.

```mermaid
flowchart TB
    ACT["Consequential agent action<br/>code chosen, denial appealed, balance settled"]

    ACT --> RCPT

    subgraph RCPT["Signed Verifiable Reasoning Receipt"]
        direction TB
        R1["inputs_digest (hash, not raw PHI)"]
        R2["policy_applied (policy:rcm/denials@v3)"]
        R3["model and version"]
        R4["evidence / citations (GraphRAG sources)"]
        R5["conclusion"]
        R6["signature"]
    end

    RCPT --> TP

    subgraph TP["Third party (no trust in issuer)"]
        direction LR
        TP1["Payer"]
        TP2["Auditor"]
        TP3["Patient"]
    end

    TP --> VER["Verify at verify_uri"]
    VER --> V1["Check signature"]
    VER --> V2["Check policy and version"]
    V1 --> OK["Provable, portable,<br/>machine-checkable justification"]
    V2 --> OK
```
