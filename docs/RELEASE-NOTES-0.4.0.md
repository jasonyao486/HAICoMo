# HAICoMo 0.4.0 preview

[Mac Apple Silicon — DMG](https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.0/HAICoMo-0.4.0-arm64.dmg) · [Windows x64 — Setup](https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.0/HAICoMo-0.4.0-windows-x64-setup.exe)

Mac Apple Silicon 与 Windows x64 同步发布 0.4.0 预览版。

- **应用内更新。** “设置 → HAICoMo”可检查官方 GitHub 发布（含预览版），显示新版本与更新内容。点“立即更新”下载，进度条显示百分比、大小、速度和预计剩余时间，可随时取消；SHA-512 校验通过后，由你点“重启并安装”。安装前保存所有窗口，有智能体运行时不安装；Windows 显示安装程序进度并自动重新打开，Mac 由系统验证 Developer ID 签名后替换并重新打开，重启后提示“已更新至 x.y.z”并恢复项目标签。默认在启动后及每 12 小时自动检查一次，只提示、不下载，可在设置中关闭。
- **项目总览搜索。** 三张总览卡片下方新增搜索框（⌘F／Ctrl+F），范围为“所有内容／任务／修订／会议”，“所有内容”也包括普通备注。所有关键词须命中，中文按字面匹配；修订还会检索审阅备注和拟修改的文本值。结果分组高亮，点击直接打开对应条目。不使用 AI，也不需要 API。
- **客户端图标。** WorkBuddy 改用官方 WorkBuddy 桌面应用图标，CodeBuddy 改用彩色标志，两平台一致。
- 数据库仍为 v5；入口与提案协议不变。

**从 0.3.5 升级：** 0.3.5 没有内置更新源。可照常下载本版安装；或在 0.3.5 的“设置 → 更新源（HTTPS）”填入 `https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.0`，再点“检查更新”，在应用内完成这一次升级（0.4.0 启动后会自动清除该地址，此后使用官方源）。Mac 请从“应用程序”文件夹运行。Windows 安装包仍未做发布者签名：浏览器下载可能出现 SmartScreen；应用内更新依靠 GitHub HTTPS 与 `latest.yml` 中的 SHA-512 校验。

English: **In-app updates** — Settings → HAICoMo checks the official GitHub releases (previews included). **Update now** downloads with percentage, size, speed and time remaining, and can be cancelled; after SHA-512 verification you choose **Restart and install**. Open windows are saved first and nothing installs while agents run. Windows shows the installer's progress and reopens HAICoMo; on Mac the system verifies the Developer ID signature, replaces and reopens the app. Automatic checks (shortly after launch and every 12 hours) only notify and can be turned off. **Project search** on the Overview (⌘F / Ctrl+F) covers Everything (including notes), Tasks, Revisions and Meetings, highlights matches and opens the result; no AI is involved. **WorkBuddy** now shows its official desktop app icon; CodeBuddy uses its colour mark. Schema v5 and the entry/proposal protocols are unchanged.

Upgrading from 0.3.5: download this release as usual, or enter `https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.0` as 0.3.5's **Update source (HTTPS)** and check for updates (0.4.0 clears it on start and then uses the official source). Windows downloads remain unsigned; in-app updates rely on GitHub HTTPS and the SHA-512 in `latest.yml`.

Further downloads: [Mac ZIP](https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.0/HAICoMo-0.4.0-arm64-mac.zip), [Mac SHA-256](https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.0/SHA256SUMS-darwin-arm64.txt), [Windows SHA-256](https://github.com/jasonyao486/HAICoMo/releases/download/v0.4.0/SHA256SUMS-win32-x64.txt). `latest-mac.yml` and `latest.yml` are the in-app update metadata.

Manuals: [简体中文](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.4.0.zh-CN.md) · [繁體中文](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.4.0.zh-TW.md) · [UK English](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.4.0.en-GB.md) · [US English](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.4.0.en-US.md). [Verification status](https://github.com/jasonyao486/HAICoMo/blob/main/docs/TESTING-0.4.0.md).
