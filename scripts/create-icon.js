import sharp from "sharp";
import { readFileSync } from "fs";

// Read the SVG
const svgBuffer = readFileSync("build/icon.svg");

// Convert to PNG
sharp(svgBuffer)
  .resize(1024, 1024)
  .png()
  .toFile("build/icon.png")
  .then(() => console.log("Icon created successfully!"))
  .catch((err) => {
    console.error("Error creating icon:", err);
    process.exit(1);
  });
