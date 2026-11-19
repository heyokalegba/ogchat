/**
 * Builds ogchat.app. Run on the Mac it is for:  npm run mac  (from the project).
 *
 * The app is a thin shell: Electron plus two small scripts. It runs the
 * project where it lives, so the app is built once and keeps working through
 * updates to the project; only moving the project folder needs a rebuild.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const project = path.resolve(__dirname, "..");
const out = path.join(project, "dist-app");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ogchat-app-"));
const mac = process.platform === "darwin";

/** The app's icon as .icns, made from the pixel icon with the tools every Mac has. */
function icns() {
  // The icon is a rounded square that fills its picture, with clear corners, as the Dock expects.
  const source = [1024, 512]
    .map((size) => path.join(project, "public", `icon-${size}.png`))
    .find(fs.existsSync);
  if (!mac || !source) return undefined;
  const set = path.join(work, "ogchat.iconset");
  fs.mkdirSync(set);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const px = size * scale;
      const name = `icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`;
      execFileSync("sips", ["-z", String(px), String(px), source, "--out", path.join(set, name)], {
        stdio: "ignore",
      });
    }
  }
  const file = path.join(work, "ogchat.icns");
  execFileSync("iconutil", ["-c", "icns", set, "-o", file]);
  return file;
}

async function main() {
  const { packager } = require("@electron/packager");
  // The app has to know where the project is, and which Node to run its server
  // with (this one: the Node running this build). Both are written into the app.
  const note = path.join(work, "ogchat.json");
  fs.writeFileSync(note, JSON.stringify({ projectDir: project, node: process.execPath }, null, 2));

  const [built] = await packager({
    dir: __dirname,
    name: "ogchat",
    out,
    overwrite: true,
    platform: process.platform,
    arch: process.arch,
    appBundleId: "local.ogchat.desktop",
    appCategoryType: "public.app-category.productivity",
    icon: icns(),
    extraResource: [note],
    prune: true,
    // Only the two scripts and package.json go in; the builder itself stays out.
    ignore: [/^\/build\.cjs$/, /^\/node_modules/, /^\/package-lock\.json$/],
    quiet: true,
  });

  const app = mac ? path.join(built, "ogchat.app") : built;
  if (mac) {
    // Renaming Electron into ogchat breaks its signature; sign it again for this Mac only.
    execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "ignore" });
  }
  console.log(`\nBuilt ${app}`);
  if (mac) {
    console.log("Open it from there, or drag it into Applications. To put it there now:");
    console.log(`  cp -R "${app}" /Applications/`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
