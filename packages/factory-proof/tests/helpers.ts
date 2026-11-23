import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";
import { FACTORY_RUN_PREDICATE_TYPE, NOTE_TYPE } from "../src/constants.js";
import { makeEnvelope, serializeStatement, statementDigest } from "../src/dsse.js";
import type { Attestation } from "../src/note.js";
import { buildStatement } from "../src/statement.js";

export const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const EXAMPLE = fileURLToPath(new URL("../../../schemas/examples/factory-run.statement.json", import.meta.url));

/** Fixed identity and dates, so commit ids are reproducible. */
export const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Factory Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Factory Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};
// Tests call the library in-process, so the library's git calls need the same environment.
Object.assign(process.env, GIT_ENV);

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

export function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "factory-proof-test-"));
  dirs.push(d);
  return d;
}

export function sh(cwd: string, cmd: string, args: string[], input?: string, env: NodeJS.ProcessEnv = {}): string {
  const r = spawnSync(cmd, args, { cwd, env: { ...GIT_ENV, ...env }, input, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

export const git = (cwd: string, ...args: string[]): string => sh(cwd, "git", args);

/** A fresh repository with one commit (`a.txt`). */
export function repo(message = "feat: initial\n\nWork-Unit: github:416\n"): string {
  const d = tempDir();
  git(d, "init", "-q", "-b", "main");
  commitFile(d, "a.txt", "a\n", message);
  return d;
}

export function commitFile(cwd: string, file: string, content: string, message: string): string {
  writeFileSync(join(cwd, file), content);
  git(cwd, "add", file);
  sh(cwd, "git", ["commit", "-q", "-F", "-"], message);
  return git(cwd, "rev-parse", "HEAD");
}

export function examplePredicate(): Record<string, unknown> {
  const st = JSON.parse(readFileSync(EXAMPLE, "utf8")) as { predicate: Record<string, unknown> };
  return st.predicate;
}

export interface EntryOptions {
  tree: string;
  commit?: string;
  predicate?: Record<string, unknown>;
  predicateType?: string;
}

/** Builds an unsigned note entry without going through attest's checks. */
export function entry(opts: EntryOptions): Attestation {
  const st = buildStatement({ predicate: opts.predicate ?? examplePredicate(), tree: opts.tree, commit: opts.commit });
  if (opts.predicateType) st.predicateType = opts.predicateType;
  const bytes = serializeStatement(st);
  return { predicateType: st.predicateType, digest: statementDigest(bytes), envelope: makeEnvelope(bytes) };
}

export function writeRawNote(cwd: string, rev: string, text: string): void {
  sh(cwd, "git", ["notes", "--ref=refs/notes/factory", "add", "-f", "-F", "-", rev], text);
}

export function writeEntries(cwd: string, rev: string, entries: Attestation[]): void {
  writeRawNote(cwd, rev, JSON.stringify({ type: NOTE_TYPE, attestations: entries }));
}

export interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
  json: () => unknown;
}

export function cli(cwd: string, args: string[], input?: string): CliResult {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env: GIT_ENV, input, encoding: "utf8" });
  return {
    status: r.status ?? -1,
    stdout: r.stdout,
    stderr: r.stderr,
    json: () => JSON.parse(r.stdout) as unknown,
  };
}

export { FACTORY_RUN_PREDICATE_TYPE };
