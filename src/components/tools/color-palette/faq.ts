import type { ToolFaqItem } from "@/components/tools/ToolFaq";

export const FAQ_ITEMS: ToolFaqItem[] = [
  {
    q: "Which color formats can I enter?",
    a: "The Color field accepts any sRGB CSS color: HEX with 3, 4, 6, or 8 digits, rgb(), rgba(), hsl(), hsla(), hwb(), oklch(), oklab(), a named color such as tomato, or transparent. Both the comma syntax and the space syntax work. You can also edit the RGB, HSL, and alpha controls directly.",
  },
  {
    q: "Why does the tool show OKLCH?",
    a: "OKLCH is a modern CSS color format. Equal changes in lightness look equal to the eye, so it is good for design tokens and color scales. Colors outside sRGB are clipped to the nearest sRGB color.",
  },
  {
    q: "Why is there no CMYK?",
    a: "CMYK depends on the printer, the ink, and the paper. A simple formula gives numbers that do not match real print output, so the tool does not show them.",
  },
  {
    q: "How does the tool handle alpha?",
    a: "HEX, RGB, HSL, HWB, and OKLCH include the alpha value when the color is not opaque. HSV has no standard alpha syntax, so it shows only the color. The Alpha slider changes opacity without changing the hue.",
  },
  {
    q: "How do palettes work?",
    a: "Every palette starts from the working color. Tints and shades step lightness by 10%, while complementary, analogous, triadic, split-complementary, and monochromatic modes rotate or step hue and saturation. Activating a swatch makes it the new working color. Copy CSS variables or JSON to export the displayed order, including alpha.",
  },
  {
    q: "Are recent colors saved?",
    a: "Yes, the last 8 applied colors are kept in this browser's local storage so they survive a reload. Only the color values are stored. Clearing site data removes them, and the tool still works if storage is unavailable.",
  },
  {
    q: "How does the contrast checker handle transparent colors?",
    a: "The checker blends a transparent foreground over the background, as a browser does. It treats the background as opaque. When a target is not met, the tool suggests the closest lightness change to the foreground or background that reaches it.",
  },
  {
    q: "How does the color blindness simulator work?",
    a: "It uses the model of Machado, Oliveira, and Fernandes (2009, IEEE TVCG). The tool converts each sRGB color to linear RGB, applies the matrix for the type and severity, and converts the result back to sRGB. At full severity, achromatopsia keeps only the luminance of each color.",
  },
  {
    q: "What does the severity slider change?",
    a: "At 0% no simulation is applied. At 100%, the tool shows protanopia, deuteranopia, and tritanopia, where one cone type is missing. Lower values show protanomaly, deuteranomaly, and tritanomaly, where the cone type is weak. Most color blind people have a mild anomaly, often deuteranomaly.",
  },
  {
    q: "What does the sample text in the vision table show?",
    a: "It shows the simulated working color as text on black or white, whichever gives the original color more contrast. The ratio is measured for the simulated text, so you can see whether the color stays legible for each vision type.",
  },
  {
    q: "When does the tool say that two colors look alike?",
    a: "The tool measures the distance between the simulated colors in OKLAB, a perceptual color space, and multiplies it by 100. A ΔE of about 2 is the smallest difference most people notice side by side. Below 6, colors are hard to tell apart in small marks such as chart lines, legend dots, and status icons. Up to 32 colors are compared at once.",
  },
  {
    q: "Why does the contrast stay almost the same for achromatopsia?",
    a: "WCAG contrast uses only luminance, and achromatopsia keeps the luminance of each color. Protanopia makes reds darker, so red text can lose contrast. Do not use color as the only signal. Add text, icons, or patterns.",
  },
  {
    q: "Does the simulated image leave my device?",
    a: "No. The tool draws the image on a canvas and changes the pixels locally. Images up to 20 MB and 40 megapixels are accepted, and large images are scaled to at most 1600 pixels on the longest side.",
  },
];
