const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function readPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

test("plugin main code avoids object spread syntax unsupported by Figma parser", () => {
  const code = fs.readFileSync(path.join(__dirname, "..", "code.js"), "utf8");

  assert.doesNotMatch(code, /\.\.\.[A-Za-z_$]/);
});

test("plugin main code sends download payload only from ui-ready handshake", () => {
  const code = fs.readFileSync(path.join(__dirname, "..", "code.js"), "utf8");
  const sends = code.match(/figma\.ui\.postMessage\(downloadMessage\);/g) || [];

  assert.equal(sends.length, 1);
});

test("generated plugin exposes exporter on globalThis for Figma runtime", () => {
  const code = fs.readFileSync(path.join(__dirname, "..", "code.js"), "utf8");

  assert.match(code, /root\.SelectionStyleExporter = api;/);
  assert.match(code, /globalThis\.SelectionStyleExporter/);
});

test("plugin main code registers ui-ready handler before building export payload", () => {
  const code = fs.readFileSync(path.join(__dirname, "..", "code.js"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "exporter.ts"), "utf8");

  assert.equal(code.indexOf("figma.ui.onmessage") < code.indexOf("const exportResult = await buildExport(profile)"), true);
  assert.equal(source.includes("const preview = await buildExport(\"ai-summary\")"), false);
  assert.equal(source.indexOf("figma.ui.onmessage") < source.indexOf("figma.on(\"selectionchange\""), true);
  assert.doesNotMatch(source, /figma\.on\("documentchange"/);
  assert.doesNotMatch(source, /loadAllPagesAsync/);
});

test("manifest exposes only release-ready AI agent commands", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  const commands = manifest.menu.map((item) => item.command);

  assert.equal(manifest.name, "Figma AI Context Bridge");
  assert.deepEqual(commands, ["export-ai", "open-panel"]);
  assert.equal(manifest.menu.some((item) => item.name === "Export AI JSON"), true);
  assert.equal(manifest.menu.some((item) => item.name === "Open AI Agent Bridge"), true);
  assert.equal(manifest.editorType.includes("figjam"), false);
});

test("manifest allows local MCP bridge network access", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));

  assert.deepEqual(manifest.networkAccess.allowedDomains, ["http://localhost:7800"]);
  assert.match(manifest.networkAccess.reasoning, /MCP bridge server/);
});

