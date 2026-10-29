import { clamp01, fromLinear, rgbToOklab, toByte, toLinear } from "./convert";
import { makeColor } from "./model";
import type { Color } from "./types";

/* ------------------------------------------------------------------------------------------------
 * Color vision deficiency (CVD) simulation
 *
 * Method: Machado, Oliveira, and Fernandes, "A Physiologically-based Model for Simulation of Color
 * Vision Deficiency", IEEE TVCG 15(6), 2009. The matrices below are the published table for
 * severities 0.1 to 1.0 in steps of 0.1. Severity 1.0 is the full dichromacy (protanopia,
 * deuteranopia, tritanopia). Values between two table rows are interpolated linearly.
 * The matrices apply to linear RGB, so each channel is linearized with the sRGB transfer
 * function first and encoded again after the matrix.
 * Achromatopsia (no cone color vision) maps each color to its linear luminance (Rec. 709 weights).
 * Partial severity blends toward that mapping, so severity 0 leaves every color unchanged.
 * ---------------------------------------------------------------------------------------------- */

export type CvdType = "protan" | "deutan" | "tritan" | "achroma";

export const CVD_TYPES: CvdType[] = ["protan", "deutan", "tritan", "achroma"];

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Machado 2009 matrices, row-major, for severity 0.1, 0.2, ..., 1.0. */
const MACHADO: Record<"protan" | "deutan" | "tritan", number[][]> = {
  protan: [
    [0.856167, 0.182038, -0.038205, 0.029342, 0.955115, 0.015544, -0.00288, -0.001563, 1.004443],
    [0.734766, 0.334872, -0.069637, 0.05184, 0.919198, 0.028963, -0.004928, -0.004209, 1.009137],
    [0.630323, 0.465641, -0.095964, 0.069181, 0.890046, 0.040773, -0.006308, -0.007724, 1.014032],
    [0.539009, 0.579343, -0.118352, 0.082546, 0.866121, 0.051332, -0.007136, -0.011959, 1.019095],
    [0.458064, 0.679578, -0.137642, 0.092785, 0.846313, 0.060902, -0.007494, -0.016807, 1.024301],
    [0.38545, 0.769005, -0.154455, 0.100526, 0.829802, 0.069673, -0.007442, -0.02219, 1.029632],
    [0.319627, 0.849633, -0.169261, 0.106241, 0.815969, 0.07779, -0.007025, -0.028051, 1.035076],
    [0.259411, 0.923008, -0.18242, 0.110296, 0.80434, 0.085364, -0.006276, -0.034346, 1.040622],
    [0.203876, 0.990338, -0.194214, 0.112975, 0.794542, 0.092483, -0.005222, -0.041043, 1.046265],
    [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.866435, 0.177704, -0.044139, 0.049567, 0.939063, 0.01137, -0.003453, 0.007233, 0.99622],
    [0.760729, 0.319078, -0.079807, 0.090568, 0.889315, 0.020117, -0.006027, 0.013325, 0.992702],
    [0.675425, 0.43385, -0.109275, 0.125303, 0.847755, 0.026942, -0.00795, 0.018572, 0.989378],
    [0.605511, 0.52856, -0.134071, 0.155318, 0.812366, 0.032316, -0.009376, 0.023176, 0.9862],
    [0.547494, 0.607765, -0.155259, 0.181692, 0.781742, 0.036566, -0.01041, 0.027275, 0.983136],
    [0.498864, 0.674741, -0.173604, 0.205199, 0.754872, 0.039929, -0.011131, 0.030969, 0.980162],
    [0.457771, 0.731899, -0.18967, 0.226409, 0.731012, 0.042579, -0.011595, 0.034333, 0.977261],
    [0.422823, 0.781057, -0.203881, 0.245752, 0.709602, 0.044646, -0.011843, 0.037423, 0.974421],
    [0.392952, 0.82361, -0.216562, 0.263559, 0.69021, 0.046232, -0.01191, 0.040281, 0.97163],
    [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [0.92667, 0.092514, -0.019184, 0.021191, 0.964503, 0.014306, 0.008437, 0.054813, 0.93675],
    [0.89572, 0.13333, -0.02905, 0.029997, 0.9454, 0.024603, 0.013027, 0.104707, 0.882266],
    [0.905871, 0.127791, -0.033662, 0.026856, 0.941251, 0.031893, 0.01341, 0.148296, 0.838294],
    [0.948035, 0.08949, -0.037526, 0.014364, 0.946792, 0.038844, 0.010853, 0.193991, 0.795156],
    [1.017277, 0.027029, -0.044306, -0.006113, 0.958479, 0.047634, 0.006379, 0.248708, 0.744913],
    [1.104996, -0.046633, -0.058363, -0.032137, 0.971635, 0.060503, 0.001336, 0.317922, 0.680742],
    [1.193214, -0.109812, -0.083402, -0.058496, 0.97941, 0.079086, -0.002346, 0.403492, 0.598854],
    [1.257728, -0.139648, -0.118081, -0.078003, 0.975409, 0.102594, -0.003316, 0.501214, 0.502102],
    [1.278864, -0.125333, -0.153531, -0.084748, 0.957674, 0.127074, -0.000989, 0.601151, 0.399838],
    [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
  ],
};

/** Rec. 709 luminance weights for linear RGB, the same weights WCAG uses. */
const ACHROMA = [0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722, 0.2126, 0.7152, 0.0722];

/**
 * The 3×3 linear RGB matrix (row-major) for a CVD type and a severity from 0 to 1.
 * Severity 0 is the identity for every type, so no simulation is applied.
 */
export function cvdMatrix(type: CvdType, severity = 1): number[] {
  const level = clamp01(severity);
  if (type === "achroma") return IDENTITY.map((value, index) => value + (ACHROMA[index] - value) * level);
  const s = level * 10;
  const table = MACHADO[type];
  const low = Math.floor(s);
  if (low >= 10) return table[9];
  const lowMatrix = low === 0 ? IDENTITY : table[low - 1];
  const t = s - low;
  return lowMatrix.map((v, i) => v + (table[low][i] - v) * t);
}

const CVD_STEMS: Record<CvdType, string> = { protan: "Prot", deutan: "Deuter", tritan: "Trit", achroma: "" };

/** A readable name: "Protanopia" at full severity, "Protanomaly" below it. */
export function cvdLabel(type: CvdType, severity = 1): string {
  if (type === "achroma") return "Achromatopsia";
  return `${CVD_STEMS[type]}${severity >= 1 ? "anopia" : "anomaly"}`;
}

/** Simulate how a color looks with a CVD. The alpha value stays the same. */
export function simulateCvd(color: Color, type: CvdType, severity = 1): Color {
  const m = cvdMatrix(type, severity);
  const r = toLinear(color.rgb.r);
  const g = toLinear(color.rgb.g);
  const b = toLinear(color.rgb.b);
  return makeColor(
    {
      r: toByte(fromLinear(clamp01(m[0] * r + m[1] * g + m[2] * b))),
      g: toByte(fromLinear(clamp01(m[3] * r + m[4] * g + m[5] * b))),
      b: toByte(fromLinear(clamp01(m[6] * r + m[7] * g + m[8] * b))),
    },
    color.alpha,
  );
}

/** Lookup tables for the pixel transform: byte to linear, and linear (4096 steps) to byte. */
let pixelTables: { toLin: Float32Array; toByte: Uint8ClampedArray } | null = null;
const LINEAR_STEPS = 4095;
function getPixelTables() {
  if (!pixelTables) {
    const toLin = new Float32Array(256);
    for (let i = 0; i < 256; i++) toLin[i] = toLinear(i);
    const out = new Uint8ClampedArray(LINEAR_STEPS + 1);
    for (let i = 0; i <= LINEAR_STEPS; i++) out[i] = toByte(fromLinear(i / LINEAR_STEPS));
    pixelTables = { toLin, toByte: out };
  }
  return pixelTables;
}

/**
 * Simulate a CVD on RGBA pixel data in place, from pixel `start` up to (not including) pixel `end`.
 * Callers can process an image in chunks to keep the UI responsive. Alpha stays the same.
 */
export function simulateCvdPixels(
  data: Uint8ClampedArray,
  type: CvdType,
  severity = 1,
  start = 0,
  end = data.length / 4,
): void {
  const m = cvdMatrix(type, severity);
  const { toLin, toByte: out } = getPixelTables();
  const enc = (v: number) => out[Math.round((v <= 0 ? 0 : v >= 1 ? 1 : v) * LINEAR_STEPS)];
  for (let p = start * 4, stop = end * 4; p < stop; p += 4) {
    const r = toLin[data[p]];
    const g = toLin[data[p + 1]];
    const b = toLin[data[p + 2]];
    data[p] = enc(m[0] * r + m[1] * g + m[2] * b);
    data[p + 1] = enc(m[3] * r + m[4] * g + m[5] * b);
    data[p + 2] = enc(m[6] * r + m[7] * g + m[8] * b);
  }
}

/**
 * Perceptual distance between two colors: the Euclidean distance in OKLAB (ΔE OK), times 100.
 * About 2 is the smallest difference most people notice with the colors side by side.
 */
export function colorDistance(a: Color, b: Color): number {
  const x = rgbToOklab(a.rgb.r, a.rgb.g, a.rgb.b);
  const y = rgbToOklab(b.rgb.r, b.rgb.g, b.rgb.b);
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b) * 100;
}

/**
 * Below this distance, two colors are hard to tell apart in small marks such as chart lines,
 * legend dots, or status icons. It is a few times the just noticeable difference of about 2.
 */
export const CONFUSION_THRESHOLD = 6;

/** Pairs of colors (by index) whose distance is below the threshold, closest first. */
export function findConfusablePairs(
  colors: Color[],
  threshold = CONFUSION_THRESHOLD,
): { a: number; b: number; distance: number }[] {
  const pairs: { a: number; b: number; distance: number }[] = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const distance = colorDistance(colors[i], colors[j]);
      if (distance < threshold) pairs.push({ a: i, b: j, distance });
    }
  }
  return pairs.sort((x, y) => x.distance - y.distance);
}
