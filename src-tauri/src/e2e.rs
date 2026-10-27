//! Test-only commands for the end-to-end self-test. Only the `e2e` feature compiles this module.

use std::path::PathBuf;

use tauri::{AppHandle, Webview};

const SELFTEST_SCRIPT: &str = include_str!("../../e2e/selftest.js");
const TOOL_REGISTRY: &str = include_str!("../../src/app/toolRegistry.ts");

/// Starts the in-app self-test when `DEVTOOLS_E2E_SELFTEST` is set.
pub fn start_selftest(webview: &Webview) {
    if std::env::var_os("DEVTOOLS_E2E_SELFTEST").is_some() {
        let _ = webview.eval(SELFTEST_SCRIPT);
    }
}

/// Quits the way Cmd+Q or the tray's Quit item does, so a test can check install-on-quit.
#[tauri::command]
pub fn e2e_request_quit(app: AppHandle, log: String) {
    println!("{log}");
    if crate::request_quit(&app) {
        app.exit(0);
    }
}

/// Prints the self-test log and exits with the test result.
#[tauri::command]
pub fn e2e_report(app: AppHandle, passed: bool, output: String) {
    println!("{output}");
    app.exit(if passed { 0 } else { 1 });
}

/// Lists the saved files with the hex of their first four bytes.
#[tauri::command]
pub fn e2e_saved_files() -> Vec<(String, String)> {
    let Some(dir) = std::env::var_os("DEVTOOLS_E2E_SAVE_DIR").map(PathBuf::from) else {
        return Vec::new();
    };

    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|entry| {
                    let bytes = std::fs::read(entry.path()).ok()?;
                    let header = bytes.iter().take(4).map(|byte| format!("{byte:02x}")).collect();
                    Some((entry.file_name().to_string_lossy().into_owned(), header))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Returns the tool names from src/app/toolRegistry.ts.
#[tauri::command]
pub fn e2e_tool_names() -> Vec<String> {
    TOOL_REGISTRY
        .split("name: \"")
        .skip(1)
        .filter_map(|rest| rest.split('"').next())
        .map(String::from)
        .collect()
}
