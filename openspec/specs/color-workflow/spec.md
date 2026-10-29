# color-workflow Specification

## Purpose

Defines how a user selects, enters, refines, copies, and reuses a single working color, and how that color stays synchronized across every panel of the Color Palette tool.

## Requirements

### Requirement: Single canonical working color

The tool SHALL maintain one canonical working color. A valid change made through any editing surface MUST update every dependent view, and no panel may silently replace an unrelated input or the working color.

#### Scenario: Edit propagates to every panel

- **WHEN** the user sets a valid color through the picker, HEX, RGB, HSL, or a palette swatch
- **THEN** the preview, all format outputs, palette, contrast panel, and color-vision panel show that color

#### Scenario: Unrelated input is not overwritten

- **WHEN** the user generates a palette or edits the contrast comparison pair
- **THEN** the working color and the user's text in other inputs remain unchanged

#### Scenario: Last valid color survives invalid draft

- **WHEN** the user is editing an input and its current text is not a valid color
- **THEN** an inline validation message is shown, dependent panels keep the last valid color, and downstream values update once the text becomes valid

### Requirement: Color input accepts supported CSS syntaxes

The tool SHALL accept the CSS color syntaxes it currently supports, including named colors, `transparent`, 3/4/6/8-digit hex, and `rgb`/`rgba`/`hsl`/`hsla`/`hwb`/`oklch`/`oklab` forms, with surrounding whitespace ignored and input length bounded.

#### Scenario: Supported syntax is accepted

- **WHEN** the user enters a supported color such as `#abc`, `rgb(255 0 0 / 50%)`, `hsl(120 50% 40%)`, `oklch(0.7 0.1 200)`, `rebeccapurple`, or `transparent`
- **THEN** the color is parsed and becomes the working color

#### Scenario: Malformed input is rejected without crashing

- **WHEN** the user enters an unsupported or malformed value such as `#12`, `rgb(300, 0)`, or arbitrary text
- **THEN** the tool reports the input as invalid and continues operating with the last valid color

#### Scenario: Oversized input is bounded

- **WHEN** the user pastes an extremely long string into a color input
- **THEN** parsing is bounded, the tool remains responsive, and no invalid color is applied

### Requirement: Direct channel and alpha editing

The tool SHALL allow editing channels directly through HEX, RGB, and HSL representations and SHALL provide an explicit alpha control from fully transparent to fully opaque. Channel edits MUST keep all formats consistent and MUST reject values outside their valid range without changing the working color.

#### Scenario: Channel edit updates all formats

- **WHEN** the user changes the red channel in RGB view
- **THEN** the HEX, HSL, HWB, OKLCH, HSV, and preview outputs reflect the same color

#### Scenario: Out-of-range channel value is rejected

- **WHEN** the user enters a channel value outside its permitted range, such as 300 for red or 120% lightness
- **THEN** the input is flagged invalid and the working color is unchanged

#### Scenario: Alpha boundaries round-trip

- **WHEN** the user sets alpha to 0 or 100 percent
- **THEN** the working color is fully transparent or fully opaque respectively, and the value round-trips through 8-digit hex and `rgba`/`hsla` output

### Requirement: Format outputs and copy

The tool SHALL display every supported output format with its alpha when present, and each output MUST offer a copy action that reports success or failure honestly.

#### Scenario: Copy a format value

- **WHEN** the user copies the HSL output
- **THEN** the clipboard receives exactly the displayed HSL value and the control confirms the copy

#### Scenario: Clipboard failure is reported

- **WHEN** the clipboard write is rejected by the browser or runtime
- **THEN** the tool shows a failure message and does not display a success state

### Requirement: Recent colors

The tool SHALL record successfully applied colors in a most-recent-first, duplicate-free list bounded to a fixed maximum, allow applying an entry with one action, and persist the list locally under a namespaced versioned key. Persistent data MUST be parsed defensively; missing, malformed, or unavailable storage MUST NOT break the tool.

#### Scenario: Apply a recent color

- **WHEN** the user selects an entry from the recent colors list
- **THEN** it becomes the working color and all panels update

#### Scenario: Duplicate and overflow handling

- **WHEN** a color equal to an existing recent entry is applied again, or the list is at its maximum
- **THEN** the entry moves to the front without duplication and the oldest entry is dropped

#### Scenario: Corrupted or unavailable storage

- **WHEN** the persisted recent-colors value is malformed or storage is unavailable
- **THEN** the tool starts with an empty list, reports no crash, and continues to work without persistence

#### Scenario: Recents stay local

- **WHEN** the user applies colors and later reloads
- **THEN** only the color values are restored from local storage and no image, file, or unrelated user input is stored

### Requirement: Responsive and keyboard-operable workspace

The tool SHALL present one primary workspace whose preview, color input, and main actions remain usable on narrow screens without horizontal scrolling, and all interactive controls MUST be reachable and operable by keyboard with visible focus and programmatic labels.

#### Scenario: Desktop workspace

- **WHEN** the tool is used at a desktop width
- **THEN** the preview and editing controls are visible together and secondary features do not obscure the primary workflow

#### Scenario: Narrow viewport

- **WHEN** the tool is used at a mobile width
- **THEN** panels stack vertically, no control overflows horizontally, and the working color remains visible while editing

#### Scenario: Keyboard operation

- **WHEN** the user navigates the tool using only the keyboard
- **THEN** every control can be reached and activated, focus is visible, and state changes are announced where needed
