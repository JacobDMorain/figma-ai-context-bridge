import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

fs.mkdirSync(path.join(root, "dist"), { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, "src", "index.ts")],
  outfile: path.join(root, "dist", "index.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  legalComments: "none",
  banner: {
    js: "#!/usr/bin/env node\n// AUTO-GENERATED FILE. Do not edit directly. Source: src/index.ts"
  }
});
