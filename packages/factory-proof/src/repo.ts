import { FactoryError, git, tryGit } from "./exec.js";

/** Fails with exit 2 unless `cwd` is inside a git repository. */
export function assertRepo(cwd: string): void {
  const r = tryGit(cwd, ["rev-parse", "--git-dir"]);
  if (r.status !== 0) throw new FactoryError(`not a git repository: ${cwd}`);
}

/** Resolves a revision to a full commit id. */
export function resolveCommit(cwd: string, rev: string): string {
  const r = tryGit(cwd, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${rev}^{commit}`]);
  if (r.status !== 0) throw new FactoryError(`unknown revision: ${rev}`);
  return r.stdout.toString("utf8").trim();
}

/** Resolves a revision (commit or tree) to its tree id. */
export function resolveTree(cwd: string, rev: string): string {
  const r = tryGit(cwd, ["rev-parse", "--verify", "--quiet", "--end-of-options", `${rev}^{tree}`]);
  if (r.status !== 0) throw new FactoryError(`unknown tree or revision: ${rev}`);
  return r.stdout.toString("utf8").trim();
}

/** Lists the commits of a range such as `A..B`, newest first. */
export function revList(cwd: string, range: string): string[] {
  const r = tryGit(cwd, ["rev-list", "--end-of-options", range]);
  if (r.status !== 0) throw new FactoryError(`invalid range: ${range}`);
  return r.stdout.toString("utf8").split("\n").filter(Boolean);
}

/** The URL of a remote, or undefined when it has none. */
export function remoteUrl(cwd: string, remote = "origin"): string | undefined {
  const r = tryGit(cwd, ["config", "--get", `remote.${remote}.url`]);
  return r.status === 0 ? r.stdout.toString("utf8").trim() || undefined : undefined;
}

export function remoteExists(cwd: string, remote: string): boolean {
  return git(cwd, ["remote"]).split("\n").includes(remote);
}
