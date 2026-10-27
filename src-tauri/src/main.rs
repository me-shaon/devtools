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
/// The tool list that launchers such as Raycast read, written to the app data folder.
#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolManifest {
    version: u32,
    app_version: String,
    scheme: String,
    tools: Vec<ManifestTool>,
}

#[derive(serde::Deserialize, serde::Serialize)]
struct ManifestTool {
    id: String,
    name: String,
    category: String,
    #[serde(default)]
    keywords: Vec<String>,
}

const MANIFEST_FILE: &str = "tools.json";
const MAX_MANIFEST_TOOLS: usize = 500;

/// Rejects a manifest that is not a plain list of tools, so the command cannot write arbitrary data.
fn validate_manifest(manifest: &ToolManifest) -> Result<(), String> {
    let short = |text: &str, max: usize| !text.trim().is_empty() && text.len() <= max;
    if manifest.tools.is_empty() || manifest.tools.len() > MAX_MANIFEST_TOOLS {
        return Err("The tool list is empty or too long.".into());
    }
    if !short(&manifest.app_version, 32) || !short(&manifest.scheme, 32) {
        return Err("The manifest version or scheme is invalid.".into());
    }
    for tool in &manifest.tools {
        let id_ok = short(&tool.id, 64)
            && tool.id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
        let keywords_ok = tool.keywords.len() <= 32 && tool.keywords.iter().all(|k| short(k, 64));
        if !id_ok || !short(&tool.name, 100) || !short(&tool.category, 100) || !keywords_ok {
            return Err(format!("Invalid tool entry: {}", tool.id));
        }
    }
    Ok(())
}

/// Writes the tool list to <app data>/tools.json, through a temporary file so readers never see half a file.
#[tauri::command]
fn write_tool_manifest(app: AppHandle, manifest: ToolManifest) -> Result<(), String> {
    use tauri::Manager;
    validate_manifest(&manifest)?;
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let json = serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?;
    let temp = dir.join(format!("{MANIFEST_FILE}.tmp"));
    std::fs::write(&temp, json).map_err(|error| error.to_string())?;
    std::fs::rename(&temp, dir.join(MANIFEST_FILE)).map_err(|error| error.to_string())
}

/// The frontend opens the command palette when it receives this event.
const OPEN_PALETTE_EVENT: &str = "open-command-palette";

/// Shows the window with the command palette open, ready to search.
fn show_command_palette(app: &tauri::AppHandle) {
    use tauri::Emitter;
    show_main_window(app);
    let _ = app.emit(OPEN_PALETTE_EVENT, ());
}

/// The global shortcut hides DevTools when it is in front, and otherwise brings it up searching.
fn toggle_from_shortcut(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        let in_front = window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false);
        if in_front {
            let _ = window.hide();
            return;
        }
    }
    show_command_palette(app);
}

/// Replaces the global shortcut. `None` turns it off. The error text names the reason, for
/// example a combination that another app already uses.
#[tauri::command]
fn set_global_shortcut(app: AppHandle, accelerator: Option<String>) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    let shortcuts = app.global_shortcut();
    shortcuts.unregister_all().map_err(|error| error.to_string())?;
    if let Some(accelerator) = accelerator.filter(|value| !value.trim().is_empty()) {
        let shortcut: Shortcut = accelerator
            .parse()
            .map_err(|_| format!("\"{accelerator}\" is not a valid shortcut."))?;
        shortcuts.register(shortcut).map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Adds the menu bar (macOS) or tray (Windows, Linux) icon. Linux desktops without a tray
/// return an error, which only means there is no icon.
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::TrayIconBuilder;

    let open = MenuItem::with_id(app, "open", "Open DevTools", true, None::<&str>)?;
    let search = MenuItem::with_id(app, "search", "Search Tools…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit DevTools", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &search, &PredefinedMenuItem::separator(app)?, &quit])?;

    let builder = TrayIconBuilder::with_id("main")
        .tooltip("DevTools")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            "search" => show_command_palette(app),
            "quit" => app.exit(0),
            _ => {}
        });

    // macOS draws a monochrome template image in the menu bar and opens the menu on click.
    #[cfg(target_os = "macos")]
    let builder = builder
        .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray-template.png"))?)
        .icon_as_template(true)
        .show_menu_on_left_click(true);

    // Windows and Linux show the app icon; a left click opens the window, a right click the menu.
    #[cfg(not(target_os = "macos"))]
    let builder = {
        use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
        let builder = builder.show_menu_on_left_click(false).on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main_window(tray.app_handle());
            }
        });
        match app.default_window_icon() {
            Some(icon) => builder.icon(icon.clone()),
            None => builder,
        }
    };
    builder.build(app)?;
    Ok(())
}

/// Brings the main window to the front, including after the window was closed or the app hidden.
fn show_main_window(app: &tauri::AppHandle) {
    use tauri::Manager;
    // Hide (Cmd+H) hides the whole app, which window.show() does not undo.
    #[cfg(target_os = "macos")]
    let _ = app.show();
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

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
    let builder = builder.invoke_handler(tauri::generate_handler![save_file, set_window_theme, write_tool_manifest, set_global_shortcut]);

    #[cfg(feature = "e2e")]
    let builder = builder
        .invoke_handler(tauri::generate_handler![
            save_file,
            set_window_theme,
            write_tool_manifest,
            set_global_shortcut,
            e2e::e2e_report,
            e2e::e2e_saved_files,
            e2e::e2e_tool_names
        ])
        .on_page_load(|webview, payload| {
            if let tauri::webview::PageLoadEvent::Finished = payload.event() {
                e2e::start_selftest(webview);
            }
        });

    // A second launch, usually from a devtoolsapp:// link, focuses the running window. With the
    // deep-link feature, the plugin also passes that link on to the deep-link plugin.
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
        show_main_window(app);
    }));

    let app = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        toggle_from_shortcut(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            use tauri_plugin_deep_link::DeepLinkExt;
            // Installers register the scheme on macOS, Windows, and deb/rpm. An AppImage and a
            // development build register it at run time. A failure only disables links.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            let _ = app.deep_link().register_all();
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |_event| show_main_window(&handle));
            if let Err(error) = build_tray(app) {
                eprintln!("The tray icon is not available: {error}");
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
            show_main_window(_app);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{file_name_from_header, validate_manifest, ManifestTool, ToolManifest};

    fn manifest(id: &str) -> ToolManifest {
        ToolManifest {
            version: 1,
            app_version: "2.1.0".into(),
            scheme: "devtoolsapp".into(),
            tools: vec![ManifestTool {
                id: id.into(),
                name: "JSON Viewer".into(),
                category: "Development Tools".into(),
                keywords: vec!["json".into()],
            }],
        }
    }

    #[test]
    fn accepts_a_valid_manifest() {
        assert!(validate_manifest(&manifest("json-viewer")).is_ok());
    }

    #[test]
    fn rejects_unsafe_tool_ids_and_empty_lists() {
        assert!(validate_manifest(&manifest("../escape")).is_err());
        assert!(validate_manifest(&manifest("")).is_err());
        let mut empty = manifest("json-viewer");
        empty.tools.clear();
        assert!(validate_manifest(&empty).is_err());
    }

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
