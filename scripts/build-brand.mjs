import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const brand = path.join(root, "assets/brand");
const blue = "#1A6DD2", slate = "#202630", white = "#FFFFFF";
const markSource = await fs.readFile(path.join(brand, "source/mark.svg"), "utf8");
const wordSource = await fs.readFile(path.join(brand, "source/wordmark.svg"), "utf8");
const inner = (svg) => svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const mark = inner(markSource);
const word = inner(wordSource).replace('fill="currentColor"', "");
const wordBox = wordSource.match(/viewBox="([^"]+)"/)[1].split(" ").map(Number);
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;
const symbol = (x, y, width, color) => `<g fill="${color}" transform="translate(${x} ${y}) scale(${width / 400})">${mark}</g>`;
const wordmark = (x, y, width, color) => `<g fill="${color}" transform="translate(${x} ${y}) scale(${width / wordBox[2]})">${word}</g>`;
async function write(relative, content) {
  const target = path.join(brand, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content);
}
async function png(relative, source, width) {
  await write(relative, await sharp(Buffer.from(source)).resize({ width }).png().toBuffer());
}
for (const [name, ink, text] of [["primary", blue, slate], ["reverse", white, white], ["slate", slate, slate], ["black", "#000000", "#000000"]]) {
  const variants = {
    [`mark-${name}`]: svg(400, 360, symbol(0, 0, 400, ink)),
    [`wordmark-${name}`]: svg(Math.ceil(wordBox[2]), Math.ceil(wordBox[3]), wordmark(0, 0, wordBox[2], text)),
    [`logo-horizontal-${name}`]: svg(1080, 240, symbol(20, 30, 200, ink) + wordmark(268, 62, 790, text)),
    [`logo-stacked-${name}`]: svg(800, 600, symbol(220, 30, 360, ink) + wordmark(50, 428, 700, text)),
  };
  for (const [filename, source] of Object.entries(variants)) {
    await write(`svg/${filename}.svg`, source);
    await png(`png/${filename}.png`, source, filename.startsWith("mark") ? 1024 : 2160);
  }
}
const icon = svg(1024, 1024, `<rect x="64" y="64" width="896" height="896" rx="202" fill="${blue}"/>` + symbol(224, 253, 576, white));
await write("app-icons/app-icon.svg", icon);
for (const size of [16, 24, 32, 48, 64, 128, 180, 256, 512, 1024]) await png(`app-icons/app-icon-${size}.png`, icon, size);
const social = svg(1200, 630, `<rect width="1200" height="630" fill="#F3F6FA"/>` + symbol(466, 82, 268, blue) + wordmark(290, 390, 620, slate));
await write("social/social-card.svg", social);
await png("social/social-card.png", social, 1200);
const publicDir = path.join(root, "public");
await fs.mkdir(path.join(publicDir, "brand"), { recursive: true });
for (const [source, dest] of [
  ["svg/mark-primary.svg", "brand/mark.svg"],
  ["app-icons/app-icon.svg", "brand/app-icon.svg"],
  ["app-icons/app-icon.svg", "favicon.svg"],
  ["app-icons/app-icon-512.png", "app-icon.png"],
  ["app-icons/app-icon-32.png", "favicon.png"],
  ["social/social-card.png", "og-image.png"],
]) await fs.copyFile(path.join(brand, source), path.join(publicDir, dest));
// Apple touch icons require an opaque square; the OS supplies its own corner mask.
await sharp(Buffer.from(svg(180, 180, `<rect width="180" height="180" fill="${blue}"/>` + symbol(32, 38, 116, white)))).png().toFile(path.join(publicDir, "apple-touch-icon.png"));
await fs.copyFile(path.join(publicDir, "apple-touch-icon.png"), path.join(brand, "app-icons/apple-touch-icon.png"));
await fs.copyFile(path.join(brand, "app-icons/app-icon-1024.png"), path.join(root, "src-tauri/app-icon.png"));
// Generate in a staging directory: this desktop project does not ship the CLI's mobile exports.
const staging = await fs.mkdtemp(path.join(tmpdir(), "devtools-icons-"));
try {
  execFileSync(process.execPath, [require.resolve("@tauri-apps/cli/tauri.js"), "icon", "src-tauri/app-icon.png", "-o", staging], { cwd: root, stdio: "pipe" });
  for (const entry of await fs.readdir(staging, { withFileTypes: true })) {
    if (entry.isFile()) await fs.copyFile(path.join(staging, entry.name), path.join(root, "src-tauri/icons", entry.name));
  }
} finally {
  await fs.rm(staging, { recursive: true, force: true });
}
for (const name of ["icon.icns", "icon.ico"]) await fs.copyFile(path.join(root, "src-tauri/icons", name), path.join(brand, "app-icons", name));
await fs.copyFile(path.join(brand, "app-icons/icon.ico"), path.join(publicDir, "favicon.ico"));
console.log("Generated brand exports, public assets, and desktop icons from assets/brand/source.");
