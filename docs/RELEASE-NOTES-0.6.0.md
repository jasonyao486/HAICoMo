# HAICoMo 0.6.0 preview

[Mac Apple Silicon — DMG](https://github.com/jasonyao486/HAICoMo/releases/download/v0.6.0/HAICoMo-0.6.0-arm64.dmg) · [Windows x64 — Setup](https://github.com/jasonyao486/HAICoMo/releases/download/v0.6.0/HAICoMo-0.6.0-windows-x64-setup.exe)

Mac Apple Silicon 与 Windows x64 同步发布 0.6.0。已安装 0.4.0 及以后版本的用户，可以在“设置 → HAICoMo → 检查更新”中直接在应用内更新。

- **提问和权限请求在 HAICoMo 里回答（ACP 与 Claude 宿主通道）。**
  - 已安装版本支持 Agent Client Protocol（ACP）的客户端，会自动改走 ACP：Kimi、Hermes、Gemini CLI、Qwen Code、OpenCode、GitHub Copilot CLI、CodeBuddy、Qoder。
  - Claude Code 改用它自带的宿主权限通道。
  - 智能体请求写文件或运行命令时，在 HAICoMo 中弹窗由你允许或拒绝；取消会确认运行已经结束。
  - 无人值守接力里，这些请求由 HAICoMo 逐条回答（拒绝破坏性命令，从不选“总是允许”），并写进决策记录。
  - “设置 → 本地智能体”的每一行会显示所用通道。
- **新增 Hermes，智能体按 A–Z 排列。** 检测范围增加 Hermes（Nous Research），共 16 个客户端。设置、交接、接力和筛选中的客户端列表统一按英文名排序。
- **交付记录。** 智能体完成时会附一段交付记录：目标、产物、证据、下一步、未决问题。
  - 记录显示在任务验收区、运行记录和接力流程图上；产物路径会标出“存在”或“未找到”，可以一键加入交付物。
  - 接力的下一阶段直接拿到这份记录，而不是一大段最终消息摘录。
  - 你不需要做任何操作。
- **要求修改时附意见。** 验收区的“要求修改”会打开一个弹窗：写下修改意见，选择退回给原负责智能体（默认，能续接时继续原会话）或另选一个智能体，然后后台发送、复制提示词，或只记录退回。
- **并行任务各用一个 git 工作副本。**
  - 项目在 git 仓库中时，同一阶段的两个及以上任务各自在 `.haicomo/worktrees` 里用自己的分支工作。
  - 阶段完成后，HAICoMo 提交各副本的改动，用 `--no-ff` 合并回当前分支，再开始下一阶段。
  - 遇到冲突时会中止合并、暂停接力并保留分支，等你手动合并后点“我已手动合并，继续”。
  - 从不强制推送、重置或清理。
- **侧栏。** “接力任务”与“时间线”之间增加了与“思维导图 / 协作办公室”相同的间隔。
- **数据。** 数据结构仍为 v6，不需要迁移。0.5.0 不认识 Hermes 和工作副本设置，请把所有电脑都更新到 0.6.0。

English:
- **Answer questions and permissions in HAICoMo (ACP and Claude's host channel).** Clients whose installed version supports the Agent Client Protocol (Kimi, Hermes, Gemini CLI, Qwen Code, OpenCode, GitHub Copilot CLI, CodeBuddy, Qoder) now run over ACP. Claude Code uses its own host permission channel. Their requests to write files or run commands appear in HAICoMo for you to allow or deny, and cancelling confirms the run has ended. In unattended relays HAICoMo answers each request itself (destructive commands declined, never "always allow") and records it. Settings shows each client's channel.
- **Hermes, and agents A–Z.** Hermes (Nous Research) joins detection, for 16 clients. Every client list is sorted by English name.
- **Delivery records.** Agents finish with a record (goal, artifacts, evidence, next, open questions). It is shown on the task, in run history and on the relay flow. Reported paths are checked and can be added as deliverables in one click. The next relay stage receives the record instead of a long excerpt. Nothing is required from you.
- **Request changes with comments.** Write what should change, send it back to the agent that delivered (the default, continuing its session when possible) or to another agent, then send it in the background, copy the prompt, or just record the return.
- **A git working copy per parallel task.** In git projects, each task of a stage with two or more tasks works on its own branch in `.haicomo/worktrees`. When the stage completes, HAICoMo commits each copy and merges it with `--no-ff`, then starts the next stage. A conflict aborts the merge, pauses the relay and keeps the branch until you merge it yourself. Nothing is ever forced, reset or cleaned.
- **Sidebar.** Relay and Timeline now have the same gap as Mind map and Office.
- **Data.** Still schema v6, with no migration. 0.5.0 does not know Hermes or working-copy settings, so update every computer.

Users of 0.4.0 or later can update in-app (Settings → HAICoMo → Check for updates). Versions 0.3.5 and earlier: download this release, or enter `https://github.com/jasonyao486/HAICoMo/releases/download/v0.6.0` as the update source once. Windows downloads remain unsigned; in-app updates rely on GitHub HTTPS and the SHA-512 in `latest.yml`.

Further downloads: [Mac ZIP](https://github.com/jasonyao486/HAICoMo/releases/download/v0.6.0/HAICoMo-0.6.0-arm64-mac.zip), [Mac SHA-256](https://github.com/jasonyao486/HAICoMo/releases/download/v0.6.0/SHA256SUMS-darwin-arm64.txt), [Windows SHA-256](https://github.com/jasonyao486/HAICoMo/releases/download/v0.6.0/SHA256SUMS-win32-x64.txt).

Manuals (0.6.0): [简体中文](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.6.0.zh-CN.md) · [繁體中文](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.6.0.zh-TW.md) · [UK English](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.6.0.en-GB.md) · [US English](https://github.com/jasonyao486/HAICoMo/blob/main/docs/USER-MANUAL-0.6.0.en-US.md). [Decisions](https://github.com/jasonyao486/HAICoMo/blob/main/docs/DECISIONS-0.6.0.md) · [Verification status](https://github.com/jasonyao486/HAICoMo/blob/main/docs/TESTING-0.6.0.md).
