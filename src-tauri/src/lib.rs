#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  use tauri::menu::{Menu, MenuItem};
  use tauri::tray::TrayIconBuilder;
  use tauri::Manager;

  tauri::Builder::default()
    .setup(|app| {
      let show_hide = MenuItem::with_id(app, "show-hide", "显示 / 隐藏", true, None::<&str>)?;
      let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show_hide, &quit])?;
      let icon = app.default_window_icon().cloned().expect("application icon is required");
      TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("Photo Desktop Pet")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "show-hide" => toggle_window(app.get_webview_window("main")),
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
