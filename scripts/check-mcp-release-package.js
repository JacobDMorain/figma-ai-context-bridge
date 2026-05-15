const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const packageDir = path.join(root, "release", "figma-ai-context-bridge-mcp-server");
const zipPath = `${packageDir}.zip`;

const requiredFiles = [
  "README.md",
  "package.json",
  "package-lock.json",
  "scripts/build.js",
  "src/index.ts",
  "src/server.ts"
];

const forbiddenNames = new Set([
  ".git",
  ".claude",
  "node_modules",
  "dist",
  ".env",
  ".env.local"
]);

function fail(message) {
  throw new Error(message);
}

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const results = [];

  entries.forEach((entry) => {
    const absolutePath = path.join(directory, entry.name);
    results.push(absolutePath);
    if (entry.isDirectory()) {
      results.push(...walk(absolutePath));
    }
  });

  return results;
}

function assertJson(targetPackageDir, relativePath) {
  const absolutePath = path.join(targetPackageDir, relativePath);
  JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function checkMcpReleasePackage(targetPackageDir = packageDir) {
  if (!fs.existsSync(targetPackageDir)) {
    fail(`MCP release package is missing: ${targetPackageDir}. Run npm run release:mcp-pack first.`);
  }

  requiredFiles.forEach((relativePath) => {
    const absolutePath = path.join(targetPackageDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      fail(`MCP release package is missing required file: ${relativePath}`);
    }
  });

  walk(targetPackageDir).forEach((absolutePath) => {
    const name = path.basename(absolutePath);
    const relativePath = path.relative(targetPackageDir, absolutePath).replace(/\\/g, "/");
    if (forbiddenNames.has(name)) {
      fail(`MCP release package contains forbidden entry: ${relativePath}`);
    }
    if (/\.log$/i.test(name)) {
      fail(`MCP release package contains log file: ${relativePath}`);
    }
  });

  assertJson(targetPackageDir, "package.json");
  assertJson(targetPackageDir, "package-lock.json");

  if (targetPackageDir === packageDir && !fs.existsSync(zipPath)) {
    fail(`MCP release zip is missing: ${zipPath}. Run npm run release:mcp-pack first.`);
  }

  return {
    ok: true,
    packageDir: targetPackageDir,
    zipPath: targetPackageDir === packageDir ? zipPath : null,
    fileCount: walk(targetPackageDir).filter((absolutePath) => fs.statSync(absolutePath).isFile()).length
  };
}

if (require.main === module) {
  const result = checkMcpReleasePackage();
  console.log(`MCP release package check passed: ${result.packageDir} (${result.fileCount} files)`);
  console.log(`MCP release zip check passed: ${result.zipPath}`);
}

module.exports = {
  checkMcpReleasePackage
};
