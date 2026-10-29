import { CVD_TYPES, cvdLabel, simulateCvd, type Color, type CvdType } from "@/utils/color";

export type Vision = CvdType | "normal";

export const VISIONS: Vision[] = ["normal", ...CVD_TYPES];

export const visionLabel = (vision: Vision, severity: number) => {
  if (vision === "normal") return "Normal vision";
  return severity === 0 ? "No simulation" : cvdLabel(vision, severity);
};

export const simulate = (color: Color, vision: Vision, severity: number) =>
  vision === "normal" ? color : simulateCvd(color, vision, severity);
