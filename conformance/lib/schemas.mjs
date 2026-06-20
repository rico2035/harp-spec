/**
 * Loads the HARP JSON Schemas from ../schemas and builds a registry keyed by
 * each schema's $id, so cross-document $refs (agent-auth references scope)
 * resolve offline. Zero dependencies.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(here, "..", "..", "schemas");

const FILES = {
  agentAuth: "agent-auth.schema.json",
  scope: "scope.schema.json",
  receipt: "receipt.schema.json",
  baaAcceptance: "baa-acceptance-event.schema.json",
  identityRequest: "identity-request.schema.json",
};

/**
 * @returns {Promise<{ schemas: Record<string, object>, registry: Record<string, object> }>}
 */
export async function loadSchemas() {
  const schemas = {};
  const registry = {};
  for (const [key, file] of Object.entries(FILES)) {
    const raw = await readFile(join(schemaDir, file), "utf8");
    const parsed = JSON.parse(raw);
    schemas[key] = parsed;
    if (parsed.$id) registry[parsed.$id] = parsed;
  }
  return { schemas, registry };
}
