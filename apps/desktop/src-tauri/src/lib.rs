mod sidecar;

use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub sidecar: Mutex<Option<sidecar::SidecarHandle>>,
}

#[tauri::command]
async fn sidecar_url() -> String {
    sidecar::ML_BASE_URL.to_string()
}

#[tauri::command]
async fn sidecar_ready() -> Result<bool, String> {
    sidecar::wait_for_health(std::time::Duration::from_secs(2))
        .await
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if std::env::var("RUST_LOG").is_err() {
        std::env::set_var("RUST_LOG", "info");
    }
    let _ = env_logger::try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            sidecar: Mutex::new(None),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match sidecar::spawn(&handle).await {
                    Ok(h) => {
                        eprintln!("[mirafold] ML sidecar spawned (pid={})", h.pid());
                        log::info!("ML sidecar spawned (pid={})", h.pid());
                        if let Some(state) = handle.try_state::<AppState>() {
                            if let Ok(mut slot) = state.sidecar.lock() {
                                *slot = Some(h);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[mirafold] FAILED to spawn ML sidecar: {e}");
                        log::error!("Failed to spawn ML sidecar: {e}");
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<AppState>() {
                    if let Ok(mut slot) = state.sidecar.lock() {
                        if let Some(handle) = slot.take() {
                            handle.kill();
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![sidecar_url, sidecar_ready])
        .run(tauri::generate_context!())
        .expect("error while running Mirafold");
}
