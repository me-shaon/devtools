# DevTools brand assets

The brand name is **DevTools**, with a capital D and T and no space. The folded D combines a code bracket and forward chevron. Two diagonal cuts separate the pieces while preserving a single compact silhouette.

## Files

| Folder | Contents |
| --- | --- |
| `source/` | Editable master mark and outlined wordmark SVGs. These are the source of truth. |
| `svg/` | Mark, wordmark, horizontal and stacked logos in primary, reverse, slate and black. |
| `png/` | Transparent high-resolution exports of every SVG logo variant. |
| `app-icons/` | Blue rounded tile in SVG, PNG sizes 16–1024, Apple touch icon, Windows ICO and macOS ICNS. |
| `social/` | 1200 × 630 social preview in SVG and PNG. |
| `reference/` | The approved generated concept, retained as design reference. |

The production artwork is a vector reconstruction of the approved concept, with consistent geometry and flat colors. The wordmark uses outlined Avenir Next Heavy letterforms; no font file or installed font is required to display or regenerate the assets. Use the supplied wordmark artwork rather than retyping it. Interface copy continues to use the app's system font stack.

## Colors

| Name | Hex | Use |
| --- | --- | --- |
| DevTools blue | `#1A6DD2` | Primary mark and app tile |
| Slate | `#202630` | Wordmark on light surfaces, monochrome mark |
| White | `#FFFFFF` | Reversed artwork on dark surfaces |
| Mist | `#F3F6FA` | Optional presentation background |

Use `logo-horizontal-primary.svg` on light backgrounds and `logo-horizontal-reverse.svg` on dark backgrounds. Reverse exports are white with transparency, so they appear blank in white-background viewers. Use slate or black for single-color printing.

## Placement

- Keep clear space of at least one main stroke width around the mark or lockup; the mark's stroke is approximately one quarter of its width.
- Use the standalone mark at 20 px or larger in the interface. Favicons have dedicated exports at 16 and 32 px.
- Use the horizontal logo at 180 px wide or larger and the stacked logo at 160 px wide or larger.
- Preserve aspect ratio, diagonal cuts, and the original spacing. Do not add shadows, outlines, rotation, or gradients.
- The desktop tile has transparent outer margins; the Apple touch icon is an opaque square so the platform can apply its own mask.

## Regenerate and integrate

Run `pnpm install`, then `pnpm run brand:build` (also available as `pnpm run icon`). The generator reads the two SVG masters, creates all exports using Sharp, and invokes the installed Tauri icon CLI for the platform formats. SVG logo exports contain paths, not live text.

Generated runtime copies live in `public/brand/`, `public/app-icon.png`, `public/favicon.*`, `public/apple-touch-icon.png`, `public/og-image.png`, `src-tauri/app-icon.png`, and `src-tauri/icons/`. Edit the masters and regenerate instead of modifying copies.

The visible product and window name is DevTools. The existing bundle identifier, executable name, Rust package, and stable release download filenames remain unchanged for compatibility with installed apps and updater URLs. The historical name in those technical locations is intentional.

Desktop icon changes take effect in a newly built application; operating systems may retain cached icons for an already installed build.
