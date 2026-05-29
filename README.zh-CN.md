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
| 每批分类都临时生成文件夹 | 快速模式使用稳定根目录；完整模式再做全局规划 |
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
    <td><strong>备份</strong><br />创建、查看、恢复和删除本地书签快照，需要回滚时有明确入口。</td>
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
    <td><strong>规则</strong><br />速度模式、批大小、白名单网站和高级规则集中管理，不挤占连接配置。</td>
  </tr>
</table>

## 安全整理流程

<p align="center">
  <img src="docs/assets/workflow.svg" alt="Marko 安全整理流程" width="920" />
</p>

1. 先生成预览方案，不改动当前书签树。
2. 正式整理前创建本地快照备份。
3. 检查链接，只删除确认失效的书签。
4. 识别完全重复项，把不确定内容留给人工查看。
5. 快速模式使用稳定根目录；完整模式先规划全局目录，再分批分类。
6. 最后一次性重建书签栏根目录。

## v3.0 重点

| 模块 | v3.0 行为 |
| --- | --- |
| 主操作 | `预览整理` 是第一步，只有方案准备好后才显示 `应用方案`。 |
| 设置补全 | 缺少服务商、Base URL 或模型时，会直接引导到设置页；只有未缓存书签确实需要模型时才要求 API 访问。 |
| API 设置 | `测试并保存` 会验证连接，并保存当前可用配置。 |
| 慢模型 | DeepSeek 会使用更小的运行批量、更短的服务商专属超时、压缩后的模型输入和受控输出预算；若仍超时，再继续自动降批重试。 |
| 应用提速 | 已生成的预览会复用保存的方案，本地重建书签，不会再次跑模型。 |
| 速度模式 | 快速模式跳过失效链接检测和额外目录规划请求；完整模式保留链接检查和全局规划。 |
| 本地复跑 | 如果规则和分类缓存已覆盖全部书签，Marko 可以不要求 API Key 或模型接口授权就生成预览。 |
| DeepSeek | 新配置和重置配置默认从 5 开始；旧的大批量设置也会在本次运行中自动压低，减少慢模型卡顿。 |
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
node --check background.js
node --check popup.js
node --check options.js
node --check providers.js
node --check i18n.js
node --check rules.js
node --check cache-utils.js
node --check json-utils.js
node tests/run-tests.js
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
- 只有你启动整理或自动整理时，书签元数据才会发送给你配置的模型服务商。
- API Key 只保存在本地，不会发送给本项目或开发者。
- 完整模式会直接访问书签对应的网站做链接检查，并增加一次单独目录规划请求；快速模式会跳过这两项额外步骤。
- 快照备份保存在本地，可以在设置页恢复或删除。

完整说明见 [PRIVACY.md](PRIVACY.md)。

## 链接

- 仓库主页：[github.com/Ariandel35/marko](https://github.com/Ariandel35/marko)
- 问题反馈：[github.com/Ariandel35/marko/issues](https://github.com/Ariandel35/marko/issues)
- 隐私政策：[github.com/Ariandel35/marko/blob/main/PRIVACY.md](https://github.com/Ariandel35/marko/blob/main/PRIVACY.md)
