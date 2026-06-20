/**
 * End-to-end HARP demo driven by the SDK client. Run the reference server
 * first (pnpm dev), then `pnpm demo` from docs/HARP/reference.
 *
 * It reproduces the WorkOS-style flow for healthcare: a clean agent discovers
 * the service, registers, hits the BAA gate, accepts the BAA, gets a PHI-scoped
 * token, calls the protected resource, and independently verifies the receipt.
 */

import { HarpClient } from "@harp-standard/sdk";
import { exportSPKI, importJWK } from "jose";

const BASE = process.env.HARP_BASE_URL ?? "http://localhost:4000";
const ORG = "org_acme";

async function postJson(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function publicKeyPem(): Promise<string> {
  const jwks = await (await fetch(`${BASE}/jwks.json`)).json();
  const key = await importJWK(jwks.keys[0], "ES256");
  return exportSPKI(key as CryptoKey);
}

async function main(): Promise<void> {
  const client = new HarpClient({ baseUrl: BASE });

  console.log("1. discover");
  const disc = await client.discover();
  console.log("   service:", disc.prm.resource_name);
  console.log("   scopes:", disc.prm.scopes_supported.join(", "));

  console.log("2. mint a dev ID-JAG and register");
  const { assertion } = await postJson("/dev/mint-id-jag", {
    sub: "user_madison",
    org_id: ORG,
  });
  await client.registerWithIdJag(assertion);

  console.log("3. request a PHI scope before BAA (expect self-healing error)");
  try {
    await client.exchangeAssertion(assertion, ["rcm.eligibility:read"]);
  } catch (e: any) {
    console.log("   blocked as expected:", e.remediation?.kind, "->", e.message);
  }

  console.log("4. accept the BAA");
  await client.acceptBaa({
    org_id: ORG,
    baa_version_hash: "sha256:demo-baa-v1",
    accepted_by: "ric@goneomics.com",
    signature: "demo-sig",
  });

  console.log("5. exchange again for a PHI-scoped token");
  const tok = await client.exchangeAssertion(assertion, ["rcm.eligibility:read"]);

  console.log("6. call the protected resource");
  const res = await client.request("/eligibility?member=demo-member", {
    token: tok.access_token!,
    purposeOfUse: "PAYMENT",
  });
  const { data, receipt } = (await res.json()) as any;
  console.log("   eligibility:", JSON.stringify(data));

  console.log("7. independently verify the receipt");
  const pem = await publicKeyPem();
  const ok = await client.verifyReceipt(receipt, pem);
  console.log("   receipt valid:", ok, "| action:", receipt.action);

  console.log("\nHARP end-to-end flow complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
