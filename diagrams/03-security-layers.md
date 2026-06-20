# Security Layers

Defense-in-depth for an autonomous workforce that touches PHI. Each layer assumes the others can fail: three identity planes that are never conflated, tokens that are short-lived and attenuable, PHI isolated down to confidential compute, a dual-LLM quarantine that keeps untrusted content away from any model holding tool permissions, policy as verifiable code, supply-chain controls on MCP, blast-radius limits, and a signed, replayable audit.

```mermaid
flowchart TB
    subgraph ID["1. Identity planes (never conflated)"]
        direction LR
        ID1["Human identity<br/>Supabase JWT"]
        ID2["External agent<br/>ID-JAG from allow-listed issuers"]
        ID3["Workload identity<br/>SPIFFE/SPIRE SVIDs"]
    end

    subgraph TOK["2. Token design"]
        direction LR
        T1["Short-lived,<br/>audience-bound"]
        T2["Purpose-of-use bound,<br/>least privilege"]
        T3["Attenuable<br/>(macaroon pattern)"]
    end

    subgraph PHI["3. PHI isolation"]
        direction LR
        PH1["RLS plus<br/>min-necessary scopes"]
        PH2["Sandboxed inference<br/>(E2B/Modal microVMs)"]
        PH3["Confidential compute<br/>(TEE)"]
    end

    subgraph QUAR["4. Dual-LLM quarantine (CaMeL)"]
        direction LR
        Q1["Untrusted content<br/>claims, EOBs, portals"]
        Q2["Quarantined model<br/>extracts structured data,<br/>no tool permissions"]
        Q3["Privileged planner<br/>sees validated fields only"]
        Q1 --> Q2 --> Q3
    end

    POL["5. Policy as code (an open policy engine)<br/>version-controlled, tested, formally verified"]
    SUP["6. Supply-chain security<br/>pin and sign MCP, allow-list, scan for poisoning"]
    BLAST["7. Blast-radius controls<br/>kill switch, circuit breakers, rate and dollar caps, rollback"]
    AUD["8. Verifiable audit<br/>append-only signed AgentAction, deterministic replay"]

    ID --> TOK --> PHI --> QUAR --> POL --> SUP --> BLAST --> AUD
```
