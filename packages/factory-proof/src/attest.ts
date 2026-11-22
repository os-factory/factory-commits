import { FACTORY_RUN_PREDICATE_TYPE } from "./constants.js";
import { makeEnvelope, pae, serializeStatement, statementDigest } from "./dsse.js";
import { FactoryError } from "./exec.js";
import { appendToNote, type Attestation } from "./note.js";
import { remoteUrl, resolveCommit, resolveTree } from "./repo.js";
import { validatePredicate, validateStatement } from "./schema.js";
import { sshSign } from "./ssh.js";
import { buildStatement, recomputeVerdict } from "./statement.js";
import { checkAttestation } from "./verify.js";

export interface AttestOptions {
  predicate: unknown;
  /** Tree id. Defaults to the tree of `rev`. */
  tree?: string;
  /** Defaults to HEAD when `tree` is not given. */
  rev?: string;
  /** Optional subject gitCommit. */
  commit?: string;
  /** Defaults to the origin URL, or `local`. */
  repoUrl?: string;
  signKey?: string;
  signer?: string;
  /** Appends the attestation to the note on this revision. */
  writeNote?: string;
}

export interface AttestResult {
  digest: string;
  tree: string;
  attestation: Attestation;
  noteWritten: string | null;
}

/** Builds, optionally signs and optionally records a factory-run attestation. */
export function attest(cwd: string, opts: AttestOptions): AttestResult {
  const predicateCheck = validatePredicate(opts.predicate);
  if (!predicateCheck.valid) throw new FactoryError(`invalid predicate: ${predicateCheck.error}`);
  const predicate = opts.predicate as Record<string, unknown>;
  const recomputed = recomputeVerdict(predicate);
  if (predicate["verdict"] !== recomputed) {
    throw new FactoryError(`invalid predicate: verdict is ${String(predicate["verdict"])} but the required stages give ${recomputed}`);
  }
  if (opts.signKey && !opts.signer) throw new FactoryError("--sign-key needs --signer");
  if (opts.signer && !opts.signKey) throw new FactoryError("--signer needs --sign-key");

  if (opts.tree && opts.rev) throw new FactoryError("use --tree or --rev, not both");
  const tree = resolveTree(cwd, opts.tree ?? opts.rev ?? "HEAD");
  const commit = opts.commit ? resolveCommit(cwd, opts.commit) : undefined;

  const statement = buildStatement({ predicate, tree, commit, repoUrl: opts.repoUrl ?? remoteUrl(cwd) });
  const statementCheck = validateStatement(statement);
  if (!statementCheck.valid) throw new FactoryError(`invalid statement: ${statementCheck.error}`);

  const bytes = serializeStatement(statement);
  const digest = statementDigest(bytes);
  const envelope = makeEnvelope(bytes);
  if (opts.signKey && opts.signer) {
    envelope.signatures.push(sshSign(pae(envelope.payloadType, bytes), opts.signKey, opts.signer));
  }
  const attestation: Attestation = { predicateType: FACTORY_RUN_PREDICATE_TYPE, digest, envelope };

  let noteWritten: string | null = null;
  if (opts.writeNote) {
    noteWritten = addToNote(cwd, opts.writeNote, attestation).commit;
  }
  return { digest, tree, attestation, noteWritten };
}

/**
 * Appends an existing attestation entry to the note on `rev` after checking its digest and,
 * for a factory-run statement, that its tree (and commit, if present) match.
 */
export function addToNote(cwd: string, rev: string, attestation: Attestation): { commit: string; added: boolean } {
  const commit = resolveCommit(cwd, rev);
  const tree = resolveTree(cwd, commit);
  const check = checkAttestation(attestation, { commit, tree });
  const fatal = check.problems.find((p) => p.code !== "PREDICATE_UNKNOWN");
  if (fatal) throw new FactoryError(`refusing to write the note on ${commit}: ${fatal.code} ${fatal.message}`);
  const added = appendToNote(cwd, commit, [attestation]);
  return { commit, added: added.length > 0 };
}
