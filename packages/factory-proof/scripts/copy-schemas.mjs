// Copies the repository's JSON Schemas (the single source of truth) into the package.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkg = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(pkg, "..", "..", "schemas");
const dest = join(pkg, "schemas");

if (!existsSync(src)) {
  // Installed from a packed tarball: the schemas were copied at pack time.
  if (existsSync(dest)) process.exit(0);
  console.error(`copy-schemas: ${src} not found`);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(src)) {
  if (f.endsWith(".schema.json")) copyFileSync(join(src, f), join(dest, f));
}
