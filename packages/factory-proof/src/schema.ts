import { readFileSync } from "node:fs";
import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

// The schemas are copied from the repository's schemas/ directory at build time.
const SCHEMA_DIR = new URL("../schemas/", import.meta.url);

function load(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(name, SCHEMA_DIR), "utf8")) as Record<string, unknown>;
}

interface Validators {
  predicate: ValidateFunction;
  statement: ValidateFunction;
  note: ValidateFunction;
}

let cached: Validators | undefined;

function validators(): Validators {
  if (cached) return cached;
  const ajv = new Ajv2020({ allErrors: false, strict: false });
  // ajv-formats ships CommonJS; its default export is the plugin function.
  const addFormats = addFormatsModule as unknown as (a: Ajv2020) => Ajv2020;
  addFormats(ajv);
  const predicate = load("factory-run.predicate.schema.json");
  const statement = load("statement.schema.json");
  const note = load("note.schema.json");
  ajv.addSchema(predicate);
  cached = {
    predicate: ajv.compile(predicate),
    statement: ajv.compile(statement),
    note: ajv.compile(note),
  };
  return cached;
}

export interface SchemaResult {
  valid: boolean;
  error?: string;
}

function result(fn: ValidateFunction, data: unknown): SchemaResult {
  if (fn(data)) return { valid: true };
  return { valid: false, error: describe(fn.errors ?? []) };
}

function describe(errors: ErrorObject[]): string {
  const e = errors[0];
  if (!e) return "schema validation failed";
  return `${e.instancePath || "/"} ${e.message ?? "is invalid"}`;
}

export function validatePredicate(data: unknown): SchemaResult {
  return result(validators().predicate, data);
}

export function validateStatement(data: unknown): SchemaResult {
  return result(validators().statement, data);
}

export function validateNote(data: unknown): SchemaResult {
  return result(validators().note, data);
}
