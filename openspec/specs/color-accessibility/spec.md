# color-accessibility Specification

## Purpose

Defines how the tool evaluates and improves color accessibility: WCAG contrast for foreground/background pairs, corrective suggestions, color-vision-deficiency simulation, and detection of colors that are hard to distinguish.

## Requirements

### Requirement: WCAG contrast evaluation

The tool SHALL compute the contrast ratio of a foreground and background pair on a 1 to 21 scale and report WCAG 2.x AA and AAA pass or fail for normal and large text. When either color is not fully opaque, the analysis MUST state the compositing assumption used rather than implying the ratio applies to the uncomposited colors.

#### Scenario: Opaque pair result

- **WHEN** the user checks opaque black text on white background
- **THEN** the ratio is 21:1 and AA and AAA pass for both normal and large text

#### Scenario: Failing pair result

- **WHEN** the computed ratio is below the selected threshold
- **THEN** each failing level is labeled as failing and the ratio is shown

#### Scenario: Transparency is disclosed

- **WHEN** the foreground or background has alpha below 100 percent
- **THEN** the tool states the color it composited over and reports the ratio for the composited result

### Requirement: Contrast pair is user-controlled

The user SHALL be able to set foreground and background independently, swap them, and explicitly use the working color as either side. Changing the working color or generating a palette MUST NOT silently replace the user's comparison pair.

#### Scenario: Use working color as foreground

- **WHEN** the user chooses to use the working color as the foreground
- **THEN** the foreground updates to the working color and the background text is preserved

#### Scenario: Swap pair

- **WHEN** the user swaps foreground and background
- **THEN** the ratio is recomputed for the reversed pair

#### Scenario: Pair survives unrelated actions

- **WHEN** the working color changes or a palette is generated
- **THEN** the comparison pair remains what the user set

### Requirement: Actionable contrast suggestions

When a pair fails the selected WCAG target, the tool SHALL offer at least one adjusted foreground or background candidate that meets that target while remaining as close as practical to the original color, and the user MUST be able to apply a suggested candidate. When the pair already passes, no corrective suggestion is required.

#### Scenario: Suggest a passing foreground

- **WHEN** a pair fails AA normal text and an adjusted foreground can meet 4.5:1
- **THEN** the tool shows a candidate with its ratio and allows applying it as the foreground

#### Scenario: AAA target

- **WHEN** the user selects the AAA normal-text target for a failing pair
- **THEN** suggested candidates meet 7:1 or the tool states that no candidate could be found

#### Scenario: Passing pair

- **WHEN** the pair already meets the selected target
- **THEN** the tool does not present a corrective suggestion as necessary

#### Scenario: Impossible target

- **WHEN** no candidate can satisfy the selected target for the given background
- **THEN** the tool explains that the target cannot be met rather than showing an incorrect suggestion

### Requirement: Color-vision simulation of colors

The tool SHALL simulate protanopia, deuteranopia, tritanopia, and achromatopsia for the working color and for a user-provided list of colors, with an adjustable severity from 0 (no simulation) to 100 percent. Results MUST identify the type and severity applied and MUST NOT present an unchanged simulated value as a failure.

#### Scenario: Severity zero

- **WHEN** severity is 0
- **THEN** every simulated result equals the original color

#### Scenario: Simulate the working color

- **WHEN** the user selects a type and severity above 0
- **THEN** the panel shows the simulated color and the contrast result for the simulated color against its background

#### Scenario: Neutral color is unchanged

- **WHEN** a gray or otherwise neutral color produces the same simulated value
- **THEN** the tool indicates the color is unchanged by the simulation instead of implying an error

#### Scenario: Unsupported or malformed list entries

- **WHEN** the color list contains invalid tokens
- **THEN** valid tokens are still simulated, each invalid token is reported, and the tool remains usable

### Requirement: Confusable color detection

Given a user-provided color list, the tool SHALL report pairs whose perceptual distance is below the documented confusion threshold, ordered from closest pair first, and MUST remain responsive for large but bounded lists.

#### Scenario: Confusable pair found

- **WHEN** two colors in the list are perceptually very close
- **THEN** the pair is reported with its distance and the colors involved

#### Scenario: No confusable pairs

- **WHEN** no pair falls below the threshold
- **THEN** the tool states that no confusable pairs were found

#### Scenario: Empty or single-entry list

- **WHEN** the list contains zero or one valid color
- **THEN** no pair comparison is attempted and the tool reports no result without error

#### Scenario: Bounded input

- **WHEN** the list approaches or exceeds the supported maximum
- **THEN** the tool applies a documented limit or rejects excess input with a clear message instead of freezing

### Requirement: Local image simulation

The tool SHALL simulate color-vision deficiency on a user-selected image entirely on the device, without uploading or transmitting the image. It MUST reject unsupported file types and images above the configured size or dimension limit with an actionable message, MUST release image resources when the image is replaced or cleared, and MUST discard stale simulation results when the image or settings change.

#### Scenario: Simulate a supported image

- **WHEN** the user selects a supported image within the limits
- **THEN** the simulated preview appears and the original file is never transmitted

#### Scenario: Reject unsupported or oversized file

- **WHEN** the user selects a file with an unsupported type or above the configured limit
- **THEN** the tool shows an actionable error and keeps the previous image state

#### Scenario: Decode failure

- **WHEN** an image fails to decode
- **THEN** the tool reports the failure, releases any partial resources, and remains usable

#### Scenario: Replace or clear image

- **WHEN** the user replaces or clears the image, or changes severity while processing
- **THEN** previous object URLs are released and stale results never replace the current preview

#### Scenario: File contents stay local

- **WHEN** image simulation is used
- **THEN** no network request, storage of the file, or logging of its contents occurs
