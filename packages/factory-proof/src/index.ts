export * from "./constants.js";
export { FactoryError } from "./exec.js";
export { pae, decodeBase64, statementDigest, serializeStatement, makeEnvelope, envelopeDigest } from "./dsse.js";
export type { Envelope, Signature } from "./dsse.js";
export { validatePredicate, validateStatement, validateNote } from "./schema.js";
export { buildStatement, recomputeVerdict, subjectName } from "./statement.js";
export type { Statement, Subject, Verdict, BuildStatementInput } from "./statement.js";
export {
  TRAILER_NAMES,
  isValidTrailer,
  factoryTrailerName,
  factoryTrailers,
  readCommitTrailers,
  parseTrailerLines,
  addTrailers,
  normalizeTrailerValue,
} from "./trailers.js";
export type { Trailer, TrailerName, TrailerInput } from "./trailers.js";
export { readNoteRaw, readNoteForWrite, mergeAttestations, writeNote, appendToNote } from "./note.js";
export type { Attestation, NoteDocument } from "./note.js";
export { sshSign, sshVerify, armoredSignature } from "./ssh.js";
export type { SignatureCheck } from "./ssh.js";
export { checkAttestation, checkTrailers, verifyCommit, isFailing } from "./verify.js";
export type { CommitResult, VerifyOptions, AttestationCheck } from "./verify.js";
export { attest, addToNote } from "./attest.js";
export type { AttestOptions, AttestResult } from "./attest.js";
export { setup, NOTES_REFSPEC } from "./setup.js";
export type { SetupResult } from "./setup.js";
