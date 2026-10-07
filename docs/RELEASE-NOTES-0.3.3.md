# HAICoMo 0.3.3 preview

## English

- macOS release workflow now requires Developer ID signing, hardened runtime, Apple notarization and stapled tickets for both the app and DMG. A missing credential or failed verification blocks publication. Final ZIP contents are independently verified.
- Windows x64 setup installs only for the current user, with no elevation helper or administrator request. Start-menu entries, uninstall registration and project associations are per user. Existing machine-wide installations remain untouched.
- User settings and project data are retained on reinstall and uninstall. Project schema remains v5; there is no data migration in this release.
- Signing files, private keys, local keychains and notarization credentials are excluded from Git and checked before publication. Signing credentials are held in GitHub Actions Secrets and a temporary CI keychain, never in download attachments.

Choose **HAICoMo-0.3.3-arm64.dmg** for Apple Silicon Mac, or **HAICoMo-0.3.3-arm64-mac.zip** for the ZIP distribution. Both contain the formally signed, notarised and stapled app; the DMG is independently signed, notarised and stapled. All 22 final packaged desktop tests passed. The owner confirmed browser download, first launch and project reopening in a fresh macOS account without Open Anyway. A normal downloaded-app Open confirmation may appear.

The formal Mac files supplement the original v0.3.3 tag with unchanged application contents. Windows setup and its existing verification/checksum files are retained exactly. Old Mac attachments containing `unnotarized` remain historical files and are not the recommended download. Formal Mac checksums are in **SHA256SUMS-darwin-arm64.txt** and acceptance evidence in **mac-release-verification.json**. Consult [0.3.3 test evidence](https://github.com/jasonyao486/HAICoMo/blob/main/docs/TESTING-0.3.3.md). Windows remains unsigned and SmartScreen can still display a warning, independently of administrator permissions. Automatic updates remain unconfigured.

## 简体中文

- Mac 发布流程必须通过 Developer ID 签名、Hardened Runtime、Apple 公证和票据校验；缺失凭据或校验失败会阻止发布。最终 ZIP 中的 App 也独立验证。
- Windows 安装程序固定为仅当前用户安装，不携带提权助手，不请求管理员权限；快捷方式、卸载项和项目文件关联都属于当前用户。
- 不自动卸载已有整机安装。重新安装和卸载保留用户设置与项目数据。本次不改变 v5 项目结构。
- 私钥、证书导出文件、公证凭据和本地钥匙串不进入 Git、日志或下载附件；GitHub Actions 使用 Secrets 和临时钥匙串。

Apple Silicon Mac 请下载 **HAICoMo-0.3.3-arm64.dmg**；ZIP 版本为 **HAICoMo-0.3.3-arm64-mac.zip**。App 与 DMG 均已完成正式签名、公证及票据附加，22 项最终打包后桌面测试全部通过。用户已确认：在干净 macOS 账户中通过浏览器下载、首次启动和重新打开项目，全程无需 Open Anyway。普通的下载应用“打开”确认仍可能出现。

正式 Mac 文件补入原 v0.3.3，应用内容与原标签一致，不改写标签。Windows 安装包及既有校验文件保持原样；旧 `unnotarized` Mac 附件保留作历史文件，默认推荐上述正式版。正式 Mac 校验清单为 **SHA256SUMS-darwin-arm64.txt**，验收报告为 **mac-release-verification.json**。详见[验证记录](https://github.com/jasonyao486/HAICoMo/blob/main/docs/TESTING-0.3.3.md)。Windows 未签名，仍可能出现 SmartScreen 提示，这与管理员权限是两件事。自动更新保持未配置。
