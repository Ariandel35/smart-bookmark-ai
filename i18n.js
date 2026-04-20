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
6. 如果两个书签明显是同一个网页、同一篇内容、同一工具的重复入口，保留信息更完整、标题更清晰的一条，其他标记为重复删除。
7. 无法确定是否重复时，不要删除，只做分类。
8. 信息不足时统一放入“待手动分类”。`;

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
6. If two bookmarks are clearly duplicates of the same page, article, or tool, keep the clearer one and mark the others as duplicate deletions.
7. If duplicate status is uncertain, do not delete it. Only classify it.
8. If the information is insufficient, put it in ["Needs Manual Review"].`;

  const MESSAGES = {
    en: {
      popupPageTitle: "Smart Bookmark AI",
      popupMainTitle: "Bookmark Organizer",
      optionsButton: "Settings",
      phaseIdle: "Idle",
      phasePreview: "Preview",
      startButton: "Organize",
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
      optionsPageTitle: "Smart Bookmark AI - Settings",
      optionsMeta: "Smart Bookmark AI / Options",
      optionsMainTitle: "Settings Center",
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
      navOrganize: "Organization",
      navAutomation: "Automation",
      navBackup: "Backups",
      connectionEyebrow: "Connection",
      connectionTitle: "Connection Settings",
      labelProvider: "API Provider",
      labelModel: "Model Name",
      labelBaseUrl: "Base URL",
      labelApiKey: "API Key",
      placeholderModel: "e.g. gpt-4.1-mini",
      placeholderApiKey: "Enter API key",
      placeholderApiKeyOptional: "Optional for local models",
      testApiButton: "Test API",
      hostAccessButton: "Grant Site Access",
      hostAccessGrantedButton: "Granted",
      organizeEyebrow: "Organization",
      organizeTitle: "Organization Rules",
      labelBatchSize: "Batch Size",
      labelWhitelistDomains: "Whitelist Domains",
      labelProtectedRootFolders: "Protected Root Folders",
      labelDomainFolderRules: "Domain Folder Rules",
      labelCustomPrompt: "Custom Prompt",
      placeholderWhitelist: "One domain per line, for example:\nmail.google.com\ngithub.com\n*.bank.com",
      placeholderProtectedRootFolders: "One root folder per line, for example:\nWork\nPersonal\nReference",
      placeholderDomainFolderRules:
        "One rule per line, for example:\ngithub.com => AI & Tech / Code\nmail.google.com => Tools & Productivity",
      placeholderPrompt: "Enter custom prompt",
      automationEyebrow: "Automation",
      automationTitle: "Automation",
      labelAutoOrganizeEnabled: "Auto Silent Organize",
      autoOrganizeOn: "Enabled",
      autoOrganizeOff: "Disabled",
      labelAutoOrganizeInterval: "Auto Organize Interval (hours)",
      backupEyebrow: "Backup",
      backupTitle: "Backup Management",
      backupLoading: "Loading",
      backupEmpty: "No backups yet",
      createBackupNow: "Create Backup",
      backupSourceAuto: "Auto",
      backupSourceManual: "Manual",
      restoreButton: "Restore",
      deleteButton: "Delete",
      defaultStatusDetail:
        "The extension keeps folders compact, limits structure to two levels, and cleans obvious duplicates or dead links.",
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
      emptyFoldersTitle: "No categorized folders yet",
      emptyFoldersDesc: "After an organize run, each category and bookmark count will appear here.",
      folderStatsTitle: "Category Statistics",
      folderStatsDesc: "{count} categorized bookmarks in total.",
      tableFolder: "Category",
      tableCount: "Bookmarks",
      noModelUsed: "No model used in this task",
      totalBookmarksTitle: "{count} bookmarks in total",
      noTaskTotal: "No task total yet",
      currentStatus: "Current status: {phase}",
      overviewNoTaskDesc: "Start organizing to see the task summary here.",
      notStartedMessage: "No organize task has started yet.",
      factPhase: "Phase",
      factCurrentBatch: "Current batch",
      factProviderModel: "Provider / Model",
      factUpdatedAt: "Updated",
      factReused: "Reused from cache",
      factAiClassified: "New AI results",
      factProtectedRoots: "Protected roots",
      processedTitle: "Progress",
      processedDesc: "Processed {processed} / {total}, {progress}% complete, {remaining} remaining.",
      factBatchSize: "Batch size",
      waitingProcessing: "Waiting to start processing.",
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
      hostPermissionRequiredTitle: "Site access is required before organizing.",
      hostPermissionRequiredDetail:
        "The extension checks dead links and calls your configured model endpoint. Grant site access first, then start again.",
      startJobFailed: "Failed to start the task.",
      createBackupFailed: "Failed to create backup.",
      previewStartFailed: "Failed to generate preview.",
      resolveUnprocessedFailed: "Failed to handle this unprocessed bookmark.",
      startJobException: "An error occurred while starting the background task.",
      previewStartException: "An error occurred while generating the preview.",
      createBackupException: "An error occurred while creating a manual backup.",
      cancelJobFailed: "Failed to cancel the task. Please try again.",
      readStateFailed: "Failed to read local state. Please reopen the popup.",
      hostAccessGranted: "Site access granted",
      hostAccessMissing: "Site access not granted",
      backupErrorBadge: "Error",
      backupCreatingBadge: "Creating",
      backupRestoringBadge: "Restoring",
      backupDeletingBadge: "Deleting",
      batchSizeValidation: "Batch size must be an integer between 5 and 100.",
      autoIntervalValidation: "Auto organize interval must be an integer between 1 and 168 hours.",
      requiredApiKey: "{provider} usually requires an API key. Please enter it first.",
      autoOrganizePermission:
        "Auto organize requires site access. Grant site access first, then save the automation settings.",
      baseUrlRequired: "Base URL is required.",
      modelRequired: "Model Name is required.",
      currentApiAccessMissing: "No access to the current API origin.",
      apiTesting: "Testing…",
      apiTestFailed: "API test failed.",
      apiTestSucceeded: "API test succeeded.",
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
        "Site access was not granted. Organizing bookmarks and auto organize both require it.",
      hostAccessRequestException: "An error occurred while requesting site access.",
      backupReadFailed: "Failed to load backup list.",
      backupRatio: "{count} / 10",
      backupFolderPrefix: "Bookmark Backup",
      backupRecordPrefix: "Bookmark Snapshot",
      manualFolderTitle: "Needs Manual Review",
      privacyPageTitle: "Smart Bookmark AI - Privacy",
      privacyMainTitle: "Privacy",
      privacyDataUseTitle: "Data Scope",
      privacyLocalDataTitle: "Local data accessed",
      privacyLocalDataDesc: "Bookmark titles, URLs, current folder paths, extension settings, and backup snapshots.",
      privacyThirdPartyTitle: "Data sent to third parties",
      privacyThirdPartyDesc:
        "Only when you actively organize bookmarks or enable auto organize, bookmark titles, URLs, current paths, and your custom prompt are sent to the model provider you chose.",
      privacyDeadLinkTitle: "Dead-link checks",
      privacyDeadLinkDesc:
        "The organize flow sends direct HEAD / GET requests to bookmarked websites to determine whether links are dead.",
      privacyStorageTitle: "Local storage",
      privacyStorageDesc:
        "API keys, provider settings, model names, whitelist rules, and backup snapshots are stored locally in browser storage and IndexedDB.",
      privacyControlTitle: "Your Controls",
      privacyHostAccessTitle: "Grant site access",
      privacyHostAccessDesc:
        "You must explicitly grant site access before organizing bookmarks or using auto organize. You can later revoke it from Chrome extension permissions.",
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
      popupPageTitle: "Smart Bookmark AI",
      popupMainTitle: "书签整理",
      optionsButton: "设置",
      phaseIdle: "空闲",
      phasePreview: "预览",
      startButton: "整理书签",
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
      optionsPageTitle: "Smart Bookmark AI - 设置",
      optionsMeta: "Smart Bookmark AI / Options",
      optionsMainTitle: "设置中心",
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
      navOrganize: "整理规则",
      navAutomation: "自动任务",
      navBackup: "备份管理",
      connectionEyebrow: "Connection",
      connectionTitle: "连接配置",
      labelProvider: "API Provider",
      labelModel: "Model Name",
      labelBaseUrl: "Base URL",
      labelApiKey: "API Key",
      placeholderModel: "例如：gpt-4.1-mini",
      placeholderApiKey: "请输入 API Key",
      placeholderApiKeyOptional: "本地模型可留空",
      testApiButton: "检测 API 是否可用",
      hostAccessButton: "授权网站访问",
      hostAccessGrantedButton: "已授权",
      organizeEyebrow: "Organization",
      organizeTitle: "整理规则",
      labelBatchSize: "每批处理数量",
      labelWhitelistDomains: "白名单域名",
      labelProtectedRootFolders: "受保护根目录",
      labelDomainFolderRules: "域名目录规则",
      labelCustomPrompt: "自定义 Prompt",
      placeholderWhitelist: "每行一个域名，例如：\nmail.google.com\ngithub.com\n*.bank.com",
      placeholderProtectedRootFolders: "每行一个根目录名称，例如：\n工作\n个人\n参考资料",
      placeholderDomainFolderRules:
        "每行一条规则，例如：\ngithub.com => AI/技术 / 代码\nmail.google.com => 工具/效率",
      placeholderPrompt: "输入自定义 Prompt",
      automationEyebrow: "Automation",
      automationTitle: "自动任务",
      labelAutoOrganizeEnabled: "自动静默整理",
      autoOrganizeOn: "开启",
      autoOrganizeOff: "关闭",
      labelAutoOrganizeInterval: "自动整理间隔（小时）",
      backupEyebrow: "Backup",
      backupTitle: "备份管理",
      backupLoading: "读取中",
      backupEmpty: "暂无备份",
      createBackupNow: "立即备份",
      backupSourceAuto: "自动",
      backupSourceManual: "手动",
      restoreButton: "恢复",
      deleteButton: "删除",
      defaultStatusDetail: "整理会尽量压缩为少量大类、最多两级，并清理明显重复或已失效的书签。",
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
      emptyFoldersTitle: "还没有可查看的分类结果",
      emptyFoldersDesc: "开始整理后，这里会显示每个分类下当前有多少条书签。",
      folderStatsTitle: "分类统计",
      folderStatsDesc: "共 {count} 条已归类书签。",
      tableFolder: "分类",
      tableCount: "书签数",
      noModelUsed: "当前任务未调用模型",
      totalBookmarksTitle: "共 {count} 条书签",
      noTaskTotal: "还没有任务总量",
      currentStatus: "当前状态：{phase}",
      overviewNoTaskDesc: "开始整理后，这里会显示本次任务总量。",
      notStartedMessage: "尚未开始整理。",
      factPhase: "阶段",
      factCurrentBatch: "当前批次",
      factProviderModel: "Provider / Model",
      factUpdatedAt: "最近更新",
      factReused: "缓存复用",
      factAiClassified: "AI 新分类",
      factProtectedRoots: "受保护根目录",
      processedTitle: "处理进度",
      processedDesc: "当前已处理 {processed} / {total}，完成度 {progress}%，剩余 {remaining} 条。",
      factBatchSize: "批大小",
      waitingProcessing: "等待开始处理。",
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
      hostPermissionRequiredTitle: "未授权网站访问，无法开始整理。",
      hostPermissionRequiredDetail:
        "书签整理会检测失效链接并访问你配置的模型接口。请先授权网站访问，再重新开始整理。",
      startJobFailed: "启动任务失败。",
      createBackupFailed: "创建备份失败。",
      previewStartFailed: "生成预览失败。",
      resolveUnprocessedFailed: "处理未处理书签失败。",
      startJobException: "启动后台任务时发生异常。",
      previewStartException: "生成预览时发生异常。",
      createBackupException: "创建手动备份时发生异常。",
      cancelJobFailed: "取消任务失败，请稍后重试。",
      readStateFailed: "读取本地状态失败，请重开弹窗。",
      hostAccessGranted: "已授权网站访问",
      hostAccessMissing: "未授权网站访问",
      backupErrorBadge: "异常",
      backupCreatingBadge: "创建中",
      backupRestoringBadge: "恢复中",
      backupDeletingBadge: "删除中",
      batchSizeValidation: "批大小必须是 5 到 100 之间的整数。",
      autoIntervalValidation: "自动整理间隔必须是 1 到 168 小时之间的整数。",
      requiredApiKey: "{provider} 通常需要 API Key，请先填写。",
      autoOrganizePermission: "自动整理需要网站访问权限。请先授权网站访问，再保存自动任务配置。",
      baseUrlRequired: "Base URL 不能为空。",
      modelRequired: "Model Name 不能为空。",
      currentApiAccessMissing: "未授权访问当前 API 地址。",
      apiTesting: "检测中…",
      apiTestFailed: "API 检测失败。",
      apiTestSucceeded: "API 检测成功。",
      apiTestException: "API 检测过程中发生异常。",
      backupCreateFailedAlert: "创建备份失败。",
      backupCreateExceptionAlert: "创建备份时发生异常。",
      backupRestoreConfirm: "恢复这个备份后，当前书签栏内容会被该备份覆盖。继续吗？",
      backupRestoreFailedAlert: "恢复备份失败。",
      backupRestoreExceptionAlert: "恢复备份时发生异常。",
      backupDeleteConfirm: "确定要删除这个备份吗？删除后无法恢复。",
      backupDeleteFailedAlert: "删除备份失败。",
      backupDeleteExceptionAlert: "删除备份时发生异常。",
      hostAccessMissingAlert: "未授予网站访问权限。整理书签和自动整理都需要这项授权。",
      hostAccessRequestException: "申请网站访问权限时发生异常。",
      backupReadFailed: "读取备份列表失败。",
      backupRatio: "{count} / 10",
      backupFolderPrefix: "书签整理备份",
      backupRecordPrefix: "书签快照",
      manualFolderTitle: "待手动分类",
      privacyPageTitle: "Smart Bookmark AI - 隐私说明",
      privacyMainTitle: "隐私说明",
      privacyDataUseTitle: "数据使用范围",
      privacyLocalDataTitle: "读取的本地数据",
      privacyLocalDataDesc: "书签标题、URL、当前文件夹路径、插件设置、备份快照。",
      privacyThirdPartyTitle: "发送到第三方的数据",
      privacyThirdPartyDesc:
        "只有在你主动整理书签或开启自动整理时，书签标题、URL、现有路径和自定义 Prompt 才会发送到你选择的模型服务商。",
      privacyDeadLinkTitle: "失效链接检测",
      privacyDeadLinkDesc: "整理流程会直接向书签对应的网站发送 HEAD / GET 请求，用于判断链接是否失效。",
      privacyStorageTitle: "本地存储",
      privacyStorageDesc: "API Key、Provider、模型名、白名单和备份快照都保存在你的浏览器本地存储与 IndexedDB 中。",
      privacyControlTitle: "你可以控制的内容",
      privacyHostAccessTitle: "授权网站访问",
      privacyHostAccessDesc: "整理书签和自动整理前，需要你显式授权网站访问权限。你也可以稍后在 Chrome 扩展权限里撤销。",
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
