use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
fn read_app_config(app: tauri::AppHandle) -> Result<String, String> {
    let config_path = get_app_config_path(&app)?;

    if !config_path.exists() {
        // Copy default config from app directory to user config directory
        let default_config_content = include_str!("../../app-config.json");

        // Create parent directory if it doesn't exist
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        // Write default config to user config directory
        fs::write(&config_path, default_config_content)
            .map_err(|e| format!("Failed to write default config: {}", e))?;

        return Ok(default_config_content.to_string());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read app config: {}", e))?;

    Ok(content)
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
