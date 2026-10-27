// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

#[cfg(feature = "e2e")]
mod e2e;

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const FILE_NAME_HEADER: &str = "x-file-name";
const DEFAULT_FILE_NAME: &str = "download";

/// Decodes the percent-encoded file name that the web UI sends in a header.
fn file_name_from_header(value: Option<&str>) -> String {
    value
        .map(|value| percent_decode_str(value).decode_utf8_lossy().into_owned())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_FILE_NAME.into())
}

/// Asks the user where to save the file. Returns `None` when the user cancels.
fn choose_save_path(app: &AppHandle, file_name: &str) -> Result<Option<PathBuf>, String> {
    // End-to-end test builds cannot drive the native dialog, so they save into a fixed folder.
    #[cfg(feature = "e2e")]
    if let Some(dir) = std::env::var_os("DEVTOOLS_E2E_SAVE_DIR") {
        let name = std::path::Path::new(file_name)
            .file_name()
            .ok_or("Invalid file name.")?;
        return Ok(Some(PathBuf::from(dir).join(name)));
    }

    app.dialog()
        .file()
        .set_file_name(file_name)
        .blocking_save_file()
        .map(|target| target.into_path().map_err(|error| error.to_string()))
        .transpose()
}

/// Asks the user where to save a file and writes the raw request body there.
/// Returns the saved path, or `None` when the user cancels the dialog.
/// Sets the native window appearance. On macOS the sidebar material follows it,
/// so it must match the app theme. `None` follows the system.
#[tauri::command]
fn set_window_theme(window: tauri::WebviewWindow, theme: Option<String>) -> Result<(), String> {
    let theme = match theme.as_deref() {
        Some("dark") => Some(tauri::Theme::Dark),
        Some("light") => Some(tauri::Theme::Light),
        _ => None,
    };
    window.set_theme(theme).map_err(|error| error.to_string())
}

#[tauri::command]
async fn save_file(app: AppHandle, request: Request<'_>) -> Result<Option<String>, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw file bytes.".into());
    };

    let file_name = file_name_from_header(
        request
            .headers()
            .get(FILE_NAME_HEADER)
            .and_then(|value| value.to_str().ok()),
    );

    let Some(path) = choose_save_path(&app, &file_name)? else {
        return Ok(None);
    };

    std::fs::write(&path, bytes).map_err(|error| error.to_string())?;

    Ok(Some(path.to_string_lossy().into_owned()))
}

fn main() {
    let builder = tauri::Builder::default();

    #[cfg(not(feature = "e2e"))]
    let builder = builder.invoke_handler(tauri::generate_handler![save_file, set_window_theme]);

    #[cfg(feature = "e2e")]
    let builder = builder
        .invoke_handler(tauri::generate_handler![
            save_file,
            set_window_theme,
            e2e::e2e_report,
            e2e::e2e_saved_files,
            e2e::e2e_tool_names
        ])
        .on_page_load(|webview, payload| {
            if let tauri::webview::PageLoadEvent::Finished = payload.event() {
                e2e::start_selftest(webview);
            }
        });

    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(|_window, _event| {
            // Keep the app running in the dock when the window closes on macOS.
            #[cfg(target_os = "macos")]
            if let tauri::WindowEvent::CloseRequested { api, .. } = _event {
                api.prevent_close();
                let _ = _window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building DevToolsApp");

    app.run(|_app, _event| {
        // Show the hidden window again when the dock icon is clicked.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = _event {
            use tauri::Manager;
            if let Some(window) = _app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::file_name_from_header;

    #[test]
    fn decodes_percent_encoded_names() {
        assert_eq!(file_name_from_header(Some("qr%20code.png")), "qr code.png");
        assert_eq!(
            file_name_from_header(Some("%E5%9B%BE%E7%89%87.webp")),
            "\u{56fe}\u{7247}.webp"
        );
    }

    #[test]
    fn keeps_plain_names() {
        assert_eq!(
            file_name_from_header(Some("compressed-images.zip")),
            "compressed-images.zip"
        );
    }

    #[test]
    fn falls_back_when_the_name_is_missing_or_blank() {
        assert_eq!(file_name_from_header(None), "download");
        assert_eq!(file_name_from_header(Some("")), "download");
        assert_eq!(file_name_from_header(Some("%20")), "download");
    }

    #[test]
    fn replaces_invalid_utf8() {
        assert_eq!(file_name_from_header(Some("a%FFb.txt")), "a\u{fffd}b.txt");
    }
}
