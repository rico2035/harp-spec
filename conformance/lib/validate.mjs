/**
 * Tiny JSON Schema validator. Zero dependencies.
 *
 * This is intentionally a subset of JSON Schema draft 2020-12, scoped to the
 * keywords the HARP schemas in ../schemas actually use:
 *   type, properties, required, additionalProperties, items, minItems,
 *   uniqueItems, enum, const, pattern, minimum, maximum, oneOf, $ref, $defs.
 *
 * $ref resolution is handled two ways:
 *   - local pointers ("#/$defs/x") resolve inside the same schema document
 *   - cross-schema HARP ids (e.g. "https://schemas.harp-standard.org/scope/0.1")
 *     resolve via the registry passed to validate(), so the agent-auth schema
 *     can reference the scope schema without a network fetch.
 *
 * It returns a list of human-readable errors with JSON-pointer-ish paths.
 * It is not a full validator and is not meant to be. If a HARP schema starts
 * using a keyword this does not cover, add it here in the same change as the
 * schema, the same way the conformance suite tracks the spec.
 */

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value === "object" ? "object" : typeof value;
}

function matchesType(value, expected) {
  const actual = typeOf(value);
  if (expected === "integer") {
    return actual === "number" && Number.isInteger(value);
  }
  if (expected === "number") return actual === "number";
  return actual === expected;
}

function resolveRef(ref, root, registry) {
  if (ref.startsWith("#")) {
    // Local JSON pointer inside the same document.
    const pointer = ref.slice(1);
    if (pointer === "") return root;
    const parts = pointer.split("/").slice(1).map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
    let node = root;
    for (const part of parts) {
      if (node && typeof node === "object" && part in node) {
        node = node[part];
      } else {
        return undefined;
      }
    }
    return node;
  }
  // Cross-document $id reference.
  if (registry && registry[ref]) return registry[ref];
  return undefined;
}

function validateNode(value, schema, ctx, path, errors) {
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    errors.push(`${path || "<root>"}: schema disallows any value here`);
    return;
  }

  if (schema.$ref) {
    const target = resolveRef(schema.$ref, ctx.root, ctx.registry);
    if (!target) {
      errors.push(`${path || "<root>"}: cannot resolve $ref ${schema.$ref}`);
      return;
    }
    // When resolving into another registered document, switch the root so its
    // own local pointers and $defs resolve correctly.
    const nextRoot = ctx.registry && ctx.registry[schema.$ref] ? target : ctx.root;
    validateNode(value, target, { ...ctx, root: nextRoot }, path, errors);
    return;
  }

  if (Array.isArray(schema.oneOf)) {
    const matches = [];
    for (let i = 0; i < schema.oneOf.length; i += 1) {
      const sub = [];
      validateNode(value, schema.oneOf[i], ctx, path, sub);
      if (sub.length === 0) matches.push(i);
    }
    if (matches.length !== 1) {
      errors.push(
        `${path || "<root>"}: expected to match exactly one of ${schema.oneOf.length} schemas, matched ${matches.length}`,
      );
    }
    return;
  }

  if (schema.const !== undefined) {
    if (JSON.stringify(value) !== JSON.stringify(schema.const)) {
      errors.push(`${path || "<root>"}: must equal ${JSON.stringify(schema.const)}`);
    }
  }

  if (schema.enum) {
    const ok = schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value));
    if (!ok) {
      errors.push(`${path || "<root>"}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
    }
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      errors.push(`${path || "<root>"}: expected type ${types.join(" or ")}, got ${typeOf(value)}`);
      return;
    }
  }

  const kind = typeOf(value);

  if (kind === "string") {
    if (schema.pattern) {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) {
        errors.push(`${path || "<root>"}: "${value}" does not match pattern ${schema.pattern}`);
      }
    }
  }

  if (kind === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path || "<root>"}: ${value} is less than minimum ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path || "<root>"}: ${value} is greater than maximum ${schema.maximum}`);
    }
  }

  if (kind === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path || "<root>"}: array has ${value.length} items, fewer than minItems ${schema.minItems}`);
    }
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const item of value) {
        const key = JSON.stringify(item);
        if (seen.has(key)) {
          errors.push(`${path || "<root>"}: array items must be unique`);
          break;
        }
        seen.add(key);
      }
    }
    if (schema.items) {
      value.forEach((item, i) => {
        validateNode(item, schema.items, ctx, `${path}[${i}]`, errors);
      });
    }
  }

  if (kind === "object") {
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) {
          errors.push(`${path || "<root>"}: missing required property "${key}"`);
        }
      }
    }
    const props = schema.properties || {};
    for (const [key, sub] of Object.entries(props)) {
      if (key in value) {
        validateNode(value[key], sub, ctx, path ? `${path}.${key}` : key, errors);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) {
          errors.push(`${path ? `${path}.${key}` : key}: additional property not allowed`);
        }
      }
    }
  }
}

/**
 * Validate a value against a schema.
 * @param {unknown} value
 * @param {object} schema the schema document (its own $id may be referenced)
 * @param {Record<string, object>} [registry] map of $id -> schema for cross refs
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validate(value, schema, registry = {}) {
  const fullRegistry = { ...registry };
  if (schema && schema.$id && !fullRegistry[schema.$id]) {
    fullRegistry[schema.$id] = schema;
  }
  const errors = [];
  validateNode(value, schema, { root: schema, registry: fullRegistry }, "", errors);
  return { valid: errors.length === 0, errors };
}
