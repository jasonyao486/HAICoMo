# HAICoMo 0.5.0 preview (draft — not yet published)

Download links are added when the release is published.

- **更多智能体可后台调用。** 检测范围新增 Kimi、Grok Bot、DeepSeek Harness、Gemini CLI 与 Qwen Code。凡提供命令行无界面模式的客户端都可后台调用：Codex、Claude Code、Cursor Agent、Kimi、DeepSeek Harness、CodeBuddy、Qoder CLI、Gemini CLI、Qwen Code、OpenCode、GitHub Copilot CLI、Pi。仅当已安装版本的帮助文本列出所需参数时启用，并标注证据等级（已实测／已在本机核对参数／按官方文档适配未实测）。Grok Bot、WorkBuddy、TRAE 没有命令行接口，仍为打开应用并复制提示词。
- **三阶段并行接力。** 一个接力最多 A → B → C 三个阶段，每阶段最多 3 个任务同时进行；当前阶段全部交付后自动进入下一阶段，中间不需要审阅，后续阶段的提示词带入前序结果摘录。交付物仍需你验收。任一任务未交付就停在本阶段，可只重试停止的任务或标记已处理；从不自动重试。
- **无人值守模式（逐个接力同意）。** 智能体使用各自的自主参数；Codex 的选择题自动选推荐项、工具审批自动批准但拒绝破坏性命令；遇到登录、验证码等只能由你完成的事会暂停并发通知；每个接力生成决策记录。
- **接力页面。** 文字模式显示完整流程图；可视化模式中工位与三人沙发等宽，工位只坐当前阶段正在工作的智能体，每个等待阶段一张三人沙发。
- **数据结构 v6。** 首次打开时自动备份 `pre-v6` 后迁移；升级后的项目不能再用 0.4.1 及更早版本打开，请把所有电脑都更新到 0.5.0。

English: **More background agents** — detection adds Kimi, Grok Bot, DeepSeek Harness, Gemini CLI and Qwen Code; every client with a headless command line can run in the background, enabled only when its installed help text lists the required options and labelled with its evidence level. **Three-stage parallel relays** — up to A → B → C with up to three tasks per stage; the next stage starts automatically once every task of the current stage delivered, with earlier results in its prompt; acceptance stays yours; a stopped task halts its stage for retry or "mark handled", never automatic. **Unattended mode** (per-relay consent) — clients' own autonomous options, Codex questions answered with the recommended option, destructive commands declined, human-only steps pause with a notification, and a decision record per relay. **Relay page** — full flowchart in Text view; equal-width desk and three-seat sofas, one sofa per waiting stage. **Schema v6** — backed up and migrated on first open; 0.4.1 and earlier cannot open migrated projects, so update every computer.

Manuals (0.5.0): [简体中文](USER-MANUAL-0.5.0.zh-CN.md) · [繁體中文](USER-MANUAL-0.5.0.zh-TW.md) · [UK English](USER-MANUAL-0.5.0.en-GB.md) · [US English](USER-MANUAL-0.5.0.en-US.md). [Verification status](TESTING-0.5.0.md).
