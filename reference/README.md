# HARP reference server

A minimal, runnable HARP-compliant service, built on `@harp-standard/sdk`. It
models a fictional "Acme Health RCM" and demonstrates the full flow: discovery,
the three registration methods, the BAA gate for PHI scopes, a protected
eligibility endpoint, and Verifiable Reasoning Receipts.

Storage is in-memory and there are dev-only helpers so the whole flow runs on one
machine with no external identity provider. Do not deploy as-is.

## Run

```bash
# from docs/HARP/sdks/typescript
pnpm install && pnpm build

# from docs/HARP/reference
pnpm install
pnpm dev
# HARP reference server on http://localhost:4000
```

## Endpoints

Discovery:
- `GET /auth.md`
- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-authorization-server`
- `GET /jwks.json`

Registration and tokens:
- `POST /agent/identity` (types: anonymous, identity_assertion, service_auth)
- `POST /agent/baa/accept`
- `POST /oauth2/token` (grants: jwt-bearer, harp claim)
- `POST /agent/identity/claim`

Resource and receipts:
- `GET /eligibility?member=...` (needs scope `rcm.eligibility:read` + BAA)
- `POST /agent/receipt/verify`

Dev only:
- `POST /dev/mint-id-jag` issue a test ID-JAG
- `GET /dev/verify` user verification page
- `POST /dev/approve` approve a pending claim ceremony

## End-to-end demo

`pnpm demo` (see `examples/demo.ts`) runs the happy path with the SDK:
discover, mint a dev ID-JAG, register, hit `/eligibility` and get a 403, accept
the BAA, exchange for a PHI-scoped token, call `/eligibility` again, then verify
the returned receipt. Manual `curl` calls are in `examples/requests.http`.

## License

MIT.
