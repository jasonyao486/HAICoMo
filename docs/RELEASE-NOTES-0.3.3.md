# HAICoMo 0.3.3 preview / 预览版

| 电脑系统 / Computer system | 正式下载 / Download |
| --- | --- |
| Apple Silicon Mac（M 系列芯片） | [Mac DMG · 0.3.3](https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.3/HAICoMo-0.3.3-arm64.dmg) |
| Windows x64 | [Windows Setup · 0.3.3](https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.3/HAICoMo-0.3.3-windows-x64-setup.exe) |

## 简体中文

一个管理项目、人工审阅与多 AI 智能体协作的本地桌面应用。

- **Mac：**打开 DMG，将 HAICoMo 拖入“应用程序”，推出磁盘映像后启动。App 与 DMG 已通过 Developer ID 签名、Apple 公证并附加票据。干净账户经浏览器下载、首次启动及项目重新打开验收，无需 Open Anyway；普通“打开”确认仍可能出现。
- **Windows：**打开 Setup，自动安装到当前用户目录。安装、运行、升级和卸载无需管理员权限；快捷方式、卸载项及项目关联均属于当前用户。已有整机安装需单独处理。本版未作 Windows 发布者签名，可能出现 SmartScreen 提示，这与管理员权限不同。受管理电脑仍受组织策略约束。
- **更新与数据：**手动下载并替换或重新安装应用；重新安装和卸载保留设置与项目数据。本次不改变 v5 项目格式。Intel Mac、Windows ARM64 和 Linux 暂无已验证安装包。

正式 Mac 文件补入原 v0.3.3，应用内容与原标签一致；原 Windows 文件保持不变。四个临时 Mac 附件已下线，正式安装包没有重新打包或覆盖。

## English

A local desktop app for project management, human review, and collaboration with multiple AI agents.

- **Mac:** open the DMG, drag HAICoMo to Applications, eject the disk image and launch the installed app. Both the app and DMG are Developer ID signed, notarised by Apple and stapled. Browser download, first launch and project reopening passed acceptance in a fresh account without Open Anyway. A normal downloaded-app Open confirmation may appear.
- **Windows:** open Setup to install automatically for the current user. Installation, execution, upgrade and uninstall require no administrator permissions; shortcuts, uninstall registration and project associations are per user. Existing machine-wide installations require separate handling. This Windows build is unsigned and may show SmartScreen warnings, independently of administrator permissions. Managed computers remain subject to organisation policies.
- **Updates and data:** updates use manual download and replacement/reinstallation. Reinstalling or uninstalling retains settings and project data. Project schema remains v5. Verified installers for Intel Mac, Windows ARM64 and Linux are not provided.

Formal Mac downloads supplement the original v0.3.3 tag with unchanged application contents. The original Windows files are unchanged. Four temporary Mac attachments have been retired; formal installers have not been rebuilt or overwritten.

## 其他文件与验证 / Other files and verification

- [Mac ZIP](https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.3/HAICoMo-0.3.3-arm64-mac.zip) — 同一正式 App / the same formally signed, notarised and stapled app.
- SHA-256：[Mac](https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.3/SHA256SUMS-darwin-arm64.txt) · [Windows](https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.3/SHA256SUMS-win32-x64.txt).
- 验收报告 / Acceptance reports：[Mac](https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.3/mac-release-verification.json) · [Windows](https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.3/windows-user-verification.json).
- [双平台测试记录 / Native verification](https://github.com/jasonyao486/HAICoMo/blob/main/docs/TESTING-0.3.3.md) — 22 项最终 Mac 桌面测试、签名与 Gatekeeper 检查，以及 Windows 非管理员令牌验收 / 22 final packaged Mac desktop tests, signature and Gatekeeper checks, and Windows standard-user-token acceptance.
- [使用手册 / Manuals](https://github.com/jasonyao486/HAICoMo#install-and-start) · [仓库整理记录 / Repository cleanup](https://github.com/jasonyao486/HAICoMo/blob/main/docs/REPOSITORY-CLEANUP-0.3.3.md).

校验值用于确认下载完整性，不等同于发布者签名。“Source code” 压缩包是开发者源码，不是安装包。

Checksums verify download integrity; they are not publisher signatures. The “Source code” archives contain developer source, not installers.
