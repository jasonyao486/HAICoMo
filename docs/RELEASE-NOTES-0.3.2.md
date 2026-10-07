# HAICoMo 0.3.2 preview

English · [简体中文说明](#简体中文)

- Collapsed sidebar: centred 19px folder and terminal icons, with keyboard access and accessible names. Home and projects share the collapse state.
- Home: revised project-management description and Chinese heading/caption; the extra tagline is removed.
- Clicking the logo opens one window-level home view. It does not create a tab or discard project pages, drafts, background runs or relays. Cmd/Ctrl+W returns from home to the previous tab. Window close/update preparation also checks home drafts.
- Activity summaries use short roles, such as Human or Claude → Human. Expanded details retain full attribution. Old records are displayed without rewriting their contents; unknown models are not inferred from client names.
- Build, verification and publishing paths read the version from package.json. Four complete manuals and synthetic screenshots have been updated.

Project schema remains v5, as in 0.3.1; entry and proposal protocols are unchanged. Version 0.3.1 remains available.

Downloads: Apple Silicon Mac — arm64 DMG or ZIP; Windows x64 — windows-x64-setup.exe. Check the matching SHA256SUMS file. Source-code archives are not installers. Quit the existing app normally before replacing/reinstalling it; retain your project folders.

macOS uses ad-hoc signing and is not notarised. Windows is unsigned. Windows consumer-desktop human acceptance, Intel Mac, Windows ARM64 and untested OS versions remain unverified. Native CI and agent-assisted Mac checks are reported separately in [compatibility](https://github.com/jasonyao486/HAICoMo/blob/main/docs/COMPATIBILITY-0.3.2.md) and [test evidence](https://github.com/jasonyao486/HAICoMo/blob/main/docs/TESTING-0.3.2.md).

## 简体中文

- 收起侧栏后，只显示居中的 19px 文件夹与终端图标，保留提示和键盘操作；首页与项目共享收起状态。
- 更新首页说明及中文标题、页脚文案，删除原第三行说明。
- 点击 logo 只返回首页，不新增标签；原页面、草稿、后台运行和接力继续保留。首页按 Cmd/Ctrl+W 返回原标签，关闭窗口和升级准备仍检查所有草稿。
- 活动摘要使用“人类”“Claude → 人类”等短角色；完整信息保留在展开详情。不重写旧记录，不根据客户端或长名字猜模型。
- 同步更新四语手册、演示截图及双平台构建流程。

项目格式仍为 v5，入口与提案协议不变；0.3.1 保留。Mac 选择 arm64 DMG，Windows x64 选择 setup.exe。安装前正常退出旧版并保留项目目录。Windows 真机人工验收、签名和 Mac 公证状态仍如实列为待完成。
