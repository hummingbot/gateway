use serde_json::json;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
fn read_app_config(app: tauri::AppHandle) -> Result<String, String> {
    let config_path = get_app_config_path(&app)?;

    if !config_path.exists() {
        // Return default config if file doesn't exist
        let default_config = json!({
            "theme": "light"
        });
        return Ok(default_config.to_string());
    }

    fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read app config: {}", e))
}

#[tauri::command]
fn write_app_config(app: tauri::AppHandle, config: String) -> Result<(), String> {
    let config_path = get_app_config_path(&app)?;

    // Create parent directory if it doesn't exist
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    fs::write(&config_path, config)
        .map_err(|e| format!("Failed to write app config: {}", e))
}

fn get_app_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to get app config directory: {}", e))?;

    Ok(app_data_dir.join("app-config.json"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .invoke_handler(tauri::generate_handler![read_app_config, write_app_config])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
