const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const releaseRoot = path.join(root, "release");
const packageDir = path.join(releaseRoot, "figma-ai-context-bridge");

const files = [
  "manifest.json",
  "code.js",
  "ui.html",
  "README.md",
  "PRIVACY.md",
  "CHANGELOG.md",
  "schema/ai-export.schema.json"
];

function copyFile(relativePath) {
  const source = path.join(root, relativePath);
  const destination = path.join(packageDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

fs.rmSync(packageDir, { recursive: true, force: true });
fs.mkdirSync(packageDir, { recursive: true });
files.forEach(copyFile);

console.log(`Release package created: ${packageDir}`);
