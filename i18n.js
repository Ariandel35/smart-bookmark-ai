(function initSmartBookmarkI18n(globalScope) {
  const uiLanguage =
    (typeof chrome !== "undefined" &&
      chrome.i18n &&
      typeof chrome.i18n.getUILanguage === "function" &&
      chrome.i18n.getUILanguage()) ||
    (typeof navigator !== "undefined" && navigator.language) ||
    "en";

  const locale = String(uiLanguage).toLowerCase().startsWith("zh") ? "zh_CN" : "en";
  const langTag = locale === "zh_CN" ? "zh-CN" : "en";

  const LEGACY_DEFAULT_PROMPT_ZH = `你是一名资深信息架构师，请根据书签标题、URL 和现有路径，为每条书签分配稳定、可复用、便于长期维护的中文分类。

要求：
1. 优先使用宽泛且可长期复用的大类，不要给单个链接创建独占文件夹。
2. folderPath 控制在 1 到 3 层之间，命名简洁清晰。
3. 同类内容尽量归并，避免只在措辞上略有差异的重复分类。
4. 如果信息不足以准确判断，请放入“待手动分类”。`;

  const PREVIOUS_DEFAULT_PROMPT_ZH = `你是一名极度克制的信息架构师，请整理浏览器书签，但目标不是“分类越细越专业”，而是“普通人以后能更快找到网页”。

强制规则：
1. 整体目录必须尽量少，一级目录总数以 6 到 8 个为目标，绝对不要超过 9 个。
2. 每条书签最多只能使用 2 级结构：
   - 允许：["AI/技术"]、["工具/效率", "浏览器插件"]
   - 不允许：["技术", "AI", "模型", "推理"] 这种 3 级或 4 级结构
3. 一级目录必须优先复用下面这些稳定大类，不要自由发明新大类：
   - AI/技术
   - 学习/教程
   - 工具/效率
   - 产品/设计
   - 资讯/社区
   - 购物/服务
   - 娱乐/内容
   - 生活/资源
   - 待手动分类
4. 只有在确实有必要时才添加二级目录；如果一级目录已经足够清楚，就只保留一级目录。
5. 宁可合并，不要细分。不要把意思接近的内容拆成多个相似文件夹。
6. 如果两个书签明显是同一个网页、同一篇内容、同一工具的重复入口，保留信息更完整、标题更清晰的一条，其他标记为重复删除。
7. 无法确定是否重复时，不要删除，只做分类。
8. 信息不足时统一放入“待手动分类”。`;

  const DEFAULT_PROMPT_ZH = `你是一名极度克制的信息架构师，请整理浏览器书签，但目标不是“分类越细越专业”，而是“普通人以后能更快找到网页”。

强制规则：
1. 整体目录必须尽量少，一级目录总数以 6 到 8 个为目标，绝对不要超过 9 个。
2. 每条书签最多只能使用 2 级结构：
   - 允许：["AI/技术"]、["工具/效率", "浏览器插件"]
   - 不允许：["技术", "AI", "模型", "推理"] 这种 3 级或 4 级结构
3. 一级目录必须优先复用下面这些稳定大类，不要自由发明新大类：
   - AI/技术
   - 学习/教程
   - 工具/效率
   - 产品/设计
   - 资讯/社区
   - 购物/服务
   - 娱乐/内容
   - 生活/资源
   - 待手动分类
4. 只有在确实有必要时才添加二级目录；如果一级目录已经足够清楚，就只保留一级目录。
5. 宁可合并，不要细分。不要把意思接近的内容拆成多个相似文件夹。
6. 去重优先于分类。先比较你当前收到的整批输入书签，再决定 folderPath。
7. 以下情况优先视为“同一个网页 / 同一个工具”的重复入口：
   - 规范化后 URL 相同
   - 只差 http/https、www、结尾斜杠、锚点，或明显追踪参数（如 utm_*、spm、from、ref 等）
   - 同一网站的移动版/桌面版、短链接/长链接，但实际落到同一内容页
8. 对重复项的保留规则：优先保留 https、标题更完整清晰、URL 参数更少、非移动版、非短链接、可读性更好的那一条。
9. 搜索结果页、列表页、登录后页面、带会话参数页面要保守；如果不能明确证明是同一内容，禁止删除。
10. 不要把重复入口分别放进不同文件夹；确认重复时只保留一条，其余标记为重复删除。
11. 信息不足时统一放入“待手动分类”。`;

  const PREVIOUS_DEFAULT_PROMPT_EN = `You are an extremely restrained information architect. Organize browser bookmarks for everyday people, not for maximum taxonomy complexity.

Hard rules:
1. Keep the overall folder structure small. Aim for 6 to 8 top-level folders and never exceed 9.
2. Each bookmark may use at most 2 levels of structure:
   - Allowed: ["AI & Tech"], ["Tools & Productivity", "Browser Extensions"]
   - Not allowed: ["Tech", "AI", "Models", "Reasoning"] or any 3- or 4-level structure
3. Reuse these stable top-level categories whenever possible instead of inventing new ones:
   - AI & Tech
   - Learning & Tutorials
   - Tools & Productivity
   - Product & Design
   - News & Communities
   - Shopping & Services
   - Entertainment & Content
   - Life & Resources
   - Needs Manual Review
4. Add a second-level folder only when it is truly necessary. If the first level is already clear, keep only one level.
5. Prefer merging over splitting. Do not create multiple similar folders for closely related content.
6. If two bookmarks are clearly duplicates of the same page, article, or tool, keep the clearer one and mark the others as duplicate deletions.
7. If duplicate status is uncertain, do not delete it. Only classify it.
8. If the information is insufficient, put it in ["Needs Manual Review"].`;

  const DEFAULT_PROMPT_EN = `You are an extremely restrained information architect. Organize browser bookmarks for everyday people, not for maximum taxonomy complexity.

Hard rules:
1. Keep the overall folder structure small. Aim for 6 to 8 top-level folders and never exceed 9.
2. Each bookmark may use at most 2 levels of structure:
   - Allowed: ["AI & Tech"], ["Tools & Productivity", "Browser Extensions"]
   - Not allowed: ["Tech", "AI", "Models", "Reasoning"] or any 3- or 4-level structure
3. Reuse these stable top-level categories whenever possible instead of inventing new ones:
   - AI & Tech
   - Learning & Tutorials
   - Tools & Productivity
   - Product & Design
   - News & Communities
   - Shopping & Services
   - Entertainment & Content
   - Life & Resources
   - Needs Manual Review
4. Add a second-level folder only when it is truly necessary. If the first level is already clear, keep only one level.
5. Prefer merging over splitting. Do not create multiple similar folders for closely related content.
6. Deduplication comes before classification. Compare the whole input batch you received before deciding the folderPath.
7. Treat bookmarks as duplicates first when they clearly point to the same destination, for example:
   - The normalized URL is the same
   - The only differences are http/https, www, trailing slash, fragment, or obvious tracking parameters such as utm_*, spm, from, or ref
   - They are mobile/desktop variants or short/long links of the same site, but land on the same content page
8. When choosing which duplicate to keep, prefer https, clearer titles, fewer URL parameters, non-mobile pages, non-short links, and the more canonical-looking URL.
9. Be conservative with search pages, listing pages, logged-in pages, or session-specific URLs. If sameness is not certain, do not delete.
10. Do not place duplicate entries into different folders. If duplicates are confirmed, keep one and mark the others as duplicate deletions.
11. If the information is insufficient, put it in ["Needs Manual Review"].`;

  const BUILT_IN_PROMPT_VARIANTS = new Set(
    [
      LEGACY_DEFAULT_PROMPT_ZH,
      PREVIOUS_DEFAULT_PROMPT_ZH,
      DEFAULT_PROMPT_ZH,
      PREVIOUS_DEFAULT_PROMPT_EN,
      DEFAULT_PROMPT_EN
    ].map((prompt) => prompt.trim())
  );

  const MESSAGES = {
    en: {
      popupPageTitle: "Marko",
      popupMainTitle: "Marko",
      popupSubtitle: "Preview a simpler AI bookmark structure with backups, duplicate cleanup, and optional dead-link checks.",
      popupStepConnect: "1. Open Settings and connect a model",
      popupStepPreview: "2. Run Preview to check the plan",
      popupStepOrganize: "3. Apply the plan when it looks right",
      optionsButton: "Settings",
      phaseIdle: "Idle",
      phasePreview: "Preview",
      setupButton: "Set up",
      startButton: "Organize",
      confirmOrganizeButton: "Apply Plan",
      previewButton: "Preview",
      backupButton: "Backup",
      cancelButton: "Cancel",
      progressWaiting: "Waiting to start",
      resultNavAria: "Result navigation",
      navOverview: "Overview",
      navProcessed: "Processed",
      navFolders: "Categorized",
      navDeleted: "Deleted",
      navWarnings: "Unprocessed",
      statTotal: "Total",
      statMoved: "Categorized",
      statDeleted: "Deleted",
      statWarnings: "Needs review",
      optionsPageTitle: "Marko - Settings",
      optionsMeta: "Marko / Options",
      optionsMainTitle: "Settings",
      optionsSubtitle: "Connect a model, preview the plan, then apply it in one flow.",
      saveBadgeUnsaved: "Unsaved",
      saveBadgeSynced: "Synced",
      saveBadgeSaved: "Saved",
      saveBadgeFailed: "Load failed",
      saveButton: "Save",
      resetButton: "Reset",
      privacyButton: "Privacy",
      navEyebrow: "Navigation",
      navTitle: "Settings Navigation",
      navConnection: "Connection",
      navOrganize: "Rules",
      navAutomation: "Auto",
      navBackup: "Backups",
      connectionEyebrow: "Connection",
      connectionTitle: "Model",
      labelProvider: "Provider",
      labelModel: "Model",
      labelBaseUrl: "Base URL",
      labelApiKey: "API Key",
      placeholderModel: "e.g. gpt-4.1-mini",
      placeholderApiKey: "Enter API key",
      placeholderApiKeyOptional: "Optional for local models",
      testApiButton: "Test & Save",
      hostAccessButton: "Grant Access",
      hostAccessGrantedButton: "Granted",
      organizeEyebrow: "Organization",
      organizeTitle: "Rules",
      labelBatchSize: "Batch size",
      labelLinkCheckMode: "Speed mode",
      linkCheckFast: "Fast",
      linkCheckComplete: "Complete",
      hintLinkCheckMode:
        "Fast skips dead-link checks during organize. Complete checks links before classification.",
      labelWhitelistDomains: "Whitelist Websites",
      labelProtectedRootFolders: "Protected Root Folders",
      labelDomainFolderRules: "Domain Folder Rules",
      labelCustomPrompt: "Custom Prompt",
      placeholderWhitelistSearch: "Search bookmark websites",
      placeholderProtectedRootFolders: "One root folder per line, for example:\nWork\nPersonal\nReference",
      placeholderDomainFolderRules:
        "One rule per line, for example:\ngithub.com => AI & Tech / Code\nmail.google.com => Tools & Productivity",
      placeholderPrompt: "Enter custom prompt",
      whitelistSelectedTitle: "Selected",
      whitelistAvailableTitle: "Bookmark Websites",
      whitelistSelectedEmpty: "No selected websites",
      whitelistLoading: "Loading bookmark websites…",
      whitelistCatalogEmpty: "No bookmark websites found",
      whitelistNoResults: "No matching websites",
      whitelistSelectionCount: "{count} selected",
      whitelistBookmarkCount: "{count} bookmarks",
      automationEyebrow: "Automation",
      automationTitle: "Auto",
      labelAutoOrganizeEnabled: "Silent organize",
      autoOrganizeOn: "Enabled",
      autoOrganizeOff: "Disabled",
      labelAutoOrganizeInterval: "Interval (hours)",
      settingsStepConnect: "Connect your provider and test the API.",
      settingsStepAccess: "Grant access for your API endpoint, and full website access only when complete link checks are enabled.",
      settingsStepRun: "Preview first, then organize when the result looks right.",
      advancedSettingsTitle: "Advanced",
      backupEyebrow: "Backup",
      backupTitle: "Backups",
      backupLoading: "Loading",
      backupEmpty: "No backups yet",
      createBackupNow: "Create Backup",
      backupSourceAuto: "Auto",
      backupSourceManual: "Manual",
      restoreButton: "Restore",
      deleteButton: "Delete",
      defaultStatusDetail:
        "Preview the plan first. Applying it creates a backup and rebuilds the bookmark bar.",
      phaseRunning: "Running",
      phaseCompleted: "Completed",
      phaseCancelled: "Cancelled",
      phaseError: "Error",
      phaseUnknown: "Unknown",
      logMoveFailed: "Move failed",
      logDeleteFailed: "Delete failed",
      logScanUncertain: "Uncertain status",
      logScanFailed: "Scan failed",
      logDuplicateDeleted: "Duplicate deleted",
      logDeadLinkDeleted: "Dead link deleted",
      logManualDeleted: "Deleted manually",
      logRecord: "Record",
      batchMeta: "Batch {current}/{total}",
      batchSizeMeta: "Batch size {count}",
      updatedMeta: "Updated {time}",
      unnamedCategory: "Untitled category",
      rootCategoryTitle: "Root",
      tableFolder: "Category",
      tableCount: "Bookmarks",
      notStartedMessage: "No organize task has started yet.",
      untitledBookmark: "(Untitled bookmark)",
      noReason: "No details yet.",
      noSuggestion: "No extra suggestion.",
      suggestionPrefix: "Suggestion: {text}",
      keepButton: "Keep",
      keepError: "Failed to keep this bookmark.",
      deleteUnprocessedError: "Failed to delete this bookmark.",
      noWarningsTitle: "No unprocessed items",
      noWarningsDesc:
        "Uncertain scans, move failures, and other items that require your decision will appear here.",
      noDeletedTitle: "No deletion records",
      noDeletedDesc:
        "Deleted duplicates and confirmed dead links will leave a traceable log here.",
      setupRequiredTitle: "Set up your model",
      setupRequiredDesc:
        "Provider, Base URL, model, and API key are required before preview.",
      setupMissingProvider: "Choose a provider first.",
      setupMissingBaseUrl: "Base URL is required before preview.",
      setupMissingModel: "Model is required before preview.",
      setupMissingApiKey: "API key is required for this provider.",
      previewReadyConfirm:
        "Apply this preview plan now? Marko will back up and rebuild locally without running the model again.",
      hostPermissionRequiredTitle: "Access is required before organizing.",
      hostPermissionRequiredDetail:
        "Fast mode needs access to your configured model endpoint. Complete mode also needs website access for link checks.",
      startJobFailed: "Failed to start the task.",
      createBackupFailed: "Failed to create backup.",
      previewStartFailed: "Failed to generate preview.",
      resolveUnprocessedFailed: "Failed to handle this unprocessed bookmark.",
      startJobException: "An error occurred while starting the background task.",
      previewStartException: "An error occurred while generating the preview.",
      createBackupException: "An error occurred while creating a manual backup.",
      cancelJobFailed: "Failed to cancel the task. Please try again.",
      readStateFailed: "Failed to read local state. Please reopen the popup.",
      hostAccessGranted: "Access granted",
      hostAccessMissing: "Access not granted",
      backupErrorBadge: "Error",
      backupCreatingBadge: "Creating",
      backupRestoringBadge: "Restoring",
      backupDeletingBadge: "Deleting",
      batchSizeValidation: "Batch size must be an integer between 5 and 100.",
      autoIntervalValidation: "Auto organize interval must be an integer between 1 and 168 hours.",
      requiredApiKey: "{provider} usually requires an API key. Please enter it first.",
      autoOrganizePermission:
        "Auto organize requires access to the selected API endpoint. Complete link checks also require website access.",
      baseUrlRequired: "Base URL is required.",
      modelRequired: "Model Name is required.",
      currentApiAccessMissing: "No access to the current API origin.",
      apiTesting: "Testing…",
      apiTestFailed: "API test failed.",
      apiTestSucceeded: "API test succeeded.",
      apiTestSaved: "Settings saved.",
      apiTestException: "An error occurred while testing the API.",
      backupCreateFailedAlert: "Failed to create backup.",
      backupCreateExceptionAlert: "An error occurred while creating backup.",
      backupRestoreConfirm:
        "Restoring this backup will replace the current bookmark bar content. Continue?",
      backupRestoreFailedAlert: "Failed to restore backup.",
      backupRestoreExceptionAlert: "An error occurred while restoring backup.",
      backupDeleteConfirm: "Delete this backup? This action cannot be undone.",
      backupDeleteFailedAlert: "Failed to delete backup.",
      backupDeleteExceptionAlert: "An error occurred while deleting backup.",
      hostAccessMissingAlert:
        "Access was not granted. Organizing bookmarks requires the selected API endpoint, and complete link checks require website access.",
      hostAccessRequestException: "An error occurred while requesting access.",
      backupReadFailed: "Failed to load backup list.",
      backupRatio: "{count} / 10",
      backupFolderPrefix: "Bookmark Backup",
      backupRecordPrefix: "Bookmark Snapshot",
      manualFolderTitle: "Needs Manual Review",
      privacyPageTitle: "Marko - Privacy",
      privacyMainTitle: "Privacy",
      privacyDataUseTitle: "Data Scope",
      privacyLocalDataTitle: "Local data accessed",
      privacyLocalDataDesc: "Bookmark titles, URLs, current folder paths, extension settings, and backup snapshots.",
      privacyThirdPartyTitle: "Data sent to third parties",
      privacyThirdPartyDesc:
        "Only when you actively organize bookmarks or enable auto organize, bookmark titles, URLs, current paths, and your custom prompt are sent to the model provider you chose.",
      privacyDeadLinkTitle: "Dead-link checks",
      privacyDeadLinkDesc:
        "When complete link checks are enabled, organize sends direct HEAD / GET requests to bookmarked websites. Fast mode skips these checks.",
      privacyStorageTitle: "Local storage",
      privacyStorageDesc:
        "API keys, provider settings, model names, whitelist rules, and backup snapshots are stored locally in browser storage and IndexedDB.",
      privacyControlTitle: "Your Controls",
      privacyHostAccessTitle: "Grant access",
      privacyHostAccessDesc:
        "You must explicitly grant API endpoint access before organizing. Complete link checks require broader website access, which you can later revoke from Chrome extension permissions.",
      privacyWhitelistTitle: "Whitelist and manual review",
      privacyWhitelistDesc:
        "Whitelisted domains are not reorganized automatically. Uncertain bookmarks are placed in the manual review folder.",
      privacyBackupTitle: "Backup and restore",
      privacyBackupDesc:
        "A local snapshot backup is created before organizing. You can manage backups and restore older versions from the settings page.",
      defaultPrompt: DEFAULT_PROMPT_EN,
      legacyDefaultPrompt: LEGACY_DEFAULT_PROMPT_ZH
    },
    zh_CN: {
      popupPageTitle: "Marko",
      popupMainTitle: "书签整理",
      popupSubtitle: "先预览 AI 书签整理方案，支持备份、重复清理和可选失效链接检测。",
      popupStepConnect: "1. 打开设置页并连接模型",
      popupStepPreview: "2. 先点预览查看整理方案",
      popupStepOrganize: "3. 确认后应用方案",
      optionsButton: "设置",
      phaseIdle: "空闲",
      phasePreview: "预览",
      setupButton: "去设置",
      startButton: "整理书签",
      confirmOrganizeButton: "应用方案",
      previewButton: "预览整理",
      backupButton: "手动备份",
      cancelButton: "取消任务",
      progressWaiting: "等待开始",
      resultNavAria: "结果导航",
      navOverview: "总览",
      navProcessed: "已处理",
      navFolders: "已归类",
      navDeleted: "已删除",
      navWarnings: "未处理",
      statTotal: "总量",
      statMoved: "已归类",
      statDeleted: "已删除",
      statWarnings: "未处理",
      optionsPageTitle: "Marko - 设置",
      optionsMeta: "Marko / Options",
      optionsMainTitle: "设置",
      optionsSubtitle: "先连接模型，再预览方案，确认后应用。",
      saveBadgeUnsaved: "未保存",
      saveBadgeSynced: "已同步",
      saveBadgeSaved: "已保存",
      saveBadgeFailed: "读取失败",
      saveButton: "保存设置",
      resetButton: "恢复默认",
      privacyButton: "隐私",
      navEyebrow: "Navigation",
      navTitle: "配置导航",
      navConnection: "连接配置",
      navOrganize: "规则",
      navAutomation: "自动",
      navBackup: "备份管理",
      connectionEyebrow: "Connection",
      connectionTitle: "模型",
      labelProvider: "Provider",
      labelModel: "Model",
      labelBaseUrl: "Base URL",
      labelApiKey: "API Key",
      placeholderModel: "例如：gpt-4.1-mini",
      placeholderApiKey: "请输入 API Key",
      placeholderApiKeyOptional: "本地模型可留空",
      testApiButton: "检测并保存",
      hostAccessButton: "授权访问",
      hostAccessGrantedButton: "已授权",
      organizeEyebrow: "Organization",
      organizeTitle: "规则",
      labelBatchSize: "批大小",
      labelLinkCheckMode: "速度模式",
      linkCheckFast: "快速",
      linkCheckComplete: "完整",
      hintLinkCheckMode: "快速模式会在整理时跳过失效链接检测；完整模式会在分类前检查链接。",
      labelWhitelistDomains: "白名单网站",
      labelProtectedRootFolders: "受保护根目录",
      labelDomainFolderRules: "域名目录规则",
      labelCustomPrompt: "自定义 Prompt",
      placeholderWhitelistSearch: "搜索书签中的网站",
      placeholderProtectedRootFolders: "每行一个根目录名称，例如：\n工作\n个人\n参考资料",
      placeholderDomainFolderRules:
        "每行一条规则，例如：\ngithub.com => AI/技术 / 代码\nmail.google.com => 工具/效率",
      placeholderPrompt: "输入自定义 Prompt",
      whitelistSelectedTitle: "已选",
      whitelistAvailableTitle: "书签网站",
      whitelistSelectedEmpty: "还没有加入白名单的网站",
      whitelistLoading: "正在加载书签网站…",
      whitelistCatalogEmpty: "没有可选的书签网站",
      whitelistNoResults: "没有匹配的网站",
      whitelistSelectionCount: "已选 {count} 个",
      whitelistBookmarkCount: "{count} 条书签",
      automationEyebrow: "Automation",
      automationTitle: "自动",
      labelAutoOrganizeEnabled: "静默整理",
      autoOrganizeOn: "开启",
      autoOrganizeOff: "关闭",
      labelAutoOrganizeInterval: "间隔（小时）",
      settingsStepConnect: "先连接你的模型服务并检测 API 是否可用。",
      settingsStepAccess: "先授权模型接口访问；只有开启完整链接检查时才需要全站访问。",
      settingsStepRun: "先预览，再正式整理，尽量避免误改。",
      advancedSettingsTitle: "高级",
      backupEyebrow: "Backup",
      backupTitle: "备份",
      backupLoading: "读取中",
      backupEmpty: "暂无备份",
      createBackupNow: "立即备份",
      backupSourceAuto: "自动",
      backupSourceManual: "手动",
      restoreButton: "恢复",
      deleteButton: "删除",
      defaultStatusDetail: "先预览方案；正式应用时会先备份，再重建书签栏。",
      phaseRunning: "执行中",
      phaseCompleted: "已完成",
      phaseCancelled: "已取消",
      phaseError: "出错",
      phaseUnknown: "未知",
      logMoveFailed: "移动失败",
      logDeleteFailed: "删除失败",
      logScanUncertain: "状态不明确",
      logScanFailed: "扫描失败",
      logDuplicateDeleted: "重复删除",
      logDeadLinkDeleted: "死链删除",
      logManualDeleted: "手动删除",
      logRecord: "记录",
      batchMeta: "第 {current}/{total} 批",
      batchSizeMeta: "批大小 {count}",
      updatedMeta: "最近更新 {time}",
      unnamedCategory: "未命名分类",
      rootCategoryTitle: "根目录",
      tableFolder: "分类",
      tableCount: "书签数",
      notStartedMessage: "尚未开始整理。",
      untitledBookmark: "(无标题书签)",
      noReason: "暂无说明。",
      noSuggestion: "暂无额外建议。",
      suggestionPrefix: "处理建议：{text}",
      keepButton: "保留",
      keepError: "保留书签时发生异常。",
      deleteUnprocessedError: "删除未处理书签时发生异常。",
      noWarningsTitle: "暂无未处理项目",
      noWarningsDesc: "扫描状态不明确、移动失败或其他需要你决定的书签会出现在这里。",
      noDeletedTitle: "暂无删除记录",
      noDeletedDesc: "自动删除重复书签或确认失效书签后，这里会留下可追溯的记录。",
      setupRequiredTitle: "先配置模型",
      setupRequiredDesc: "预览前需要 Provider、Base URL、Model 和 API Key。",
      setupMissingProvider: "请先选择 Provider。",
      setupMissingBaseUrl: "预览前需要填写 Base URL。",
      setupMissingModel: "预览前需要填写 Model。",
      setupMissingApiKey: "当前 Provider 需要 API Key。",
      previewReadyConfirm: "现在应用这个预览方案吗？Marko 会先备份，然后直接本地重建，不会再次请求模型。",
      hostPermissionRequiredTitle: "缺少访问授权，无法开始整理。",
      hostPermissionRequiredDetail:
        "快速模式需要访问你配置的模型接口；完整模式还需要网站访问权限来检测链接。",
      startJobFailed: "启动任务失败。",
      createBackupFailed: "创建备份失败。",
      previewStartFailed: "生成预览失败。",
      resolveUnprocessedFailed: "处理未处理书签失败。",
      startJobException: "启动后台任务时发生异常。",
      previewStartException: "生成预览时发生异常。",
      createBackupException: "创建手动备份时发生异常。",
      cancelJobFailed: "取消任务失败，请稍后重试。",
      readStateFailed: "读取本地状态失败，请重开弹窗。",
      hostAccessGranted: "已授权访问",
      hostAccessMissing: "未授权访问",
      backupErrorBadge: "异常",
      backupCreatingBadge: "创建中",
      backupRestoringBadge: "恢复中",
      backupDeletingBadge: "删除中",
      batchSizeValidation: "批大小必须是 5 到 100 之间的整数。",
      autoIntervalValidation: "自动整理间隔必须是 1 到 168 小时之间的整数。",
      requiredApiKey: "{provider} 通常需要 API Key，请先填写。",
      autoOrganizePermission: "自动整理需要访问当前模型接口；完整链接检查还需要网站访问权限。",
      baseUrlRequired: "Base URL 不能为空。",
      modelRequired: "Model Name 不能为空。",
      currentApiAccessMissing: "未授权访问当前 API 地址。",
      apiTesting: "检测中…",
      apiTestFailed: "API 检测失败。",
      apiTestSucceeded: "API 检测成功。",
      apiTestSaved: "设置已保存。",
      apiTestException: "API 检测过程中发生异常。",
      backupCreateFailedAlert: "创建备份失败。",
      backupCreateExceptionAlert: "创建备份时发生异常。",
      backupRestoreConfirm: "恢复这个备份后，当前书签栏内容会被该备份覆盖。继续吗？",
      backupRestoreFailedAlert: "恢复备份失败。",
      backupRestoreExceptionAlert: "恢复备份时发生异常。",
      backupDeleteConfirm: "确定要删除这个备份吗？删除后无法恢复。",
      backupDeleteFailedAlert: "删除备份失败。",
      backupDeleteExceptionAlert: "删除备份时发生异常。",
      hostAccessMissingAlert: "未授予访问权限。整理需要访问当前模型接口，完整链接检查还需要网站访问权限。",
      hostAccessRequestException: "申请访问权限时发生异常。",
      backupReadFailed: "读取备份列表失败。",
      backupRatio: "{count} / 10",
      backupFolderPrefix: "书签整理备份",
      backupRecordPrefix: "书签快照",
      manualFolderTitle: "待手动分类",
      privacyPageTitle: "Marko - 隐私说明",
      privacyMainTitle: "隐私说明",
      privacyDataUseTitle: "数据使用范围",
      privacyLocalDataTitle: "读取的本地数据",
      privacyLocalDataDesc: "书签标题、URL、当前文件夹路径、插件设置、备份快照。",
      privacyThirdPartyTitle: "发送到第三方的数据",
      privacyThirdPartyDesc:
        "只有在你主动整理书签或开启自动整理时，书签标题、URL、现有路径和自定义 Prompt 才会发送到你选择的模型服务商。",
      privacyDeadLinkTitle: "失效链接检测",
      privacyDeadLinkDesc: "开启完整链接检查时，整理流程会直接向书签对应的网站发送 HEAD / GET 请求；快速模式会跳过这些检测。",
      privacyStorageTitle: "本地存储",
      privacyStorageDesc: "API Key、Provider、模型名、白名单和备份快照都保存在你的浏览器本地存储与 IndexedDB 中。",
      privacyControlTitle: "你可以控制的内容",
      privacyHostAccessTitle: "授权访问",
      privacyHostAccessDesc: "整理前需要你显式授权模型接口访问。完整链接检查需要更广的网站访问权限，你也可以稍后在 Chrome 扩展权限里撤销。",
      privacyWhitelistTitle: "白名单与待手动分类",
      privacyWhitelistDesc: "白名单域名不会被自动整理；状态不明确的书签会进入“待手动分类”。",
      privacyBackupTitle: "备份与恢复",
      privacyBackupDesc: "整理前会先创建本地快照备份。你可以在设置页管理备份并恢复旧版本。",
      defaultPrompt: DEFAULT_PROMPT_ZH,
      legacyDefaultPrompt: LEGACY_DEFAULT_PROMPT_ZH
    }
  };

  function formatTemplate(template, params = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_match, key) =>
      Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : ""
    );
  }

  function t(key, params) {
    const pack = MESSAGES[locale] || MESSAGES.en;
    const fallbackPack = MESSAGES.en;
    const template = pack[key] ?? fallbackPack[key] ?? key;
    return formatTemplate(template, params);
  }

  function formatDate(dateValue, options) {
    if (!dateValue) {
      return locale === "zh_CN" ? "—" : "-";
    }

    try {
      return new Intl.DateTimeFormat(
        langTag,
        options || {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        }
      ).format(new Date(dateValue));
    } catch (error) {
      return locale === "zh_CN" ? "—" : "-";
    }
  }

  function applyDocument(root) {
    const target = root || document;
    if (!target || typeof target.querySelectorAll !== "function") {
      return;
    }

    if (target.documentElement) {
      target.documentElement.lang = langTag;
    } else if (document && document.documentElement) {
      document.documentElement.lang = langTag;
    }

    target.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });

    target.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      node.placeholder = t(node.dataset.i18nPlaceholder);
    });

    target.querySelectorAll("[data-i18n-aria-label]").forEach((node) => {
      node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel));
    });

    const titleNode = target.querySelector("title[data-i18n]");
    if (titleNode) {
      titleNode.textContent = t(titleNode.dataset.i18n);
    }
  }

  globalScope.SmartBookmarkI18n = {
    locale,
    langTag,
    t,
    formatDate,
    applyDocument,
    getDefaultPrompt() {
      return t("defaultPrompt");
    },
    getLegacyDefaultPrompt() {
      return LEGACY_DEFAULT_PROMPT_ZH;
    },
    isBuiltInPromptValue(promptValue) {
      return typeof promptValue === "string" && BUILT_IN_PROMPT_VARIANTS.has(promptValue.trim());
    },
    getBackupFolderPrefix() {
      return t("backupFolderPrefix");
    },
    getBackupRecordPrefix() {
      return t("backupRecordPrefix");
    },
    getManualFolderTitle() {
      return t("manualFolderTitle");
    }
  };
})(globalThis);
