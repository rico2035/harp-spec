# @harp-standard/sdk

TypeScript SDK for HARP, the Healthcare Agent Registration and Connection
Profile. Use the client to build an agent that registers and works against a
HARP service. Use the server helpers to make your own service HARP-compliant.

This is a v0.1 skeleton. It tracks the spec in `../../README.md` and the schemas
in `../../schemas/`.

## Install

```bash
pnpm install
pnpm build
```

## Client: an agent that uses a HARP service

```ts
import { HarpClient } from "@harp-standard/sdk";

const client = new HarpClient({ baseUrl: "https://api.goneomics.com" });
await client.discover();

// Try the free tier with no credentials.
const anon = await client.registerAnonymous();

// Or register with an ID-JAG from your provider (synchronous, no human).
const reg = await client.registerWithIdJag(myIdJag);

// Unlock PHI scopes by accepting the BAA for your org.
await client.acceptBaa({
  org_id: "org_123",
  baa_version_hash: "sha256:...",
  accepted_by: "ric@goneomics.com",
  signature: "...",
});

// Call the API. Errors are self-healing: a 403 tells you exactly what to fix.
const res = await client.request("/eligibility?member=...", {
  token: reg.access_token!,
  purposeOfUse: "PAYMENT",
});
```

When a call fails, the client throws a `HarpError` whose `remediation` field says
what to do (`obtain_scope`, `accept_baa`, `raise_proofing`, `register`).

## Server: make your service HARP-compliant

```ts
import {
  renderAuthMd,
  buildProtectedResourceMetadata,
  buildAuthorizationServerMetadata,
  verifyIdJag,
  mintAccessToken,
  issueReceipt,
} from "@harp-standard/sdk";
```

See `../../reference/` for a runnable server that wires these together.

## Layout

```
src/types.ts    types mirroring the JSON Schemas
src/client.ts   HarpClient (discover, register, BAA, token, call, verify)
src/server.ts   metadata, auth.md render, ID-JAG verify, token mint, receipts
src/errors.ts   self-healing HarpError
src/index.ts    barrel
```

## License

MIT.
