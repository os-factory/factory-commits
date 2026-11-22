import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProblemCode } from "../src/constants.js";
import { makeEnvelope, pae, statementDigest } from "../src/dsse.js";
import type { Attestation } from "../src/note.js";
import { sshSign } from "../src/ssh.js";
import { verifyCommit } from "../src/verify.js";
import { commitFile, entry, examplePredicate, git, repo, sh, tempDir, writeEntries, writeRawNote } from "./helpers.js";

function head(d: string): { commit: string; tree: string } {
  return { commit: git(d, "rev-parse", "HEAD"), tree: git(d, "rev-parse", "HEAD^{tree}") };
}

function codes(d: string, rev = "HEAD", allowedSigners?: string): { level: string; codes: ProblemCode[] } {
  const r = verifyCommit(d, git(d, "rev-parse", rev), { allowedSigners });
  return { level: r.level, codes: r.problems.map((p) => p.code).sort() };
}

function keypair(dir: string, principal: string): { key: string; allowed: string } {
  const key = join(dir, `${principal}-key`);
  sh(dir, "ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "", "-f", key]);
  const allowed = join(dir, `${principal}-allowed_signers`);
  writeFileSync(allowed, `${principal} ${sh(dir, "cat", [`${key}.pub`])}\n`);
  return { key, allowed };
}

function sign(a: Attestation, key: string, principal: string, over?: Buffer): Attestation {
  const bytes = Buffer.from(a.envelope.payload, "base64");
  const sig = sshSign(over ?? pae(a.envelope.payloadType, bytes), key, principal);
  return { ...a, envelope: { ...a.envelope, signatures: [...a.envelope.signatures, sig] } };
}

describe("levels", () => {
  it("none: no trailers, no note", () => {
    const d = repo("chore: nothing\n");
    expect(codes(d)).toEqual({ level: "none", codes: [] });
  });

  it("L0: a Work-Unit or Factory-Run trailer", () => {
    expect(codes(repo("feat: x\n\nWork-Unit: github:416\n"))).toEqual({ level: "L0", codes: [] });
    expect(codes(repo("feat: x\n\nFactory-Run: 01JD4X7Q\n"))).toEqual({ level: "L0", codes: [] });
    // Policy and agent trailers alone do not link a commit.
    expect(codes(repo("feat: x\n\nFactory-Policy: default@3\n")).level).toBe("none");
  });

  it("L1: a valid passing statement on the commit's tree", () => {
    const d = repo();
    writeEntries(d, "HEAD", [entry(head(d))]);
    expect(codes(d)).toEqual({ level: "L1", codes: [] });
  });

  it("L1 without trailers", () => {
    const d = repo("chore: no trailers\n");
    writeEntries(d, "HEAD", [entry({ tree: head(d).tree })]);
    expect(codes(d).level).toBe("L1");
  });

  it("a valid failing statement does not reach L1", () => {
    const d = repo();
    const p = examplePredicate();
    const stages = (p["stages"] as Array<Record<string, unknown>>).map((s) => (s["id"] === "lint" ? { ...s, status: "failed" } : s));
    writeEntries(d, "HEAD", [entry({ tree: head(d).tree, predicate: { ...p, stages, verdict: "fail" } })]);
    expect(codes(d)).toEqual({ level: "L0", codes: [] });
  });

  it("L2: a valid trusted ssh signature; L1 without allowed signers", () => {
    const d = repo();
    const { key, allowed } = keypair(tempDir(), "dev");
    writeEntries(d, "HEAD", [sign(entry({ tree: head(d).tree }), key, "dev")]);
    expect(codes(d, "HEAD", allowed)).toEqual({ level: "L2", codes: [] });
    expect(codes(d)).toEqual({ level: "L1", codes: [] });
  });
});

describe("problem codes", () => {
  it("TRAILER_MALFORMED", () => {
    const d = repo("feat: x\n\nWork-Unit: GitHub:416\nFactory-Run: r1\n");
    expect(codes(d)).toEqual({ level: "L0", codes: ["TRAILER_MALFORMED"] });
    expect(codes(repo("feat: x\n\nFactory-Attestation: sha256:abc\n"))).toEqual({ level: "none", codes: ["TRAILER_MALFORMED"] });
  });

  it("NOTE_INVALID_JSON", () => {
    const d = repo();
    writeRawNote(d, "HEAD", "not json");
    expect(codes(d)).toEqual({ level: "L0", codes: ["NOTE_INVALID_JSON"] });
  });

  it("NOTE_SCHEMA", () => {
    const d = repo();
    writeRawNote(d, "HEAD", JSON.stringify({ type: "https://example.com/nope", attestations: [] }));
    expect(codes(d)).toEqual({ level: "L0", codes: ["NOTE_SCHEMA"] });
  });

  it("DIGEST_MISMATCH", () => {
    const d = repo();
    const e = entry(head(d));
    writeEntries(d, "HEAD", [{ ...e, digest: `sha256:${"0".repeat(64)}` }]);
    expect(codes(d)).toEqual({ level: "L0", codes: ["DIGEST_MISMATCH"] });
  });

  it("STATEMENT_INVALID: bad base64, not JSON, schema failure", () => {
    const d = repo();
    const raw = (bytes: Buffer): Attestation => ({
      predicateType: "https://example.com/x",
      digest: statementDigest(bytes),
      envelope: makeEnvelope(bytes),
    });
    const notJson = raw(Buffer.from("not json"));
    const notBase64: Attestation = { ...entry(head(d)), envelope: { ...entry(head(d)).envelope, payload: "%%%" } };
    const p = examplePredicate();
    delete p["producer"];
    const schemaFail = entry({ tree: head(d).tree, predicate: p });
    writeEntries(d, "HEAD", [notBase64, notJson, schemaFail]);
    expect(codes(d)).toEqual({ level: "L0", codes: ["STATEMENT_INVALID", "STATEMENT_INVALID", "STATEMENT_INVALID"] });
  });

  it("PREDICATE_UNKNOWN alongside a valid statement stays L1", () => {
    const d = repo();
    const unknown = entry({ tree: head(d).tree, predicateType: "https://example.com/other/v1" });
    writeEntries(d, "HEAD", [unknown, entry(head(d))]);
    expect(codes(d)).toEqual({ level: "L1", codes: ["PREDICATE_UNKNOWN"] });
  });

  it("TREE_MISMATCH", () => {
    const d = repo();
    writeEntries(d, "HEAD", [entry({ tree: "b".repeat(40) })]);
    expect(codes(d)).toEqual({ level: "L0", codes: ["TREE_MISMATCH"] });
  });

  it("COMMIT_MISMATCH", () => {
    const d = repo();
    writeEntries(d, "HEAD", [entry({ tree: head(d).tree, commit: "c".repeat(40) })]);
    expect(codes(d)).toEqual({ level: "L0", codes: ["COMMIT_MISMATCH"] });
  });

  it("VERDICT_MISMATCH", () => {
    const d = repo();
    writeEntries(d, "HEAD", [entry({ tree: head(d).tree, predicate: { ...examplePredicate(), verdict: "fail" } })]);
    expect(codes(d)).toEqual({ level: "L0", codes: ["VERDICT_MISMATCH"] });
  });

  it("SIGNATURE_INVALID: a trusted key over other bytes", () => {
    const d = repo();
    const { key, allowed } = keypair(tempDir(), "dev");
    writeEntries(d, "HEAD", [sign(entry({ tree: head(d).tree }), key, "dev", Buffer.from("something else"))]);
    expect(codes(d, "HEAD", allowed)).toEqual({ level: "L1", codes: ["SIGNATURE_INVALID"] });
  });

  it("SIGNATURE_UNVERIFIED: untrusted key or unknown scheme", () => {
    const d = repo();
    const dir = tempDir();
    const other = keypair(dir, "other");
    const trusted = keypair(dir, "dev");
    const e = sign(entry({ tree: head(d).tree }), other.key, "other");
    e.envelope.signatures.push({ keyid: "ci", sig: "c2ln", scheme: "sigstore" });
    writeEntries(d, "HEAD", [e]);
    expect(codes(d, "HEAD", trusted.allowed)).toEqual({ level: "L1", codes: ["SIGNATURE_UNVERIFIED", "SIGNATURE_UNVERIFIED"] });
  });

  it("TRAILER_ATTESTATION_NOT_FOUND, with and without a note", () => {
    const t = `Factory-Attestation: sha256:${"d".repeat(64)}`;
    const d = repo(`feat: x\n\nWork-Unit: github:1\n${t}\n`);
    expect(codes(d)).toEqual({ level: "L0", codes: ["TRAILER_ATTESTATION_NOT_FOUND"] });
    writeEntries(d, "HEAD", [entry(head(d))]);
    expect(codes(d)).toEqual({ level: "L1", codes: ["TRAILER_ATTESTATION_NOT_FOUND"] });
  });
});

describe("history rewrites with notes.rewriteRef", () => {
  function setupRepo(): string {
    const d = repo();
    git(d, "config", "notes.rewriteRef", "refs/notes/factory");
    return d;
  }

  it("amend that keeps the tree keeps L1", () => {
    const d = setupRepo();
    writeEntries(d, "HEAD", [entry({ tree: head(d).tree })]);
    const before = head(d).commit;
    git(d, "commit", "-q", "--amend", "-m", "feat: reworded\n\nWork-Unit: github:416");
    expect(head(d).commit).not.toBe(before);
    expect(codes(d)).toEqual({ level: "L1", codes: [] });
  });

  it("rebase that keeps the trees keeps L1", () => {
    const d = setupRepo();
    commitFile(d, "b.txt", "b\n", "feat: b\n");
    writeEntries(d, "HEAD", [entry({ tree: head(d).tree })]);
    const before = head(d).commit;
    sh(d, "git", ["rebase", "-q", "--force-rebase", "HEAD~1"], undefined, { GIT_COMMITTER_DATE: "2026-01-02T00:00:00Z" });
    expect(head(d).commit).not.toBe(before);
    expect(codes(d).level).toBe("L1");
  });

  it("rebase onto a moved base copies the note but the tree no longer matches", () => {
    const d = setupRepo();
    git(d, "checkout", "-q", "-b", "topic");
    commitFile(d, "b.txt", "b\n", "feat: b\n\nWork-Unit: github:2\n");
    writeEntries(d, "HEAD", [entry({ tree: head(d).tree })]);
    git(d, "checkout", "-q", "main");
    commitFile(d, "c.txt", "c\n", "feat: c\n");
    git(d, "checkout", "-q", "topic");
    git(d, "rebase", "-q", "main");
    expect(codes(d)).toEqual({ level: "L0", codes: ["TREE_MISMATCH"] });
  });

  it("an amend that pins gitCommit is reported as COMMIT_MISMATCH", () => {
    const d = setupRepo();
    writeEntries(d, "HEAD", [entry(head(d))]);
    git(d, "commit", "-q", "--amend", "-m", "feat: reworded\n\nWork-Unit: github:416");
    expect(codes(d)).toEqual({ level: "L0", codes: ["COMMIT_MISMATCH"] });
  });
});
