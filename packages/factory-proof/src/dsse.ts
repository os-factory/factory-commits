import { createHash } from "node:crypto";
import { PAYLOAD_TYPE } from "./constants.js";

export interface Signature {
  keyid?: string;
  sig: string;
  scheme?: string;
}

export interface Envelope {
  payloadType: string;
  payload: string;
  signatures: Signature[];
}

/** DSSE pre-authentication encoding: `DSSEv1 <len> <type> <len> <body>`. */
export function pae(payloadType: string, body: Uint8Array): Buffer {
  const type = Buffer.from(payloadType, "utf8");
  return Buffer.concat([
    Buffer.from(`DSSEv1 ${type.length} `, "utf8"),
    type,
    Buffer.from(` ${body.length} `, "utf8"),
    body,
  ]);
}

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Strict standard base64 decoding. Returns null when the input is not canonical base64. */
export function decodeBase64(text: string): Buffer | null {
  if (!BASE64.test(text)) return null;
  return Buffer.from(text, "base64");
}

/** SPEC §5.2: `sha256:` + hex SHA-256 of the decoded payload bytes. */
export function statementDigest(payloadBytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(payloadBytes).digest("hex")}`;
}

/** Serializes a statement once; the returned bytes are what gets hashed and signed. */
export function serializeStatement(statement: unknown): Buffer {
  return Buffer.from(JSON.stringify(statement), "utf8");
}

export function makeEnvelope(payloadBytes: Uint8Array, signatures: Signature[] = []): Envelope {
  return {
    payloadType: PAYLOAD_TYPE,
    payload: Buffer.from(payloadBytes).toString("base64"),
    signatures,
  };
}

/** The digest of an envelope's payload, or null when the payload is not valid base64. */
export function envelopeDigest(envelope: Pick<Envelope, "payload">): string | null {
  const bytes = decodeBase64(envelope.payload);
  return bytes ? statementDigest(bytes) : null;
}
