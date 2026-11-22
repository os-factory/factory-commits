#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs, type ParseArgsConfig } from "node:util";
import { addToNote, attest } from "./attest.js";
import { type Level, LEVELS, SPEC_VERSION } from "./constants.js";
import { decodeBase64, statementDigest } from "./dsse.js";
import { FactoryError } from "./exec.js";
import { type Attestation, readNoteRaw } from "./note.js";
import { assertRepo, resolveCommit, resolveTree, revList } from "./repo.js";
import { setup } from "./setup.js";
import { addTrailers, factoryTrailers, readCommitTrailers, TRAILER_NAMES, type TrailerInput } from "./trailers.js";
import { type CommitResult, isFailing, verifyCommit } from "./verify.js";

const USAGE = `usage: git factory [-C <path>] <command> [options]

commands:
  attest     --predicate <file|-> [--tree <sha> | --rev <rev>] [--commit <sha>] [--repo-url <url>]
             [--sign-key <path> --signer <principal>] [--write-note <rev>] [--out <file>] [--json]
  note add   <rev> --attestation <file|-> [--json]
  show       [<rev>] [--json]
  verify     [<rev> | <A..B>] [--allowed-signers <file>] [--min-level L0|L1|L2|L3] [--json]
  trailers   <message-file> [--work-unit <[source:]id>]... [--run <id>[;trace=<hex>]] [--policy <id[@v]>]
             [--agent <name[/v][;model=m]>] [--attestation <sha256:...>]
  setup      [--remote origin] [--undo] [--json]
  digest     <envelope-or-attestation-file|->
  --version`;

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  return pkg.version;
}

function readInput(cwd: string, path: string): string {
  try {
    return readFileSync(path === "-" ? 0 : resolve(cwd, path), "utf8");
  } catch (e) {
    throw new FactoryError(`cannot read ${path}: ${(e as Error).message}`);
  }
}

function readJson(cwd: string, path: string): unknown {
  const text = readInput(cwd, path);
  try {
    return JSON.parse(text);
  } catch {
    throw new FactoryError(`${path} is not valid JSON`);
  }
}

