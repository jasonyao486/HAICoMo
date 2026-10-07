# Windows 功能验证与兼容修复（2026-10-07）

使用独立配置、临时项目、新建账号会话及合成文件。分支 `codex/windows-functional-validation`，基于 `448c9f33959ccc71efa5c094b2957610d472ec1d` 的未提交工作区；未推送、发布、迁移数据库或替换日常安装版本。

## 环境与证据边界

| 项目 | 实际环境 |
| --- | --- |
| Windows | x64，25H2，build 26200.9457 |
| 开发运行时 | Node 24.21.0 / npm 11.19.0；原 Node 22.19.0 保留 |
| 已安装基线 | 发布版 HAICoMo 0.3.3，`%LOCALAPPDATA%\Programs\haicomo\HAICoMo.exe` |
| 修复构建 | 版本字段仍为 0.3.3；`release/0.3.3/win-unpacked/HAICoMo.exe`，不能与发布版混同 |
| Codex | CLI 0.153.4，`%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe`，ChatGPT 订阅登录 |
| Claude | 原生 Claude Code 2.1.285，`%USERPROFILE%\.local\bin\claude.exe`，用户完成独立 Claude 账号登录；MSIX Desktop 2.26454.0.0 |
| Cursor | 3.12.30；机器级与用户级安装并存；启动用户级 `%LOCALAPPDATA%\Programs\cursor\Cursor.exe` |
| Electron | 44.5.1 |

Mac 历史证据见 [0.3.3 验证记录](TESTING-0.3.3.md)：本地 macOS 27 ARM64，原生发布验证 macOS 15 ARM64 / Node 24.21.0；正式包与恢复验证均记录 22 项桌面测试通过。agent 测试使用模拟 CLI，**不证明真实 Codex、Claude、Cursor 账号链路在 Mac 通过**。本次没有 Mac 执行环境，不声称修复后在 Mac 重测。

## 对照与归因

| 功能／分类 | Mac 证据及版本 | Windows 修复前 | 原因与修复 | 修复后／剩余限制 |
| --- | --- | --- | --- | --- |
| Cursor 桌面发现：Windows 缺陷 | 0.3.3 有 `.app` 发现和模拟套件；没有真实 Cursor 验收证据 | 找到 cursor.cmd，但 appPath 为空，前台交接走终端 | Windows 仅在没找到 CLI 时查 GUI；改为独立发现，支持用户级／机器级路径和明确路径覆盖 | 实际从 HAICoMo 打开 Cursor、核对复制提示词、生成正确文件。后台托管仍不在适配范围 |
| Claude 商店发现：Windows 缺陷 | Mac `.app` 机制，没有 MSIX 等价场景 | 商店应用已安装，但桌面路径未识别 | 读取当前用户 Appx 注册及 manifest executable，不硬编码版本目录；GUI 不当作 CLI 探测 | 同时发现 Desktop 和原生 CLI；HAICoMo 的 providers.open 成功，实际出现 Claude 窗口 |
| 安装状态／按钮文案：显示缺陷 | Mac 可从 Info.plist 读版本；缺少这个场景的历史截图 | Windows 手动客户端版本为空时，即使 installed=true 仍显示 Not found；按钮写终端但实际开 GUI | 按 installed 显示可用性；手动交接使用对应说明，GUI 按钮显示“打开客户端并复制提示词”；四语言一致 | UI 回归通过，保留“尚未确认发送”提示和禁用的后台按钮 |
| 打开终端：Windows 启动缺陷 | Mac 用 shell.openPath(Terminal.app)；未找到真实终端窗口通过证据 | PowerShell 立即以 code 0 退出，单加 -NoExit 也无效 | detached 加 ignored stdin 不形成交互控制台；改用固定参数 cmd /d /c start 启动独立控制台。项目路径只作 cwd，检查 launcher 退出状态 | 原生测试确认 PowerShell 保持运行；中文、空格及 & 路径通过；没有通过 UI 在终端输入命令 |
| Codex 立即取消：跨平台适配缺陷 | Mac fixture 曾检查 interrupt 参数，未证实真实账号取消终态 | 文件和恢复通过；取消 unknown/lost | turn/start ACK 后尚未 active，interrupt 返回 no active turn to interrupt；ACK 也不等于结束。等 turn/started 后发送一次取消，等 turn/completed 确认 | 最终包真实文件、恢复、取消通过，终态 cancelled/history；加入延迟启动、缺失结束通知回归；无确认仍 unknown |
| Claude 写入权限：现有集成限制 | 无真实 Mac 账号证据；fixture 覆盖 permission_denials | 默认模式写入被拒；正确记录 waiting / permission，指引前台继续 | 当前 -p stream-json 适配没有双向权限询问；没有绕过权限或更改默认模式 | 单独合成任务显式 acceptEdits 后，文件和恢复通过；默认模式仍不能在 HAICoMo 内批准该类交互 |
| Claude 取消：现有适配／平台限制 | 没有真实 Mac 取消通过证据 | 停止进程后 unknown/lost | 当前单向 -p 适配没有可确认的取消结束通知；Windows 终止进程不代表语义完成 | 等实际 running 后取消，仍 unknown/lost；严格 live 测试保持失败。不能保证外部子进程全部停止 |
| simulated-agent timeout：历史间歇性测试问题 | Mac 0.3.3 曾同类超时，后来 22/22 通过；旧日志不足以还原缺失事件 | 上次本机 21/22；本轮应用修改前，发布版和源码同一用例均通过 | 未复现旧根因；增加界面错误诊断，保留启动、并发权限和结束断言；没有增加 retry 或放宽权限等待 | 最终独立连续三次结果见下；现在通过不等于已查明旧 Windows 缺陷 |
| 移动目录／交付物：平台行为 | Mac 0.3.3 项目与路径套件通过 | Windows 对打开的 SQLite 文件加锁；Mac 绝对路径不能直接使用 | 遵循关闭项目后移动完整目录流程；相对路径随项目移动，外来绝对路径需重新定位 | 关闭／移动／重开、身份和交付物路径测试通过，不强移或删除活跃数据库 |

