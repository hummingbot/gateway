use std::fs;
use std::io::{BufRead, BufReader};
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

#[tauri::command]
fn read_gateway_logs(gateway_path: String, lines: usize) -> Result<String, String> {
    use chrono::Local;

    // Get today's log file name
    let today = Local::now().format("%Y-%m-%d").to_string();
    let log_filename = format!("logs_gateway_app.log.{}", today);

    // Construct full path
    let log_path = PathBuf::from(gateway_path)
        .join("logs")
        .join(log_filename);

    if !log_path.exists() {
        return Ok(String::from("No logs found for today."));
    }

    // Read last N lines
    let file = fs::File::open(&log_path)
        .map_err(|e| format!("Failed to open log file: {}", e))?;

    let reader = BufReader::new(file);
    let all_lines: Vec<String> = reader
        .lines()
        .filter_map(|line| line.ok())
        .collect();

    // Take last N lines
    let start = if all_lines.len() > lines {
        all_lines.len() - lines
    } else {
        0
    };

    Ok(all_lines[start..].join("\n"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .invoke_handler(tauri::generate_handler![read_app_config, write_app_config, read_gateway_logs])
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
