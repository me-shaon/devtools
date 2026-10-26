// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use percent_encoding::percent_decode_str;
use tauri::ipc::{InvokeBody, Request};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

const FILE_NAME_HEADER: &str = "x-file-name";

/// Asks the user where to save a file and writes the raw request body there.
/// Returns the saved path, or `None` when the user cancels the dialog.
#[tauri::command]
async fn save_file(app: AppHandle, request: Request<'_>) -> Result<Option<String>, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected raw file bytes.".into());
    };

    let file_name = request
        .headers()
        .get(FILE_NAME_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(|value| percent_decode_str(value).decode_utf8_lossy().into_owned())
        .unwrap_or_else(|| "download".into());

    let Some(target) = app
        .dialog()
        .file()
        .set_file_name(&file_name)
        .blocking_save_file()
    else {
        return Ok(None);
    };

    let path = target.into_path().map_err(|error| error.to_string())?;
    std::fs::write(&path, bytes).map_err(|error| error.to_string())?;

    Ok(Some(path.to_string_lossy().into_owned()))
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![save_file])
        .setup(|_app| {
            // Open the web inspector in development builds.
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                if let Some(window) = _app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
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
