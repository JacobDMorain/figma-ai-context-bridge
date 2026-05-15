const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const banner = {
  js: "// AUTO-GENERATED FILE. Do not edit directly. Source: src/exporter.ts"
};

async function build() {
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });

  const shared = {
    entryPoints: [path.join(root, "src", "exporter.ts")],
    bundle: true,
    target: "es2017",
    legalComments: "none",
    banner,
    logLevel: "silent"
  };

  await esbuild.build({
    ...shared,
    outfile: path.join(root, "code.js"),
    format: "iife",
    platform: "browser",
    globalName: "SelectionStyleExporterBundle"
  });

  await esbuild.build({
    ...shared,
    outfile: path.join(root, "dist", "exporter.cjs"),
    format: "cjs",
    platform: "node"
  });
}

build().catch((error) => {
  console.error(error);
  process.exit(1);
});