test("plugin panel runtime posts MCP config and summary push messages", () => {
  const code = fs.readFileSync(path.join(__dirname, "..", "code.js"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "exporter.ts"), "utf8");
  const uiReadyBranch = source.slice(source.indexOf('if (message && message.type === "ui-ready")'), source.indexOf('if (message && message.type === "panel-export")'));

  assert.match(code, /selectionchange/);
  assert.match(code, /height: isPanel \? 620 : 1/);
  assert.match(code, /mcp-config/);
  assert.match(code, /mcp-sync-start/);
  assert.match(code, /mcp-push-summary/);
  assert.match(code, /mcp-push-selection/);
  assert.match(code, /mcp-push-diff/);
  assert.match(code, /500/);
  assert.match(code, /figma\.currentPage\.selection/);
  assert.doesNotMatch(uiReadyBranch, /scheduleMcpSummaryPush\(\)/);
  assert.match(source, /figma\.on\("selectionchange"[\s\S]*?scheduleMcpSummaryPush\(\)/);
  assert.doesNotMatch(source, /figma\.on\("documentchange"[\s\S]*?scheduleMcpSummaryPush\(\)/);
});

test("plugin allows empty selection only for open panel command", () => {
  const code = fs.readFileSync(path.join(__dirname, "..", "code.js"), "utf8");

  assert.match(code, /isPanel && !initialSelection\.length|!isPanel && !initialSelection\.length/);
  assert.match(code, /figma\.command === "open-panel"/);
});

test("plugin UI presents release AI agent bridge without raw export profiles", () => {
  const ui = fs.readFileSync(path.join(__dirname, "..", "ui.html"), "utf8");

  assert.match(ui, /AI Agent Bridge/);
  assert.match(ui, /Connection/);
  assert.match(ui, /Current Selection/);
  assert.match(ui, /Agent Sync/);
  assert.match(ui, /MCP Server Setup/);
  assert.match(ui, /https:\/\/github\.com\/JacobDMorain\/figma-ai-context-bridge/);
  assert.match(ui, /https:\/\/github\.com\/JacobDMorain\/figma-ai-context-bridge\/releases\/latest/);
  assert.match(ui, /Download MCP server/);
  assert.match(ui, /View setup guide/);
  assert.match(ui, /GitHub repository/);
  assert.match(ui, /Last Sync/);
  assert.match(ui, /Copy AI JSON/);
  assert.match(ui, /Download AI JSON/);
  assert.match(ui, /Sync Detail to Agent/);
  assert.doesNotMatch(ui, /MCP Diagnostics/);
  assert.doesNotMatch(ui, /Raw Referenced/);
  assert.doesNotMatch(ui, /Raw Full/);
  assert.doesNotMatch(ui, /AI Summary/);
  assert.doesNotMatch(ui, /AI Diff/);
  assert.doesNotMatch(ui, /Last Push/);
  assert.match(ui, /mcp-last-error/);
  assert.match(ui, /updateMcpDiagnostics/);
  assert.doesNotMatch(ui, /#panel\s*\{[\s\S]*?display:\s*none/);
  assert.match(ui, /document\.body\.classList\.add\("panel-ready"\)/);
  assert.match(ui, /Waiting for plugin messages/);
  assert.match(ui, /\}, 800\);/);
  assert.match(ui, /uiReadyTimer/);
  assert.match(ui, /setInterval\(sendUiReady,\s*500\)/);
  assert.match(ui, /markPluginMessageReceived/);
  assert.match(ui, /\/api\/heartbeat/);
  assert.match(ui, /\/api\/push\/summary/);
  assert.match(ui, /\/api\/push\/selection/);
  assert.match(ui, /\/api\/push\/diff/);
  assert.match(ui, /\/api\/requests/);
  assert.match(ui, /\/api\/push\/node-detail/);
  assert.match(ui, /setInterval\([^,]+,\s*15000\)/);
  assert.match(ui, /mcp-push-summary/);
  assert.match(ui, /mcp-sync-start/);
  assert.match(ui, /Syncing summary/);
  assert.match(ui, /mcp-push-selection/);
  assert.match(ui, /mcp-push-diff/);
  assert.match(ui, /mcp-push-node-detail/);
  assert.match(ui, /mcp-detail-request/);
  assert.match(ui, /connectionStatus/);
  assert.match(ui, /lastSyncStatus/);
  assert.doesNotMatch(ui, /mcp-push-summary[\s\S]*download-error/);
});

test("plugin panel syncs detail selection separately from copy and download", () => {
  const ui = fs.readFileSync(path.join(__dirname, "..", "ui.html"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "exporter.ts"), "utf8");
  const panelExportBranch = source.slice(
    source.indexOf('if (message && message.type === "panel-export")'),
    source.indexOf('if (message && message.type === "mcp-detail-request")')
  );

  assert.match(ui, /id="sync-detail"/);
  assert.match(ui, /requestExport\("sync"\)/);
  assert.match(panelExportBranch, /message\.action === "sync"/);
  assert.match(panelExportBranch, /mcp-push-selection/);
  assert.doesNotMatch(panelExportBranch, /message\.action !== "copy"[\s\S]*mcp-push-selection/);
});

test("plugin UI copy export handles missing clipboard API", () => {
  const ui = fs.readFileSync(path.join(__dirname, "..", "ui.html"), "utf8");

  assert.match(ui, /navigator\.clipboard/);
  assert.match(ui, /typeof navigator\.clipboard\.writeText === "function"/);
  assert.match(ui, /execCommand\("copy"\)/);
});

test("release documentation and scripts are present", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package-lock.json"), "utf8"));
  const mcpPackageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "mcp-server", "package.json"), "utf8"));
  const mcpPackageLock = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "mcp-server", "package-lock.json"), "utf8"));
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
  const mcpReadme = fs.readFileSync(path.join(__dirname, "..", "mcp-server", "README.md"), "utf8");
  const releasePlan = fs.readFileSync(path.join(__dirname, "..", "RELEASE_READINESS_PLAN.md"), "utf8");
  const versioning = fs.existsSync(path.join(__dirname, "..", "VERSIONING.md"))
    ? fs.readFileSync(path.join(__dirname, "..", "VERSIONING.md"), "utf8")
    : "";
  const listing = fs.existsSync(path.join(__dirname, "..", "docs", "community-listing.md"))
    ? fs.readFileSync(path.join(__dirname, "..", "docs", "community-listing.md"), "utf8")
    : "";

  assert.equal(fs.existsSync(path.join(__dirname, "..", "README.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "VERSIONING.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "PRIVACY.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "CHANGELOG.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "mcp-server", "README.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "scripts", "release-pack.js")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "scripts", "check-release-package.js")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "scripts", "release-mcp-pack.js")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "scripts", "check-mcp-release-package.js")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "docs", "community-listing.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "assets", "community", "icon.svg")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "assets", "community", "icon-128.png")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "assets", "community", "cover.svg")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "assets", "community", "cover-1920x1080.png")), true);
  assert.deepEqual(readPngSize(path.join(__dirname, "..", "assets", "community", "icon-128.png")), { width: 128, height: 128 });
  assert.deepEqual(readPngSize(path.join(__dirname, "..", "assets", "community", "cover-1920x1080.png")), { width: 1920, height: 1080 });
  assert.match(readme, /Codex/);
  assert.match(readme, /Claude Code/);
  assert.match(readme, /Cursor/);
  assert.match(readme, /MCP server zip/);
  assert.match(readme, /https:\/\/github\.com\/JacobDMorain\/figma-ai-context-bridge\/releases\/latest/);
  assert.match(mcpReadme, /Codex/);
  assert.match(mcpReadme, /Claude Code/);
  assert.match(mcpReadme, /Cursor/);
  assert.match(mcpReadme, /GitHub repository clone/);
  assert.match(mcpReadme, /standalone MCP server package/);
  assert.match(releasePlan, /Final Release Checklist/);
  assert.match(releasePlan, /Figma Community/);
  assert.match(versioning, /Semantic Versioning/);
  assert.match(versioning, /AI JSON schema/);
  assert.match(versioning, /MCP tools/);
  assert.match(listing, /Figma AI Context Bridge/);
  assert.match(listing, /AI-friendly JSON/);
  assert.match(listing, /Local MCP Bridge/);
  assert.equal(packageJson.name, "figma-ai-context-bridge");
  assert.equal(packageLock.name, "figma-ai-context-bridge");
  assert.equal(packageLock.packages[""].name, "figma-ai-context-bridge");
  assert.equal(mcpPackageJson.name, "figma-ai-context-bridge-mcp-server");
  assert.equal(mcpPackageJson.version, packageJson.version);
  assert.equal(mcpPackageLock.name, "figma-ai-context-bridge-mcp-server");
  assert.equal(mcpPackageLock.version, packageJson.version);
  assert.equal(mcpPackageLock.packages[""].name, "figma-ai-context-bridge-mcp-server");
  assert.equal(mcpPackageLock.packages[""].version, packageJson.version);
  assert.equal(packageJson.scripts.verify, "npm test && npm run check && npm run release:pack && npm run release:check && npm run release:mcp-pack && npm run release:mcp-check && cd mcp-server && npm test && npm run check");
  assert.equal(packageJson.scripts["assets:render"], "node scripts/render-community-assets.js");
  assert.equal(packageJson.scripts["release:pack"], "node scripts/release-pack.js");
  assert.equal(packageJson.scripts["release:check"], "node scripts/check-release-package.js");
  assert.equal(packageJson.scripts["release:mcp-pack"], "node scripts/release-mcp-pack.js");
  assert.equal(packageJson.scripts["release:mcp-check"], "node scripts/check-mcp-release-package.js");
});

