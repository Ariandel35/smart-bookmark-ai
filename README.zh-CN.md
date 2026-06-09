# Marko

<p align="center">
  <img src="icons/icon-128.png" alt="Marko 图标" width="88" />
</p>

<p align="center">
  <strong>一个更克制的 Chrome 书签整理工具，由你选择的模型驱动。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="https://github.com/Ariandel35/marko/issues">问题反馈</a> ·
  <a href="PRIVACY.md">隐私说明</a>
</p>

<p align="center">
  <img alt="Chrome MV3" src="https://img.shields.io/badge/Chrome-MV3-4285F4?style=flat-square&logo=googlechrome&logoColor=white" />
  <img alt="Version 3.0.0" src="https://img.shields.io/badge/Version-3.0.0-1f6d53?style=flat-square" />
  <img alt="MIT License" src="https://img.shields.io/badge/License-MIT-black?style=flat-square" />
</p>

<p align="center">
  <img src="docs/assets/hero.svg" alt="Marko 产品封面" width="920" />
</p>

Marko 用来把拥挤的 Chrome 书签栏整理成更少、更清楚、更容易浏览的结构。它先生成 AI 辅助整理预览，正式改动前创建本地备份，只有在你确认后才重建书签。

## 为什么需要 Marko

| 混乱书签库常见问题 | Marko 的处理方式 |
| --- | --- |
| 同一个链接散落在多个文件夹 | 分类前先做保守去重 |
| 很多旧链接已经打不开 | 只删除确认失效的链接 |
| 每批分类都临时生成文件夹 | 快速模式使用稳定根目录；平衡模式保留 AI 但跳过链接扫描；完整模式在较快服务商上可先做全局规划 |
| 一键整理风险太高 | 先预览，再备份，最后重建 |
| 设置项太多，主流程不够直接 | 弹窗更聚焦，设置路径更短 |

## 界面一览

<p align="center">
  <img src="docs/assets/pages.svg" alt="Marko 弹窗、设置和备份页面" width="920" />
</p>

<table>
  <tr>
    <td width="34%">
      <img src="docs/screenshots/popup-store.png" alt="Marko 弹窗预览" width="100%" />
    </td>
    <td width="33%">
      <img src="docs/screenshots/options-connection-store.png" alt="Marko 模型设置" width="100%" />
    </td>
    <td width="33%">
      <img src="docs/screenshots/options-backup-store.png" alt="Marko 备份设置" width="100%" />
    </td>
  </tr>
  <tr>
    <td><strong>弹窗</strong><br />预览、应用、备份、取消和进度查看集中在一个紧凑面板里。</td>
    <td><strong>连接</strong><br />选择服务商，测试 API，保存可用模型，高级项默认不打扰主流程。</td>
    <td><strong>备份</strong><br />创建、查看、恢复和删除本地书签快照；恢复前会先把当前状态存成新的回滚点。</td>
  </tr>
</table>

<table>
  <tr>
    <td width="50%">
      <img src="docs/screenshots/popup-apply-store.png" alt="Marko 行内应用确认" width="100%" />
    </td>
    <td width="50%">
      <img src="docs/screenshots/options-organization-store.png" alt="Marko 整理规则和速度模式" width="100%" />
    </td>
  </tr>
  <tr>
    <td><strong>应用</strong><br />在弹窗内确认已保存的预览方案，先备份，再本地重建，不会再次跑模型。</td>
    <td><strong>规则</strong><br />用和弹窗一致的快速/平衡/完整三段控件调整速度模式，并集中管理批大小、白名单网站和高级规则。</td>
  </tr>
</table>

## 安全整理流程

<p align="center">
  <img src="docs/assets/workflow.svg" alt="Marko 安全整理流程" width="920" />
</p>

1. 先生成预览方案，不改动当前书签树。
2. 正式整理前创建本地快照备份。
3. 按所选模式处理：快速模式用本地规则，平衡模式跳过链接扫描但保留 AI 分类，完整模式再加入链接检查。
4. 识别完全重复项，把不确定内容留给人工查看。
5. 较快完整模式服务商可先规划全局目录；慢模型会跳过额外请求，并可在超时后本地兜底。
6. 最后一次性重建书签栏根目录。

## v3.0 重点

| 模块 | v3.0 行为 |
| --- | --- |
| 主操作 | `预览整理` 是第一步，只有方案准备好后才显示 `应用方案`。 |
| 弹窗模式切换 | 可直接在弹窗切换快速/平衡/完整模式；模式变化后已保存预览会自动失效。 |
| 设置补全 | 缺少服务商、Base URL 或模型时，会直接引导到设置页；快速预览不要求模型访问，因此设置页默认只露出服务商，AI 连接字段会在平衡或完整模式需要时再展开。 |
| API 设置 | `测试并保存` 会验证连接、保存当前可用配置，并在自动整理权限仍未授权时明确提示。 |
| 慢模型 | DeepSeek 和 DeepSeek 兼容接口会跳过单独目录规划请求，运行批次最多 9 条，单个模型请求最多 3 条，并最多 3 个小请求并发处理；批处理会优先即时唤醒，Chrome alarm 仅作为后台兜底。如果 6 秒无首包或 14 秒未完整返回，Marko 会停止等待本轮模型，改用本地规则、缓存、内置规则和待手动分类兜底完成。 |
| 进度反馈 | 弹窗会显示已运行时间，并在已有实际处理进度后估算预计剩余时间；如果 45 秒没有后台更新，详情区会说明模型可能仍在等待，并建议继续等或取消后改用快速模式重试。时间文本会每秒轻量刷新，不需要每秒重载完整弹窗状态。 |
| 应用提速 | 已生成的预览会复用保存的方案，本地重建书签，不会再次跑模型。 |
| 速度模式 | 快速模式跳过失效链接检测、额外目录规划请求和模型等待；未命中本地规则的书签进入待手动分类。平衡模式跳过失效链接检测和额外目录规划，但保留 AI 分类。完整模式保留链接检查和 AI 分类，但会先用确定性的内置域名规则减少模型请求。 |
| 完整模式链接检测 | 完整模式每次最多并发检测 8 条链接，单条超过 6 秒会留给人工确认，避免慢网站拖住整批预览。 |
| 本地复跑 | 快速模式可以不要求 API Key 或模型接口授权就生成预览，因为自定义规则、分类缓存、内置域名规则和待手动分类兜底会在本地完成。 |
| 自动整理 | 快速自动整理可以不填 API Key 本地运行；静默整理开关打开后才启用间隔设置，并会在保存前直接显示权限影响。 |
| DeepSeek | 新配置和重置配置默认从 9 开始；旧的大批量设置会在读取或保存时自动压低，DeepSeek 兼容 Base URL 或模型名也会使用同一策略，旧的运行中任务会在下一批开始前自动规范化。设置页会在慢模型批量被压低前先提示。 |
| 高级规则 | 受保护根目录、域名规则和 Prompt 仍然可用，但默认更安静。 |
| 语言 | 扩展界面支持英文和简体中文。 |

