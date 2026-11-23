import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cli, commitFile, entry, examplePredicate, git, repo, sh, tempDir, writeRawNote } from "./helpers.js";

interface AttestJson {
  digest: string;
  tree: string;
  attestation: { predicateType: string; digest: string; envelope: { payloadType: string; payload: string; signatures: unknown[] } };
  noteWritten: string | null;
}

interface VerifyJson {
  commits: Array<{ commit: string; level: string; problems: Array<{ code: string; message: string }> }>;
}

function predicateFile(dir: string, predicate: unknown = examplePredicate()): string {
  const f = join(dir, "predicate.json");
  writeFileSync(f, JSON.stringify(predicate));
  return f;
}

function noteOf(d: string, rev = "HEAD"): { attestations: Array<{ digest: string; envelope: { signatures: unknown[] } }> } {
  return JSON.parse(git(d, "notes", "--ref=refs/notes/factory", "show", rev)) as {
    attestations: Array<{ digest: string; envelope: { signatures: unknown[] } }>;
  };
}

describe("git factory --version", () => {
  it("prints the package and contract versions", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    expect(cli(tempDir(), ["--version"]).stdout).toBe(`factory-proof ${pkg.version} (factory-commits v0.1)\n`);
  });
});

describe("git factory attest", () => {
  it("writes a note and prints the JSON contract", () => {
    const d = repo();
    const r = cli(d, ["attest", "--predicate", predicateFile(tempDir()), "--write-note", "HEAD", "--json"]);
    expect(r.status).toBe(0);
    const out = r.json() as AttestJson;
    expect(Object.keys(out).sort()).toEqual(["attestation", "digest", "noteWritten", "tree"]);
    expect(out.tree).toBe(git(d, "rev-parse", "HEAD^{tree}"));
    expect(out.noteWritten).toBe(git(d, "rev-parse", "HEAD"));
    expect(out.attestation.digest).toBe(out.digest);
    expect(out.attestation.envelope.payloadType).toBe("application/vnd.in-toto+json");
    const statement = JSON.parse(Buffer.from(out.attestation.envelope.payload, "base64").toString()) as {
      subject: Array<{ name: string; digest: Record<string, string> }>;
    };
    expect(statement.subject[0]).toEqual({ name: "git+local", digest: { gitTree: out.tree } });
    expect(noteOf(d).attestations.map((a) => a.digest)).toEqual([out.digest]);
  });

  it("is idempotent and keeps other attestations", () => {
    const d = repo();
    const p = predicateFile(tempDir());
    const other = entry({ tree: git(d, "rev-parse", "HEAD^{tree}"), predicateType: "https://example.com/other/v1" });
    writeRawNote(d, "HEAD", JSON.stringify({ type: "https://os-factory.dev/factory-commits/note/v0.1", attestations: [other] }));
    const a = cli(d, ["attest", "--predicate", p, "--write-note", "HEAD", "--json"]).json() as AttestJson;
    cli(d, ["attest", "--predicate", p, "--write-note", "HEAD", "--json"]);
    expect(noteOf(d).attestations.map((x) => x.digest)).toEqual([other.digest, a.digest]);
  });

  it("builds a statement before the commit exists with --tree, then note add", () => {
    const d = repo();
    writeFileSync(join(d, "b.txt"), "b\n");
    git(d, "add", "b.txt");
    const tree = git(d, "write-tree");
    const out = join(tempDir(), "att.json");
    const r = cli(d, ["attest", "--predicate", predicateFile(tempDir()), "--tree", tree, "--out", out, "--json"]);
    expect((r.json() as AttestJson).noteWritten).toBeNull();
    sh(d, "git", ["commit", "-q", "-F", "-"], "feat: b\n\nWork-Unit: github:416\n");
    const add = cli(d, ["note", "add", "HEAD", "--attestation", out, "--json"]);
    expect(add.json()).toEqual({ commit: git(d, "rev-parse", "HEAD"), added: true });
    expect(cli(d, ["note", "add", "HEAD", "--attestation", out, "--json"]).json()).toEqual({
      commit: git(d, "rev-parse", "HEAD"),
      added: false,
    });
    expect(cli(d, ["verify", "--json"]).status).toBe(0);
  });

  it("refuses a note on a commit with another tree", () => {
    const d = repo();
    const first = git(d, "rev-parse", "HEAD");
    commitFile(d, "b.txt", "b\n", "feat: b\n");
    const r = cli(d, ["attest", "--predicate", predicateFile(tempDir()), "--write-note", first]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("TREE_MISMATCH");
  });

  it("strips credentials from --repo-url and records --commit", () => {
    const d = repo();
    const head = git(d, "rev-parse", "HEAD");
    const out = cli(d, [
      "attest",
      "--predicate",
      predicateFile(tempDir()),
      "--repo-url",
      "https://user:secret@example.com/acme/app",
      "--commit",
      "HEAD",
      "--json",
    ]).json() as AttestJson;
    const payload = Buffer.from(out.attestation.envelope.payload, "base64").toString();
    expect(payload).not.toContain("secret");
    expect(JSON.parse(payload).subject[0]).toEqual({
      name: "git+https://example.com/acme/app",
      digest: { gitTree: out.tree, gitCommit: head },
    });
  });

  it("exits 2 on an invalid predicate or a lying verdict", () => {
    const d = repo();
    const dir = tempDir();
    expect(cli(d, ["attest", "--predicate", predicateFile(dir, { run: {} })]).status).toBe(2);
    expect(cli(d, ["attest", "--predicate", predicateFile(dir, { ...examplePredicate(), verdict: "fail" })]).status).toBe(2);
    expect(git(d, "notes", "--ref=refs/notes/factory", "list")).toBe("");
  });

  it("reads the predicate from stdin and signs with ssh", () => {
    const d = repo();
    const dir = tempDir();
    const key = join(dir, "key");
    sh(dir, "ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "", "-f", key]);
    const allowed = join(dir, "allowed_signers");
    writeFileSync(allowed, `dev ${readFileSync(`${key}.pub`, "utf8")}`);
    const r = cli(
      d,
      ["attest", "--predicate", "-", "--sign-key", key, "--signer", "dev", "--write-note", "HEAD", "--json"],
      JSON.stringify(examplePredicate()),
    );
    expect(r.status).toBe(0);
    const out = r.json() as AttestJson;
    expect(out.attestation.envelope.signatures).toHaveLength(1);
    expect(r.stdout).not.toContain("PRIVATE KEY");
    const v = cli(d, ["verify", "--allowed-signers", allowed, "--min-level", "L2", "--json"]);
    expect((v.json() as VerifyJson).commits[0]?.level).toBe("L2");
    expect(v.status).toBe(0);
  });
});

describe("git factory verify", () => {
  it("prints the conformance format and exits 1 below L1 for a single rev", () => {
    const d = repo();
    const r = cli(d, ["verify", "--json"]);
    expect(r.status).toBe(1);
    expect(r.json()).toEqual({ commits: [{ commit: git(d, "rev-parse", "HEAD"), level: "L0", problems: [] }] });
    expect(cli(d, ["verify", "--min-level", "L0"]).status).toBe(0);
  });

  it("verifies a range with min level none by default, and fails on problems", () => {
    const d = repo();
    const base = git(d, "rev-parse", "HEAD");
    commitFile(d, "b.txt", "b\n", "feat: b\n");
    commitFile(d, "c.txt", "c\n", "feat: c\n\nWork-Unit: github:3\n");
    const r = cli(d, ["verify", `${base}..HEAD`, "--json"]);
    expect(r.status).toBe(0);
    expect((r.json() as VerifyJson).commits.map((c) => c.level)).toEqual(["L0", "none"]);
    expect(cli(d, ["verify", `${base}..HEAD`, "--min-level", "L0"]).status).toBe(1);
    commitFile(d, "d.txt", "d\n", "feat: d\n\nWork-Unit: Bad:1\n");
    const bad = cli(d, ["verify", `${base}..HEAD`, "--json"]);
    expect(bad.status).toBe(1);
    expect((bad.json() as VerifyJson).commits[0]?.problems[0]?.code).toBe("TRAILER_MALFORMED");
  });

  it("does not fail on informational problems alone", () => {
    const d = repo();
    const tree = git(d, "rev-parse", "HEAD^{tree}");
    const unknown = entry({ tree, predicateType: "https://example.com/other/v1" });
    writeRawNote(
      d,
      "HEAD",
      JSON.stringify({ type: "https://os-factory.dev/factory-commits/note/v0.1", attestations: [unknown, entry({ tree })] }),
    );
    const r = cli(d, ["verify", "--json"]);
    expect(r.status).toBe(0);
    expect((r.json() as VerifyJson).commits[0]?.problems.map((p) => p.code)).toEqual(["PREDICATE_UNKNOWN"]);
  });

  it("honours -C and exits 2 outside a repository or on bad input", () => {
    const d = repo();
    expect(cli(tempDir(), ["-C", d, "verify", "--min-level", "L0"]).status).toBe(0);
    expect(cli(tempDir(), ["verify"]).status).toBe(2);
    expect(cli(d, ["verify", "nope"]).status).toBe(2);
    expect(cli(d, ["verify", "--min-level", "L9"]).status).toBe(2);
    expect(cli(d, ["verify", "--allowed-signers", "/nonexistent"]).status).toBe(2);
    expect(cli(d, ["bogus"]).status).toBe(2);
  });
});

describe("git factory show", () => {
  it("prints trailers and the note", () => {
    const d = repo("feat: x\n\nWork-Unit: github:416\nWork-Unit: linear:ENG-1\nFactory-Run: r1\n");
    expect(cli(d, ["show", "--json"]).json()).toEqual({
      commit: git(d, "rev-parse", "HEAD"),
      tree: git(d, "rev-parse", "HEAD^{tree}"),
      trailers: { "Work-Unit": ["github:416", "linear:ENG-1"], "Factory-Run": ["r1"] },
      note: null,
    });
    cli(d, ["attest", "--predicate", predicateFile(tempDir()), "--write-note", "HEAD"]);
    const shown = cli(d, ["show"]);
    expect(shown.stdout).toContain("run        01JD4X7Q");
    expect(shown.stdout).toContain("verdict    pass");
  });
});

describe("git factory trailers", () => {
  it("adds, replaces and is idempotent", () => {
    const d = tempDir();
    const msg = join(d, "COMMIT_EDITMSG");
    writeFileSync(msg, "feat: thing\n\nBody.\n");
    const args = [
      "trailers",
      msg,
      "--work-unit",
      "github:416",
      "--work-unit",
      "linear:ENG-1",
      "--run",
      "01JD;trace=4bf92f3577b34da6a3ce929d0e0e4736",
      "--policy",
      "default@3",
      "--agent",
      "claude-code/2.1;model=claude-opus-5-5",
    ];
    expect(cli(d, args).status).toBe(0);
    const once = readFileSync(msg, "utf8");
    expect(cli(d, args).status).toBe(0);
    expect(readFileSync(msg, "utf8")).toBe(once);
    expect(once).toBe(
      "feat: thing\n\nBody.\n\nWork-Unit: github:416\nWork-Unit: linear:ENG-1\n" +
        "Factory-Run: 01JD; trace=4bf92f3577b34da6a3ce929d0e0e4736\nFactory-Policy: default@3\n" +
        "Factory-Agent: claude-code/2.1; model=claude-opus-5-5\n",
    );
    cli(d, ["trailers", msg, "--run", "02XY"]);
    expect(readFileSync(msg, "utf8")).toContain("Factory-Run: 02XY\n");
    expect(readFileSync(msg, "utf8")).not.toContain("01JD");
  });

  it("exits 2 on a bad value and leaves the file alone", () => {
    const d = tempDir();
    const msg = join(d, "msg");
    writeFileSync(msg, "feat: thing\n");
    expect(cli(d, ["trailers", msg, "--work-unit", "GitHub:1"]).status).toBe(2);
    expect(cli(d, ["trailers", msg, "--attestation", "sha256:nope"]).status).toBe(2);
    expect(readFileSync(msg, "utf8")).toBe("feat: thing\n");
  });
});

describe("git factory setup", () => {
  it("is idempotent and undoable", () => {
    const d = repo();
    git(d, "remote", "add", "origin", "https://example.com/acme/app.git");
    expect(cli(d, ["setup", "--json"]).json()).toEqual({ remote: "origin", fetchRefspec: true, rewriteRef: true, changed: true });
    expect((cli(d, ["setup", "--json"]).json() as { changed: boolean }).changed).toBe(false);
    expect(git(d, "config", "--get-all", "remote.origin.fetch")).toContain("+refs/notes/factory:refs/notes/factory");
    expect(git(d, "config", "--get-all", "notes.rewriteRef")).toBe("refs/notes/factory");
    expect(cli(d, ["setup", "--undo", "--json"]).json()).toEqual({ remote: "origin", fetchRefspec: false, rewriteRef: false, changed: true });
    expect(git(d, "config", "--get-all", "remote.origin.fetch")).not.toContain("notes");
  });
});

describe("git factory digest", () => {
  it("prints the statement digest of an attestation or an envelope", () => {
    const d = tempDir();
    const e = entry({ tree: "a".repeat(40) });
    const f = join(d, "att.json");
    writeFileSync(f, JSON.stringify(e));
    expect(cli(d, ["digest", f]).stdout).toBe(`${e.digest}\n`);
    expect(cli(d, ["digest", "-"], JSON.stringify(e.envelope)).stdout).toBe(`${e.digest}\n`);
    expect(cli(d, ["digest", "-"], "{}").status).toBe(2);
  });
});
