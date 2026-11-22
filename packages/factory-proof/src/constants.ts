export const SPEC_VERSION = "v0.1";
export const STATEMENT_TYPE = "https://in-toto.io/Statement/v1";
export const FACTORY_RUN_PREDICATE_TYPE = "https://os-factory.dev/factory-commits/factory-run/v0.1";
export const NOTE_TYPE = "https://os-factory.dev/factory-commits/note/v0.1";
export const PAYLOAD_TYPE = "application/vnd.in-toto+json";
export const NOTES_REF = "refs/notes/factory";
export const SSH_NAMESPACE = "factory-commits";

export const LEVELS = ["none", "L0", "L1", "L2", "L3"] as const;
export type Level = (typeof LEVELS)[number];

export function levelRank(level: Level): number {
  return LEVELS.indexOf(level);
}

export const PROBLEM_CODES = [
  "TRAILER_MALFORMED",
  "NOTE_INVALID_JSON",
  "NOTE_SCHEMA",
  "DIGEST_MISMATCH",
  "STATEMENT_INVALID",
  "PREDICATE_UNKNOWN",
  "TREE_MISMATCH",
  "COMMIT_MISMATCH",
  "VERDICT_MISMATCH",
  "SIGNATURE_INVALID",
  "SIGNATURE_UNVERIFIED",
  "TRAILER_ATTESTATION_NOT_FOUND",
] as const;
export type ProblemCode = (typeof PROBLEM_CODES)[number];

/** Codes reported for information only: they never make verify fail on their own. */
export const INFORMATIONAL_CODES: ReadonlySet<ProblemCode> = new Set<ProblemCode>([
  "PREDICATE_UNKNOWN",
  "SIGNATURE_UNVERIFIED",
]);

export interface Problem {
  code: ProblemCode;
  message: string;
}
