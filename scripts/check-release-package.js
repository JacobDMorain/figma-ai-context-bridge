const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const packageDir = path.join(root, "release", "figma-ai-context-bridge");

const requiredFiles = [
  "manifest.json",
  "code.js",
  "ui.html",
  "README.md",
  "PRIVACY.md",
  "CHANGELOG.md",
  "schema/ai-export.schema.json",
  "docs/community-listing.md",
  "assets/community/icon.svg",
  "assets/community/icon-128.png",
  "assets/community/cover.svg",
  "assets/community/cover-1920x1080.png"
];

const forbiddenNames = new Set([
  ".git",
  ".claude",
  "node_modules",
  "dist",
  "test",
  "tests",
  ".env",
  ".env.local",
  "package-lock.json",
  "package.json"
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

function checkReleasePackage(targetPackageDir = packageDir) {
  if (!fs.existsSync(targetPackageDir)) {
    fail(`Release package is missing: ${targetPackageDir}. Run npm run release:pack first.`);
  }

  requiredFiles.forEach((relativePath) => {
    const absolutePath = path.join(targetPackageDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      fail(`Release package is missing required file: ${relativePath}`);
    }
  });

  walk(targetPackageDir).forEach((absolutePath) => {
    const name = path.basename(absolutePath);
    const relativePath = path.relative(targetPackageDir, absolutePath).replace(/\\/g, "/");
    if (forbiddenNames.has(name)) {
      fail(`Release package contains forbidden entry: ${relativePath}`);
    }
    if (/\.log$/i.test(name)) {
      fail(`Release package contains log file: ${relativePath}`);
    }
  });

  assertJson(targetPackageDir, "manifest.json");
  assertJson(targetPackageDir, "schema/ai-export.schema.json");

  return {
    ok: true,
    packageDir: targetPackageDir,
    fileCount: walk(targetPackageDir).filter((absolutePath) => fs.statSync(absolutePath).isFile()).length
  };
}

if (require.main === module) {
  const result = checkReleasePackage();
  console.log(`Release package check passed: ${result.packageDir} (${result.fileCount} files)`);
}

module.exports = {
  checkReleasePackage
};
