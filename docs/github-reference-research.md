# GitHub 桌面宠物项目调研 & Photo Desktop Pet 补充完善方案

> 调研日期：2026-08-14
> 方法：按 `find-skills` 技能流程 —— 场景理解 → GitHub 多关键词搜索 → 深读最相关项目源码 → gap 分析
> 搜索账号：`gh` CLI（zkoreist），关键词：`desktop pet` / `desktop-pet` / `shimeji` / `desktop mascot` / `virtual pet` / `topic:desktop-pet` / `tauri pet`

---

## 一、结论速览

1. **BongoCat（22.5k★）本身就是 Tauri 桌宠**（前端 Vue + 后端 Tauri/Rust），技术栈与本项目最对口，其透明窗口配置、双窗口、平台分离插件、自定义模型导入、离线隐私，几乎全部可参考。
2. **Tauri 桌宠是近乎空白的细分**：`tauri pet` 全站仅 1 个 0★ 项目。本项目有机会成为「Tauri 2 桌宠」领域的参考实现，这是天然差异化。
3. 桌宠生态可分成四类，本项目（照片→本地隐私桌宠）与「AI 桌宠」「Live2D/VRM 桌宠」定位不同，应坚持本地优先、隐私优先，**不必跟风接 LLM**。
4. 你的 `DESKTOP_PET_AGENT_GUIDE.md` 已是一份高质量 runbook，本报告在其 Phase 结构上给出「每个 Phase 参考谁、补什么」。

---

## 二、GitHub 桌宠生态地图（按定位分类）