## 实际场景覆盖

- Codex：真实读取 input.txt，生成 `result.txt = HAICOMO_WINDOWS_TEST_OK`，同会话恢复生成 `resumed.txt = HAICOMO_RESUME_OK`，取消确认。完成后 acceptedAt 仍为空。真实任务没有触发权限请求，**真实 Codex 权限弹窗未验证**；模拟测试覆盖并发权限、用户问题、拒绝、断连与取消。
- Claude：默认写入权限降级正确；显式 acceptEdits 下两份文件、恢复均通过；实际 running 后取消未知。没有切换付费 API。
- Cursor：HAICoMo 打开正确客户端，核对剪贴板；在新窗口的独立项目中，实际用 Claude Sonnet 4.5 生成 cursor-result.txt，内容为 HAICOMO_CURSOR_OK。文件交回 HAICoMo 后待验收，只有测试中显式点击“通过验收”才出现 acceptedAt，不是 agent 自动验收。
- 业务：完整桌面套件覆盖中文空格路径、多项目草稿、提案审阅、人工验收、备份恢复、关闭后移动目录、移后交付物定位、实验性一步接力与后台权限路由。
- 资源管理器：artifact.reveal 返回 insideProject=true，实际观察到正确文件被选中。
- 文件关联：Windows ShellExecute 的 .haicomo 默认打开操作启动已安装 0.3.3，打开正确项目；独立 association-profile 的 recents.json 和截图确认。**未用 Explorer 鼠标双击**，因为常驻 Explorer 不能可靠继承隔离配置，不将 ShellExecute 等同于实际双击观察。
- 托盘：真实 native Tray 创建、关闭最后窗口后 runner 保留、click 处理器恢复窗口、之后可取消通过。测试保留真实 Tray 引用后触发 click；**通知区鼠标点击及溢出面板未验证**。
- Codex 本次认证的是 CLI 后台链路，不是 Codex 桌面 UI 集成。
- 最终包额外通过真实“交接 → 后台发送”按钮启动 Codex、Claude，确认交接记录绑定实际 run ID。界面补充测试初次将按钮的可访问名称误写成含计数的文本，造成 locator 失败（截图实际已显示后台任务 0）；修正测试定位后，重开相同合成项目，不再调用模型，确认后台计数 0、Activity 中有 Recorded handoff、两次 completed 和相应取消状态，acceptedAt 仍为空。保留原失败报告和独立 ui-recheck.json，不将测试缺陷计作应用回归。

## 检查结果

