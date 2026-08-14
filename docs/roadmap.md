# Photo Desktop Pet — 路线图 / 还能干什么

> 维护方式：每完成一项，把状态从「待办」移到「已落地」，并附一行说明。
> 优先级：P0 核心闭环 > P1 可用性 > P2 分发/开源 > P3 增强。

## ✅ 已落地

| 项 | 说明 |
|---|---|
| Phase A 透明窗口 | Tauri 2 透明、无边框、置顶、skipTaskbar、系统托盘 |
| Phase C 图片导入 | 托盘菜单「导入图片…」→ 弹文件选择器 → 校验格式/大小/magic bytes → 复制到 app-data 生成 UUID → 重启保留 → 「删除当前图片」 |
| 引擎基础 | `engine.ts` 纯函数状态机（idle/walking/dragging/paused）+ 水平移动 + 边界反弹 + 时间步长 clamp |
| 调研文档 | `docs/github-reference-research.md`（BongoCat / desktopPet / VPet / openpets 源码级参考） |

## 📋 待办清单

### P0 ✅ 已完成（2026-08-14）

- ✅ 引擎升级：垂直维度（重力/落地/起跳）+ 概率状态机（idle↔walking、自发换向、偶尔跳跃）+ `mulberry32` seeded random
- ✅ 拖拽 + 位置持久化：`startDragging` 拖窗口 → 结束后读 `outerPosition` 写回 app-data JSON，重启恢复
- ✅ 多显示器 / 任务栏边界：`get_work_area` 命令返回当前显示器工作区（已排除任务栏），注入引擎 bounds
- ✅ 测试：Vitest 单测 11 项（移动/边界/拖拽/暂停/clamp/有界性/确定性），`npm test`

### P1 — 可用性

- [ ] **Phase E：托盘补全**
  - 加「暂停 / 继续」「设置」菜单项
  - 暂停时停止 requestAnimationFrame 动画循环（省电）
  - 参考：BongoCat `useTray.ts`、你现有 `lib.rs` 的托盘结构

- [ ] **Phase E：交互反馈**
  - 点击宠物 → 气泡 / 弹跳；右键菜单
  - `prefers-reduced-motion` 支持（GUIDE 无障碍要求）

- [ ] **Phase D：裁剪 / 缩放 / 锚点编辑器**
  - 预览 + crop/scale 控件 + 「feet anchor」贴地锚点
  - 预览与宠物窗口共用同一套 scale/anchor 计算（非破坏保存）
  - 参考：BongoCat 的 `behavior-modal` + `upload` 组件

- [ ] **文档补齐**（GUIDE §7 开源前必备）
  - `CONTRIBUTING.md`、`SECURITY.md`、`CODE_OF_CONDUCT.md`
  - `docs/development.md`（透明窗口手动 QA 清单）、`docs/privacy.md` 补删除步骤

### P2 — 分发 / 开源

- [ ] **Phase F：打包与更新**
  - GitHub Actions Windows 构建 + NSIS 安装包
  - `tauri-plugin-updater` 自动更新
  - 无签名证书时诚实描述 SmartScreen（不绕过安全警告）
  - 参考：BongoCat 的 `bundle.targets` + updater 配置

- [ ] **开源发布**（每步前先征求你确认——GUIDE §9）
  - 建 GitHub 仓库 → push → 加 topics（windows/tauri/react/desktop-pet/privacy）
  - README 补 GIF/截图（用非真人素材）+ 卸载说明
  - 打 `v0.1.0` tag → CI 产物 → release 说明

### P3 — 可选增强

- [ ] **输入联动**：键盘/鼠标动作同步宠物反应（参考 BongoCat `useDevice.ts`/`useKeyPress.ts`）
- [ ] **点击穿透开关**：`set_ignore_cursor_events`，托盘可恢复（GUIDE Phase E 要求 opt-in）
- [ ] **多宠物 / 多显示器**：每屏一个实例（desktopPet 的多显示器模型）
- [ ] **帧动画**：同一张照片的不同 transform（bob/squash/stretch/镜像）当帧序列（desktopPet 精灵图范式）
- [ ] **插件化（远期）**：预留「行为 = 可插拔模块」的缝（openpets 插件 SDK 方向）

---

## 一句话优先级建议

先做 **P0 拖拽+持久化**（让桌宠「能被摆到想要的位置并记住」），再做 **P0 引擎升级 + 测试**（让行为更自然且可验证），然后 **P1 托盘/交互**，最后 **P2 打包开源**。P3 按兴趣挑。
