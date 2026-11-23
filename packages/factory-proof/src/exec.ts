import { spawnSync } from "node:child_process";

/** An error that maps to a CLI exit code (2 = usage or environment error). */
export class FactoryError extends Error {
  constructor(
    message: string,
    readonly exitCode: number = 2,
  ) {
    super(message);
    this.name = "FactoryError";
  }
}

export interface RunResult {
  status: number;
  stdout: Buffer;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  input?: string | Buffer;
  env?: NodeJS.ProcessEnv;
}

/** Runs a program without a shell. Throws FactoryError when it cannot be started. */
export function run(cmd: string, args: readonly string[], opts: RunOptions = {}): RunResult {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    input: opts.input,
    env: opts.env ?? process.env,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) {
    const code = (r.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new FactoryError(`required tool not found: ${cmd}`);
    throw new FactoryError(`cannot run ${cmd}: ${r.error.message}`);
  }
  return { status: r.status ?? 1, stdout: r.stdout, stderr: r.stderr.toString("utf8") };
}

/** Runs git, returning the result whatever the exit status. */
export function tryGit(cwd: string, args: readonly string[], input?: string | Buffer): RunResult {
  return run("git", args, { cwd, input });
}

/** Runs git and returns trimmed stdout. Throws FactoryError on a non-zero exit. */
export function git(cwd: string, args: readonly string[], input?: string | Buffer): string {
  const r = tryGit(cwd, args, input);
  if (r.status !== 0) {
    throw new FactoryError(`git ${args[0] ?? ""} failed: ${r.stderr.trim() || `exit ${r.status}`}`);
  }
  return r.stdout.toString("utf8").replace(/\n$/, "");
}
