# HAICoMo 0.3.3 preview

## English

- macOS release workflow now requires Developer ID signing, hardened runtime, Apple notarization and stapled tickets for both the app and DMG. A missing credential or failed verification blocks publication. Final ZIP contents are independently verified.
- Windows x64 setup installs only for the current user, with no elevation helper or administrator request. Start-menu entries, uninstall registration and project associations are per user. Existing machine-wide installations remain untouched.
- User settings and project data are retained on reinstall and uninstall. Project schema remains v5; there is no data migration in this release.
- Signing files, private keys, local keychains and notarization credentials are excluded from Git and checked before publication. Signing credentials are held in GitHub Actions Secrets and a temporary CI keychain, never in download attachments.

Windows x64 is published first after native standard-user acceptance, with a SHA-256 manifest and verification report. Apple Silicon downloads are pending; Apple notarization is still processing. Any interim Mac download will be explicitly named `unnotarized` and may require System Settings → Privacy & Security → Open Anyway. It does not meet the notarized Mac acceptance criteria. Consult [0.3.3 test evidence](https://github.com/jasonyao486/HAICoMo/blob/main/docs/TESTING-0.3.3.md). Windows remains unsigned and SmartScreen can still display a warning. Mac's normal first-download confirmation may still appear. Existing 0.3.2 releases remain available. Automatic updates remain unconfigured.

## 简体中文

- Mac 发布流程必须通过 Developer ID 签名、Hardened Runtime、Apple 公证和票据校验；缺失凭据或校验失败会阻止发布。最终 ZIP 中的 App 也独立验证。
- Windows 安装程序固定为仅当前用户安装，不携带提权助手，不请求管理员权限；快捷方式、卸载项和项目文件关联都属于当前用户。
- 不自动卸载已有整机安装。重新安装和卸载保留用户设置与项目数据。本次不改变 v5 项目结构。
- 私钥、证书导出文件、公证凭据和本地钥匙串不进入 Git、日志或下载附件；GitHub Actions 使用 Secrets 和临时钥匙串。

Windows x64 已通过真实非管理员用户验收，先行发布，并附 SHA-256 和验收报告。Mac 下载尚待补充，Apple 公证仍在处理中；如提供临时 Mac 包，文件名会明确包含 `unnotarized`，首次启动可能需要“系统设置 → 隐私与安全性 → 仍要打开（Open Anyway）”，不能视为正式 Mac 公证验收通过。详见[验证记录](https://github.com/jasonyao486/HAICoMo/blob/main/docs/TESTING-0.3.3.md)。Windows 未签名，仍可能出现 SmartScreen 提示。Mac 首次打开的普通下载确认仍可能出现。自动更新保持未配置。
