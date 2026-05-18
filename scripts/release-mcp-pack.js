const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const sourceRoot = path.join(root, "mcp-server");
const releaseRoot = path.join(root, "release");
const packageDir = path.join(releaseRoot, "figma-ai-context-bridge-mcp-server");
const zipPath = `${packageDir}.zip`;
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const mcpPackage = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));

const files = [
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "scripts/build.js"
];

function copyFile(relativePath) {
  const source = path.join(sourceRoot, relativePath);
  const destination = path.join(packageDir, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyDirectory(relativePath) {
  const source = path.join(sourceRoot, relativePath);
  const destination = path.join(packageDir, relativePath);
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (entry) => {
      const name = path.basename(entry);
      return name !== "node_modules" && name !== "dist" && name !== ".git";
    }
  });
}

function writeReleaseInfo() {
  const releaseInfo = {
    artifact: "figma-ai-context-bridge-mcp-server",
    version: mcpPackage.version,
    rootPackageVersion: rootPackage.version,
    mcpPackageVersion: mcpPackage.version,
    generatedAt: new Date().toISOString()
  };
  fs.writeFileSync(
    path.join(packageDir, "RELEASE_INFO.json"),
    `${JSON.stringify(releaseInfo, null, 2)}\n`
  );
}

fs.rmSync(packageDir, { recursive: true, force: true });
fs.rmSync(zipPath, { force: true });
fs.mkdirSync(packageDir, { recursive: true });
files.forEach(copyFile);
copyDirectory("src");
copyDirectory("test");
writeReleaseInfo();

execFileSync("powershell.exe", [
  "-NoProfile",
  "-Command",
  "Compress-Archive",
  "-LiteralPath",
  packageDir,
  "-DestinationPath",
  zipPath,
  "-Force"
], { stdio: "inherit" });

console.log(`MCP server release package created: ${packageDir}`);
console.log(`MCP server release zip created: ${zipPath}`);
