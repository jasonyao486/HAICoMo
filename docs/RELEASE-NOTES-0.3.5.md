# HAICoMo 0.3.5 preview

[Mac Apple Silicon — DMG](https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.5/HAICoMo-0.3.5-arm64.dmg) · [Windows x64 — Setup](https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.5/HAICoMo-0.3.5-windows-x64-setup.exe)

Mac Apple Silicon 与 Windows x64 同步发布 0.3.5 预览版。双平台原生验证及本版 Mac 干净账户首次打开验收已通过。

- 新建项目按名称提供默认入口文件名，例如 `rpi5.haicomo`。可在保存框中改名；已有入口、项目身份及日后标题修改不会触发自动重命名。
- 项目顶部新增“连接智能体／复制接入说明”，支持项目级读取与等待，或选择任务加入上下文和交付物引用。界面与提示词支持四语。
- 手动交接、终端交接和接力统一组合自动接入指引、任务上下文、自定义内容及交付物引用。自定义内容单独保存，不再覆盖自动指引，也不会反复叠加生成内容。
- 完整英语协议指南位于 `.haicomo/agent-guide.md`。已有规则文件原样保留；自定义同名指南冲突明确提示。未增加智能体审批或验收权限，不配置客户端或注册全局命令。
- 数据库继续使用 v5；入口和提案协议不变。Mac 从 0.3.3、Windows 从 0.3.4 的升级已通过相应原生验证。

Mac 已通过 Developer ID 签名、Apple 公证、票据、Gatekeeper 与本版本干净账户首次打开验收。可能出现普通“打开”确认，无需 Open Anyway。Windows 安装、升级和卸载仅限当前用户，不主动请求管理员权限；未签名 EXE 仍可能出现 SmartScreen 提示，两者不同。

English: new projects derive their default entry filename from the project name. The new **Connect an agent** dialog offers project or task context in four languages. Manual handoffs, terminal copies and relays retain automatic protocol instructions alongside separately saved custom content. Existing project rules are preserved; conflicting custom guides block connection with an explicit error. Database schema v5 and the entry/proposal protocols are unchanged. No client configuration or agent approval authority is added.

Mac downloads are Developer ID signed, notarised and stapled; fresh-account first launch passed without Open Anyway. A normal Open confirmation may appear. Windows installation, upgrade and uninstall are per user without requesting administrator permissions; unsigned Windows downloads may still trigger SmartScreen. Native upgrades from Mac 0.3.3 and Windows 0.3.4 passed.

Further downloads: [Mac ZIP](https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.5/HAICoMo-0.3.5-arm64-mac.zip), [Mac SHA-256](https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.5/SHA256SUMS-darwin-arm64.txt), [Windows SHA-256](https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.5/SHA256SUMS-win32-x64.txt). Verification reports accompany these files.

Manuals: [简体中文](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.3.5.zh-CN.md) · [繁體中文](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.3.5.zh-TW.md) · [UK English](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.3.5.en-GB.md) · [US English](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.3.5.en-US.md). [Verification status](https://github.com/jasonyao486/HAICoMo/blob/main/docs/TESTING-0.3.5.md).
