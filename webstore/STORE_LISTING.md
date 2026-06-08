# Marko - Chrome Web Store Copy

## 中文

### 单一用途
使用 AI 整理 Chrome 书签：先预览整理结果，再清理明显重复项，可选检测失效链接，并把剩余书签重建为更清爽、更容易查找的结构。

### 简短描述
先预览，再用 AI 整理 Chrome 书签，清理明显重复项，可选检测失效链接。

### 产品详情
Marko 是一个面向重度书签用户的整理工具，目标不是把书签分得越来越细，而是让用户以后更快找到网页。

点击预览后，扩展会先生成整理方案，而不是直接改动现有书签。确认应用时会复用已保存的预览方案，先创建本地快照备份，再直接在本地重建书签，不会再次请求模型。默认快速模式会跳过失效链接检测、单独目录规划请求和模型等待，让预览更快、权限更少；未命中本地规则的书签会进入待手动分类。平衡模式会跳过失效链接扫描和额外目录规划，但保留 AI 分类，只需要模型接口权限。完整模式还会扫描明显失效的链接，并先用确定性的内置域名规则减少模型请求，再结合你自己配置的模型服务分批分类；较快服务商可以先生成全局目录方案，慢模型会跳过这一步并可在超时后本地兜底。整理过程会清理明显重复项，最后一次性把结果重建到书签根目录。

核心能力：
- 支持 OpenAI、DeepSeek、MiniMax、Anthropic、Gemini、OpenRouter、Groq、xAI、Moonshot AI、Ollama，以及兼容 OpenAI 的自定义接口
- 支持自定义 Base URL、API Key、模型名和 Prompt
- API 检测成功后自动保存当前连接配置
- API 检测成功但自动整理权限未授权时，会明确显示该权限问题
- 静默整理使用直接开关；间隔设置只在开关打开后启用，并会说明当前速度模式是本地运行、需要模型接口权限，还是还需要网站访问权限
- 快速模式不需要模型接口访问即可本地完成；平衡模式保留 AI 分类但跳过网站检测；完整模式才会检测书签链接并使用 AI 分类，且会先用内置域名规则减少模型请求
- 完整模式链接检测最多并发 8 条，单条超过 6 秒会留给人工确认，避免慢网站拖住整批预览
- DeepSeek 和 DeepSeek 兼容接口会在请求前再次拆分大批量，运行批次最多 9 条、单个模型请求最多 3 条，并最多 3 个小请求并发处理；如果 6 秒无首包或 14 秒未完整返回，本轮会停止等待模型，改用本地规则、缓存、内置规则和待手动分类兜底完成
- 慢模型批大小将被压低时，设置页会在保存前给出页面内提示
- 应用已生成预览时复用保存的方案，本地重建，不会再次请求模型
- 应用预览遇到可恢复失败时，可修复后直接重试保存方案
- 预览阶段的未处理项保持只读，应用方案前不会出现保留/删除操作
- 处理未处理项时会锁定整组操作按钮，避免重复点击造成并发请求
- 弹窗状态刷新失败时会显示页面内错误并继续重试，恢复后自动清除提示
- 弹窗操作已经成功但后续状态刷新失败时，会保留刷新失败提示，不再误报成操作失败
- 发布前可运行 UI 审计脚本检查中英文窄屏布局，横向溢出、按钮裁切或脚本异常会直接失败
- 发布前可运行真实解压扩展冒烟测试，确认 Marko 的 `background.js` service worker、弹窗和设置页能在 Chrome for Testing 或 Chromium 中正常运行
- 发布前可用一条命令串联测试、UI 审计、打包、ZIP 校验和上传文件清单检查
- 发布门禁会校验 README 截图、商店宣传图和图标尺寸，减少后台上传素材出错
- 发布门禁会校验商店文案、隐私政策、审核备注、发布清单和 GitHub 商店链接，减少后台填写遗漏
- 按钮和状态徽标会在容器内收缩和换行，减少长文案造成的挤压
- 弹窗文件夹摘要读取失败时会在详情区提示，不会静默显示空白结果区
- 白名单网站目录读取失败时会显示独立错误提示，不再误显示成没有可选网站
- 弹窗设置入口在两种打开路径都失败时会显示页面内错误，不会静默无响应
- 弹窗和设置页使用页面内确认与错误提示，避免浏览器原生弹窗打断流程
- 设置页隐私按钮会在新建标签页失败时回退到窗口打开，并在两种方式都失败时显示页面内错误
- 自动整理开关会实时说明当前模式需要本地运行、模型接口权限还是网站访问权限
- 设置页会把连接配置加载和备份/权限状态刷新分开处理，局部刷新失败不会覆盖已保存配置
- 权限状态刷新失败时会恢复控件并给出页面内提示
- 备份列表恢复加载后会清除过期错误提示，状态显示更一致
- 备份操作成功但列表刷新失败时，会保留操作完成提示，并在列表区域显示加载错误
- 支持中英文界面，可根据浏览器语言自动切换
- 先预览，再确认执行，减少误整理风险
- 可选扫描明显失效链接，分类前清理重复入口
- 优先输出更少、更稳定的文件夹结构，避免越整理越难找
- 支持白名单网站、受保护根目录和域名目录规则
- 支持分类缓存和死链缓存，加快重复整理
- 每次正式整理前自动创建本地快照备份
- 支持手动备份、恢复和删除备份；恢复前会先保存当前书签快照，便于回退
- 支持自动静默整理
- 支持查看未处理项目和删除记录

