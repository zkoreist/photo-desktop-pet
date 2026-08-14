use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

mod drag;

const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10 MB

/// 裁剪区域（相对原图 0-1 的比例）。
#[derive(Serialize, Deserialize, Clone, Copy, Default)]
pub(crate) struct CropRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// 持久化的宠物状态：图片引用 + 窗口位置 + 裁剪/缩放/锚点（可选）。
#[derive(Serialize, Deserialize, Clone, Default)]
pub(crate) struct PetState {
    file_name: Option<String>,
    display_name: Option<String>,
    path: Option<String>,
    x: Option<f64>,
    y: Option<f64>,
    direction: Option<i32>,
    crop: Option<CropRect>,
    scale: Option<f64>,
    anchor_x: Option<f64>,
    anchor_y: Option<f64>,
}

#[derive(Serialize)]
struct WorkArea {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    scale: f64,
}

fn pets_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))?
        .join("pets");
    std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建目录: {e}"))?;
    Ok(dir)
}

fn state_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))?;
    Ok(dir.join("pet_state.json"))
}

/// 读取图片像素尺寸（只解码头部，不加载全图）。
fn image_dimensions(path: &std::path::Path) -> Result<(u32, u32), String> {
    image::image_dimensions(path).map_err(|e| format!("无法读取图片尺寸: {e}"))
}

/// 计算裁剪+缩放后的窗口尺寸（逻辑像素，与图片像素 1:1）。
/// 无裁剪/缩放配置时返回 (0, 0)。
fn computed_window_size(state: &PetState) -> Result<(f64, f64), String> {
    let (crop, scale) = match (state.crop, state.scale) {
        (Some(c), Some(s)) => (c, s),
        _ => return Ok((0.0, 0.0)),
    };
    if !scale.is_finite() || scale <= 0.0 || crop.width <= 0.0 || crop.height <= 0.0 {
        return Err("裁剪/缩放参数无效".into());
    }
    let path = state.path.as_deref().ok_or("当前没有已导入的图片")?;
    let (w0, h0) = image_dimensions(std::path::Path::new(path))?;
    let fw = (w0 as f64 * crop.width * scale).round().max(1.0);
    let fh = (h0 as f64 * crop.height * scale).round().max(1.0);
    Ok((fw, fh))
}

/// 根据 state 里的裁剪/缩放配置把主窗口调整到目标尺寸；无配置时保持默认。
fn apply_window_size(app: &tauri::AppHandle) -> Result<(), String> {
    let state = load_state(app)?.unwrap_or_default();
    let Ok((fw, fh)) = computed_window_size(&state) else {
        return Ok(());
    };
    if fw <= 0.0 || fh <= 0.0 {
        return Ok(());
    }
    if let Some(win) = app.get_webview_window("main") {
        use tauri::Size;
        win.set_size(Size::Logical(tauri::LogicalSize::new(fw, fh)))
            .map_err(|e| format!("设置窗口尺寸失败: {e}"))?;
    }
    Ok(())
}

/// 校验扩展名白名单、大小上限与真实图片内容（magic bytes）。
fn validate_image(path: &std::path::Path) -> Result<(), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp") {
        return Err("只支持 PNG、JPG、JPEG 或 WebP 图片".into());
    }
    let meta = std::fs::metadata(path).map_err(|e| format!("无法读取文件: {e}"))?;
    if meta.len() > MAX_FILE_SIZE {
        return Err("图片超过 10 MB 上限".into());
    }
    let bytes = std::fs::read(path).map_err(|e| format!("无法读取文件: {e}"))?;
    let valid = match ext.as_str() {
        "png" => bytes.len() >= 8 && bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "jpg" | "jpeg" => bytes.len() >= 3 && bytes.starts_with(b"\xff\xd8\xff"),
        "webp" => bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP",
        _ => false,
    };
    if !valid {
        return Err("文件内容不是有效的图片格式".into());
    }
    Ok(())
}

