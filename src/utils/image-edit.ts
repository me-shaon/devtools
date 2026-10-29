export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ImageEdits {
  crop: CropRect;
  width: number;
  height: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}
export function imageEditSize(
  sourceWidth: number,
  sourceHeight: number,
  edits: ImageEdits,
) {
  const { crop, width, height, rotation } = edits;
  if (
    ![
      sourceWidth,
      sourceHeight,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      width,
      height,
      rotation,
    ].every(Number.isInteger)
  )
    throw new Error("Use whole pixels for crop and output dimensions.");
  if (
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width < 1 ||
    crop.height < 1 ||
    crop.x + crop.width > sourceWidth ||
    crop.y + crop.height > sourceHeight
  )
    throw new Error(
      "Crop must stay inside the original image and contain at least one pixel.",
    );
  if (
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    width * height > 32000000
  )
    throw new Error(
      "Output must be 1–16,384 pixels per side and at most 32 megapixels.",
    );
  if (![0, 90, 180, 270].includes(rotation))
    throw new Error("Rotation must be a quarter turn.");
  return rotation % 180 ? { width: height, height: width } : { width, height };
}
export function cropFromPoints(
  a: {
    x: number;
    y: number;
  },
  b: {
    x: number;
    y: number;
  },
  width: number,
  height: number,
): CropRect {
  const x = Math.min(
    width - 1,
    Math.max(0, Math.floor(Math.min(a.x, b.x) * width)),
  );
  const y = Math.min(
    height - 1,
    Math.max(0, Math.floor(Math.min(a.y, b.y) * height)),
  );
  return {
    x,
    y,
    width: Math.max(
      1,
      Math.min(width - x, Math.ceil(Math.max(a.x, b.x) * width) - x),
    ),
    height: Math.max(
      1,
      Math.min(height - y, Math.ceil(Math.max(a.y, b.y) * height) - y),
    ),
  };
}
export function drawEditedImage(
  image: HTMLImageElement,
  edits: ImageEdits,
  type: string,
): HTMLCanvasElement {
  const size = imageEditSize(image.naturalWidth, image.naturalHeight, edits);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image editing is not supported in this browser.");
  if (type === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
  }
  ctx.translate(size.width / 2, size.height / 2);
  ctx.rotate((edits.rotation * Math.PI) / 180);
  ctx.scale(edits.flipX ? -1 : 1, edits.flipY ? -1 : 1);
  const c = edits.crop;
  ctx.drawImage(
    image,
    c.x,
    c.y,
    c.width,
    c.height,
    -edits.width / 2,
    -edits.height / 2,
    edits.width,
    edits.height,
  );
  return canvas;
}