test("release package checker rejects forbidden files", () => {
  const { checkReleasePackage } = require("../scripts/check-release-package.js");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "figma-release-check-"));
  const packageDir = path.join(tempRoot, "package");

  try {
    fs.mkdirSync(path.join(packageDir, "schema"), { recursive: true });
    [
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
    ].forEach((relativePath) => {
      const filePath = path.join(packageDir, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, relativePath.endsWith(".json") ? "{}" : "ok");
    });

    assert.equal(checkReleasePackage(packageDir).ok, true);

    fs.mkdirSync(path.join(packageDir, "node_modules"));
    assert.throws(() => checkReleasePackage(packageDir), /forbidden entry: node_modules/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("MCP server release package checker rejects forbidden files", () => {
  const { checkMcpReleasePackage } = require("../scripts/check-mcp-release-package.js");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "figma-mcp-release-check-"));
  const packageDir = path.join(tempRoot, "package");

  try {
    [
      "RELEASE_INFO.json",
      "README.md",
      "package.json",
      "package-lock.json",
      "scripts/build.js",
      "src/index.ts",
      "src/server.ts"
    ].forEach((relativePath) => {
      const filePath = path.join(packageDir, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      if (relativePath === "package.json") {
        fs.writeFileSync(filePath, JSON.stringify({ version: "1.0.0" }));
      } else if (relativePath === "RELEASE_INFO.json") {
        fs.writeFileSync(filePath, JSON.stringify({
          artifact: "figma-ai-context-bridge-mcp-server",
          version: "1.0.0"
        }));
      } else {
        fs.writeFileSync(filePath, relativePath.endsWith(".json") ? "{}" : "ok");
      }
    });

    assert.equal(checkMcpReleasePackage(packageDir).ok, true);

    fs.mkdirSync(path.join(packageDir, "node_modules"));
    assert.throws(() => checkMcpReleasePackage(packageDir), /forbidden entry: node_modules/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("plugin runtime handles lazy MCP node detail requests serially", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "exporter.ts"), "utf8");

  assert.match(source, /mcp-detail-request/);
  assert.match(source, /mcp-push-node-detail/);
  assert.match(source, /getNodeByIdAsync/);
  assert.match(source, /detailRequestQueue/);
  assert.match(source, /processNextDetailRequest/);
  assert.match(source, /serializeSelectionForAi\(\[node\]/);
  assert.doesNotMatch(source, /loadAllPagesAsync/);
});

test("panel mode keeps UI open when preview export fails", () => {
  const code = fs.readFileSync(path.join(__dirname, "..", "code.js"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "exporter.ts"), "utf8");

  assert.match(code, /if \(isPanel\) \{/);
  assert.match(code, /type: "panel-error"/);
  assert.match(code, /return;/);
  assert.match(code, /if \(!isPanel\) \{[\s\S]*?figma\.closePlugin\(\);[\s\S]*?\}/);
  assert.doesNotMatch(source, /if \(isPanel\) \{[\s\S]*?await buildExport\("ai-summary"\)/);
  assert.match(source, /const documentResources = mode === "ai-summary"[\s\S]*?\? null/);
});

test("AI export schema is valid JSON", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "schema", "ai-export.schema.json"), "utf8"));

  assert.equal(schema.$schema, "http://json-schema.org/draft-07/schema#");
  assert.equal(schema.properties.schemaVersion.const, "2.1.0");
});
