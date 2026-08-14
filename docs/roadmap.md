# Photo Desktop Pet — 路线图 / 还能干什么

> 维护方式：每完成一项，把状态从「待办」移到「已落地」，并附一行说明。
> 优先级：P0 核心闭环 > P1 可用性 > P2 分发/开源 > P3 增强。

## ✅ 已落地

| 项 | 说明 |
|---|---|
| Phase A 透明窗口 | Tauri 2 透明、无边框、置顶、skipTaskbar、系统托盘 |
| Phase B 引擎 | `engine.ts` 纯函数状态机：垂直重力/落地/起跳 + 概率状态机（idle↔walking、自发换向、偶尔跳跃）+ `mulberry32` seeded random + 屏幕绝对坐标（物理像素）|
| 拖拽（完整状态机） | `src-tauri/src/drag.rs` 独立模块：Idle/Pressed/Dragging 状态机，全局 `cursor_position()` + `GetAsyncKeyState(VK_LBUTTON)` 轮询（不依赖 MouseUp），offset 防跳动，可配置 dragThreshold，多显示器虚拟桌面边界 + 负坐标支持，加载时 clamp |
| Phase C 图片导入 | 托盘菜单「导入图片…」→ 文件选择器 → 校验格式/大小/magic bytes → 复制到 app-data 生成 UUID → 重启保留 → 「删除当前图片」 |
| 测试 | Vitest 单测 **15 项**（移动/边界/拖拽/暂停/clamp/有界性/确定性 + DPI 150% + 多显示器负坐标），`npm test` |
| 调研文档 | `docs/github-reference-research.md`（BongoCat / desktopPet / VPet / openpets 源码级参考） |
| Phase F（部分） | 本地 NSIS 打包成功（`Photo Desktop Pet_0.1.0_x64-setup.exe`）；CI workflow（`.github/workflows/ci.yml` + `release.yml`，push tag `v*` 触发）已写 |

## 📋 待办清单

### P1 — 可用性（下一步主攻）

- [ ] **Phase D：裁剪 / 缩放 / 锚点编辑器**（产品核心闭环的缺失环）
  - 预览 + crop/scale 控件 + 「feet anchor」贴地锚点
  - 预览与宠物窗口共用同一套 scale/anchor 计算（非破坏保存）
  - 参考：BongoCat 的 `behavior-modal` + `upload` 组件
  - 验收（GUIDE §4 Phase D）：用户能校正不完美的抠图，无需外部编辑；预览与宠物窗口同套计算

- [ ] **Phase E：托盘补全**
  - 加「暂停 / 继续」「设置」菜单项
  - 暂停时停止 requestAnimationFrame 动画循环（省电）
  - 验收（GUIDE §4 Phase E）：Paused 状态不使用连续动画循环

- [ ] **Phase E：交互反馈**
  - 点击宠物 → 气泡 / 弹跳；右键菜单
  - `prefers-reduced-motion` 支持（GUIDE 无障碍要求）
  - 点击穿透开关：`set_ignore_cursor_events`，托盘可恢复（opt-in、明显、可恢复）

### P2 — 分发 / 开源

- [ ] **Phase F 收尾**
  - 打 `v0.1.0` tag 触发 CI，验证从干净 checkout 构建出 NSIS 安装包
  - `tauri-plugin-updater` 自动更新
  - 无签名证书时诚实描述 SmartScreen（不绕过安全警告）
  - README 补 GIF/截图（非真人素材）+ 卸载说明

- [ ] **文档补齐**（GUIDE §7 开源前必备）
  - `CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`
  - `docs/development.md`（透明窗口手动 QA 清单）、`docs/privacy.md` 补删除步骤

- [ ] **开源发布**（每步前先征求确认——GUIDE §9）
  - 加 topics（windows/tauri/react/desktop-pet/privacy）、issue templates
  - release 说明（事实性：已知限制、安装/卸载、本地-only 声明）

### P3 — 可选增强

- [ ] **输入联动**：键盘/鼠标动作同步宠物反应（参考 BongoCat `useDevice.ts`/`useKeyPress.ts`）
- [ ] **多宠物 / 多显示器**：每屏一个实例（desktopPet 的多显示器模型）
- [ ] **帧动画**：同一张照片的不同 transform（bob/squash/stretch/镜像）当帧序列（desktopPet 精灵图范式）
- [ ] **插件化（远期）**：预留「行为 = 可插拔模块」的缝（openpets 插件 SDK 方向）

---

## 一句话优先级建议

P0 已闭环（透明窗口 + 引擎 + 拖拽 + 导入 + 打包）。下一步先做 **Phase D 裁剪/锚点编辑器**（补齐「照片 → 透明桌宠」的核心闭环，没有它普通照片只能显示成带背景的矩形），再补 **Phase E 托盘/交互**（暂停省电 + 点击反馈），最后 **P2 打包开源收尾**。P3 按兴趣挑。
