use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WebviewWindow};

use crate::{load_state, write_state};

static DRAG_ACTIVE: AtomicBool = AtomicBool::new(false);

const DEFAULT_THRESHOLD: f64 = 3.0;
const VK_LBUTTON: i32 = 0x01;

/// 拖拽状态机状态。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(dead_code)]
pub enum DragState {
    Idle, // 隐式状态：无拖拽线程运行时（DRAG_ACTIVE == false）
    Pressed,
    Dragging,
}

/// 拖拽上下文：按下位置、点击偏移、阈值。
struct DragContext {
    press_mouse: (f64, f64),
    offset: (f64, f64),
    threshold: f64,
}

/// 鼠标左键是否按下（Windows GetAsyncKeyState，不依赖 MouseUp 事件）。
#[cfg(target_os = "windows")]
fn is_left_button_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
    unsafe { GetAsyncKeyState(VK_LBUTTON) as u16 & 0x8000 != 0 }
}

#[cfg(not(target_os = "windows"))]
fn is_left_button_down() -> bool {
    false
}

/// 计算虚拟桌面边界（所有显示器并集），返回 (min_x, min_y, max_x, max_y) 物理坐标。
fn virtual_screen_bounds(app: &AppHandle) -> Option<(f64, f64, f64, f64)> {
    let monitors = app.available_monitors().ok()?;
    if monitors.is_empty() {
        return None;
    }
    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = f64::MIN;
    let mut max_y = f64::MIN;
    for m in monitors {
        let pos = m.position();
        let size = m.size();
        min_x = min_x.min(pos.x as f64);
        min_y = min_y.min(pos.y as f64);
        max_x = max_x.max(pos.x as f64 + size.width as f64);
        max_y = max_y.max(pos.y as f64 + size.height as f64);
    }
    Some((min_x, min_y, max_x, max_y))
}

/// MouseDown：进入 PRESSED，记录按下位置与偏移，启动拖拽循环。
#[tauri::command]
pub fn begin_press(window: WebviewWindow, threshold: Option<f64>) -> Result<(), String> {
    if DRAG_ACTIVE.swap(true, Ordering::SeqCst) {
        return Ok(()); // 已在拖拽中，忽略重复触发
    }
    let mouse = match window.cursor_position() {
        Ok(m) => m,
        Err(e) => {
            DRAG_ACTIVE.store(false, Ordering::SeqCst);
            return Err(e.to_string());
        }
    };
    let pos = match window.outer_position() {
        Ok(p) => p,
        Err(e) => {
            DRAG_ACTIVE.store(false, Ordering::SeqCst);
            return Err(e.to_string());
        }
    };
    let ctx = DragContext {
        press_mouse: (mouse.x, mouse.y),
        offset: (mouse.x - pos.x as f64, mouse.y - pos.y as f64),
        threshold: threshold.unwrap_or(DEFAULT_THRESHOLD),
    };
    log::info!(
        "[drag] PRESSED: mouse=({:.0},{:.0}) offset=({:.0},{:.0}) threshold={}",
        mouse.x, mouse.y, ctx.offset.0, ctx.offset.1, ctx.threshold
    );
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || drag_loop(app, window, ctx));
    Ok(())
}

fn drag_loop(app: AppHandle, window: WebviewWindow, ctx: DragContext) {
    let mut state = DragState::Pressed;
    loop {
        if !is_left_button_down() {
            break; // 左键释放，无论当前状态如何都结束
        }
        let Ok(mouse) = window.cursor_position() else {
            break;
        };
        match state {
            DragState::Pressed => {
                let dx = mouse.x - ctx.press_mouse.0;
                let dy = mouse.y - ctx.press_mouse.1;
                if (dx * dx + dy * dy).sqrt() >= ctx.threshold {
                    state = DragState::Dragging;
                    log::info!("[drag] DRAGGING (moved >= {}px)", ctx.threshold);
                }
            }
            DragState::Dragging => {
                let new_x = mouse.x - ctx.offset.0;
                let new_y = mouse.y - ctx.offset.1;
                let (cx, cy) = clamp_to_virtual_screen(&app, &window, new_x, new_y);
                let _ = window.set_position(PhysicalPosition::new(cx as i32, cy as i32));
            }
            DragState::Idle => {}
        }
        std::thread::sleep(Duration::from_millis(16));
    }
    // 完整清理：无论正常还是异常结束，都必须释放状态
    DRAG_ACTIVE.store(false, Ordering::SeqCst);
    if state == DragState::Dragging {
        if let Ok(pos) = window.outer_position() {
            log::info!("[drag] ENDED: pos=({},{})", pos.x, pos.y);
            if let Err(e) = persist_position(&app, pos.x as f64, pos.y as f64) {
                log::warn!("[drag] persist failed: {e}");
            }
            let _ = app.emit("drag-ended", (pos.x, pos.y));
        }
    }
}

/// 边界策略：VIRTUAL_SCREEN —— clamp 到所有显示器并集，允许跨屏但不拖出虚拟桌面。
fn clamp_to_virtual_screen(app: &AppHandle, window: &WebviewWindow, x: f64, y: f64) -> (f64, f64) {
    let Some((min_x, min_y, max_x, max_y)) = virtual_screen_bounds(app) else {
        return (x, y);
    };
    let size = window.outer_size().unwrap_or(tauri::PhysicalSize::new(0, 0));
    let w = size.width as f64;
    let h = size.height as f64;
    let cx = x.clamp(min_x, (max_x - w).max(min_x));
    let cy = y.clamp(min_y, (max_y - h).max(min_y));
    (cx, cy)
}

/// 持久化拖拽后的窗口屏幕绝对坐标（物理像素）。
fn persist_position(app: &AppHandle, x: f64, y: f64) -> Result<(), String> {
    let mut state = load_state(app)?.unwrap_or_default();
    state.x = Some(x);
    state.y = Some(y);
    write_state(app, &state)
}