| 类别 | 代表项目 | ★ | 技术栈 | 与本项目关系 |
|---|---|---|---|---|
| **Tauri 桌宠** | [ayangweb/BongoCat](https://github.com/ayangweb/BongoCat) | 22.5k | Tauri 2 + Vue | ⭐ 最对口，直接参考 |
| **经典桌宠（帧动画+状态机）** | [Adrianotiger/desktopPet](https://github.com/Adrianotiger/desktopPet) (eSheep) | 1.1k | C# WPF | 动画/状态机/环境感知范式 |
| **成熟桌宠框架** | [LorisYounger/VPet](https://github.com/LorisYounger/VPet) | 6.6k | C# WPF | 动画矩阵 + MOD + 插件架构 |
| **本地优先伴侣平台** | [alvinunreal/openpets](https://github.com/alvinunreal/openpets) | 1.1k | TypeScript | 插件 SDK + 产品化方向 |
| 桌面 mascot | [MidraLab/uDesktopMascot](https://github.com/MidraLab/uDesktopMascot) | 352 | C# | 交互参考 |
| 捣蛋宠物 | [Kritzkingvoid/Desktop_Gremlin](https://github.com/Kritzkingvoid/Desktop_Gremlin) | 550 | C# WPF | 行为设计参考 |
| AI 桌宠（跟风方向，不推荐） | rullerzhou-afk/clawd-on-desk 等 | 5.9k | JS | 定位不同，仅观察 |
| Shimeji 系 | pixelomer/Shijima-Qt 等 | ~200 | C++/Java | 桌宠鼻祖，历史参考 |

> 说明：上表为调研快照，★ 数随时间变化，仅供相对量级判断。

---

## 三、重点参考项目深度分析

### 3.1 BongoCat — Tauri 桌宠（技术栈最对口）

**为什么看它**：唯一高星 Tauri 桌宠，解决了「跨平台透明置顶宠物窗口 + 输入联动 + 自定义模型 + 离线隐私」全链路。

**可直接借鉴的点**：

1. **透明窗口配置**（`src-tauri/tauri.conf.json`）——你的配置已基本到位，可补两个字段：
   ```json
   { "label": "main", "alwaysOnTop": true, "transparent": true,
     "decorations": false, "acceptFirstMouse": true, "skipTaskbar": true,
     "shadow": false, "maximizable": false }
   ```
   - `acceptFirstMouse` 让窗口第一次点击即响应（无需先聚焦），对「点一下就拖拽」的桌宠很重要。

2. **双窗口架构**：`main`（宠物窗）+ `preference`（设置窗，`titleBarStyle: Overlay, hiddenTitle: true, skipTaskbar: true`）。你目前只有一个窗口，导入/设置 UI 是塞在同一个 React 路由里。**建议**：宠物窗与设置窗分离，宠物窗保持最小透明，设置窗是普通可聚焦窗口。

3. **平台分离的 Rust 插件**（`src-tauri/src/plugins/window/src/commands/{windows,macos,linux}.rs`）：把「窗口置顶/穿透/贴边」等平台差异操作封装成插件命令，前端统一 invoke。你的 `toggle_window` 目前是裸函数，后续加多显示器/任务栏边界、click-through 时，建议同样抽成独立命令模块。

4. **输入监听 composables**（`src/composables/useDevice.ts`、`useKeyPress.ts`、`useGamepad.ts`）：监听全局键盘/鼠标/手柄事件驱动宠物动作。你目前没有输入联动，可作为可选交互增强（例如：鼠标移动时宠物视线跟随，键盘敲击时宠物弹跳）。

5. **自定义模型导入**（`src/composables/useModel.ts` + `src/pages/preference/components/model/components/upload/index.vue`）：导入 → 校验 → 存入本地 → 预览帧。对应你的 Phase C/D，组件结构可直接参照。

6. **离线 + 隐私**：README 明确「完全开源、不收集任何数据、支持离线」。与本项目定位一致，可作为对外话术参考。

### 3.2 desktopPet (eSheep) — 帧动画 + 状态机 + 环境感知（范式最成熟）

**为什么看它**：桌宠鼻祖 eSheep 复刻，用一份 `animations.xml` 定义了完整的「精灵图帧动画 + 概率状态机 + 环境感知」模型，这是本项目最该借鉴的引擎设计范式。

**`animations.xml` 提炼出的范式**（`Pets/esheep64/animations.xml`）：

1. **精灵图**：`<tilesx>16</tilesx><tilesy>11</tilesy>` + 一张透明 PNG，按帧切分。你目前是「整张照片 + scaleX 镜像」，**建议**：即便用照片，也可引入「帧序列」概念——同一张照片的不同 transform（bob/squash/stretch/镜像）当作不同帧。

2. **概率状态机**：
   ```xml
   <sequence repeat="20" repeatfrom="0">
     <frame>2</frame><frame>3</frame>
     <next probability="2" only="window">11</next>
     <next probability="90" only="none">1</next>
     <next probability="50" only="taskbar">50</next>
   </sequence>
   <border>
     <next probability="100" only="none">2</next>
     <next probability="20" only="window">43</next>
   </border>
   ```
   关键洞察：**状态转移带 `only="window|taskbar|none|vertical"` 环境条件 + `probability` 权重**。即宠物能感知「在窗口上 / 在任务栏上 / 悬空 / 贴边」并据此选择下一动作。你现在的引擎只有「左右撞墙反弹」，可升级为「概率 + 环境」驱动（idle 一段时间→随机决定走/停/换向；贴边→选择爬墙或转身）。

3. **生成位置**用变量：`<x>screenW+10</x>`、`<y>areaH-imageH</y>`、`<x>random*(screenW-imageW-50)/100+25</x>`——支持多显示器与工作区尺寸。对应你的 GUIDE「bounce safely inside the selected display」与「survive monitor resolution changes」。

### 3.3 VPet — 动画矩阵 + MOD + 插件（体系最完整）

**为什么看它**：最成熟的桌宠框架，「32 种 × 4 状态 × 3 类型」动画，创意工坊 + 代码插件（可挂 l2d/spine），Core 可独立内置到任意 WPF 应用。

**可借鉴**：
- **状态 × 动画矩阵**：用「状态（正常/生病/…）× 动作（摸头/提起/爬墙/…）」二维矩阵组织动画，而不是一维 if-else。你未来若从「照片」扩展到「多表情/多动作」，用矩阵组织状态最清晰。
- **Core 与 UI 分离**：`VPet-Simulator.Core` 是纯逻辑，可独立内置。你的 `engine.ts` 已经做到了纯逻辑分离（✅ 已符合这个最佳实践），保持即可。
- **MOD/创意工坊**：让用户自造形象，是桌宠留存的核心。你的「照片」天然就是「人人都能自定义形象」——这是比 VPet 更轻的「MOD」，可作为卖点。

### 3.4 openpets — 本地优先 + 插件 SDK（产品化方向）

**为什么看它**：定位「local-first desktop companion platform」，插件 SDK v3 提供沙箱 JS/TS runtime + permissions/quotas/storage/schedules/events/notifications，多语言 README，官方插件目录（专注计时/提醒/喝水/待办）。

**可借鉴**：
- **插件化是远期方向**：当前 MVP 阶段不必做，但架构上预留「行为 = 可插拔模块」的缝（你的 `engine.ts` 纯函数 + 显式状态已天然支持）。
- **多语言文档**：项目早期就做多语言 README + 隐私说明，对开源传播有帮助。

---

## 四、Photo Desktop Pet gap 分析 & 逐 Phase 补充方案

对照 `DESKTOP_PET_AGENT_GUIDE.md` 的 Phase 与当前代码：

| Phase | 现状 | 差距 | 参考 |
|---|---|---|---|
| A 透明窗口 | ✅ 完成 | 可补 `acceptFirstMouse`、click-through 开关 | BongoCat |
| B 引擎 | 🟡 基础（仅水平+反弹） | 垂直维度、概率状态机、拖拽、位置持久化、多显示器/任务栏边界 | desktopPet / BongoCat |
| C 导入 | 🔴 仅浏览器预览 | 复制到 app-data + 生成 ID + 删除 | BongoCat / GUIDE |
| D 裁剪缩放锚点 | 🔴 未做 | crop/scale + feet anchor 编辑器 | BongoCat behavior UI |
| E 交互+托盘 | 🟡 托盘仅 2 项 | Pause/Resume、Settings、点击反馈、右键、reduced-motion | BongoCat useTray |
| F 分发 | 🔴 未做 | CI + NSIS 安装包 + updater + 签名诚实说明 | BongoCat bundle |

### Phase A（透明窗口）——补 2 个字段 + 1 个开关

`src-tauri/tauri.conf.json` 的 main 窗口补：
```json
"acceptFirstMouse": true,
"maximizable": false
```
可选加 click-through（穿透）能力，Windows 下用 Rust 命令：
```rust
use tauri::WebviewWindow;
fn set_click_through(window: &WebviewWindow, on: bool) {
    let _ = window.set_ignore_cursor_events(on);
}
```
> 穿透开关必须能在托盘菜单恢复（GUIDE 已要求「opt-in、可恢复」）。

### Phase B（引擎）——从「反弹」升级到「概率状态机」

当前 `engine.ts` 只有 `idle/walking/dragging/paused` + 水平反弹。建议：

1. **补垂直维度 + 上下边界**（现有只有 x 方向）：
   ```ts
   // 增加 y 坐标、上下边界反弹（对应 desktopPet 的 vertical border）
   ```

2. **概率状态转移**（引入 seeded random，测试可复现）：
   ```ts
   type Mode = 'idle' | 'walking' | 'dragging' | 'paused' | 'bouncing'
   // tick 内：按概率在 idle ↔ walking 间切换、随机换向、偶尔 bounce
   // 参考 desktopPet 的 <next probability=...> 语义
   ```

3. **拖拽落地**（GUIDE 要求「drag 结束后才持久化」）：
   ```ts
   // mousedown → mode='dragging'（禁用自主移动）
   // mousemove → 更新 x/y（clamp 到 bounds）
   // mouseup   → mode 恢复 + 触发位置持久化命令
   ```

4. **多显示器/任务栏边界**：新增 Tauri 命令返回当前显示器工作区尺寸与任务栏位置，注入引擎 bounds（参考 BongoCat 的 window 插件取平台窗口/屏幕信息；desktopPet 用 screenW/areaH 变量）。

### Phase C（导入）——从「浏览器预览」到「本地 app-data 存储」

1. 新增 Rust 命令（`src-tauri/src/` 下）：
   ```rust
   // 1) 用 tauri-plugin-dialog 选文件
   // 2) 校验扩展名 + MIME + 大小上限（10MB）
   // 3) 复制到 app_data_dir()/pets/<uuid>.<ext>，生成 ID
   // 4) 返回相对路径，绝不返回任意外部路径
   ```
2. 前端桌面版不再用 `URL.createObjectURL`（仅 Web 预览用），改用 `convertFileSrc` 或 asset protocol 显示 app-data 内文件。
3. 补删除命令 + UI 删除入口。

### Phase D（裁剪/缩放/锚点）

- 参考 BongoCat 的 `behavior-modal`（行为配置弹窗）+ `upload`（上传）组件结构。
- 实现：预览 + 缩放/裁剪控件 + 「feet anchor」锚点（贴地接触点，移动时保持）。
- 关键约束（GUIDE）：预览与宠物窗口用同一套 scale/anchor 计算，非破坏性保存。

### Phase E（交互 + 托盘）

1. 托盘菜单补全（现有 `lib.rs` 只有 show-hide + quit）：
   ```rust
   // 新增 "pause-resume"、"settings" 菜单项
   // pause-resume → 前端切 paused（停止 requestAnimationFrame 动画循环）
   // settings → 打开 preference 窗口
   ```
2. 点击反馈（气泡/弹跳）、右键菜单。
3. `prefers-reduced-motion` 支持（GUIDE 可访问性要求）。

### Phase F（分发）

- 参考 BongoCat 的 `bundle.targets: ["nsis", ...]` + `tauri-plugin-updater`。
- 无签名证书时诚实描述 SmartScreen（GUIDE 已要求）；有证书后再签。

---

## 五、差异化机会（为什么值得做）

1. **Tauri 2 桌宠近乎空白**，本项目可成为该细分参考实现（README 可对标 BongoCat 的「跨平台 + 离线 + 隐私」话术）。
2. **「照片 → 桌宠」比 VPet/BongoCat 更轻的个性化**：人人都有想做成桌宠的照片，无需建模/MOD。
3. **隐私本地是可信赖的差异化**：AI 桌宠方向拥挤且普遍依赖云端/LLM，本项目反其道（纯本地、不联网、不识别）反而稀缺。

---

## 六、建议的下一步行动清单（按优先级）

1. [ ] Phase B 引擎升级：垂直维度 + 概率状态机 + seeded random 单测（参考 desktopPet 范式）
2. [ ] Phase B 拖拽落地 + 位置持久化（Tauri 命令存 JSON）
3. [ ] Phase A 补 `acceptFirstMouse` + click-through 开关（参考 BongoCat）
4. [ ] Phase C 导入落地：dialog + 校验 + 复制到 app-data + 生成 ID + 删除
5. [ ] Phase E 托盘补 Pause/Resume + Settings（参考 BongoCat useTray）
6. [ ] Phase D 裁剪/缩放/锚点编辑器（参考 BongoCat behavior-modal）
7. [ ] Phase F：GitHub Actions Windows 构建 + NSIS + 签名诚实说明

---

## 附：参考项目文件清单（速查）

- `ayangweb/BongoCat` → `src-tauri/tauri.conf.json`（透明窗口/双窗口/bundle）、`src-tauri/src/plugins/window/src/commands/*.rs`（平台分离）、`src/composables/useModel.ts` / `useTray.ts` / `useDevice.ts`
- `Adrianotiger/desktopPet` → `Pets/esheep64/animations.xml`（精灵图+概率状态机+环境感知）、`src/dotNet/Animations.cs`（动画引擎）
- `LorisYounger/VPet` → `VPet-Simulator.Core/`（状态×动画矩阵 + Core/UI 分离）
- `alvinunreal/openpets` → `packages/` + `plugins/`（插件 SDK 架构）、多语言 README
