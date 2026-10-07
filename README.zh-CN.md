# HAICoMo

> [0.3.3 预览版](https://github.com/jasonyao486/HAICoMo/releases/tag/v0.3.3)：Apple Silicon Mac 提供正式签名公证版，Windows 仅当前用户安装、无需提权。见[发布说明](docs/RELEASE-NOTES-0.3.3.md)。

[English](README.md) · **简体中文**

一个管理项目、人工审阅与多 AI 智能体协作的本地桌面应用。智能体提交修改提案，由人类用户决定是否批准及何时通过交付验收。项目数据保存在选定的工作目录中。

**0.3.3** 为 Apple Silicon Mac 与 Windows x64 预发布版本。原生平台测试与 Mac 干净账户首次打开验收见[验证记录](docs/TESTING-0.3.3.md)。

## 安装与开始使用

使用任务管理功能不需要安装 Node.js、Git，也不需要购买模型订阅。

1. 打开[下载与版本发布](https://github.com/jasonyao486/HAICoMo/releases)，选择 **v0.3.3**，展开 **Assets**。
2. 按电脑类型下载。页面上的 “Source code” 是开发者源码，不是安装包。

| 电脑系统 | 下载文件 |
|---|---|
| 搭载 Apple M 系列芯片的 Mac | [HAICoMo-0.3.3-arm64.dmg](https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.3/HAICoMo-0.3.3-arm64.dmg) |
| 系统类型为“基于 x64 的处理器”的 Windows PC | [HAICoMo-0.3.3-windows-x64-setup.exe](https://github.com/jasonyao486/HAICoMo/releases/download/v0.3.3/HAICoMo-0.3.3-windows-x64-setup.exe) |
| Intel Mac、Windows ARM64、Linux | 本版暂不提供已验证安装包 |

Mac 在“苹果菜单 → 关于本机”查看芯片；Windows 在“设置 → 系统 → 系统信息”查看系统类型。

3. **Mac：** 打开 DMG，将 HAICoMo 拖到 Applications（应用程序），推出磁盘映像，再从应用程序启动。正式包已通过 Developer ID 签名、Apple 公证并附加票据；首次启动可能出现普通“打开”确认，已完成的干净账户测试无需 Open Anyway。
4. **Windows：** 打开 setup `.exe`，自动安装到当前用户目录并启动；安装、升级和卸载不主动请求管理员权限。本版没有发布者签名，可能出现 SmartScreen 或未知发布者提示，这与管理员权限不同；确认来源并核对 SHA-256 后再决定继续。单位管理的电脑可能需要管理员协助。
5. 点击“新建项目”，选择一个空的本地文件夹，保存 `.haicomo` 入口文件。创建一个任务，再添加子任务。此过程不需要 AI 账号。
6. 交付后，从任务中打开交付物，检查内容，再点击“通过验收”。智能体运行完成不会自动通过人工验收。

<details>
<summary>如何核对下载文件的 SHA-256</summary>

从同一发布页下载对应的 `SHA256SUMS-darwin-arm64.txt` 或 `SHA256SUMS-win32-x64.txt`。保留安装包原文件名；如果文件位于“下载”文件夹，运行下面的对应命令，将结果与文本文件中该安装包那一行的完整校验值比较，大小写不影响结果。如不一致，请重新下载后再安装。

Mac：打开“终端”运行：

```sh
shasum -a 256 ~/Downloads/HAICoMo-0.3.3-arm64.dmg
```

Windows：打开 PowerShell 运行：

```powershell
Get-FileHash "$HOME\Downloads\HAICoMo-0.3.3-windows-x64-setup.exe" -Algorithm SHA256
```

校验值用于确认下载完整性，不等同于发布者签名。

</details>

需要 AI 协作时，自行安装并登录相应客户端，然后在“设置 → 本地智能体 → 检测”查看能力。Codex、Claude Code 支持后台交接；其他列出的客户端使用前台或文件协作。HAICoMo 不提供订阅，也不会自动转用另行收费的 API。

更新采用手动下载安装：退出应用，保留项目文件夹，下载新版并替换或重新安装应用。0.3.1 之前的项目首次在新版中打开时，会先备份再迁移到 v5；早于 0.3.1 的应用不能打开已迁移项目。需要回退时，将迁移前备份恢复到空目录。

完整手册：[简体中文](docs/USER-MANUAL-0.3.3.zh-CN.md) · [繁體中文](docs/USER-MANUAL-0.3.3.zh-TW.md) · [UK English](docs/USER-MANUAL-0.3.3.en-GB.md) · [US English](docs/USER-MANUAL-0.3.3.en-US.md)。

点击 logo 返回首页，不增加标签；原项目页面与草稿保留。收起侧栏后保留正常尺寸的文件夹与终端按钮。活动摘要使用简短角色，展开详情保留完整身份。0.3.3 沿用 0.3.1 的项目格式 v5。

## 功能

以下图片来自独立的合成 “HAICoMo Demo” 项目，包含 10 个任务、50 个子任务，不含真实工作内容或账号对话。截图界面使用英文。

### 首页与项目标签

点击 logo 返回首页，保留各项目的页面与草稿。收起侧栏后仍可使用文件夹与终端入口。

![首页](docs/images/0.3.2/home.png)

### 任务与子任务

分配模型或客户端，记录日期、交付物及前置关系。人工验收通过后，后续任务才能解除前置限制。

![任务与子任务](docs/images/0.3.2/tasks.png)

### 修订提案

审阅智能体提出的修改，可调整后批准，也可拒绝。修订号与事务检查避免旧修改覆盖新内容、避免只批准一部分。

![修订提案](docs/images/0.3.2/proposals.png)

### 时间线、前置关系与思维导图

在时间线中安排任务日期，在关系图中检查前置条件或任务层级。图表支持缩放、适应画布和平移；明确指定模型的节点显示对应公司标志。

![时间线](docs/images/0.3.2/timeline.png)

### 协作实验室

默认模式使用简洁人物；增强模式使用单独授权的拟人角色及手绘家具。动画展示可观测状态，不代表智能体一定正在工作，也不等于任务已完成。

![默认协作实验室](docs/images/0.3.2/studio-default.png)

![增强协作实验室](docs/images/0.3.2/studio-enhanced.png)

### 协作统计

查看任务参与、提案、交接及可观测运行时长。默认与增强模式使用同一份数据。

![默认协作统计](docs/images/0.3.2/analytics-default.png)

![增强协作统计](docs/images/0.3.2/analytics-enhanced.png)

### 接力、笔记、活动记录与恢复

实验性接力在前置运行或时间条件满足后，启动一次后台交接，要求应用运行且项目保持加载。笔记与会议记录跟随项目保存。活动记录可在确认后逐条永久删除，不撤销任务操作，也不改变历史返工统计。备份及独立副本用于恢复；备份 ZIP 只包含管理数据，不包含实际交付物文件。

![Claude 在工位执行，ChatGPT 坐在沙发等待](docs/images/0.3.3/relay-claude-chatgpt.png)

合成演示：测试 CLI 保持 Claude 运行，ChatGPT 坐在沙发等待接力。接力处于暂停状态，不会调用模型账号。

`.haicomo` 入口与隐藏的 `.haicomo/` 数据目录必须一起保留。云盘或 Git 应采用本地编辑，停止运行及接力、退出应用、同步完成后再换电脑。活动 NAS 数据库与多机同时写入不受支持。不要把私人项目数据库或提示词提交到公开源码仓库。

### 接力可视化预览

即使没有接力任务，可视化模式仍显示工位和沙发，并保留无任务提示。默认与增强两种画风均可预览；空场景不放置模型角色，也不会启动工作。

![默认接力预览](docs/images/0.3.2/relay-preview-default.png)

![增强接力预览](docs/images/0.3.2/relay-preview-enhanced.png)

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

[前往 GitHub 反馈](https://github.com/jasonyao486/HAICoMo/issues/new/choose)。附加诊断或截图前，请删除私人路径、提示词及凭据。当前证据见[0.3.3 验证记录](docs/TESTING-0.3.3.md)和[差距分析](docs/GAP-ANALYSIS.md)。
