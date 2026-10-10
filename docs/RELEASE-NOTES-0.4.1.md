# HAICoMo 0.4.1 preview

[Mac Apple Silicon — DMG](https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.1/HAICoMo-0.4.1-arm64.dmg) · [Windows x64 — Setup](https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.1/HAICoMo-0.4.1-windows-x64-setup.exe)

Mac Apple Silicon 与 Windows x64 同步发布 0.4.1 修复版。已安装 0.4.0 的用户可在“设置 → HAICoMo → 检查更新”中直接在应用内更新。

- **设置页滚动修复。** 滚到“第三方组件与品牌说明”后不再能继续下滑出 2–4 屏空白，上滑时页面上下边距也不再错位。原因是授权链接中供读屏软件使用的隐藏文字以窗口而不是页面为定位参照，把窗口撑高了；现在每个页面只在自己的区域内滚动，窗口本身不会滚动。
- **更新后清理缓存（Mac）。** 应用内更新完成并恢复窗口后，删除旧版更新程序留下的约 380 MB 安装包副本（`update.zip`）。Windows 保留 `installer.exe`，用于下次只下载变化部分。
- 功能、数据库 v5、入口与提案协议与 0.4.0 相同；手册沿用 0.4.0。

English: **Settings scrolling** — the Settings page now ends at its last section. Screen-reader-only link labels were positioned against the window instead of the page, stretching the window and leaving 2–4 screens of blank scrolling and misaligned margins; each page now scrolls only within its own area. **Update cache (Mac)** — after an in-app update is installed and restored, the roughly 380 MB `update.zip` copy left by earlier updaters is removed; Windows keeps `installer.exe` for differential downloads. Features, schema v5 and the entry/proposal protocols are unchanged; the 0.4.0 manuals apply.

Users of 0.4.0 can update in-app (Settings → HAICoMo → Check for updates). Versions 0.3.5 and earlier: download this release, or enter `https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.1` as the update source once. Windows downloads remain unsigned; in-app updates rely on GitHub HTTPS and the SHA-512 in `latest.yml`.

Further downloads: [Mac ZIP](https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.1/HAICoMo-0.4.1-arm64-mac.zip), [Mac SHA-256](https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.1/SHA256SUMS-darwin-arm64.txt), [Windows SHA-256](https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.1/SHA256SUMS-win32-x64.txt).

Manuals (0.4.0): [简体中文](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.4.0.zh-CN.md) · [繁體中文](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.4.0.zh-TW.md) · [UK English](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.4.0.en-GB.md) · [US English](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.4.0.en-US.md). [Verification status](https://github.com/jasonyao486/HAICoMo/blob/main/docs/TESTING-0.4.1.md).
