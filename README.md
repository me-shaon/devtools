# DevTools – Tauri Version
This branch contains a Tauri-based build of DevTools.
Compared to Electron (~170+ MB), the Tauri build is only ~1.8 MB while keeping the same features.

🚀 Requirements
Before running, install these:

Rust (with cargo)
Install via: https://rustup.rs

Verify:
```bash
rustc --version
cargo --version
```

Tauri CLI

```bash
cargo install tauri-cli
```
▶️ Run in Development Mode
```bash
npm run dev
```
This will launch the app with live reload.

🏗 Build Release
```bash
npm run tauri build
```
The built application will be in the src-tauri/target/release/ folder.


💡 Notes for Newbies
Rust handles the backend (fast, small size)

Tauri bundles your existing frontend (React, Vue, Svelte, etc.) into a native shell

No need to know deep Rust — most work stays in your JS/TS code

For more info:
📖 https://tauri.app/


![](https://rs2.deno.dev/2u841r/devtools)