import sharp from 'sharp';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.dirname(__dirname);
const buildDir = path.join(rootDir, 'build');

// Icon sizes for different platforms
const macSizes = [16, 32, 64, 128, 256, 512, 1024];
const winSizes = [16, 32, 48, 64, 128, 256];
const linuxSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

async function generateMacOSIcon() {
  const sourceIcon = path.join(buildDir, 'icon.png');
  const iconsetDir = path.join(buildDir, 'icon.iconset');
  const icnsPath = path.join(buildDir, 'icon.icns');

  if (!fs.existsSync(sourceIcon)) {
    console.error(`Source icon not found: ${sourceIcon}`);
    process.exit(1);
  }

  // Create iconset directory
  if (fs.existsSync(iconsetDir)) {
    fs.rmSync(iconsetDir, { recursive: true });
  }
  fs.mkdirSync(iconsetDir, { recursive: true });

  console.log('Generating macOS icon sizes...');

  // Generate all required sizes
  for (const size of macSizes) {
    const regularSize = size;
    const retinaSize = size * 2;

    await sharp(sourceIcon)
      .resize(regularSize, regularSize, { fit: 'cover', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFile(path.join(iconsetDir, `icon_${regularSize}x${regularSize}.png`));

    await sharp(sourceIcon)
      .resize(retinaSize, retinaSize, { fit: 'cover', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFile(path.join(iconsetDir, `icon_${regularSize}x${regularSize}@2x.png`));
  }

  console.log('Creating .icns file...');

  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'inherit' });
    console.log(`Created: build/icon.icns`);
    fs.rmSync(iconsetDir, { recursive: true });
  } catch (error) {
    console.error('Failed to create .icns file. Make sure you are running on macOS.');
    throw error;
  }
}

async function generateWindowsIcon() {
  const sourceIcon = path.join(buildDir, 'icon.png');
  const icoPath = path.join(buildDir, 'icon.ico');

  console.log('Generating Windows .ico file...');

  // Resize to 1024x1024 first (ensure square)
  const squareIcon = await sharp(sourceIcon)
    .resize(1024, 1024, { fit: 'cover', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Generate all required sizes for ICO
  const sizes = winSizes;
  const pngBuffers = await Promise.all(
    sizes.map(size =>
      sharp(squareIcon)
        .resize(size, size)
        .toBuffer()
    )
  );

  // Combine into ICO file
  const imageSize = 1024;
  const headerSize = 6;
  const dirEntrySize = 16;
  const numImages = pngBuffers.length;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICO
  header.writeUInt16LE(numImages, 4); // Number of images

  let dataOffset = headerSize + (dirEntrySize * numImages);
  const entries = [];

  for (let i = 0; i < numImages; i++) {
    const size = sizes[i];
    const png = pngBuffers[i];
    const entry = Buffer.alloc(dirEntrySize);

    entry.writeUInt8(size >= 256 ? 0 : size, 0); // Width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // Height
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(png.length, 8); // Size of image data
    entry.writeUInt32LE(dataOffset, 12); // Offset to image data

    entries.push(entry);
    dataOffset += png.length;
  }

  const ico = Buffer.concat([header, ...entries, ...pngBuffers]);
  fs.writeFileSync(icoPath, ico);
  console.log(`Created: build/icon.ico`);
}

async function generateLinuxIcons() {
  const sourceIcon = path.join(buildDir, 'icon.png');
  const linuxDir = path.join(buildDir, 'linux');

  console.log('Generating Linux icons...');

  if (fs.existsSync(linuxDir)) {
    fs.rmSync(linuxDir, { recursive: true });
  }
  fs.mkdirSync(linuxDir, { recursive: true });

  // Create square icons for all required sizes
  for (const size of linuxSizes) {
    const subdir = path.join(linuxDir, size.toString());
    fs.mkdirSync(subdir, { recursive: true });

    await sharp(sourceIcon)
      .resize(size, size, { fit: 'cover', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toFile(path.join(subdir, 'devtools.png'));
  }

  console.log(`Created: build/linux/ with icons in multiple sizes`);
}

async function main() {
  try {
    await generateMacOSIcon();
    await generateWindowsIcon();
    await generateLinuxIcons();
    console.log('\nAll icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error.message);
    process.exit(1);
  }
}

main();