| 检查 | 结果 |
| --- | --- |
| 资源检查、TypeScript | 通过（最终 build / dist:win） |
| 单元测试 | 89 通过，2 跳过，总计 91 |
| 最终源码桌面 | 24/24 通过 |
| 最终打包桌面 | 24/24 通过，1.5 分钟 |
| 原后台发送用例独立连续三次 | 最终包 3/3 通过，24.4 秒；每次独立 app/profile，实际验证启动、两项权限及结束，无 retry |
| Windows NSIS | npm run dist:win 成功，当前用户 x64，NotSigned |
| Codex 最终包 live | 通过：文件、恢复、取消 |
| Claude 最终包严格 live | 失败：文件与恢复通过，取消确认未满足（unknown/lost） |
| Cursor 真实手动交接 | 通过：打开、复制、文件、交回、人工验收分离 |
| 原始 brief 哈希 | 公共 checkout 没有 prd_draft.md，无法在本机复核；未生成或修改它 |

两项 Mac 专用跳过均来自 `tests/mac-artifacts.test.ts`：

1. `artifact cleanup verifies exact archive restoration, preserves evidence and rejects unsafe owners`：验证 .app 归档后精确恢复（含符号链接）、保留证据、拒绝错误 owner/bundle、坏归档不执行清理；依赖 Mac ditto 和 bundle 布局。
2. `abandoned test ownership recovers on next run, active owner is protected and cleanup is repeatable`：验证中断的 Mac 升级测试 staging 回收、活跃 owner 保护和幂等清理。

这是 Mac 发布测试设施，不是 Windows 缺少两项业务功能。新增两项 Windows 原生桌面用例只在 Windows 执行。

最终本地安装包：`release/0.3.3/HAICoMo-0.3.3-windows-x64-setup.exe`。
SHA-256：`b97a49d166160b227b7941a42241b4f6f7d012f0503a538787da5f86bc19504e`。
没有覆盖日常安装、修改系统安全设置、配置签名或发布 Release。

## 复现与证据

PowerShell 开发入口：

```powershell
. "$env:LOCALAPPDATA\HAICoMo-dev\Enter-HAICoMo.ps1"
npm run typecheck
npm test
npm run test:e2e
npm run dist:win
$env:HAICOMO_PACKAGED_EXECUTABLE = (Resolve-Path 'release\0.3.3\win-unpacked\HAICoMo.exe').Path
npx playwright test
npx playwright test tests/e2e/tabs.spec.ts -g 'single window tabs' --repeat-each=3
$env:HAICOMO_VERIFICATION_LABEL = 'manual-verification'
npx tsx scripts/verify-windows-live.ts --live codex
npx tsx scripts/verify-windows-live.ts --live claude --mode acceptEdits
```

真实 smoke 必须显式 --live，不属于 npm test 或 CI。Claude 命令目前预期在取消断言处失败，这不是安装故障。真实测试临时项目保留供核验，普通 E2E 只清理自身目录。

本机原始证据均被 Git ignore，不作为公开账号日志提交：

- `validation/windows-functional/baseline/codex/result.json`：发布版文件／恢复通过、取消 unknown；首版 harness 弱取消断言已纠正，原始 stages 保留，结论 partial。
- `validation/windows-functional/fixed/`：中间构建 Codex 取消失败、Claude 默认权限降级。
- `validation/windows-functional/final/{codex,claude}/`：最终 live 报告与截图。
- `validation/windows-functional/final-ui/{codex,claude}/`：真实 UI 启动、原始 locator 失败、相同项目 UI 复核与 activity.png；修正后的复用 smoke 脚本包含这些界面断言。
- `validation/windows-functional/cancel-protocol.json`：真实合成会话请求／通知阶段证据。
- `validation/windows-functional/system-result.json`、`cursor-real.png`、`cursor-awaiting-acceptance.png`、`association-open.png`：实际窗口、文件、验收证据。
- `validation/windows-functional/windows-system/`、`final-source-suite/`、`final-packaged-suite/`、`final-stability/`：回归截图与结果。
- `%LOCALAPPDATA%\HAICoMo-dev\windows-final-*.log`、`final-codex.log`、`final-claude.log`：原始检查日志。

协议依据：[Codex App Server](https://learn.chatgpt.com/docs/app-server) 的 turn/started、turn/interrupt、turn/completed；[Claude CLI reference](https://code.claude.com/docs/en/cli-reference) 的权限模式与 stream-json；[Claude Windows 安装说明](https://code.claude.com/docs/en/setup)。原生 Windows Claude sandbox 的第三方限制不等于 HAICoMo 数据库／交接回归。

不能列为 Windows 回归的共同限制：Cursor 没有后台托管适配、未配置自动更新渠道、真实账号权限依赖客户端、没有 Mac 实际运行证据的场景。本次没有覆盖所有组织安全策略、Windows ARM64 或旧系统版本。
