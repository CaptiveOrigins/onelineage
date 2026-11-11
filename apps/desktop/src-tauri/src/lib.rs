//! OneLineage for Mac: the window, the folder picker, and one bridge, `host_call`, to the app's Node host
//! (`host/main.ts`, bundled as `host.mjs`). The host runs the OneLineage packages unchanged and does all the
//! file work. It's started on the first request and stopped when the app quits. See ADR 0007.
//!
//! Only two programs can run from here, both fixed on this side: Node, and the bundled host script.
//! Nothing in the window can choose a program or a path to run.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::{Emitter, Manager, State};

struct Sidecar {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Default, Clone)]
struct Host(Arc<Mutex<Option<Sidecar>>>);

/// Node, from ONELINEAGE_NODE, the usual install places, or PATH. Node 22 or later is needed.
fn find_node() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ONELINEAGE_NODE") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
    }
    for p in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
    }
    std::env::var_os("PATH").and_then(|paths| std::env::split_paths(&paths).map(|d| d.join("node")).find(|p| p.is_file()))
}

/// The bundled host script: inside the app's resources when built, or beside the sources in development.
fn host_script(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(dir) = app.path().resource_dir() {
        let p = dir.join("host").join("host.mjs");
        if p.is_file() {
            return Some(p);
        }
    }
    let dev = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../host-dist/host.mjs"));
    dev.is_file().then_some(dev)
}

fn start(app: &tauri::AppHandle) -> Result<Sidecar, String> {
    let node = find_node().ok_or("OneLineage needs Node.js 22 or later on this Mac for now, and couldn’t find it. Install Node, or set ONELINEAGE_NODE to its path.")?;
    let script = host_script(app).ok_or("The app’s file helper (host.mjs) is missing. Run `pnpm build:host` in apps/desktop.")?;
    let state_dir = app.path().home_dir().map_err(|e| e.to_string())?.join("Library").join("Application Support").join("OneLineage");
    let mut child = Command::new(node)
        .arg(script)
        .env("ONELINEAGE_STATE_DIR", state_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|e| format!("Couldn’t start the app’s file helper: {e}"))?;
    let stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = BufReader::new(child.stdout.take().ok_or("no stdout")?);
    Ok(Sidecar { child, stdin, stdout, next_id: 1 })
}

fn exchange(sc: &mut Sidecar, method: &str, params: &Value) -> Result<Value, String> {
    let id = sc.next_id;
    sc.next_id += 1;
    let line = json!({ "id": id, "method": method, "params": params }).to_string();
    writeln!(sc.stdin, "{line}").and_then(|_| sc.stdin.flush()).map_err(|e| format!("The app’s file helper stopped: {e}"))?;
    let mut reply = String::new();
    if sc.stdout.read_line(&mut reply).map_err(|e| e.to_string())? == 0 {
        return Err("The app’s file helper stopped unexpectedly.".into());
    }
    let v: Value = serde_json::from_str(&reply).map_err(|e| format!("The app’s file helper sent something unreadable: {e}"))?;
    if v.get("id").and_then(Value::as_u64) != Some(id) {
        return Err("The app’s file helper answered out of order.".into());
    }
    match v.get("error").and_then(Value::as_str) {
        Some(msg) => Err(msg.to_string()),
        None => Ok(v.get("result").cloned().unwrap_or(Value::Null)),
    }
}

/// Send one request to the host. Requests run one at a time, off the main thread, so the window stays responsive.
#[tauri::command]
async fn host_call(app: tauri::AppHandle, host: State<'_, Host>, method: String, params: Value) -> Result<Value, String> {
    if method.is_empty() || !method.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err("Unknown request.".into());
    }
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = host.0.lock().map_err(|_| "The app’s file helper is in a bad state. Restart OneLineage.".to_string())?;
        if guard.is_none() {
            *guard = Some(start(&app)?);
        }
        let result = exchange(guard.as_mut().expect("started above"), &method, &params);
        // If the helper died, drop it so the next request starts a fresh one.
        if let Some(sc) = guard.as_mut() {
            if matches!(sc.child.try_wait(), Ok(Some(_))) {
                *guard = None;
            }
        }
        result
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(Host::default())
        .invoke_handler(tauri::generate_handler![host_call])
        // The standard Mac menus, plus View > Privacy (Cmd+Shift+P), so privacy can be flipped from the menu bar.
        // The window does the flipping through the host, the same way as the toolbar button.
        .menu(|handle| {
            let menu = Menu::default(handle)?;
            let privacy = MenuItem::with_id(handle, "privacy", "Privacy", true, Some("CmdOrCtrl+Shift+P"))?;
            let view = Submenu::with_items(handle, "View", true, &[&privacy])?;
            menu.append(&view)?;
            Ok(menu)
        })
        .on_menu_event(|app, event| {
            if event.id() == "privacy" {
                let _ = app.emit("privacy-toggle", ());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while starting OneLineage")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                // Stop the host with the app.
                if let Ok(mut g) = app.state::<Host>().0.lock() {
                    *g = None;
                }
            }
        });
}
