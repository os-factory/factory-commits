import { NOTES_REF } from "./constants.js";
import { git, tryGit } from "./exec.js";
import { remoteExists } from "./repo.js";

export const NOTES_REFSPEC = `+${NOTES_REF}:${NOTES_REF}`;

export interface SetupResult {
  remote: string;
  /** The fetch refspec is configured after the call (null when the remote does not exist). */
  fetchRefspec: boolean | null;
  rewriteRef: boolean;
  changed: boolean;
}

function getAll(cwd: string, key: string): string[] {
  const r = tryGit(cwd, ["config", "--get-all", key]);
  return r.status === 0 ? r.stdout.toString("utf8").split("\n").filter(Boolean) : [];
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Idempotently configures (or with `undo`, removes) the notes fetch refspec and notes.rewriteRef. */
export function setup(cwd: string, remote = "origin", undo = false): SetupResult {
  let changed = false;
  const fetchKey = `remote.${remote}.fetch`;
  let fetchRefspec: boolean | null = null;
  if (remoteExists(cwd, remote)) {
    const present = getAll(cwd, fetchKey).includes(NOTES_REFSPEC);
    if (!undo && !present) {
      git(cwd, ["config", "--add", fetchKey, NOTES_REFSPEC]);
      changed = true;
    } else if (undo && present) {
      git(cwd, ["config", "--unset-all", fetchKey, `^${escape(NOTES_REFSPEC)}$`]);
      changed = true;
    }
    fetchRefspec = !undo;
  }
  const rewrite = getAll(cwd, "notes.rewriteRef").includes(NOTES_REF);
  if (!undo && !rewrite) {
    git(cwd, ["config", "--add", "notes.rewriteRef", NOTES_REF]);
    changed = true;
  } else if (undo && rewrite) {
    git(cwd, ["config", "--unset-all", "notes.rewriteRef", `^${escape(NOTES_REF)}$`]);
    changed = true;
  }
  return { remote, fetchRefspec, rewriteRef: !undo, changed };
}