隐私说明：
- 只有平衡/完整模式预览或已开启自动整理且仍需要模型分类时，相关书签信息才会发送到你选择的模型服务商
- 应用已保存的预览方案会直接本地重建，不会再次请求模型
- API Key、备份快照、分类缓存和死链缓存保存在浏览器本地
- 平衡模式不会直接访问书签对应的网站，但可使用 AI 分类；只有完整模式会直接访问书签对应的网站并使用 AI 分类；快速模式会跳过这些外部请求，慢模型会跳过额外目录规划请求
- 扩展开发者不会接收你的书签数据

## English

### Single purpose
Use AI to organize Chrome bookmarks: preview the result first, remove obvious duplicates, optionally check dead links, and rebuild the remaining bookmarks into a simpler structure.

### Short description
Preview first, then use AI to clean obvious duplicates and optionally check dead links.

### Detailed description
Marko is a bookmark cleanup tool for people with large, messy bookmark libraries. The goal is not to create more folders. The goal is to make websites easier to find later.

When you click Preview, the extension generates a plan before changing anything. You can switch Fast, Balanced, or Complete directly in the popup before preview. When you apply that plan, Marko reuses the saved preview, creates a local snapshot backup, and rebuilds locally without calling the model again. Fast mode skips dead-link checks, the separate taxonomy-planning request, and model waiting for quicker previews and fewer permissions; it applies conservative built-in domain rules after custom rules and cache reuse, then puts unmatched bookmarks in manual review. Balanced mode skips dead-link scans and extra taxonomy planning but keeps AI classification with only model endpoint access. Complete mode also checks clearly dead links, applies deterministic built-in domain rules to reduce model work, skips the extra taxonomy-planning request when fewer than 25 bookmarks still need AI, and uses your chosen model provider to classify uncached bookmarks in batches. Slow providers skip the separate taxonomy-planning request and can fall back to local rules, cache, built-in rules, and manual review if model classification times out. Marko removes obvious duplicates and rebuilds the final result directly at the bookmark root in one pass.