## 模型服务

Marko 支持 OpenAI、DeepSeek、MiniMax、Anthropic、Gemini、OpenRouter、Groq、xAI、Moonshot AI、Ollama，以及通用 OpenAI Compatible 接口。

你可以配置服务商、Base URL、API Key、模型名、Prompt、批大小、白名单、受保护根目录和域名目录规则。

## 本地安装

1. 打开 `chrome://extensions`。
2. 启用 `开发者模式`。
3. 点击 `加载已解压的扩展程序`。
4. 选择当前仓库根目录。

## 开发检查

运行静态检查和扩展测试：

```bash
npm test
```

审计弹窗和设置页在窄屏、宽屏下的自适应布局：

```bash
npm run audit:ui
```

使用 Chrome for Testing 或 Chromium 运行真实解压扩展冒烟测试：

```bash
npm run e2e:extension
```

脚本会使用临时浏览器 profile，写入真实书签，然后验证真实弹窗“预览整理 -> 应用方案 -> 备份并应用”点击流、真实弹窗未处理项删除按钮、真实设置页备份创建/恢复/删除点击流、100 条书签快速模式规模用例、手动备份、快速预览、重复清理、备份记录、真实设置页保存、DeepSeek 批量压低、弹窗和设置页。
自动化 Chrome 默认使用 headless 后台运行，不会打开可见浏览器窗口。只有需要观察过程时才设置 `MARKO_SHOW_BROWSER=1`；设置 `MARKO_EXTENSION_SCREENSHOT_DIR=/tmp/marko-e2e` 可以保留该次运行的弹窗和设置页截图。

UI 或商店文案改动后重新生成 README 和 Chrome Web Store 截图：

```bash
npm run render:store-assets
```

渲染脚本同样默认 headless 后台运行，使用仓库声明的 `playwright-core` 开发依赖，并控制你已安装的 Chrome 或 Chrome for Testing，不会下载浏览器。新 checkout 先运行 `npm install`；Chrome for Testing 不在默认位置时，可设置 `MARKO_RENDER_BROWSER`。

上传前运行完整发布门禁：

```bash
npm run verify:release
```

运行发布门禁并追加真实扩展冒烟测试：

```bash
npm run verify:release:full
```

生成 Chrome Web Store 上传包：

```bash
npm run package:webstore
```

主要文件：

| 文件 | 作用 |
| --- | --- |
| [manifest.json](manifest.json) | Chrome MV3 扩展清单 |
| [background.js](background.js) | 整理任务、备份、扫描和重建逻辑 |
| [providers.js](providers.js) | 模型服务默认值、请求构造和响应解析 |
| [popup.js](popup.js) | 预览和应用流程 |
| [options.js](options.js) | 设置、API 测试、备份和规则 |
| [i18n.js](i18n.js) | 英文和简体中文文案 |
| [tests](tests) | JSON、规则、缓存、静态资源和 i18n 检查 |
| [docs](docs) | README 配图和截图 |
| [webstore](webstore) | Chrome Web Store 上架材料 |

## 隐私边界

- 书签标题、URL、当前路径、Prompt、API 设置、缓存和备份默认都留在本地浏览器。
- 只有平衡/完整模式预览或已开启自动整理且本地规则、缓存无法覆盖时，书签元数据才会发送给你配置的模型服务商。
- 应用已保存的预览方案会直接本地重建，不会再次请求模型。
- API Key 只保存在本地，不会发送给本项目或开发者。
- 平衡模式可使用模型分类但不会直接检测书签对应的网站。完整模式会直接访问书签对应的网站做链接检查，并使用模型分类；较快服务商可能额外请求目录规划，慢模型会跳过这一步。快速模式会跳过这些外部请求。
- 快照备份保存在本地，可以在设置页恢复或删除；恢复前会先创建新的本地快照。

完整说明见 [PRIVACY.md](PRIVACY.md)。

## 链接

- 仓库主页：[github.com/Ariandel35/marko](https://github.com/Ariandel35/marko)
- 问题反馈：[github.com/Ariandel35/marko/issues](https://github.com/Ariandel35/marko/issues)
- 隐私政策：[github.com/Ariandel35/marko/blob/main/PRIVACY.md](https://github.com/Ariandel35/marko/blob/main/PRIVACY.md)
