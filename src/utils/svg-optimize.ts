/**
 * Runs SVGO on SVG markup. SVGO is large, so it loads only when the SVG to CSS tool needs it.
 */

export type SvgOptimizer = (svg: string) => string;

let loading: Promise<SvgOptimizer> | null = null;

/** Loads SVGO once and returns an optimizer that uses its default preset with two passes or more. */
export function loadSvgOptimizer(): Promise<SvgOptimizer> {
  loading ??= import("svgo/browser")
    .then(({ optimize }) => (svg: string) => optimize(svg, { multipass: true, plugins: ["preset-default"] }).data)
    .catch((err) => {
      loading = null;
      throw err;
    });
  return loading;
}
