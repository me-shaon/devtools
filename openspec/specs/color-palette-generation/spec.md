# color-palette-generation Specification

## Purpose

Defines how the tool derives usable shades, tints, and harmony palettes from the working color, how users apply those colors, and how palettes are exported for development workflows.

## Requirements

### Requirement: Palettes derive from the working color

The tool SHALL generate the active palette from the canonical working color using one of the supported modes: tints and shades, complementary, analogous, triadic, split-complementary, or monochromatic. Each generated palette MUST include the working color, contain only valid colors, and be deterministic for the same input and mode.

#### Scenario: Change the working color

- **WHEN** the working color changes while a palette mode is active
- **THEN** the displayed palette is regenerated for the new color in the same mode

#### Scenario: Switch palette mode

- **WHEN** the user selects a different palette mode
- **THEN** the displayed swatches reflect that mode while the working color stays unchanged

#### Scenario: Deterministic output

- **WHEN** the same working color and mode are used twice
- **THEN** the same ordered set of colors is produced

#### Scenario: Extreme colors remain valid

- **WHEN** the working color is black, white, transparent, or fully saturated
- **THEN** every swatch is a valid color, the palette includes the working color, duplicates are removed, and no error is shown

### Requirement: Apply a swatch to the working color

Each swatch SHALL be activatable by pointer and keyboard and MUST apply that swatch color as the new working color without altering other panel inputs.

#### Scenario: Apply a swatch

- **WHEN** the user activates a swatch
- **THEN** the swatch color becomes the working color, all panels update, and the palette regenerates from it

#### Scenario: Keyboard activation

- **WHEN** the user focuses a swatch and activates it with the keyboard
- **THEN** the same result occurs as a pointer activation and the swatch has a programmatic label containing its color value

### Requirement: Swatches expose their value

Each swatch SHALL display or make available its color value in a readable format, and the palette MUST remain usable when colors are visually similar or transparent.

#### Scenario: Read a swatch value

- **WHEN** the user inspects a swatch
- **THEN** its HEX value is shown with sufficient contrast against the swatch or a neutral surface, and transparent colors remain distinguishable

### Requirement: Export palette for developers

The tool SHALL export the currently displayed palette as copyable CSS custom properties and as copyable JSON. The exported content MUST match the displayed palette order and values, and export MUST NOT change the working color or other tool state.

#### Scenario: Copy CSS custom properties

- **WHEN** the user copies the CSS export
- **THEN** the clipboard receives one custom property per displayed swatch with values that are valid CSS colors in palette order

#### Scenario: Copy JSON

- **WHEN** the user copies the JSON export
- **THEN** the clipboard receives valid JSON listing every displayed swatch in order with its color value

#### Scenario: Export failure is reported

- **WHEN** the clipboard write fails
- **THEN** the user sees a failure message and no success confirmation

### Requirement: Palette generation is bounded

Palette generation SHALL have a fixed maximum number of swatches per mode and MUST NOT consume unbounded time or memory for any input.

#### Scenario: Consistent palette size

- **WHEN** any supported mode is generated
- **THEN** the number of swatches stays within the mode's fixed maximum and the interface renders without measurable delay for repeated regeneration
