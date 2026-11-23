import {
  FACTORY_RUN_PREDICATE_TYPE,
  INFORMATIONAL_CODES,
  type Level,
  levelRank,
  PAYLOAD_TYPE,
  type Problem,
  type ProblemCode,
} from "./constants.js";
import { decodeBase64, type Envelope, pae, statementDigest } from "./dsse.js";
import { type Attestation, readNoteRaw } from "./note.js";
import { resolveTree } from "./repo.js";
import { validateNote, validateStatement } from "./schema.js";
import { sshVerify } from "./ssh.js";
import { recomputeVerdict, type Statement, type Verdict } from "./statement.js";
import { factoryTrailerName, isValidTrailer, readCommitTrailers, type Trailer } from "./trailers.js";

export interface CommitResult {
  commit: string;
  level: Level;
  problems: Problem[];
}

export interface VerifyOptions {
  /** ssh allowed_signers file. Without it signatures are not checked and L2 is never reached. */
  allowedSigners?: string;
}

export interface AttestationCheck {
  /** The digest the note claims. */
  digest: string;
  problems: Problem[];
  /** True when the attestation passed every check of SPEC §9 step 3 (any verdict). */
  valid: boolean;
  verdict?: Verdict;
  payload?: Buffer;
}

function short(digest: string): string {
  return digest.startsWith("sha256:") ? digest.slice(0, 19) : digest;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** SPEC §9 step 3 for one note entry, stopping at the first failing check. */
export function checkAttestation(entry: Attestation, ctx: { commit: string; tree: string }): AttestationCheck {
  const id = short(entry.digest);
  const fail = (code: ProblemCode, message: string, payload?: Buffer): AttestationCheck => ({
    digest: entry.digest,
    problems: [{ code, message: `${id}: ${message}` }],
    valid: false,
    payload,
  });
  const env: Envelope = entry.envelope;
  const payload = decodeBase64(env.payload);
  if (!payload) return fail("STATEMENT_INVALID", "payload is not valid base64");
  const actual = statementDigest(payload);
  if (actual !== entry.digest) return fail("DIGEST_MISMATCH", `payload digest is ${actual}`, payload);
  if (env.payloadType !== PAYLOAD_TYPE) {
    return fail("STATEMENT_INVALID", `payloadType is ${JSON.stringify(env.payloadType)}`, payload);
  }
  let statement: unknown;
  try {
    statement = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload));
  } catch {
    return fail("STATEMENT_INVALID", "payload is not UTF-8 JSON", payload);
  }
  if (!isRecord(statement) || typeof statement["predicateType"] !== "string") {
    return fail("STATEMENT_INVALID", "payload is not a statement", payload);
  }
  if (statement["predicateType"] !== FACTORY_RUN_PREDICATE_TYPE) {
    return fail("PREDICATE_UNKNOWN", `predicate type ${statement["predicateType"]} is not recognized`, payload);
  }
  const schema = validateStatement(statement);
  if (!schema.valid) return fail("STATEMENT_INVALID", `statement schema: ${schema.error}`, payload);
  const s = statement as unknown as Statement;
  const subject = s.subject[0];
  if (subject.digest.gitTree !== ctx.tree) {
    return fail("TREE_MISMATCH", `statement tree ${subject.digest.gitTree} is not the commit tree ${ctx.tree}`, payload);
  }
  if (subject.digest.gitCommit !== undefined && subject.digest.gitCommit !== ctx.commit) {
    return fail("COMMIT_MISMATCH", `statement commit ${subject.digest.gitCommit} is not ${ctx.commit}`, payload);
  }
  const recorded = s.predicate["verdict"];
  const recomputed = recomputeVerdict(s.predicate);
  if (recorded !== recomputed) {
    return fail("VERDICT_MISMATCH", `recorded verdict ${String(recorded)}, recomputed ${recomputed}`, payload);
  }
  return { digest: entry.digest, problems: [], valid: true, verdict: recomputed, payload };
}

/** SPEC §9 step 1: trailer problems and whether the commit reaches L0. */
export function checkTrailers(trailers: readonly Trailer[]): {
  linked: boolean;
  attestationDigests: string[];
  problems: Problem[];
} {
  const problems: Problem[] = [];
  const attestationDigests: string[] = [];
  let linked = false;
  for (const t of trailers) {
    const name = factoryTrailerName(t.key);
    if (!name) continue;
    if (!isValidTrailer(name, t.value)) {
      problems.push({ code: "TRAILER_MALFORMED", message: `${name}: ${JSON.stringify(t.value)} does not match its grammar` });
      continue;
    }
    if (name === "Work-Unit" || name === "Factory-Run") linked = true;
    if (name === "Factory-Attestation") attestationDigests.push(t.value);
  }
  return { linked, attestationDigests, problems };
}

/** Runs the verification procedure (SPEC §9) on one commit. */
export function verifyCommit(cwd: string, commit: string, opts: VerifyOptions = {}): CommitResult {
  const tree = resolveTree(cwd, commit);
  const trailers = checkTrailers(readCommitTrailers(cwd, commit));
  const problems: Problem[] = [...trailers.problems];
  let level: Level = trailers.linked ? "L0" : "none";
  const noteDigests = new Set<string>();

  const raw = readNoteRaw(cwd, commit);
  if (raw !== null) {
    let doc: unknown;
    let parsed = true;
    try {
      doc = JSON.parse(raw);
    } catch {
      parsed = false;
      problems.push({ code: "NOTE_INVALID_JSON", message: "the note is not valid JSON" });
    }
    const schema = parsed ? validateNote(doc) : { valid: false };
    if (parsed && !schema.valid) {
      problems.push({ code: "NOTE_SCHEMA", message: `note schema: ${schema.error ?? "invalid"}` });
    }
    if (parsed && schema.valid) {
      const attestations = (doc as { attestations: Attestation[] }).attestations;
      let recorded = false;
      let signed = false;
      for (const entry of attestations) {
        noteDigests.add(entry.digest);
        const check = checkAttestation(entry, { commit, tree });
        problems.push(...check.problems);
        if (!check.valid || !check.payload) continue;
        const passing = check.verdict === "pass";
        if (passing) recorded = true;
        if (!opts.allowedSigners) continue;
        const paeBytes = pae(entry.envelope.payloadType, check.payload);
        for (const sig of entry.envelope.signatures) {
          const result = sshVerify(paeBytes, sig, opts.allowedSigners);
          const who = sig.keyid ? ` by ${sig.keyid}` : "";
          if (result === "valid") {
            if (passing) signed = true;
          } else if (result === "invalid") {
            problems.push({ code: "SIGNATURE_INVALID", message: `${short(entry.digest)}: signature${who} is invalid` });
          } else {
            problems.push({
              code: "SIGNATURE_UNVERIFIED",
              message: `${short(entry.digest)}: signature${who} cannot be checked against the allowed signers`,
            });
          }
        }
      }
      if (recorded) level = signed ? "L2" : "L1";
    }
  }

  for (const d of trailers.attestationDigests) {
    if (!noteDigests.has(d)) {
      problems.push({ code: "TRAILER_ATTESTATION_NOT_FOUND", message: `Factory-Attestation ${short(d)} is not in the note` });
    }
  }
  return { commit, level, problems };
}

/** True when a result fails verification: below the minimum level or with a non-informational problem. */
export function isFailing(result: CommitResult, minLevel: Level): boolean {
  return levelRank(result.level) < levelRank(minLevel) || result.problems.some((p) => !INFORMATIONAL_CODES.has(p.code));
}
