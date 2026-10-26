// Stable, version-free release asset names.
// The README download links and the updater manifest depend on these names.

export const PRODUCT_NAME = "DevToolsApp";

/** Bundle rules per platform: the Tauri bundle subfolder, file suffix, and stable output name. */
export function getBundleRules(platform, arch) {
  const isArm = arch === "arm64";

  const rules = {
    darwin: [
      { dir: "dmg", suffix: ".dmg", name: `${PRODUCT_NAME}-macos-${arch}.dmg` },
      // The Electron app (v1.3.0 and earlier) updates on macOS from a zip of the signed app.
      { dir: "macos", suffix: ".app", name: `${PRODUCT_NAME}-macos-${arch}.zip`, zipApp: true },
      {
        dir: "macos",
        suffix: ".app.tar.gz",
        name: `${PRODUCT_NAME}-macos-${arch}.app.tar.gz`,
        // Updater archives exist only when a signing key is available.
        optional: true,
      },
    ],
    win32: [{ dir: "nsis", suffix: "-setup.exe", name: `${PRODUCT_NAME}-windows-setup.exe` }],
    linux: [
      {
        dir: "appimage",
        suffix: ".AppImage",
        name: `${PRODUCT_NAME}-linux-${isArm ? "arm64" : "x86_64"}.AppImage`,
      },
      { dir: "deb", suffix: ".deb", name: `${PRODUCT_NAME}-linux-${isArm ? "arm64" : "amd64"}.deb` },
      { dir: "rpm", suffix: ".rpm", name: `${PRODUCT_NAME}-linux-${isArm ? "aarch64" : "x86_64"}.rpm` },
    ],
  };

  return rules[platform] ?? null;
}

function assetName(platform, arch, suffix) {
  return getBundleRules(platform, arch).find((rule) => rule.suffix === suffix).name;
}

/** Tauri updater platform keys mapped to the asset that installs the update. */
export const UPDATER_PLATFORM_ASSETS = {
  "darwin-x86_64": assetName("darwin", "x64", ".app.tar.gz"),
  "darwin-aarch64": assetName("darwin", "arm64", ".app.tar.gz"),
  "windows-x86_64": assetName("win32", "x64", "-setup.exe"),
  "linux-x86_64": assetName("linux", "x64", ".AppImage"),
  "linux-aarch64": assetName("linux", "arm64", ".AppImage"),
  "linux-x86_64-deb": assetName("linux", "x64", ".deb"),
  "linux-aarch64-deb": assetName("linux", "arm64", ".deb"),
  "linux-x86_64-rpm": assetName("linux", "x64", ".rpm"),
  "linux-aarch64-rpm": assetName("linux", "arm64", ".rpm"),
};

/** Platforms that every release must be able to update. */
export const REQUIRED_UPDATER_PLATFORMS = [
  "darwin-x86_64",
  "darwin-aarch64",
  "windows-x86_64",
  "linux-x86_64",
  "linux-aarch64",
];

/**
 * electron-updater manifests that move installs of the old Electron app to this release.
 * Each list starts with the default download for that platform.
 */
export const ELECTRON_BRIDGE_MANIFESTS = {
  "latest-mac.yml": [assetName("darwin", "arm64", ".app"), assetName("darwin", "x64", ".app")],
  "latest.yml": [assetName("win32", "x64", "-setup.exe")],
  "latest-linux.yml": [".AppImage", ".deb", ".rpm"].map((suffix) => assetName("linux", "x64", suffix)),
  "latest-linux-arm64.yml": [".AppImage", ".deb", ".rpm"].map((suffix) => assetName("linux", "arm64", suffix)),
};
