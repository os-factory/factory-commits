import { NOTE_TYPE, NOTES_REF } from "./constants.js";
import type { Envelope } from "./dsse.js";
import { FactoryError, git, tryGit } from "./exec.js";
import { validateNote } from "./schema.js";

export interface Attestation {
  predicateType: string;
  digest: string;
  envelope: Envelope;
}

export interface NoteDocument {
  type: typeof NOTE_TYPE;
  attestations: Attestation[];
  summary?: Record<string, unknown>;
  [extra: string]: unknown;
}

/** The raw note text on a commit in refs/notes/factory, or null when there is none. */
export function readNoteRaw(cwd: string, commit: string): string | null {
  const list = tryGit(cwd, ["notes", `--ref=${NOTES_REF}`, "list", commit]);
  if (list.status !== 0) return null;
  const blob = list.stdout.toString("utf8").trim();
  if (!blob) return null;
  return git(cwd, ["cat-file", "blob", blob]);
}

/** Reads and validates the note for writing. Refuses (exit 2) to overwrite a note it cannot parse. */
export function readNoteForWrite(cwd: string, commit: string): NoteDocument | null {
  const raw = readNoteRaw(cwd, commit);
  if (raw === null) return null;
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new FactoryError(`existing note on ${commit} is not valid JSON; refusing to overwrite it`);
  }
  const v = validateNote(doc);
  if (!v.valid) throw new FactoryError(`existing note on ${commit} is invalid (${v.error}); refusing to overwrite it`);
  return doc as NoteDocument;
}

/**
 * SPEC §7.2: append, de-duplicate by digest, never drop existing attestations.
 * An entry whose digest is already present contributes only its new signatures
 * (signatures never change the digest, SPEC §5.2).
 */
export function mergeAttestations(
  existing: NoteDocument | null,
  add: readonly Attestation[],
): { note: NoteDocument; added: Attestation[] } {
  const note: NoteDocument = existing
    ? { ...existing, attestations: [...existing.attestations] }
    : { type: NOTE_TYPE, attestations: [] };
  const added: Attestation[] = [];
  for (const a of add) {
    const i = note.attestations.findIndex((e) => e.digest === a.digest);
    const current = note.attestations[i];
    if (!current) {
      note.attestations.push(a);
      added.push(a);
      continue;
    }
    const known = new Set(current.envelope.signatures.map((s) => s.sig));
    const fresh = a.envelope.signatures.filter((s) => !known.has(s.sig));
    if (fresh.length === 0) continue;
    note.attestations[i] = {
      ...current,
      envelope: { ...current.envelope, signatures: [...current.envelope.signatures, ...fresh] },
    };
    added.push(a);
  }
  return { note, added };
}

export function writeNote(cwd: string, commit: string, note: NoteDocument): void {
  git(cwd, ["notes", `--ref=${NOTES_REF}`, "add", "-f", "-F", "-", commit], `${JSON.stringify(note, null, 2)}\n`);
}

/** Appends attestations to a commit's note. Returns the ones that were not already present. */
export function appendToNote(cwd: string, commit: string, attestations: readonly Attestation[]): Attestation[] {
  const { note, added } = mergeAttestations(readNoteForWrite(cwd, commit), attestations);
  if (added.length > 0) writeNote(cwd, commit, note);
  return added;
}
