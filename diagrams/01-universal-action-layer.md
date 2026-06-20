# Universal Action Layer

The keystone of the agent-native platform. Every actor (a human in the dashboard, an external agent over MCP, a Neo agent acting on its own, a voice call) executes the same typed Actions through one command bus. The UI, the MCP server, and the public API are thin adapters that translate a request into one Action Envelope, which runs through a single pipeline before it reaches any service. There is no path to an effect that bypasses authn, policy, guardrails, or signed audit.

```mermaid
flowchart TB
    H["Human (UI)"]
    E["External agent (MCP)"]
    N["Neo agent (autonomous)"]
    V["Voice (orchestrator)"]

    H --> ENV
    E --> ENV
    N --> ENV
    V --> ENV

    ENV["Action Envelope<br/>actor, intent, scope, purpose,<br/>idempotency key, payload"]

    ENV --> P1
    subgraph PIPE["One pipeline"]
        direction TB
        P1["1. Authn<br/>human JWT, agent token, or ID-JAG"]
        P2["2. Policy and authz (an open policy engine)<br/>plus autonomy tier"]
        P3["3. Input guardrails"]
        P4["4. Execute<br/>tool-executor"]
        P5["5. Sign and audit<br/>AgentAction, event log"]
        P6["6. Output guardrails<br/>plus receipt"]
        P1 --> P2 --> P3 --> P4 --> P5 --> P6
    end

    P6 --> SVC["Services<br/>claims, payments, eligibility, collections"]
```