Key features:
- Works with OpenAI, DeepSeek, MiniMax, Anthropic, Gemini, OpenRouter, Groq, xAI, Moonshot AI, Ollama, and generic OpenAI-compatible endpoints
- Custom Base URL, API key, model name, and prompt
- Successful API tests save the current connection settings
- If an API test succeeds but auto organize access is not granted, Marko reports that permission issue inline
- Fast/Balanced/Complete mode can be changed directly in the popup before preview
- Fast mode finishes locally without model endpoint access; Balanced keeps AI classification without website scans; Complete mode adds link checks and AI classification but uses built-in domain rules before AI, while small AI candidate sets and slow providers skip the extra taxonomy-planning request
- Complete-mode link checks scan up to 8 links at a time and leave links that take longer than 6 seconds for review, so slow sites do not hold up the whole preview
- Fast local reruns use built-in domain rules, cached classifications, and manual-review fallback to skip model calls and batch scheduling
- Fast automatic organize can run locally without an API key; Balanced automatic organize requires model credentials; Complete automatic organize also requires website access
- Slow providers such as DeepSeek and DeepSeek-compatible endpoints re-split large batches before each request, cap runtime batches at 9 bookmarks, cap each model request at 3 bookmarks, and run up to three mini requests at a time; if the model has no first response in 6 seconds or no full response in 14 seconds, the run stops waiting and finishes with local fallback instead of failing the whole flow
- Settings warn inline before slow-model batch sizes are capped for faster previews
- Applying a generated preview reuses the saved plan and rebuilds locally without another model request
- Recoverable apply failures keep the saved preview retry path available after the issue is fixed
- Backup failures before applying a saved preview keep the same retry path available
- Apply Plan retry appears only after a preview-apply failure, not after unrelated errors
- Unprocessed items stay read-only until an organize/apply run completes, with keep/delete actions shown only for actionable items
- Unprocessed item actions lock the whole action group while one item is being kept or deleted
- Popup state refresh failures show an inline error, keep retrying, and clear after refresh recovers
- Popup folder-summary load failures show an inline detail message instead of a silently empty result area
- Whitelist website catalog load failures show a distinct inline error instead of looking like an empty bookmark-site list
- Popup Settings shortcuts show inline feedback if both opening paths fail
- Popup action errors keep their specific failure message even if the follow-up popup refresh also fails
- Popup action successes keep refresh-failure feedback visible instead of clearing it or reporting the completed action as failed
- A pre-release UI audit script checks bilingual narrow-screen layouts and fails on horizontal overflow, clipped buttons, or runtime exceptions
- A real unpacked-extension smoke test can confirm Marko's `background.js` service worker, popup, and options page in Chrome for Testing or Chromium
- A single release gate runs tests, UI audit, package generation, ZIP validation, and upload file allowlist checks before publishing
- The release gate validates README screenshots, store promo image dimensions, and icon sizes before upload
- The release gate validates store listing, privacy policy, review notes, publish checklist, and GitHub store links before packaging
- Buttons and status badges shrink and wrap inside their containers to reduce long-label overflow
- Popup and settings startup controls stay disabled until saved state is loaded or a recoverable load failure is shown
- Long settings status and hint text wraps safely on narrow screens, with clearer muted disabled buttons
- Popup and settings actions use inline confirmations and validation feedback instead of browser dialogs
- Settings Privacy falls back from tab creation to window opening and shows inline feedback if both paths are blocked
- Auto organize uses a direct Silent organize switch; the interval field is enabled only after the switch is on, and the page explains whether the selected mode runs locally, needs model endpoint access, or needs website access
- Save and Test & Save keep API or automation permission-denied feedback visible even if the follow-up access-status refresh fails
- Settings load keeps saved connection fields visible even when backup or permission status refreshes fail
- Access-status refresh failures restore controls and show inline feedback
- Recovered backup-list refreshes clear stale error text for more consistent status feedback
- Backup action successes stay visible even if the follow-up list refresh fails, with the list-load error shown inline
- English and Simplified Chinese interface support
- Preview-first organize flow to reduce mistakes
- Optional dead-link cleanup and conservative duplicate removal before AI classification
- Compact, stable folder structures instead of deep nesting
- Whitelist websites, protected root folders, and domain folder rules
- Classification cache reuse and dead-link cache for faster reruns
- Automatic local snapshot backup before each real organize run
- Manual backup, restore, and delete, with a fresh pre-restore snapshot before replacing current bookmarks
- Auto organize support
- Reviewable unprocessed and deletion logs

Privacy summary:
- Bookmark data is sent only to the model provider chosen by the user when Balanced/Complete preview or enabled auto organize still needs model classification
- Applying a saved preview rebuilds locally without another model request
- API keys, backups, and caches are stored locally in the browser
- Balanced mode can use AI classification without directly checking bookmarked websites; only Complete mode sends requests directly to bookmarked websites and uses AI classification; Fast mode skips those external requests, and slow providers skip the extra taxonomy-planning request
- The extension developer does not receive bookmark data

## Visual Assets Checklist
- At least 5 screenshots:
  1. Popup preview
  2. Popup inline apply confirmation
  3. Settings - Connection
  4. Settings - Organization rules with Speed mode
  5. Settings - Backup management with inline restore confirmation
