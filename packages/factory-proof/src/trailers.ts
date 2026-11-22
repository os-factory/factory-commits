import { FactoryError, git, run } from "./exec.js";

export const TRAILER_NAMES = [
  "Work-Unit",
  "Factory-Run",
  "Factory-Policy",
  "Factory-Agent",
  "Factory-Attestation",
] as const;
export type TrailerName = (typeof TRAILER_NAMES)[number];

const TOKEN = "[^\\s;]+";

/** SPEC §3 grammars. */
const GRAMMAR: Record<TrailerName, RegExp> = {
  // Without a colon the whole value is the id; with one, the part before the first colon is the source.
  "Work-Unit": new RegExp(`^(?:[^\\s;:]+|[a-z0-9][a-z0-9-]*:${TOKEN})$`),
  "Factory-Run": new RegExp(`^${TOKEN}(?:; trace=[0-9a-f]{32})?$`),
  "Factory-Policy": /^[^\s;@]+(?:@[^\s;]+)?$/,
  "Factory-Agent": /^[^\s;/]+(?:\/[^\s;]+)?(?:; model=[^\s;]+)?$/,
  "Factory-Attestation": /^sha256:[0-9a-f]{64}$/,
};

export interface Trailer {
  key: string;
  value: string;
}

/** The canonical factory trailer name for a key (trailer keys are case-insensitive), if any. */
export function factoryTrailerName(key: string): TrailerName | undefined {
  const k = key.toLowerCase();
  return TRAILER_NAMES.find((n) => n.toLowerCase() === k);
}

export function isValidTrailer(name: TrailerName, value: string): boolean {
  return GRAMMAR[name].test(value);
}

/** Parses `Key: value` lines as printed by git's trailer formatter. */
export function parseTrailerLines(text: string): Trailer[] {
  const out: Trailer[] = [];
  for (const line of text.split("\n")) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    out.push({ key: line.slice(0, i).trim(), value: line.slice(i + 1).trim() });
  }
  return out;
}

/** All trailers of a commit, unfolded. */
export function readCommitTrailers(cwd: string, commit: string): Trailer[] {
  return parseTrailerLines(git(cwd, ["log", "-1", "--format=%(trailers:only=true,unfold=true)", commit]));
}

/** The factory trailers of a commit, keyed by canonical name. */
export function factoryTrailers(trailers: readonly Trailer[]): Partial<Record<TrailerName, string[]>> {
  const out: Partial<Record<TrailerName, string[]>> = {};
  for (const t of trailers) {
    const name = factoryTrailerName(t.key);
    if (name) (out[name] ??= []).push(t.value);
  }
  return out;
}

/** Normalizes CLI input to the SPEC grammar (`id;trace=x` becomes `id; trace=x`). */
export function normalizeTrailerValue(name: TrailerName, value: string): string {
  const v = value.trim();
  if (name === "Factory-Run") return v.replace(/;\s*trace=/, "; trace=");
  if (name === "Factory-Agent") return v.replace(/;\s*model=/, "; model=");
  return v;
}

export interface TrailerInput {
  name: TrailerName;
  value: string;
}

/**
 * Adds trailers to a commit message file in place with `git interpret-trailers`.
 * Replaces an existing trailer of the same name, except Work-Unit (added if different).
 */
export function addTrailers(messageFile: string, inputs: readonly TrailerInput[]): void {
  const normalized = inputs.map((t) => ({ name: t.name, value: normalizeTrailerValue(t.name, t.value) }));
  for (const t of normalized) {
    if (!isValidTrailer(t.name, t.value)) {
      throw new FactoryError(`invalid ${t.name} value: ${JSON.stringify(t.value)}`);
    }
  }
  for (const t of normalized) {
    const ifExists = t.name === "Work-Unit" ? "addIfDifferent" : "replace";
    const r = run("git", [
      "interpret-trailers",
      "--in-place",
      "--where",
      "end",
      "--if-exists",
      ifExists,
      "--trailer",
      `${t.name}: ${t.value}`,
      messageFile,
    ]);
    if (r.status !== 0) throw new FactoryError(`git interpret-trailers failed: ${r.stderr.trim()}`);
  }
}
