import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SSH_NAMESPACE } from "./constants.js";
import { decodeBase64, type Signature } from "./dsse.js";
import { FactoryError, run } from "./exec.js";

const ARMOR = "-----BEGIN SSH SIGNATURE-----";

function withTemp<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "factory-proof-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Signs PAE bytes with `ssh-keygen -Y sign -n factory-commits`.
 * Returns a DSSE signature whose `sig` is the base64 of the armored ssh signature.
 */
export function sshSign(paeBytes: Uint8Array, keyPath: string, principal: string): Signature {
  const r = run("ssh-keygen", ["-Y", "sign", "-n", SSH_NAMESPACE, "-f", keyPath], { input: Buffer.from(paeBytes) });
  const armored = r.stdout.toString("utf8");
  if (r.status !== 0 || !armored.includes(ARMOR)) {
    throw new FactoryError(`ssh-keygen -Y sign failed: ${r.stderr.trim() || `exit ${r.status}`}`);
  }
  return { keyid: principal, sig: Buffer.from(armored, "utf8").toString("base64") };
}

/** The armored ssh signature carried by a DSSE `sig`: base64 of the armor, or the armor itself. */
export function armoredSignature(sig: string): string | null {
  if (sig.startsWith(ARMOR)) return sig;
  const bytes = decodeBase64(sig);
  const text = bytes?.toString("utf8");
  return text?.startsWith(ARMOR) ? text : null;
}

export type SignatureCheck = "valid" | "invalid" | "unverified";

/**
 * Checks one ssh signature over PAE bytes against an allowed_signers file.
 * `unverified` when it is not an ssh signature, has no principal, or its key is not an allowed signer.
 */
export function sshVerify(paeBytes: Uint8Array, signature: Signature, allowedSigners: string): SignatureCheck {
  if (signature.scheme !== undefined && signature.scheme !== "ssh") return "unverified";
  const armored = armoredSignature(signature.sig);
  if (!armored || !signature.keyid) return "unverified";
  const principal = signature.keyid;
  return withTemp((dir) => {
    const sigFile = join(dir, "sig");
    writeFileSync(sigFile, armored);
    const v = run(
      "ssh-keygen",
      ["-Y", "verify", "-n", SSH_NAMESPACE, "-f", allowedSigners, "-I", principal, "-s", sigFile],
      { input: Buffer.from(paeBytes) },
    );
    if (v.status === 0) return "valid";
    // A key that is not in allowed_signers cannot be checked; a known key that fails is invalid.
    const f = run("ssh-keygen", ["-Y", "find-principals", "-f", allowedSigners, "-s", sigFile]);
    return f.status === 0 && f.stdout.toString("utf8").trim() !== "" ? "invalid" : "unverified";
  });
}
