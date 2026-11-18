use std::{
    fs::{self, File},
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, RunEvent, State};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(15);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);
const JAVA_MEMORY_ARGUMENTS: [&str; 2] = ["-Xms32m", "-Xmx256m"];

#[derive(Clone, Copy, PartialEq)]
enum RuntimePhase {
    Starting,
    Ready,
    Failed,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeStatus {
    status: &'static str,
    message: Option<String>,
    api_base: Option<String>,
    session_token: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateStatus {
    distribution: &'static str,
    configured: bool,
    version: String,
}

#[derive(Deserialize)]
struct ReadyFile {
    port: u16,
}

struct RuntimeInner {
    phase: RuntimePhase,
    message: Option<String>,
    token: String,
    port: Option<u16>,
    child: Option<Child>,
    generation: u64,
}

struct RuntimeSupervisor {
    app: AppHandle,
    data_dir: PathBuf,
    inner: Mutex<RuntimeInner>,
}

impl RuntimeSupervisor {
    fn new(app: AppHandle) -> Result<Arc<Self>, String> {
        let data_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|error| format!("Não foi possível localizar os dados locais: {error}"))?;
        for directory in ["data", "logs", "secrets", "runtime"] {
            fs::create_dir_all(data_dir.join(directory)).map_err(|error| {
                format!("Não foi possível preparar o diretório de dados: {error}")
            })?;
        }
        Ok(Arc::new(Self {
            app,
            data_dir,
            inner: Mutex::new(RuntimeInner {
                phase: RuntimePhase::Failed,
                message: Some("Serviço local aguardando inicialização.".to_owned()),
                token: String::new(),
                port: None,
                child: None,
                generation: 0,
            }),
        }))
    }

    fn start(self: &Arc<Self>) -> Result<(), String> {
        let (generation, token, ready_file) = {
            let mut inner = self
                .inner
                .lock()
                .map_err(|_| "O serviço local ficou indisponível.".to_owned())?;
            if inner.phase == RuntimePhase::Starting || inner.child.is_some() {
                return Ok(());
            }
            inner.generation += 1;
            inner.phase = RuntimePhase::Starting;
            inner.message = Some("Iniciando o serviço local".to_owned());
            inner.token = new_token();
            inner.port = None;
            let ready_file = self
                .data_dir
                .join("runtime")
                .join(format!("ready-{}.json", inner.generation));
            let _ = fs::remove_file(&ready_file);
            (inner.generation, inner.token.clone(), ready_file)
        };

        let (java, jar) = match self.runtime_paths() {
            Ok(paths) => paths,
            Err(error) => {
                self.fail(generation, error.clone());
                return Err(error);
            }
        };
        if !jar.is_file() {
            self.fail(
                generation,
                "O componente Java interno não foi encontrado.".to_owned(),
            );
            return Ok(());
        }
        let log_file = self.data_dir.join("logs").join("core.log");
        let output = match File::options().create(true).append(true).open(&log_file) {
            Ok(file) => file,
            Err(error) => {
                let message = format!("Não foi possível abrir o log interno: {error}");
                self.fail(generation, message.clone());
                return Err(message);
            }
        };
        let error_output = match output.try_clone() {
            Ok(file) => file,
            Err(error) => {
                let message = format!("Não foi possível preparar o log interno: {error}");
                self.fail(generation, message.clone());
                return Err(message);
            }
        };
        let child = match Command::new(java)
            .args(JAVA_MEMORY_ARGUMENTS)
            .arg("-jar")
            .arg(jar)
            .env("GODARD_DATA_DIR", &self.data_dir)
            .env("GODARD_SESSION_TOKEN", token)
            .env("GODARD_READY_FILE", &ready_file)
            .current_dir(&self.data_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::from(output))
            .stderr(Stdio::from(error_output))
            .spawn()
        {
            Ok(process) => process,
            Err(error) => {
                let message = format!("Não foi possível iniciar o serviço Java: {error}");
                self.fail(generation, message.clone());
                return Err(message);
            }
        };
        {
            let mut inner = self
                .inner
                .lock()
                .map_err(|_| "O serviço local ficou indisponível.".to_owned())?;
            if inner.generation != generation {
                return Ok(());
            }
            inner.child = Some(child);
        }
        let supervisor = Arc::clone(self);
        thread::spawn(move || supervisor.wait_for_ready(generation, ready_file));
        Ok(())
    }

    fn wait_for_ready(&self, generation: u64, ready_file: PathBuf) {
        let attempts = (STARTUP_TIMEOUT.as_millis() / 100) as usize;
        for _ in 0..attempts {
            thread::sleep(Duration::from_millis(100));
            if let Ok(content) = fs::read_to_string(&ready_file) {
                if let Ok(ready) = serde_json::from_str::<ReadyFile>(&content) {
                    if ready.port > 0 {
                        let mut inner = match self.inner.lock() {
                            Ok(value) => value,
                            Err(_) => return,
                        };
                        if inner.generation == generation && inner.child.is_some() {
                            inner.phase = RuntimePhase::Ready;
                            inner.message = None;
                            inner.port = Some(ready.port);
                        }
                        return;
                    }
                }
            }
            let exited = {
                let mut inner = match self.inner.lock() {
                    Ok(value) => value,
                    Err(_) => return,
                };
                if inner.generation != generation {
                    return;
                }
                inner
                    .child
                    .as_mut()
                    .and_then(|child| child.try_wait().ok())
                    .flatten()
            };
            if let Some(status) = exited {
                self.fail(
                    generation,
                    format!("O serviço Java encerrou durante a inicialização ({status})."),
                );
                return;
            }
        }
        self.fail(
            generation,
            "O serviço Java demorou mais que o esperado para iniciar.".to_owned(),
        );
    }

    fn status(&self) -> RuntimeStatus {
        let inner = match self.inner.lock() {
            Ok(value) => value,
            Err(_) => {
                return RuntimeStatus {
                    status: "failed",
                    message: Some("O estado do serviço local não está disponível.".to_owned()),
                    api_base: None,
                    session_token: None,
                };
            }
        };
        match inner.phase {
            RuntimePhase::Starting => RuntimeStatus {
                status: "starting",
                message: inner.message.clone(),
                api_base: None,
                session_token: None,
            },
            RuntimePhase::Ready => RuntimeStatus {
                status: "ready",
                message: None,
                api_base: inner.port.map(|port| format!("http://127.0.0.1:{port}")),
                session_token: Some(inner.token.clone()),
            },
            RuntimePhase::Failed => RuntimeStatus {
                status: "failed",
                message: inner.message.clone(),
                api_base: None,
                session_token: None,
            },
        }
    }

    fn restart(self: &Arc<Self>) -> Result<(), String> {
        self.shutdown();
        if let Err(error) = self.start() {
            self.fail_current(error.clone());
            return Err(error);
        }
        Ok(())
    }

    fn shutdown(&self) {
        let (port, token, mut child) = {
            let mut inner = match self.inner.lock() {
                Ok(value) => value,
                Err(_) => return,
            };
            let port = inner.port;
            inner.phase = RuntimePhase::Failed;
            inner.port = None;
            inner.message = Some("Serviço local encerrado.".to_owned());
            (port, inner.token.clone(), inner.child.take())
        };
        if let Some(port) = port {
            send_shutdown(port, &token);
        }
        if let Some(child) = child.as_mut() {
            let elapsed = std::time::Instant::now();
            while elapsed.elapsed() < SHUTDOWN_TIMEOUT {
                if child.try_wait().ok().flatten().is_some() {
                    return;
                }
                thread::sleep(Duration::from_millis(80));
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    fn fail(&self, generation: u64, message: String) {
        let child = if let Ok(mut inner) = self.inner.lock() {
            if inner.generation == generation {
                inner.phase = RuntimePhase::Failed;
                inner.message = Some(message);
                inner.port = None;
                inner.child.take()
            } else {
                None
            }
        } else {
            None
        };
        if let Some(mut child) = child {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    fn fail_current(&self, message: String) {
        let generation = self
            .inner
            .lock()
            .map(|inner| inner.generation)
            .unwrap_or_default();
        self.fail(generation, message);
    }

    fn runtime_paths(&self) -> Result<(PathBuf, PathBuf), String> {
        if cfg!(debug_assertions) {
            let root = Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .ok_or_else(|| "Não foi possível localizar a raiz do projeto.".to_owned())?;
            let java = std::env::var_os("GODARD_JAVA_COMMAND")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from("java"));
            return Ok((java, root.join("backend/target/godard-stack.jar")));
        }
        let resources =
            self.app.path().resource_dir().map_err(|error| {
                format!("Não foi possível localizar os recursos internos: {error}")
            })?;
        Ok((
            resources.join("java-runtime/bin/java"),
            resources.join("godard-stack.jar"),
        ))
    }
}

fn new_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn send_shutdown(port: u16, token: &str) {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(500)) else {
        return;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
    let request = format!(
        "POST /internal/shutdown HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-Godard-Session: {token}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_ok() {
        let mut response = [0_u8; 128];
        let _ = stream.read(&mut response);
    }
}

#[tauri::command]
fn runtime_status(supervisor: State<'_, Arc<RuntimeSupervisor>>) -> RuntimeStatus {
    supervisor.status()
}

#[tauri::command]
fn retry_runtime(supervisor: State<'_, Arc<RuntimeSupervisor>>) -> Result<(), String> {
    supervisor.restart()
}

#[tauri::command]
fn update_status(app: AppHandle) -> UpdateStatus {
    let distribution = if cfg!(debug_assertions) {
        "development"
    } else if std::env::var_os("APPIMAGE").is_some() {
        "appimage"
    } else {
        "system_package"
    };
    UpdateStatus {
        distribution,
        configured: app
            .config()
            .plugins
            .0
            .get("updater")
            .is_some_and(|config| config.is_object()),
        version: app.package_info().version.to_string(),
    }
}

#[tauri::command]
fn restart_application(app: AppHandle) {
    app.request_restart();
}

#[tauri::command]
fn recover_basic(supervisor: State<'_, Arc<RuntimeSupervisor>>) -> Result<(), String> {
    let data = &supervisor.data_dir;
    let _ = fs::remove_file(data.join("data").join("godard-stack.db-wal"));
    let _ = fs::remove_file(data.join("data").join("godard-stack.db-shm"));
    if let Ok(entries) = fs::read_dir(data.join("runtime")) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let s = name.to_string_lossy();
            if s.starts_with("ready-") && s.ends_with(".json") {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn recover_intermediate(supervisor: State<'_, Arc<RuntimeSupervisor>>) -> String {
    let log_path = supervisor.data_dir.join("logs").join("core.log");
    let content = fs::read_to_string(&log_path).unwrap_or_default();
    let lines: Vec<&str> = content.lines().collect();
    let start = lines.len().saturating_sub(150);
    lines[start..].join("\n")
}

#[tauri::command]
fn recover_advanced(supervisor: State<'_, Arc<RuntimeSupervisor>>) -> Result<String, String> {
    let data = &supervisor.data_dir;
    let db = data.join("data").join("godard-stack.db");
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let backup = data
        .join("data")
        .join(format!("godard-stack.db.backup.{timestamp}"));
    if db.exists() {
        fs::copy(&db, &backup).map_err(|e| format!("Falha ao criar backup: {e}"))?;
    }
    let _ = fs::remove_file(&db);
    let _ = fs::remove_file(data.join("data").join("godard-stack.db-wal"));
    let _ = fs::remove_file(data.join("data").join("godard-stack.db-shm"));
    if let Ok(entries) = fs::read_dir(data.join("runtime")) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let s = name.to_string_lossy();
            if s.starts_with("ready-") && s.ends_with(".json") {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    Ok(backup.to_string_lossy().into_owned())
}

#[cfg(target_os = "linux")]
fn configure_linux_webview() {
    if std::env::var_os("WAYLAND_DISPLAY").is_none()
        || std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_some()
    {
        return;
    }

    let has_nvidia_graphics = fs::read_dir("/sys/class/drm")
        .ok()
        .into_iter()
        .flat_map(|entries| entries.flatten())
        .any(|entry| {
            fs::read_to_string(entry.path().join("device/vendor"))
                .is_ok_and(|vendor| vendor.trim().eq_ignore_ascii_case("0x10de"))
        });

    if has_nvidia_graphics {
        // Avoid a WebKitGTK/Wayland synchronization failure on NVIDIA systems.
        unsafe { std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1") };
    }
}

fn main() {
    #[cfg(target_os = "linux")]
    configure_linux_webview();

    let context = tauri::generate_context!();
    let updater_configured = context
        .config()
        .plugins
        .0
        .get("updater")
        .is_some_and(|config| config.is_object());
    let mut builder = tauri::Builder::default();
    if updater_configured {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }
    let app = builder
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let supervisor = RuntimeSupervisor::new(app.handle().clone())
                .map_err(|error| std::io::Error::other(error))?;
            if let Err(error) = supervisor.start() {
                supervisor.fail_current(error);
            }
            app.manage(supervisor);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_status,
            retry_runtime,
            update_status,
            restart_application,
            recover_basic,
            recover_intermediate,
            recover_advanced,
        ])
        .build(context)
        .expect("erro ao construir o aplicativo Godard Stack");
    app.run(|handle, event| {
        if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
            let supervisor = handle.state::<Arc<RuntimeSupervisor>>();
            supervisor.shutdown();
        }
    });
}
