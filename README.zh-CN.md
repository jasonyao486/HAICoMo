# HAICoMo

[English](README.md) · **简体中文**

一个管理任务、人工审阅与 AI 协作的本地桌面应用。智能体提交修改提案，由你决定是否批准及何时通过交付验收。项目数据保存在你选择的工作目录中。

**0.3.1** 为 Apple Silicon Mac 与 Windows x64 预发布版本。实际验证范围见[兼容性报告](docs/COMPATIBILITY-0.3.1.md)。

## 安装与开始使用

使用任务管理功能不需要安装 Node.js、Git，也不需要购买模型订阅。

1. 打开[下载与版本发布](https://github.com/jasonyao486/HAICoMo/releases)，选择 **v0.3.1**，展开 **Assets**。
2. 按电脑类型下载。页面上的 “Source code” 是开发者源码，不是安装包。

| 你的电脑 | 下载文件 |
|---|---|
| 搭载 Apple M 系列芯片的 Mac | `HAICoMo-0.3.1-arm64.dmg` |
| 系统类型为“基于 x64 的处理器”的 Windows PC | `HAICoMo-0.3.1-windows-x64-setup.exe` |
| Intel Mac、Windows ARM64、Linux | 本版暂不提供已验证安装包 |

Mac 在“苹果菜单 → 关于本机”查看芯片；Windows 在“设置 → 系统 → 系统信息”查看系统类型。

3. **Mac：**打开 DMG，将 HAICoMo 拖到 Applications（应用程序），推出磁盘映像，再从应用程序启动。首发包仅为 ad-hoc 签名，尚未公证。如果系统阻止打开，先确认下载来源，再到“系统设置 → 隐私与安全性”对本应用选择“仍要打开”。不要全局关闭 Gatekeeper。
4. **Windows：**打开 setup `.exe`，按安装向导完成安装并启动。本版没有发布者签名，可能出现 SmartScreen 或未知发布者提示；确认来源并核对 SHA-256 后再决定继续。单位管理的电脑可能需要管理员协助。
5. 点击“新建项目”，选择一个空的本地文件夹，保存 `.haicomo` 入口文件。创建一个任务，再添加子任务。此过程不需要 AI 账号。
6. 交付后，从任务中打开交付物，检查内容，再点击“通过验收”。智能体运行完成不会自动替你验收。

<details>
<summary>如何核对下载文件的 SHA-256</summary>

从同一发布页下载对应的 `SHA256SUMS-darwin-arm64.txt` 或 `SHA256SUMS-win32-x64.txt`。保留安装包原文件名；如果文件位于“下载”文件夹，运行下面的对应命令，将结果与文本文件中该安装包那一行的完整校验值比较，大小写不影响结果。如不一致，请重新下载后再安装。

Mac：打开“终端”运行：

```sh
shasum -a 256 ~/Downloads/HAICoMo-0.3.1-arm64.dmg
```

Windows：打开 PowerShell 运行：

```powershell
Get-FileHash "$HOME\Downloads\HAICoMo-0.3.1-windows-x64-setup.exe" -Algorithm SHA256
```

校验值用于确认下载完整性，不等同于发布者签名。

</details>

需要 AI 协作时，自行安装并登录相应客户端，然后在“设置 → 本地智能体 → 检测”查看能力。Codex、Claude Code 支持后台交接；其他列出的客户端使用前台或文件协作。HAICoMo 不提供订阅，也不会自动转用另行收费的 API。

更新采用手动下载安装：退出应用，保留项目文件夹，下载新版并替换或重新安装应用。旧项目首次在 0.3.1 中打开时，会先备份再迁移到 v5；旧版应用不能打开已迁移项目。需要回退时，将迁移前备份恢复到空目录。

完整手册：[简体中文](docs/USER-MANUAL-0.3.1.zh-CN.md) · [繁體中文](docs/USER-MANUAL-0.3.1.zh-TW.md) · [UK English](docs/USER-MANUAL-0.3.1.en-GB.md) · [US English](docs/USER-MANUAL-0.3.1.en-US.md)。

## 功能

以下图片来自独立的合成 “HAICoMo Demo” 项目，包含 10 个任务、50 个子任务，不含真实工作内容或账号对话。截图界面使用英文。

### 任务与子任务

分配模型或客户端，记录日期、交付物及前置关系。人工验收通过后，后续任务才能解除前置限制。

![任务与子任务](docs/images/0.3.1/tasks.png)

### 修订提案

审阅智能体提出的修改，可调整后批准，也可拒绝。修订号与事务检查避免旧修改覆盖新内容、避免只批准一部分。

![修订提案](docs/images/0.3.1/proposals.png)

### 时间线、前置关系与思维导图

在时间线中安排任务日期，在关系图中检查前置条件或任务层级。图表支持缩放、适应画布和平移；明确指定模型的节点显示对应公司标志。

![时间线](docs/images/0.3.1/timeline.png)

### 协作实验室

默认模式使用简洁人物；增强模式使用单独授权的拟人角色及手绘家具。动画展示可观测状态，不代表智能体一定正在工作，也不等于任务已完成。

![默认协作实验室](docs/images/0.3.1/studio-default.png)

![增强协作实验室](docs/images/0.3.1/studio-enhanced.png)

### 协作统计

查看任务参与、提案、交接及可观测运行时长。默认与增强模式使用同一份数据。

![默认协作统计](docs/images/0.3.1/analytics-default.png)

![增强协作统计](docs/images/0.3.1/analytics-enhanced.png)

### 接力、笔记、活动记录与恢复

实验性接力在前置运行或时间条件满足后，启动一次后台交接，要求应用运行且项目保持加载。笔记与会议记录跟随项目保存。活动记录可在确认后逐条永久删除，不撤销任务操作，也不改变历史返工统计。备份及独立副本用于恢复；备份 ZIP 只包含管理数据，不包含实际交付物文件。

![增强接力家具](docs/images/0.3.1/relay-enhanced.png)

`.haicomo` 入口与隐藏的 `.haicomo/` 数据目录必须一起保留。云盘或 Git 应采用本地编辑，停止运行及接力、退出应用、同步完成后再换电脑。活动 NAS 数据库与多机同时写入不受支持。不要把私人项目数据库或提示词提交到公开源码仓库。

### 接力可视化预览

即使没有接力任务，可视化模式仍显示工位和沙发，并保留无任务提示。默认与增强两种画风均可预览；空场景不放置模型角色，也不会启动工作。

![默认接力预览](docs/images/0.3.1/relay-preview-default.png)

![增强接力预览](docs/images/0.3.1/relay-preview-enhanced.png)

## 协议与授权

源码及原创文档采用 [MIT](LICENSE)。角色素材按 ZipZipPipe 的**非商业使用及分发许可**提供；鲸鱼娘保留原作者署名链及 **CC BY-NC-SA 4.0**。环境家具采用 CC BY 4.0。公司标志仅用于识别，不表示背书。完整安装包并非所有内容都采用 MIT。

再分发前请阅读[素材许可](ASSET-LICENSES.md)、[逐文件来源清单](assets/manifest.json)和[第三方声明](THIRD-PARTY-NOTICES.md)。用户创建的内容仍归用户所有。

## 开发与反馈

安装 Node **24.21+** 与 npm 后：

```sh
git clone https://github.com/jasonyao486/HAICoMo.git
cd HAICoMo
npm ci
npm run dev
```

`npm test` 执行单元测试；`npm run test:e2e` 使用临时数据执行 Electron 测试；`npm run dist` 构建当前平台安装包，`npm run dist:win` 构建 Windows x64；`npm run demo -- /绝对路径/空目录` 生成演示项目。维护说明见[贡献指南](CONTRIBUTING.md)、[架构](docs/ARCHITECTURE.md)及[文件、CLI、MCP 协议](docs/PROTOCOL.md)。

[前往 GitHub 反馈](https://github.com/jasonyao486/HAICoMo/issues/new/choose)。附加诊断或截图前，请删除私人路径、提示词及凭据。当前证据见[测试记录](docs/TESTING-0.3.1.md)、[应用审查](docs/REVIEW-0.3.1.md)、[首次使用报告](docs/FIRST-RUN-0.3.1.md)和[差距分析](docs/GAP-ANALYSIS.md)。
