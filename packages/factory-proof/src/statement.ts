import { FACTORY_RUN_PREDICATE_TYPE, STATEMENT_TYPE } from "./constants.js";

export type Verdict = "pass" | "fail";

export interface Subject {
  name: string;
  digest: { gitTree: string; gitCommit?: string };
}

export interface Statement {
  _type: typeof STATEMENT_TYPE;
  subject: [Subject];
  predicateType: string;
  predicate: Record<string, unknown>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** SPEC §4.3: pass iff every required stage appears with status `passed`. */
export function recomputeVerdict(predicate: unknown): Verdict {
  if (!isRecord(predicate)) return "fail";
  const policy = predicate["policy"];
  const required = isRecord(policy) && Array.isArray(policy["required"]) ? policy["required"] : [];
  const stages = Array.isArray(predicate["stages"]) ? predicate["stages"] : [];
  const passed = new Set(
    stages.filter((s): s is Record<string, unknown> => isRecord(s) && s["status"] === "passed").map((s) => s["id"]),
  );
  return required.every((id) => passed.has(id)) ? "pass" : "fail";
}

/**
 * The subject name for a repository URL: `git+<url>` without credentials, or `git+local`
 * when there is no usable remote (a filesystem path would leak a local path, SPEC §6).
 */
export function subjectName(url: string | undefined): string {
  if (!url || url === "local") return "git+local";
  const scp = /^[^/@:\s]+@([^/:\s]+):(.+)$/.exec(url);
  if (scp) return `git+ssh://${scp[1]}/${scp[2]?.replace(/^\/+/, "")}`;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "git+local";
  }
  if (parsed.protocol === "file:" || !parsed.host) return "git+local";
  parsed.username = "";
  parsed.password = "";
  return `git+${parsed.toString()}`;
}

export interface BuildStatementInput {
  predicate: Record<string, unknown>;
  tree: string;
  commit?: string;
  repoUrl?: string;
}

export function buildStatement(input: BuildStatementInput): Statement {
  const digest: Subject["digest"] = { gitTree: input.tree };
  if (input.commit) digest.gitCommit = input.commit;
  return {
    _type: STATEMENT_TYPE,
    subject: [{ name: subjectName(input.repoUrl), digest }],
    predicateType: FACTORY_RUN_PREDICATE_TYPE,
    predicate: input.predicate,
  };
}