function parse(args: string[], options: NonNullable<ParseArgsConfig["options"]>) {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (e) {
    throw new FactoryError(`${(e as Error).message}\n${USAGE}`);
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function print(json: boolean, value: unknown, human: string): void {
  process.stdout.write(json ? `${JSON.stringify(value)}\n` : `${human}\n`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asAttestation(value: unknown, what: string): Attestation {
  if (!isRecord(value) || typeof value["digest"] !== "string" || typeof value["predicateType"] !== "string") {
    throw new FactoryError(`${what} is not an attestation entry ({predicateType, digest, envelope})`);
  }
  const env = value["envelope"];
  if (!isRecord(env) || typeof env["payload"] !== "string" || typeof env["payloadType"] !== "string" || !Array.isArray(env["signatures"])) {
    throw new FactoryError(`${what} has no valid DSSE envelope`);
  }
  return value as unknown as Attestation;
}

function cmdAttest(cwd: string, args: string[]): number {
  const { values, positionals } = parse(args, {
    predicate: { type: "string" },
    tree: { type: "string" },
    rev: { type: "string" },
    commit: { type: "string" },
    "repo-url": { type: "string" },
    "sign-key": { type: "string" },
    signer: { type: "string" },
    "write-note": { type: "string" },
    out: { type: "string" },
    json: { type: "boolean" },
  });
  if (positionals.length) throw new FactoryError(`unexpected argument: ${positionals[0]}`);
  const predicatePath = str(values.predicate);
  if (!predicatePath) throw new FactoryError("attest needs --predicate <file|->");
  assertRepo(cwd);
  const result = attest(cwd, {
    predicate: readJson(cwd, predicatePath),
    tree: str(values.tree),
    rev: str(values.rev),
    commit: str(values.commit),
    repoUrl: str(values["repo-url"]),
    signKey: str(values["sign-key"]),
    signer: str(values.signer),
    writeNote: str(values["write-note"]),
  });
  const out = str(values.out);
  if (out) writeFileSync(resolve(cwd, out), `${JSON.stringify(result.attestation, null, 2)}\n`);
  const human = [`${result.digest}`, `tree ${result.tree}`];
  if (result.noteWritten) human.push(`note written on ${result.noteWritten}`);
  print(values.json === true, result, human.join("\n"));
  return 0;
}

function cmdNote(cwd: string, args: string[]): number {
  const [sub, ...rest] = args;
  if (sub !== "add") throw new FactoryError(`unknown note subcommand: ${sub ?? ""}\n${USAGE}`);
  const { values, positionals } = parse(rest, { attestation: { type: "string" }, json: { type: "boolean" } });
  const rev = positionals[0];
  const file = str(values.attestation);
  if (!rev || !file || positionals.length > 1) throw new FactoryError("usage: git factory note add <rev> --attestation <file|->");
  assertRepo(cwd);
  const result = addToNote(cwd, rev, asAttestation(readJson(cwd, file), file));
  print(values.json === true, result, result.added ? `added to the note on ${result.commit}` : `already in the note on ${result.commit}`);
  return 0;
}

interface ShownAttestation {
  digest: string;
  predicateType: string;
  runId?: string;
  verdict?: string;
  signatures: number;
}

function describeAttestation(a: unknown): ShownAttestation | null {
  if (!isRecord(a) || !isRecord(a["envelope"])) return null;
  const env = a["envelope"];
  const out: ShownAttestation = {
    digest: String(a["digest"]),
    predicateType: String(a["predicateType"]),
    signatures: Array.isArray(env["signatures"]) ? env["signatures"].length : 0,
  };
  const bytes = typeof env["payload"] === "string" ? decodeBase64(env["payload"]) : null;
  try {
    const st: unknown = bytes ? JSON.parse(bytes.toString("utf8")) : null;
    const pred = isRecord(st) && isRecord(st["predicate"]) ? st["predicate"] : undefined;
    const run = pred && isRecord(pred["run"]) ? pred["run"] : undefined;
    if (run && typeof run["id"] === "string") out.runId = run["id"];
    if (pred && typeof pred["verdict"] === "string") out.verdict = pred["verdict"];
  } catch {
    // Shown as-is; verify reports the problem.
  }
  return out;
}

function cmdShow(cwd: string, args: string[]): number {
  const { values, positionals } = parse(args, { json: { type: "boolean" } });
  if (positionals.length > 1) throw new FactoryError("usage: git factory show [<rev>] [--json]");
  assertRepo(cwd);
  const commit = resolveCommit(cwd, positionals[0] ?? "HEAD");
  const tree = resolveTree(cwd, commit);
  const trailers = factoryTrailers(readCommitTrailers(cwd, commit));
  const raw = readNoteRaw(cwd, commit);
  let note: unknown = null;
  if (raw !== null) {
    try {
      note = JSON.parse(raw);
    } catch {
      process.stderr.write("git factory: the note is not valid JSON (run git factory verify)\n");
    }
  }
  const lines = [`commit ${commit}`, `tree   ${tree}`];
  for (const name of TRAILER_NAMES) for (const v of trailers[name] ?? []) lines.push(`${name}: ${v}`);
  const attestations = isRecord(note) && Array.isArray(note["attestations"]) ? note["attestations"] : [];
  if (raw === null) lines.push("no note in refs/notes/factory");
  for (const a of attestations) {
    const d = describeAttestation(a);
    if (!d) continue;
    lines.push(
      `attestation ${d.digest}`,
      `  predicate  ${d.predicateType}`,
      ...(d.runId ? [`  run        ${d.runId}`] : []),
      ...(d.verdict ? [`  verdict    ${d.verdict}`] : []),
      `  signatures ${d.signatures}`,
    );
  }
  print(values.json === true, { commit, tree, trailers, note }, lines.join("\n"));
  return 0;
}

function parseLevel(v: string | undefined): Level | undefined {
  if (v === undefined) return undefined;
  if (v === "none" || !(LEVELS as readonly string[]).includes(v)) {
    throw new FactoryError(`--min-level must be L0, L1, L2 or L3, not ${v}`);
  }
  return v as Level;
}

function cmdVerify(cwd: string, args: string[]): number {
  const { values, positionals } = parse(args, {
    "allowed-signers": { type: "string" },
    "min-level": { type: "string" },
    json: { type: "boolean" },
  });
  if (positionals.length > 1) throw new FactoryError("usage: git factory verify [<rev> | <A..B>] [options]");
  assertRepo(cwd);
  const allowed = str(values["allowed-signers"]);
  const allowedSigners = allowed ? resolve(cwd, allowed) : undefined;
  if (allowedSigners && !existsSync(allowedSigners)) throw new FactoryError(`allowed signers file not found: ${allowed}`);
  const target = positionals[0] ?? "HEAD";
  const isRange = target.includes("..");
  const minLevel = parseLevel(str(values["min-level"])) ?? (isRange ? "none" : "L1");
  const commits = isRange ? revList(cwd, target) : [resolveCommit(cwd, target)];
  const results: CommitResult[] = commits.map((c) => verifyCommit(cwd, c, { allowedSigners }));
  const failing = results.some((r) => isFailing(r, minLevel));
  const human = results
    .map((r) => [`${r.commit.slice(0, 12)} ${r.level}`, ...r.problems.map((p) => `  ${p.code}: ${p.message}`)].join("\n"))
    .join("\n");
  print(values.json === true, { commits: results }, human || "no commits");
  return failing ? 1 : 0;
}

function cmdTrailers(cwd: string, args: string[]): number {
  const { values, positionals } = parse(args, {
    "work-unit": { type: "string", multiple: true },
    run: { type: "string" },
    policy: { type: "string" },
    agent: { type: "string" },
    attestation: { type: "string" },
  });
  const name = positionals[0];
  if (!name || positionals.length > 1) throw new FactoryError("usage: git factory trailers <message-file> [options]");
  const file = resolve(cwd, name);
  if (!existsSync(file)) throw new FactoryError(`message file not found: ${name}`);
  const inputs: TrailerInput[] = [];
  const workUnits = values["work-unit"];
  for (const v of Array.isArray(workUnits) ? workUnits : []) {
    if (typeof v === "string") inputs.push({ name: "Work-Unit", value: v });
  }
  const single: Array<[string, TrailerInput["name"]]> = [
    ["run", "Factory-Run"],
    ["policy", "Factory-Policy"],
    ["agent", "Factory-Agent"],
    ["attestation", "Factory-Attestation"],
  ];
  for (const [opt, name] of single) {
    const v = str(values[opt as keyof typeof values]);
    if (v !== undefined) inputs.push({ name, value: v });
  }
  addTrailers(file, inputs);
  return 0;
}

function cmdSetup(cwd: string, args: string[]): number {
  const { values, positionals } = parse(args, {
    remote: { type: "string" },
    undo: { type: "boolean" },
    json: { type: "boolean" },
  });
  if (positionals.length) throw new FactoryError(`unexpected argument: ${positionals[0]}`);
  assertRepo(cwd);
  const result = setup(cwd, str(values.remote) ?? "origin", values.undo === true);
  if (result.fetchRefspec === null && values.json !== true) {
    process.stderr.write(`git factory: no remote named ${result.remote}; fetch refspec not configured\n`);
  }
  const verb = values.undo === true ? "removed" : "configured";
  print(values.json === true, result, result.changed ? `refs/notes/factory ${verb}` : "already up to date");
  return 0;
}

function cmdDigest(cwd: string, args: string[]): number {
  const { positionals } = parse(args, {});
  const file = positionals[0];
  if (!file || positionals.length > 1) throw new FactoryError("usage: git factory digest <envelope-or-attestation-file|->");
  const value = readJson(cwd, file);
  const env = isRecord(value) && isRecord(value["envelope"]) ? value["envelope"] : value;
  const payload = isRecord(env) ? env["payload"] : undefined;
  const bytes = typeof payload === "string" ? decodeBase64(payload) : null;
  if (!bytes) throw new FactoryError(`${file} has no valid base64 payload`);
  process.stdout.write(`${statementDigest(bytes)}\n`);
  return 0;
}

export function main(argv: string[]): number {
  let cwd = process.cwd();
  const args = [...argv];
  while (args[0] === "-C") {
    const dir = args[1];
    if (dir === undefined) throw new FactoryError("-C needs a path");
    cwd = resolve(cwd, dir);
    args.splice(0, 2);
  }
  const [cmd, ...rest] = args;
  switch (cmd) {
    case "--version":
    case "version":
      process.stdout.write(`factory-proof ${version()} (factory-commits ${SPEC_VERSION})\n`);
      return 0;
    case undefined:
    case "-h":
    case "--help":
    case "help":
      process.stdout.write(`${USAGE}\n`);
      return cmd === undefined ? 2 : 0;
    case "attest":
      return cmdAttest(cwd, rest);
    case "note":
      return cmdNote(cwd, rest);
    case "show":
      return cmdShow(cwd, rest);
    case "verify":
      return cmdVerify(cwd, rest);
    case "trailers":
      return cmdTrailers(cwd, rest);
    case "setup":
      return cmdSetup(cwd, rest);
    case "digest":
      return cmdDigest(cwd, rest);
    default:
      throw new FactoryError(`unknown command: ${cmd}\n${USAGE}`);
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (e instanceof FactoryError) {
    process.stderr.write(`git factory: ${e.message}\n`);
    process.exitCode = e.exitCode;
  } else {
    process.stderr.write(`git factory: internal error: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
    process.exitCode = 2;
  }
}
