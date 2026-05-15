const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

test("manifest exposes AI optimized export command", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));
  const commands = manifest.menu.map((item) => item.command);

  assert.equal(commands.includes("export-ai"), true);
  assert.equal(commands.includes("export-ai-summary"), true);
  assert.equal(commands.includes("open-panel"), true);
  assert.equal(manifest.menu.some((item) => item.name === "Open Export Panel (MCP Debug)"), true);
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

test("plugin UI bridges MCP push and heartbeat without download errors", () => {
  const ui = fs.readFileSync(path.join(__dirname, "..", "ui.html"), "utf8");

  assert.match(ui, /mcp-diagnostics/);
  assert.match(ui, /Connection/);
  assert.match(ui, /Last Sync/);
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
  assert.match(ui, /setInterval\([^,]+,\s*15000\)/);
  assert.match(ui, /mcp-push-summary/);
  assert.match(ui, /mcp-sync-start/);
  assert.match(ui, /Syncing summary/);
  assert.match(ui, /mcp-push-selection/);
  assert.match(ui, /mcp-push-diff/);
  assert.match(ui, /connectionStatus/);
  assert.match(ui, /lastSyncStatus/);
  assert.doesNotMatch(ui, /mcp-push-summary[\s\S]*download-error/);
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
