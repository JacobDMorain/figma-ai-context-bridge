const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { checkMcpReleasePackage } = require("../scripts/check-mcp-release-package.js");

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function createPackage(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "figma-mcp-release-"));
  const files = [
    "README.md",
    "package-lock.json",
    "scripts/build.js",
    "src/index.ts",
    "src/server.ts"
  ];
  for (const file of files) {
    const target = path.join(dir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.endsWith(".json") ? "{}\n" : "");
  }
  writeJson(path.join(dir, "package.json"), {
    name: "figma-ai-context-bridge-mcp-server",
    version: "1.2.3"
  });
  if (overrides.releaseInfo) {
    writeJson(path.join(dir, "RELEASE_INFO.json"), overrides.releaseInfo);
  }
  return dir;
}

test("MCP release check requires explicit release version information", () => {
  const dir = createPackage();

  assert.throws(
    () => checkMcpReleasePackage(dir),
    /RELEASE_INFO\.json/
  );
});

test("MCP release check rejects version information that does not match package.json", () => {
  const dir = createPackage({
    releaseInfo: {
      artifact: "figma-ai-context-bridge-mcp-server",
      version: "9.9.9"
    }
  });

  assert.throws(
    () => checkMcpReleasePackage(dir),
    /version/
  );
});
