# HAICoMo 0.3.4 preview — Windows x64

## English

- Windows desktop applications and command-line tools are now discovered independently. Cursor's CLI no longer hides its desktop application, and the current user's registered Claude Microsoft Store application can be found alongside Claude Code.
- Manual handoff shows accurate availability, opens the selected desktop client and copies the prompt. It does not claim that the client received or completed a task.
- Opening a project terminal on Windows now keeps an interactive PowerShell console alive, including projects with Unicode, spaces and shell metacharacters in their directory names.
- Codex cancellation waits for the turn to start and for its completion notification. Acknowledgement alone does not certify cancellation; missing confirmation remains unknown.
- The application, installer and installed version information are 0.3.4. Installation remains per user, with the same application identity and project schema v5. The Windows release gate verifies upgrade from 0.3.3, reinstall, uninstall and retained data using a disposable standard-user account.

Download **HAICoMo-0.3.4-windows-x64-setup.exe** and verify it using **SHA256SUMS-win32-x64.txt**. Windows remains unsigned; automatic updates are not configured. The installer published here is the same CI-verified artifact installed and checked on the maintainer's Windows machine before publication.

Known limitations: the current Claude print/stream-json adapter cannot approve interactive write permissions inside HAICoMo and does not reliably confirm cancellation. It reports waiting/unknown instead of success. Cursor uses manual handoff; background hosting is not supported. Real-account results and evidence boundaries are documented in [Windows functional validation](https://github.com/jasonyao486/HAICoMo/blob/main/docs/TESTING-WINDOWS-2026-10-07.md).

This release distributes Windows only. Apple Silicon Mac users should continue using the signed and notarised **0.3.3** files from [v0.3.3](https://github.com/jasonyao486/HAICoMo/releases/tag/v0.3.3). Historical Windows 0.3.3 attachments remain available for rollback.

## 简体中文

- Windows 桌面应用与 CLI 分开识别：Cursor 命令行入口不再遮蔽桌面程序；支持识别当前用户注册的 Claude 商店应用，并与 Claude Code 分别显示能力。
- 手动交接准确显示安装状态、打开指定客户端并复制提示词，不把这些操作当作发送或任务完成。
- 修复打开项目终端后 PowerShell 立即退出的问题，支持中文、空格及 shell 特殊字符目录。
- Codex 取消等待任务真正开始及结束通知；请求收到确认不等于任务已取消，缺少结束确认仍显示未知。
- 程序内版本、安装包和安装记录同步升级到 0.3.4。继续仅为当前用户安装，保持应用标识及 v5 项目格式。Windows 发布门禁使用一次性普通账户验证 0.3.3 升级、重装、卸载及数据保留。

Windows x64 请下载 **HAICoMo-0.3.4-windows-x64-setup.exe**，使用 **SHA256SUMS-win32-x64.txt** 校验。Windows 仍未签名，自动更新未配置；公开安装包与发布前在维护者 Windows 机器上安装验收的 CI 产物为同一份文件。

剩余限制：当前 Claude print/stream-json 适配无法在 HAICoMo 内批准交互写入权限，也不能可靠确认取消结束；保持等待／未知状态，不显示虚假成功。Cursor 继续使用手动交接，不支持后台托管。真实账号验证结果及证据边界见 [Windows 功能验证](https://github.com/jasonyao486/HAICoMo/blob/main/docs/TESTING-WINDOWS-2026-10-07.md)。

本次只发布 Windows 安装包。Apple Silicon Mac 继续推荐 [v0.3.3](https://github.com/jasonyao486/HAICoMo/releases/tag/v0.3.3) 中已签名、公证的文件；旧 Windows 0.3.3 附件保留供回退使用。
