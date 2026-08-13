# Photo Desktop Pet

将你有权使用的照片变成私人、本地的 Windows 桌面伙伴。目标平台为 Windows；不上传照片、不进行人脸识别或身份推断。

## 当前状态

已完成 React 原型与可测试的桌宠移动引擎，以及 Tauri 2 的透明、无边框、始终置顶原生宠物窗口与系统托盘菜单。导入到原生应用数据目录、拖动和位置持久化仍在开发中。

## 运行

```bash
npm install
npm run dev

# Windows 原生桌宠开发模式
npm run tauri:dev
```

推荐导入已去背景的 PNG。JPG、WebP 仅用于预览；自动去背景不是 v0.1 功能。

## 隐私与授权

图片仅应由拥有者或得到授权的用户导入。请勿把真人图片、密钥或私人应用数据提交到仓库。详见 [docs/privacy.md](docs/privacy.md)。

## 许可证

MIT。源码许可证不自动授予任何第三方人物肖像或素材的使用权。