/// 阻塞式导入流程：必须在非主线程调用（内部使用 blocking_pick_file）。
fn import_blocking(app: &tauri::AppHandle) -> Result<PetState, String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("图片", &["png", "jpg", "jpeg", "webp"])
        .blocking_pick_file();
    let Some(file) = picked else {
        return Err("未选择文件".into());
    };
    let source = file.into_path().map_err(|e| e.to_string())?;
    let display_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("pet")
        .to_string();
    validate_image(&source)?;
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png")
        .to_ascii_lowercase();
    let file_name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let dest = pets_dir(app)?.join(&file_name);
    std::fs::copy(&source, &dest).map_err(|e| format!("复制图片失败: {e}"))?;
    let mut state = load_state(app)?.unwrap_or_default();
    state.file_name = Some(file_name);
    state.display_name = Some(display_name);
    state.path = Some(dest.to_string_lossy().to_string());
    write_state(app, &state)?;
    Ok(state)
}

pub(crate) fn write_state(app: &tauri::AppHandle, state: &PetState) -> Result<(), String> {
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    std::fs::write(state_file(app)?, json).map_err(|e| format!("保存状态失败: {e}"))
}

pub(crate) fn load_state(app: &tauri::AppHandle) -> Result<Option<PetState>, String> {
    let path = state_file(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("读取状态失败: {e}"))?;
    let state: PetState =
        serde_json::from_str(&text).map_err(|e| format!("解析状态失败: {e}"))?;
    Ok(Some(state))
}

