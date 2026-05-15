const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function findSystemBrowser() {
  const candidates = [
    path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "", "Google", "Chrome", "Application", "chrome.exe")
  ];

  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    const bundledNodeModules = path.join(
      process.env.USERPROFILE || "",
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "node",
      "node_modules"
    );
    const pnpmRoot = path.join(bundledNodeModules, ".pnpm");
    if (fs.existsSync(pnpmRoot)) {
      const packageName = fs.readdirSync(pnpmRoot).find((name) => /^playwright@/.test(name));
      if (packageName) {
        return require(path.join(pnpmRoot, packageName, "node_modules", "playwright"));
      }
    }
    const bundledPath = path.join(bundledNodeModules, "playwright");
    if (fs.existsSync(bundledPath)) {
      return require(bundledPath);
    }
    throw error;
  }
}

async function renderAsset(page, source, destination, width, height) {
  const sourcePath = path.join(root, source);
  const destinationPath = path.join(root, destination);

  await page.setViewportSize({ width, height });
  await page.goto(pathToFileURL(sourcePath).href);
  await page.screenshot({
    path: destinationPath,
    fullPage: false,
    omitBackground: false
  });
}

async function main() {
  const { chromium } = loadPlaywright();
  const executablePath = findSystemBrowser();
  const browser = await chromium.launch({
    headless: true,
    executablePath
  });
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  try {
    await renderAsset(page, "assets/community/icon.svg", "assets/community/icon-128.png", 128, 128);
    await renderAsset(page, "assets/community/cover.svg", "assets/community/cover-1920x1080.png", 1920, 1080);
  } finally {
    await browser.close();
  }

  console.log("Community PNG assets rendered.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
