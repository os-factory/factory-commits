import { describe, expect, it } from "vitest";
import { NOTE_TYPE } from "../src/constants.js";
import { decodeBase64, envelopeDigest, makeEnvelope, pae, statementDigest } from "../src/dsse.js";
import { mergeAttestations } from "../src/note.js";
import { validatePredicate } from "../src/schema.js";
import { recomputeVerdict, subjectName } from "../src/statement.js";
import { isValidTrailer, normalizeTrailerValue, parseTrailerLines, type TrailerName } from "../src/trailers.js";
import { entry, examplePredicate } from "./helpers.js";

describe("DSSE", () => {
  it("encodes PAE as in the DSSE spec", () => {
    expect(pae("http://example.com/HelloWorld", Buffer.from("hello world")).toString()).toBe(
      "DSSEv1 29 http://example.com/HelloWorld 11 hello world",
    );
  });

  it("counts bytes, not characters", () => {
    expect(pae("t", Buffer.from("é")).toString()).toBe("DSSEv1 1 t 2 é");
  });

  it("digests the decoded payload, independently of signatures", () => {
    const bytes = Buffer.from('{"a":1}');
    const expected = statementDigest(bytes);
    expect(expected).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(envelopeDigest(makeEnvelope(bytes))).toBe(expected);
    expect(envelopeDigest(makeEnvelope(bytes, [{ keyid: "k", sig: "c2ln" }]))).toBe(expected);
  });

  it("rejects non-canonical base64", () => {
    expect(decodeBase64("aGk=")?.toString()).toBe("hi");
    expect(decodeBase64("aGk")).toBeNull();
    expect(decodeBase64("a*k=")).toBeNull();
  });
});

describe("trailer grammar (SPEC §3)", () => {
  const cases: Array<[TrailerName, string, boolean]> = [
    ["Work-Unit", "github:416", true],
    ["Work-Unit", "416", true],
    ["Work-Unit", "jira:PROJ-1:sub", true],
    ["Work-Unit", "GitHub:416", false],
    ["Work-Unit", "github:", false],
    ["Work-Unit", "has space", false],
    ["Work-Unit", "a;b", false],
    ["Factory-Run", "01JD4X7Q", true],
    ["Factory-Run", "01JD4X7Q; trace=4bf92f3577b34da6a3ce929d0e0e4736", true],
    ["Factory-Run", "01JD4X7Q; trace=4BF92F3577B34DA6A3CE929D0E0E4736", false],
    ["Factory-Run", "01JD4X7Q; trace=abc", false],
    ["Factory-Run", "01JD 4X7Q", false],
    ["Factory-Policy", "default@3", true],
    ["Factory-Policy", "default", true],
    ["Factory-Policy", "default@", false],
    ["Factory-Agent", "claude-code/2.1; model=claude-opus-5-5", true],
    ["Factory-Agent", "claude-code", true],
    ["Factory-Agent", "claude-code; model=x y", false],
    ["Factory-Agent", "claude-code/", false],
    ["Factory-Attestation", `sha256:${"a".repeat(64)}`, true],
    ["Factory-Attestation", `sha256:${"A".repeat(64)}`, false],
    ["Factory-Attestation", "sha256:abc", false],
  ];
  it.each(cases)("%s: %s → %s", (name, value, ok) => {
    expect(isValidTrailer(name, value)).toBe(ok);
  });

  it("normalizes CLI parameter spacing", () => {
    expect(normalizeTrailerValue("Factory-Run", "r1;trace=ab")).toBe("r1; trace=ab");
    expect(normalizeTrailerValue("Factory-Agent", "a/1;model=m")).toBe("a/1; model=m");
  });

  it("parses formatter output", () => {
    expect(parseTrailerLines("Work-Unit: github:1\nFactory-Run: r; trace=x\n")).toEqual([
      { key: "Work-Unit", value: "github:1" },
      { key: "Factory-Run", value: "r; trace=x" },
    ]);
  });
});

describe("statement", () => {
  it("names the subject without credentials or local paths", () => {
    expect(subjectName("https://user:tok@github.com/acme/app.git")).toBe("git+https://github.com/acme/app.git");
    expect(subjectName("git@github.com:acme/app.git")).toBe("git+ssh://github.com/acme/app.git");
    expect(subjectName("/home/someone/app")).toBe("git+local");
    expect(subjectName("file:///srv/app")).toBe("git+local");
    expect(subjectName(undefined)).toBe("git+local");
    expect(subjectName("local")).toBe("git+local");
  });

  it("recomputes the verdict (SPEC §4.3)", () => {
    const p = examplePredicate();
    expect(recomputeVerdict(p)).toBe("pass");
    const stages = (p["stages"] as Array<Record<string, unknown>>).map((s) =>
      s["id"] === "unit" ? { ...s, status: "failed" } : s,
    );
    expect(recomputeVerdict({ ...p, stages })).toBe("fail");
    expect(recomputeVerdict({ ...p, policy: { required: [] }, stages: [] })).toBe("pass");
  });

  it("validates the example predicate against the schema", () => {
    expect(validatePredicate(examplePredicate()).valid).toBe(true);
    expect(validatePredicate({ ...examplePredicate(), verdict: "maybe" }).valid).toBe(false);
  });
});

describe("note merge (SPEC §7.2)", () => {
  const tree = "a".repeat(40);
  it("appends, de-duplicates by digest and keeps others", () => {
    const a = entry({ tree });
    const b = entry({ tree, predicateType: "https://example.com/other/v1" });
    const first = mergeAttestations(null, [a]);
    expect(first.note.type).toBe(NOTE_TYPE);
    const second = mergeAttestations(first.note, [a, b]);
    expect(second.added).toEqual([b]);
    expect(second.note.attestations.map((x) => x.digest)).toEqual([a.digest, b.digest]);
  });

  it("merges new signatures into an entry with the same digest", () => {
    const a = entry({ tree });
    const signed = { ...a, envelope: { ...a.envelope, signatures: [{ keyid: "k", sig: "c2ln" }] } };
    const first = mergeAttestations(null, [a]).note;
    const merged = mergeAttestations(first, [signed]);
    expect(merged.added).toHaveLength(1);
    expect(merged.note.attestations).toHaveLength(1);
    expect(merged.note.attestations[0]?.envelope.signatures).toHaveLength(1);
    expect(mergeAttestations(merged.note, [signed]).added).toHaveLength(0);
  });
});
