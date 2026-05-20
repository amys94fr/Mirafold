use std::path::PathBuf;
use std::process::Stdio;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tokio::process::{Child, Command};

pub const ML_BASE_URL: &str = "http://127.0.0.1:8765";

pub struct SidecarHandle {
    child: Child,
}

impl SidecarHandle {
    pub fn pid(&self) -> u32 {
        self.child.id().unwrap_or(0)
    }
    pub fn kill(mut self) {
        let _ = self.child.start_kill();
    }
}

fn ml_service_root(app: &AppHandle) -> PathBuf {
    // Dev: walk up from src-tauri/target to apps/ml-service
    if let Ok(dev_cwd) = std::env::current_dir() {
        let candidate = dev_cwd
            .ancestors()
            .find_map(|p| {
                let candidate = p.join("apps").join("ml-service");
                if candidate.join("run.py").exists() {
                    Some(candidate)
                } else {
                    None
                }
            });
        if let Some(p) = candidate {
            return p;
        }
    }

    // Prod: bundled resource
    if let Ok(resource) = app.path().resource_dir() {
        let bundled = resource.join("ml-service");
        if bundled.join("run.py").exists() {
            return bundled;
        }
    }

    PathBuf::from("ml-service")
}

pub async fn spawn(app: &AppHandle) -> std::io::Result<SidecarHandle> {
    let root = ml_service_root(app);
    let entry = root.join("run.py");
    let python = which_python();

    eprintln!(
        "[mirafold] Launching ML sidecar: python={} entry={:?} cwd={:?}",
        python, entry, root
    );
    log::info!("Launching ML sidecar from {:?}", entry);

    if !entry.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("ml-service entry not found: {:?}", entry),
        ));
    }

    let child = Command::new(&python)
        .arg(&entry)
        .current_dir(&root)
        .env("MIRAFOLD_PORT", "8765")
        .env("MIRAFOLD_HOST", "127.0.0.1")
        .env("PYTHONUNBUFFERED", "1")
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()?;

    Ok(SidecarHandle { child })
}

fn which_python() -> String {
    // Prefer venv python if present, else system python
    let candidates = ["python", "python3", "py"];
    for c in candidates {
        if std::process::Command::new(c)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
        {
            return c.to_string();
        }
    }
    "python".to_string()
}

pub async fn wait_for_health(timeout: Duration) -> Result<bool, reqwest::Error> {
    let client = reqwest::Client::new();
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Ok(resp) = client
            .get(format!("{}/health", ML_BASE_URL))
            .send()
            .await
        {
            if resp.status().is_success() {
                return Ok(true);
            }
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    Ok(false)
}