/// 删除 app-data 内的一张图片；若正是当前宠物则一并清空图片引用（保留位置）。
fn delete_blocking(app: &tauri::AppHandle, file_name: &str) -> Result<(), String> {
    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
    {
        return Err("非法文件名".into());
    }
    let path = pets_dir(app)?.join(file_name);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("删除失败: {e}"))?;
    }
    if let Ok(Some(mut state)) = load_state(app) {
        if state.file_name.as_deref() == Some(file_name) {
            state.file_name = None;
            state.display_name = None;
            state.path = None;
            write_state(app, &state)?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn import_pet_image(app: tauri::AppHandle) -> Result<PetState, String> {
    tauri::async_runtime::spawn_blocking(move || import_blocking(&app))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn delete_pet_image(app: tauri::AppHandle, file_name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || delete_blocking(&app, &file_name))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn load_pet_state(app: tauri::AppHandle) -> Result<Option<PetState>, String> {
    load_state(&app)
}

/// 返回当前显示器的工作区（已排除任务栏），单位物理像素。
#[tauri::command]
fn get_work_area(window: tauri::WebviewWindow) -> Result<WorkArea, String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or(window.primary_monitor().map_err(|e| e.to_string())?)
        .ok_or_else(|| "未检测到显示器".to_string())?;
    let wa = monitor.work_area();
    let scale = monitor.scale_factor();
    log::info!(
        "[diagnostic] get_work_area: scale={scale}, work_area=({}, {}, {}x{})",
        wa.position.x, wa.position.y, wa.size.width, wa.size.height
    );
    Ok(WorkArea {
        x: wa.position.x as f64,
        y: wa.position.y as f64,
        width: wa.size.width as f64,
        height: wa.size.height as f64,
        scale,
    })
}

#[tauri::command]
fn set_pet_position(window: tauri::WebviewWindow, x: f64, y: f64) -> Result<(), String> {
    use tauri::Position;
    log::info!("[diagnostic] set_pet_position: ({x}, {y})");
    window
        .set_position(Position::Physical(tauri::PhysicalPosition::new(
            x as i32, y as i32,
        )))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_pet_position(window: tauri::WebviewWindow) -> Result<(i32, i32), String> {
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    log::info!("[diagnostic] get_pet_position: ({}, {})", pos.x, pos.y);
    Ok((pos.x, pos.y))
}

/// 保存裁剪/缩放/锚点配置，并把主窗口调整到对应尺寸。
#[tauri::command]
fn save_pet_config(
    app: tauri::AppHandle,
    crop: CropRect,
    scale: f64,
    anchor_x: f64,
    anchor_y: f64,
) -> Result<(), String> {
    let crop = CropRect {
        x: crop.x.clamp(0.0, 1.0),
        y: crop.y.clamp(0.0, 1.0),
        width: crop.width.clamp(0.0, 1.0),
        height: crop.height.clamp(0.0, 1.0),
    };
    if crop.width <= 0.0 || crop.height <= 0.0 {
        return Err("裁剪区域无效".into());
    }
    if !scale.is_finite() || scale <= 0.0 {
        return Err("缩放比例无效".into());
    }

    let mut state = load_state(&app)?.unwrap_or_default();
    if state.path.is_none() {
        return Err("当前没有已导入的图片".into());
    }
    state.crop = Some(crop);
    state.scale = Some(scale);
    state.anchor_x = Some(anchor_x.clamp(0.0, 1.0));
    state.anchor_y = Some(anchor_y.clamp(0.0, 1.0));
    write_state(&app, &state)?;
    apply_window_size(&app)?;
    let _ = app.emit("pet-changed", ());
    Ok(())
}

/// 打开编辑器窗口。
#[tauri::command]
fn open_editor(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("editor") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 关闭编辑器窗口（隐藏，不销毁）。
#[tauri::command]
fn close_editor(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("editor") {
        let _ = win.hide();
    }
    Ok(())
}

/// 直接设置主窗口尺寸（逻辑像素）。前端在图片尺寸已知后调用，消除启动竞态。
#[tauri::command]
fn set_window_size(app: tauri::AppHandle, width: f64, height: f64) -> Result<(), String> {
    if width <= 0.0 || height <= 0.0 || !width.is_finite() || !height.is_finite() {
        return Err("窗口尺寸无效".into());
    }
    if let Some(win) = app.get_webview_window("main") {
        use tauri::Size;
        win.set_size(Size::Logical(tauri::LogicalSize::new(width, height)))
            .map_err(|e| format!("设置窗口尺寸失败: {e}"))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::TrayIconBuilder;

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            import_pet_image,
            delete_pet_image,
            load_pet_state,
            get_work_area,
            set_pet_position,
            get_pet_position,
            save_pet_config,
            open_editor,
            close_editor,
            set_window_size,
            drag::begin_press
        ])
        .setup(|app| {
            let show_hide = MenuItem::with_id(app, "show-hide", "显示 / 隐藏", true, None::<&str>)?;
            let import = MenuItem::with_id(app, "import", "导入图片…", true, None::<&str>)?;
            let edit = MenuItem::with_id(app, "edit", "编辑图片…", true, None::<&str>)?;
            let delete = MenuItem::with_id(app, "delete", "删除当前图片", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_hide, &import, &edit, &delete, &quit])?;
            let icon = app.default_window_icon().cloned().expect("application icon is required");
            TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .tooltip("Photo Desktop Pet")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show-hide" => toggle_window(app.get_webview_window("main")),
                    "edit" => {
                        let _ = open_editor(app.clone());
                    }
                    "import" => {
                        let handle = app.clone();
                        tauri::async_runtime::spawn_blocking(move || match import_blocking(&handle) {
                            Ok(_) => {
                                let _ = handle.emit("pet-changed", ());
                            }
                            Err(e) => {
                                let _ = handle.emit("pet-error", e);
                            }
                        });
                    }
                    "delete" => {
                        let handle = app.clone();
                        tauri::async_runtime::spawn_blocking(move || {
                            let to_delete = match load_state(&handle) {
                                Ok(Some(state)) => state.file_name,
                                _ => None,
                            };
                            match to_delete {
                                Some(name) => match delete_blocking(&handle, &name) {
                                    Ok(()) => {
                                        let _ = handle.emit("pet-changed", ());
                                    }
                                    Err(e) => {
                                        let _ = handle.emit("pet-error", e);
                                    }
                                },
                                None => {
                                    let _ = handle.emit("pet-error", "当前没有已导入的图片");
                                }
                            }
                        });
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // 启动时按已保存的裁剪/缩放配置调整主窗口尺寸
            let handle = app.handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                if let Err(e) = apply_window_size(&handle) {
                    log::warn!("[diagnostic] apply_window_size: {e}");
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn toggle_window(window: Option<tauri::WebviewWindow>) {
    if let Some(window) = window {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}
