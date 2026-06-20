/**
 * @harp-standard/sdk
 *
 * TypeScript SDK for HARP, the Healthcare Agent Registration and Connection
 * Profile. Import the client to build an agent that uses a HARP service, or the
 * server helpers to make your own service HARP-compliant.
 */

export * from "./types.js";
export * from "./errors.js";
export { HarpClient } from "./client.js";
export type {
  HarpClientOptions,
  DiscoveryResult,
  FetchLike,
} from "./client.js";
export {
  buildProtectedResourceMetadata,
  buildAuthorizationServerMetadata,
  renderAuthMd,
  verifyIdJag,
  mintAccessToken,
  inputsDigest,
  issueReceipt,
  verifyReceiptSignature,
} from "./server.js";
export type {
  ServiceConfig,
  VerifyIdJagOptions,
  VerifiedAssertion,
  MintTokenParams,
  IssueReceiptParams,
} from "./server.js";
