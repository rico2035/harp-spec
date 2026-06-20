# HARP Registration Sequence

How an agent registers and gets a scoped, purpose-bound token with no human filling a form. The agent obtains an audience-bound ID-JAG from its own identity provider, accepts the Business Associate Agreement programmatically to unlock PHI scopes, then posts the assertion to the HARP service, which verifies it against the issuer JWKS and exchanges it for a least-privilege token. Every PHI scope stays locked until the BAA acceptance completes.

```mermaid
sequenceDiagram
    participant A as Agent
    participant IdP as Agent IdP
    participant H as HARP service
    participant J as JWKS / issuer keys
    participant M as MCP server / API

    A->>IdP: Request audience-bound ID-JAG
    IdP-->>A: Signed ID-JAG (aud = HARP service)

    A->>H: POST /agent/baa/accept (org_id, baa_version_hash, signature)
    H-->>A: 200 baa_acceptance_id, scopes_unlocked

    A->>H: POST /agent/identity (type: identity_assertion, assertion: ID-JAG)
    H->>J: Fetch issuer JWKS
    J-->>H: Public keys
    H->>H: Verify signature and claims (aud, exp, iat, jti, client_id)
    H->>H: JWT-bearer token exchange (RFC 7523)
    H-->>A: Scoped, purpose-bound access token

    A->>M: Call MCP tool / REST API (Bearer token)
    M-->>A: Result plus signed reasoning receipt
```
