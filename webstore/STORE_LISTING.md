# TidyMarks AI - Chrome Web Store Copy

## 中文

### 单一用途
使用 AI 整理 Chrome 书签：先预览整理结果，再清理明显重复和失效链接，并把剩余书签重建为更清爽、更容易查找的结构。

### 简短描述
先预览，再用 AI 整理 Chrome 书签，清理明显重复和失效链接，重建更清爽的目录结构。

### 产品详情
TidyMarks AI 是一个面向重度书签用户的整理工具，目标不是把书签分得越来越细，而是让用户以后更快找到网页。

点击预览后，扩展会先生成整理方案，而不是直接改动现有书签。确认应用后，它会先创建本地快照备份，再扫描明显失效的链接、清理明显重复项，随后结合你自己配置的模型服务，对剩余书签进行全局规划和分批分类，最后一次性把结果重建到书签根目录。

核心能力：
- 支持 OpenAI、DeepSeek、Anthropic、Gemini、OpenRouter、Groq、xAI、Moonshot AI、Ollama，以及兼容 OpenAI 的自定义接口
- 支持自定义 Base URL、API Key、模型名和 Prompt
- API 检测成功后自动保存当前连接配置
- 模型响应过慢时自动降低当前批大小并重试
- 支持中英文界面，可根据浏览器语言自动切换
- 先预览，再确认执行，减少误整理风险
- 先扫描明显失效链接和重复入口，再进行 AI 分类
- 优先输出更少、更稳定的文件夹结构，避免越整理越难找
- 支持白名单网站、受保护根目录和域名目录规则
- 支持分类缓存和死链缓存，加快重复整理
- 每次正式整理前自动创建本地快照备份
- 支持手动备份、恢复和删除备份
- 支持自动静默整理
- 支持查看未处理项目和删除记录

隐私说明：
- 只有在你主动开始整理，或开启自动整理后，相关书签信息才会发送到你选择的模型服务商
- API Key、备份快照、分类缓存和死链缓存保存在浏览器本地
- 失效链接检测会直接访问书签对应的网站
- 扩展开发者不会接收你的书签数据

## English

### Single purpose
Use AI to organize Chrome bookmarks: preview the result first, remove clearly dead or duplicate links, and rebuild the remaining bookmarks into a simpler structure that is easier to browse.

### Short description
Preview first, then use AI to clean dead links, remove obvious duplicates, and rebuild a simpler Chrome bookmark structure.

### Detailed description
TidyMarks AI is a bookmark cleanup tool for people with large, messy bookmark libraries. The goal is not to create more folders. The goal is to make websites easier to find later.

When you click Preview, the extension generates a plan before changing anything. After you apply the plan, it creates a local snapshot backup, checks clearly dead links, removes obvious duplicates, plans a stable global folder structure, and uses your chosen model provider to classify bookmarks in batches. The final result is rebuilt directly at the bookmark root in one pass.

Key features:
- Works with OpenAI, DeepSeek, Anthropic, Gemini, OpenRouter, Groq, xAI, Moonshot AI, Ollama, and generic OpenAI-compatible endpoints
- Custom Base URL, API key, model name, and prompt
- Successful API tests save the current connection settings
- Slow model requests automatically retry with smaller batches
- English and Simplified Chinese interface support
- Preview-first organize flow to reduce mistakes
- Dead-link cleanup and conservative duplicate removal before AI classification
- Compact, stable folder structures instead of deep nesting
- Whitelist websites, protected root folders, and domain folder rules
- Classification cache reuse and dead-link cache for faster reruns
- Automatic local snapshot backup before each real organize run
- Manual backup, restore, and delete
- Auto organize support
- Reviewable unprocessed and deletion logs

Privacy summary:
- Bookmark data is only sent to the model provider chosen by the user
- API keys, backups, and caches are stored locally in the browser
- Dead-link checks send requests directly to bookmarked websites
- The extension developer does not receive bookmark data

## Visual Assets Checklist
- At least 5 screenshots:
  1. Popup home
  2. Settings - Connection
  3. Settings - Automation
  4. Settings - Backup management
  5. Rebuilt bookmark root result
