(function initMarkoI18n(globalScope) {
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
      setupButton: "Open Settings",
      settingsShortcutButton: "Open Settings",
      startButton: "Organize",
      confirmOrganizeButton: "Apply Plan",
      previewButton: "Preview",
      backupButton: "Backup Now",
      cancelButton: "Cancel",
      cancelRequestedButton: "Cancelling",
      progressWaiting: "Waiting to start",
      progressAriaLabel: "Organize progress",
      detailPanelAriaLabel: "Status details",
      popupCheckingCoverageStatus: "Checking local rules and cache coverage…",
      popupRequestingAccessStatus: "Waiting for permission approval…",
      popupStartingPreviewStatus: "Starting preview…",
      popupApplyingPlanStatus: "Applying saved preview plan…",
      popupCreatingBackupStatus: "Creating backup…",
      popupResolvingItemStatus: "Updating unprocessed item…",
      popupCancellingStatus: "Cancelling task…",
      popupCancellingToFastStatus: "Stopping task and switching to Fast mode…",
      popupCancelledToFastStatus: "Fast mode saved. Start a new preview after cancellation finishes.",
      popupCancelToFastFailedStatus: "Failed to stop and switch to Fast mode.",
      popupSpeedModeLabel: "Mode",
      popupSpeedModeFastAria:
        "Fast mode: finish locally without waiting for the model; unmatched bookmarks go to manual review",
      popupSpeedModeBalancedAria:
        "Balanced mode: skip dead-link checks and extra planning, then use AI classification",
      popupSpeedModeCompleteAria:
        "Complete mode: check dead links and use AI classification; slow models skip extra planning",
      popupSavingSpeedModeStatus: "Saving mode…",
      popupSpeedModeSavedStatus: "Mode saved. Generate a new preview.",
      popupSpeedModeFailedStatus: "Failed to save mode.",
      popupRefreshFailedStatus: "Status could not be refreshed. Reopen the popup if this continues.",
      popupOpenSettingsFailed: "Could not open Settings. Open the extension options page from Chrome and try again.",
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
      optionsMainTitle: "Marko Settings",
      optionsSubtitle: "Connect a model, preview the plan, then apply it in one flow.",
      saveBadgeUnsaved: "Unsaved",
      saveBadgeLoading: "Loading",
      saveBadgeSynced: "Synced",
      saveBadgeSaved: "Saved",
      saveBadgeFailed: "Failed",
      saveBadgeLoadFailed: "Load failed",
      settingsLoadException: "Settings could not be loaded. Defaults are shown; save again after checking extension storage.",
      settingsSavedStatus: "Settings saved.",
      settingsSlowBatchAdjustedStatus: "Settings saved. Slow-model batch size was capped to {count} for faster previews.",
      settingsSavingStatus: "Saving settings…",
      settingsSaveException: "Failed to save settings. Check extension storage permissions and try again.",
      settingsAccessRequestingStatus: "Waiting for access approval…",
      privacyOpenFailed: "Could not open the privacy page. Check popup blocking and try again.",
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
      connectionTitle: "Connection",
      labelProvider: "Provider",
      labelModel: "Model",
      labelBaseUrl: "Base URL",
      labelApiKey: "API Key",
      placeholderModel: "e.g. gpt-4.1-mini",
      placeholderApiKey: "Enter API key",
      placeholderApiKeyOptional: "Optional for local models",
      showApiKeyButton: "Show",
      hideApiKeyButton: "Hide",
      showApiKeyAria: "Show API key",
      hideApiKeyAria: "Hide API key",
      apiKeyVisibilityHint: "Hidden by default. Use Show only to verify pasted text.",
      aiConnectionTitle: "AI connection",
      aiConnectionFastSummary: "Optional in Fast mode",
      aiConnectionRequiredSummary: "Required for AI modes",
      testApiButton: "Test & Save",
      hostAccessButton: "Grant Access",
      hostAccessGrantedButton: "Granted",
      hostAccessNotNeededButton: "Not needed",
      connectionModeFastHint:
        "Fast mode previews locally. Provider is enough; Base URL, model, API key, and access checks are optional until you switch to AI classification.",
      connectionModeBalancedHint:
        "Balanced mode skips website checks but needs Base URL, model, API key, and model endpoint access when uncached bookmarks need AI classification.",
      connectionModeCompleteHint:
        "Complete mode needs the model connection for AI classification and website access for dead-link checks.",
      organizeEyebrow: "Organization",
      organizeTitle: "Rules",
      labelBatchSize: "Batch size",
      hintBatchSize: "Use 5 to 100. DeepSeek and DeepSeek-compatible endpoints are capped per run and split into 3-item model requests with small parallelism.",
      batchSizeCapHint: "This slow-model endpoint will save at {count} to keep previews responsive.",
      labelLinkCheckMode: "Speed mode",
      linkCheckFast: "Fast",
      linkCheckBalanced: "Balanced",
      linkCheckComplete: "Complete",
      hintLinkCheckMode:
        "Fast finishes locally without waiting for the model. Balanced skips link checks but keeps AI classification. Complete checks links and uses AI.",
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
      whitelistCatalogLoadFailed: "Could not load bookmark websites. Reopen settings or check Chrome bookmark permissions.",
      whitelistNoResults: "No matching websites",
      whitelistSelectionCount: "{count} selected",
      whitelistBookmarkCount: "{count} bookmarks",
      whitelistAddDomainWithCount: "Add {domain} to whitelist ({count} bookmarks)",
      whitelistRemoveDomainWithCount: "Remove {domain} from whitelist ({count} bookmarks)",
      whitelistRemoveDomain: "Remove {domain} from whitelist",
      automationEyebrow: "Automation",
      automationTitle: "Auto",
      labelAutoOrganizeEnabled: "Silent organize",
      autoOrganizeOn: "Enabled",
      autoOrganizeOff: "Disabled",
      autoOrganizeDisabledHint: "Off: Marko runs only when you start a preview.",
      autoOrganizeFastHint: "Fast automation runs locally and does not need model or website access.",
      autoOrganizeBalancedHint: "Balanced automation needs model endpoint access before it can run.",
      autoOrganizeCompleteHint: "Complete automation needs model endpoint access plus website access.",
      labelAutoOrganizeInterval: "Interval (hours)",
      hintAutoOrganizeInterval: "Use 1 to 168 hours.",
      settingsStepConnect: "Connect your provider and test the API.",
      settingsStepAccess: "Fast automation runs locally. Balanced asks for model endpoint access. Complete also asks for website access.",
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
      logModelTimeoutFallback: "Model fallback",
      logFastLocalUnclassified: "Fast review",
      logRecord: "Record",
      batchMeta: "Batch {current}/{total}",
      batchSizeMeta: "Batch size {count}",
      elapsedMeta: "Elapsed {duration}",
      remainingMeta: "About {duration} left",
      staleStatusMeta: "No background update for {duration}",
      staleStatusTitle: "Background update delayed",
      staleStatusDetail:
        "Marko may still be waiting on the model. Keep waiting if the provider is slow, or stop this run and switch to Fast mode.",
      staleStatusFastAction: "Stop and use Fast",
      staleStatusCancelAction: "Cancel task",
      updatedMeta: "Updated {time}",
      unnamedCategory: "Untitled category",
      rootCategoryTitle: "Root",
      tableFolder: "Category",
      tableCount: "Bookmarks",
      managedFoldersLoadFailedTitle: "Could not load current folder summary",
      managedFoldersLoadFailedDesc:
        "The saved organize result is still preserved, but the popup could not read the folder list right now. Reopen the popup or refresh Chrome bookmarks and try again.",
      notStartedMessage: "No preview has been generated yet.",
      untitledBookmark: "(Untitled bookmark)",
      noReason: "No details yet.",
      noSuggestion: "No extra suggestion.",
      suggestionPrefix: "Suggestion: {text}",
      keepButton: "Keep",
      keepBookmarkAria: "Keep bookmark {title}",
      deleteBookmarkAria: "Delete bookmark {title}",
      keepError: "Failed to keep this bookmark.",
      deleteUnprocessedError: "Failed to delete this bookmark.",
      noWarningsTitle: "No unprocessed items",
      noWarningsDesc:
        "Uncertain scans, move failures, and other items that require your decision will appear here.",
      noDeletedTitle: "No deletion records",
      noDeletedDesc:
        "Deleted duplicates and confirmed dead links will leave a traceable log here.",
      setupRequiredTitle: "Finish preview setup",
      setupRequiredDesc:
        "Fast preview only needs a provider. Balanced or Complete will ask for Base URL and model only when AI classification is needed.",
      setupMissingProvider: "Choose a provider first.",
      setupMissingBaseUrl: "Base URL is required before preview.",
      setupInvalidBaseUrl: "Base URL must be a valid http or https URL.",
      setupMissingModel: "Model is required before preview.",
      setupMissingApiKey: "API key is required for this provider.",
      modelAccessRequiredForUncachedPreview:
        "Balanced or Complete mode has bookmarks that are not covered by local rules or cached classifications, so Marko needs model access before it can classify them. Slow-model timeouts fall back to local review.",
      modelAccessRequiredForUncachedPreviewWithCount:
        "{count} bookmarks are not covered by local rules or cached classifications, so Marko needs model access before it can classify them. Slow-model timeouts fall back to local review.",
      applyConfirmTitle: "Apply saved preview plan",
      applyConfirmDesc:
        "Marko will create a fresh backup, verify the preview is still current, then rebuild locally without calling the model again.",
      applyConfirmPrimary: "Back up and apply",
      applyConfirmSecondary: "Not now",
      hostPermissionRequiredTitle: "Access is required before preview.",
      hostPermissionRequiredDetail:
        "Marko asks for model endpoint access only when a model call is needed. Complete mode also needs website access for link checks.",
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
      backupCreateSuccess: "Backup created.",
      backupRestoreSuccess: "Backup restored.",
      backupDeleteSuccess: "Backup deleted.",
      backupRestoreInlineConfirm:
        "A fresh snapshot of current bookmarks is created first. Then this backup replaces the bookmark bar.",
      backupRestoreInlinePrimary: "Restore backup",
      backupDeleteInlineConfirm: "Delete this snapshot? This cannot be undone.",
      backupDeleteInlinePrimary: "Delete backup",
      backupInlineCancel: "Cancel",
      backupRecordFallback: "this backup",
      backupRestoreRecordAria: "Restore backup {title}",
      backupDeleteRecordAria: "Delete backup {title}",
      backupConfirmRestoreRecordAria: "Confirm restoring backup {title}",
      backupConfirmDeleteRecordAria: "Confirm deleting backup {title}",
      backupCancelActionAria: "Cancel backup action for {title}",
      batchSizeValidation: "Batch size must be an integer between 5 and 100.",
      autoIntervalValidation: "Auto organize interval must be an integer between 1 and 168 hours.",
      requiredApiKey: "{provider} usually requires an API key. Please enter it first.",
      autoOrganizePermission:
        "Fast auto organize runs locally. Balanced requires model endpoint access. Complete auto organize also requires website access.",
      baseUrlRequired: "Base URL is required.",
      baseUrlInvalid: "Base URL must be a valid http or https URL.",
      modelRequired: "Model Name is required.",
      currentApiAccessMissing: "No access to the current API origin.",
      hostAccessNotNeeded: "Fast mode runs locally. No model endpoint or website access is needed.",
      hostAccessNotNeededAction: "Fast mode does not need extra access. Use Test & Save only when you want to verify the model endpoint.",
      hostAccessChecking: "Checking access…",
      hostAccessRefreshFailed: "Access status could not be refreshed. Check Chrome extension permissions and try again.",
      apiTesting: "Testing…",
      apiTestFailed: "API test failed.",
      apiTestSucceeded: "API test succeeded.",
      apiTestSaved: "Settings saved.",
      apiTestSaveFailed: "API test succeeded, but settings could not be saved.",
      apiTestAutoAccessFailed: "API test succeeded, but auto organize access was not granted.",
      apiTestException: "An error occurred while testing the API.",
      apiKeyClearedOnProviderChange: "API key cleared after provider change.",
      backupCreateFailedAlert: "Failed to create backup.",
      backupCreateExceptionAlert: "An error occurred while creating backup.",
      backupRestoreFailedAlert: "Failed to restore backup.",
      backupRestoreExceptionAlert: "An error occurred while restoring backup.",
      backupDeleteFailedAlert: "Failed to delete backup.",
      backupDeleteExceptionAlert: "An error occurred while deleting backup.",
      hostAccessMissingAlert:
        "Access was not granted. API testing plus Balanced and Complete modes require the selected model endpoint; Complete link checks also require website access.",
      hostAccessRequestException: "An error occurred while requesting access.",
      backupReadFailed: "Failed to load backup list.",
      backupRatio: "{count} / 10",
      backupFolderPrefix: "Bookmark Backup",
      backupRecordPrefix: "Bookmark Snapshot",
      manualFolderTitle: "Needs Manual Review",
      privacyPageTitle: "Marko - Privacy",
      privacyMeta: "Marko / Privacy",
      privacyMainTitle: "Privacy",
      privacyLastUpdatedMeta: "Last updated: 2026-06-09",
      privacyDataUseEyebrow: "Data Use",
      privacyDataUseTitle: "Data Scope",
      privacyLocalDataTitle: "Local data accessed",
      privacyLocalDataDesc: "Bookmark titles, URLs, current folder paths, extension settings, and backup snapshots.",
      privacyThirdPartyTitle: "Data sent to third parties",
      privacyThirdPartyDesc:
        "Only when Balanced or Complete preview, or enabled auto organize, still needs model classification, bookmark titles, URLs, current paths, and your custom prompt are sent to the model provider you chose. Applying a saved preview does not call the model again.",
      privacyDeadLinkTitle: "Dead-link checks",
      privacyDeadLinkDesc:
        "Balanced mode skips direct website checks but can use model classification. Complete mode can send direct HEAD / GET requests to bookmarked websites and use model classification. Faster providers may also use a separate taxonomy-planning request; slow providers skip that extra request. Fast mode skips those external requests.",
      privacyStorageTitle: "Local storage",
      privacyStorageDesc:
        "API keys, provider settings, model names, whitelist rules, and backup snapshots are stored locally in browser storage and IndexedDB.",
      privacyControlEyebrow: "Control",
      privacyControlTitle: "Your Controls",
      privacyHostAccessTitle: "Grant access",
      privacyHostAccessDesc:
        "You must explicitly grant API endpoint access before previews that need the model. Complete link checks require broader website access, which you can later revoke from Chrome extension permissions.",
      privacyWhitelistTitle: "Whitelist and manual review",
      privacyWhitelistDesc:
        "Whitelisted domains are not reorganized automatically. Uncertain bookmarks are placed in the manual review folder.",
      privacyBackupTitle: "Backup and restore",
      privacyBackupDesc:
        "A local snapshot backup is created before applying a preview plan, before automatic organize rebuilds, and before restoring an older backup. You can manage backups and restore older versions from the settings page.",
      defaultPrompt: DEFAULT_PROMPT_EN,
      legacyDefaultPrompt: LEGACY_DEFAULT_PROMPT_ZH
    },
    zh_CN: {
      popupPageTitle: "Marko",
      popupMainTitle: "Marko",
      popupSubtitle: "先预览 AI 书签整理方案，支持备份、重复清理和可选失效链接检测。",
      popupStepConnect: "1. 打开设置页并连接模型",
      popupStepPreview: "2. 先点预览查看整理方案",
      popupStepOrganize: "3. 确认后应用方案",
      optionsButton: "设置",
      phaseIdle: "空闲",
      phasePreview: "预览",
      setupButton: "打开设置",
      settingsShortcutButton: "打开设置",
      startButton: "整理书签",
      confirmOrganizeButton: "应用方案",
      previewButton: "预览整理",
      backupButton: "手动备份",
      cancelButton: "取消任务",
      cancelRequestedButton: "取消中",
      progressWaiting: "等待开始",
      progressAriaLabel: "整理进度",
      detailPanelAriaLabel: "状态详情",
      popupCheckingCoverageStatus: "正在检查本地规则和缓存覆盖情况…",
      popupRequestingAccessStatus: "正在等待权限确认…",
      popupStartingPreviewStatus: "正在启动预览…",
      popupApplyingPlanStatus: "正在应用已保存方案…",
      popupCreatingBackupStatus: "正在创建备份…",
      popupResolvingItemStatus: "正在更新未处理项…",
      popupCancellingStatus: "正在取消任务…",
      popupCancellingToFastStatus: "正在停止任务并切到快速模式…",
      popupCancelledToFastStatus: "已保存快速模式。取消完成后可重新生成预览。",
      popupCancelToFastFailedStatus: "停止并切到快速模式失败。",
      popupSpeedModeLabel: "模式",
      popupSpeedModeFastAria: "快速模式：本地完成，不等待模型；未命中书签进入待手动分类",
      popupSpeedModeBalancedAria: "平衡模式：跳过失效链接和额外规划，但保留 AI 分类",
      popupSpeedModeCompleteAria: "完整模式：检测失效链接并使用 AI 分类，慢模型会跳过额外规划",
      popupSavingSpeedModeStatus: "正在保存模式…",
      popupSpeedModeSavedStatus: "模式已保存，请重新生成预览。",
      popupSpeedModeFailedStatus: "保存模式失败。",
      popupRefreshFailedStatus: "状态刷新失败。如果持续出现，请重开弹窗。",
      popupOpenSettingsFailed: "无法打开设置页。请从 Chrome 扩展管理页打开选项后重试。",
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
      optionsMeta: "Marko / 设置",
      optionsMainTitle: "Marko 设置",
      optionsSubtitle: "先连接模型，再预览方案，确认后应用。",
      saveBadgeUnsaved: "未保存",
      saveBadgeLoading: "读取中",
      saveBadgeSynced: "已同步",
      saveBadgeSaved: "已保存",
      saveBadgeFailed: "失败",
      saveBadgeLoadFailed: "读取失败",
      settingsLoadException: "设置读取失败。当前显示默认值，请检查扩展存储后重新保存。",
      settingsSavedStatus: "设置已保存。",
      settingsSlowBatchAdjustedStatus: "设置已保存。慢模型批大小已自动压到 {count}，预览会更快返回。",
      settingsSavingStatus: "正在保存设置…",
      settingsSaveException: "保存设置失败，请检查扩展存储权限后重试。",
      settingsAccessRequestingStatus: "正在等待授权…",
      privacyOpenFailed: "无法打开隐私说明。请检查浏览器弹窗拦截后重试。",
      saveButton: "保存设置",
      resetButton: "恢复默认",
      privacyButton: "隐私",
      navEyebrow: "导航",
      navTitle: "配置导航",
      navConnection: "连接配置",
      navOrganize: "规则",
      navAutomation: "自动",
      navBackup: "备份管理",
      connectionEyebrow: "连接",
      connectionTitle: "连接",
      labelProvider: "服务商",
      labelModel: "模型名称",
      labelBaseUrl: "Base URL",
      labelApiKey: "API Key",
      placeholderModel: "例如：gpt-4.1-mini",
      placeholderApiKey: "请输入 API Key",
      placeholderApiKeyOptional: "本地模型可留空",
      showApiKeyButton: "显示",
      hideApiKeyButton: "隐藏",
      showApiKeyAria: "显示 API Key",
      hideApiKeyAria: "隐藏 API Key",
      apiKeyVisibilityHint: "默认隐藏；仅在确认粘贴内容时显示。",
      aiConnectionTitle: "AI 连接",
      aiConnectionFastSummary: "快速模式可选",
      aiConnectionRequiredSummary: "AI 模式需要",
      testApiButton: "检测并保存",
      hostAccessButton: "授权访问",
      hostAccessGrantedButton: "已授权",
      hostAccessNotNeededButton: "无需授权",
      connectionModeFastHint:
        "快速模式会本地生成预览。只选服务商即可；Base URL、模型、API Key 和授权检测可以等切到 AI 分类时再配置。",
      connectionModeBalancedHint:
        "平衡模式会跳过网站检测，但未缓存书签需要 AI 分类时，要填写 Base URL、模型、API Key 并授权模型接口。",
      connectionModeCompleteHint:
        "完整模式需要模型连接做 AI 分类，也需要网站访问权限来检测失效链接。",
      organizeEyebrow: "整理",
      organizeTitle: "规则",
      labelBatchSize: "批大小",
      hintBatchSize: "可填 5 到 100。DeepSeek 和 DeepSeek 兼容接口会自动压低运行批次，并拆成 3 条以内的小请求并发处理。",
      batchSizeCapHint: "当前慢模型接口保存时会压到 {count}，避免预览长时间卡住。",
      labelLinkCheckMode: "速度模式",
      linkCheckFast: "快速",
      linkCheckBalanced: "平衡",
      linkCheckComplete: "完整",
      hintLinkCheckMode: "快速模式本地完成，不等待模型；平衡模式跳过链接检查但保留 AI 分类；完整模式会检查链接并使用 AI。",
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
      whitelistCatalogLoadFailed: "无法读取书签网站。请重开设置页，或检查 Chrome 书签权限。",
      whitelistNoResults: "没有匹配的网站",
      whitelistSelectionCount: "已选 {count} 个",
      whitelistBookmarkCount: "{count} 条书签",
      whitelistAddDomainWithCount: "将 {domain} 加入白名单（{count} 条书签）",
      whitelistRemoveDomainWithCount: "从白名单移除 {domain}（{count} 条书签）",
      whitelistRemoveDomain: "从白名单移除 {domain}",
      automationEyebrow: "自动化",
      automationTitle: "自动整理",
      labelAutoOrganizeEnabled: "静默整理",
      autoOrganizeOn: "开启",
      autoOrganizeOff: "关闭",
      autoOrganizeDisabledHint: "关闭：Marko 只会在你手动开始预览时运行。",
      autoOrganizeFastHint: "快速自动整理会在本地运行，不需要模型接口或网站权限。",
      autoOrganizeBalancedHint: "平衡自动整理运行前需要模型接口权限。",
      autoOrganizeCompleteHint: "完整自动整理运行前需要模型接口权限和网站访问权限。",
      labelAutoOrganizeInterval: "间隔（小时）",
      hintAutoOrganizeInterval: "可填 1 到 168 小时。",
      settingsStepConnect: "先连接你的模型服务并检测 API 是否可用。",
      settingsStepAccess: "快速自动整理可本地运行；平衡模式需要模型接口权限；完整模式还需要网站访问权限。",
      settingsStepRun: "先预览，再正式整理，尽量避免误改。",
      advancedSettingsTitle: "高级",
      backupEyebrow: "备份",
      backupTitle: "备份管理",
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
      logModelTimeoutFallback: "模型兜底",
      logFastLocalUnclassified: "快速待分类",
      logRecord: "记录",
      batchMeta: "第 {current}/{total} 批",
      batchSizeMeta: "批大小 {count}",
      elapsedMeta: "已运行 {duration}",
      remainingMeta: "预计剩余约 {duration}",
      staleStatusMeta: "后台已 {duration} 未更新",
      staleStatusTitle: "后台更新延迟",
      staleStatusDetail:
        "Marko 可能仍在等待模型。接口较慢时可以继续等待，也可以停止本轮并切到快速模式。",
      staleStatusFastAction: "停止并用快速模式",
      staleStatusCancelAction: "取消任务",
      updatedMeta: "最近更新 {time}",
      unnamedCategory: "未命名分类",
      rootCategoryTitle: "根目录",
      tableFolder: "分类",
      tableCount: "书签数",
      managedFoldersLoadFailedTitle: "无法读取当前文件夹摘要",
      managedFoldersLoadFailedDesc:
        "已保存的整理结果仍会保留，但弹窗暂时无法读取文件夹列表。请重开弹窗，或刷新 Chrome 书签后再试。",
      notStartedMessage: "尚未生成预览。",
      untitledBookmark: "(无标题书签)",
      noReason: "暂无说明。",
      noSuggestion: "暂无额外建议。",
      suggestionPrefix: "处理建议：{text}",
      keepButton: "保留",
      keepBookmarkAria: "保留书签 {title}",
      deleteBookmarkAria: "删除书签 {title}",
      keepError: "保留书签时发生异常。",
      deleteUnprocessedError: "删除未处理书签时发生异常。",
      noWarningsTitle: "暂无未处理项目",
      noWarningsDesc: "扫描状态不明确、移动失败或其他需要你决定的书签会出现在这里。",
      noDeletedTitle: "暂无删除记录",
      noDeletedDesc: "自动删除重复书签或确认失效书签后，这里会留下可追溯的记录。",
      setupRequiredTitle: "完成预览设置",
      setupRequiredDesc: "快速预览只需要选择服务商；平衡或完整模式只有需要 AI 分类时才要求 Base URL 和模型名称。",
      setupMissingProvider: "请先选择服务商。",
      setupMissingBaseUrl: "预览前需要填写 Base URL。",
      setupInvalidBaseUrl: "Base URL 必须是有效的 http 或 https 地址。",
      setupMissingModel: "预览前需要填写模型名称。",
      setupMissingApiKey: "当前服务商需要 API Key。",
      modelAccessRequiredForUncachedPreview:
        "平衡或完整模式中有书签没有命中本地规则或分类缓存，Marko 需要先访问模型才能分类；慢模型超时会改用本地待分类兜底。",
      modelAccessRequiredForUncachedPreviewWithCount:
        "{count} 条书签没有命中本地规则或分类缓存，Marko 需要先访问模型才能分类；慢模型超时会改用本地待分类兜底。",
      applyConfirmTitle: "应用已保存的预览方案",
      applyConfirmDesc: "Marko 会先创建新备份，确认预览仍然有效，然后直接本地重建，不会再次请求模型。",
      applyConfirmPrimary: "备份并应用",
      applyConfirmSecondary: "暂不应用",
      hostPermissionRequiredTitle: "缺少访问授权，无法生成预览。",
      hostPermissionRequiredDetail:
        "只有确实需要调用模型时，Marko 才会请求模型接口访问；完整模式还需要网站访问权限来检测链接。",
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
      backupCreateSuccess: "备份已创建。",
      backupRestoreSuccess: "备份已恢复。",
      backupDeleteSuccess: "备份已删除。",
      backupRestoreInlineConfirm: "恢复前会先为当前书签创建新快照，然后用这个备份替换书签栏。",
      backupRestoreInlinePrimary: "恢复备份",
      backupDeleteInlineConfirm: "删除这个快照吗？删除后无法恢复。",
      backupDeleteInlinePrimary: "删除备份",
      backupInlineCancel: "取消",
      backupRecordFallback: "这个备份",
      backupRestoreRecordAria: "恢复备份 {title}",
      backupDeleteRecordAria: "删除备份 {title}",
      backupConfirmRestoreRecordAria: "确认恢复备份 {title}",
      backupConfirmDeleteRecordAria: "确认删除备份 {title}",
      backupCancelActionAria: "取消 {title} 的备份操作",
      batchSizeValidation: "批大小必须是 5 到 100 之间的整数。",
      autoIntervalValidation: "自动整理间隔必须是 1 到 168 小时之间的整数。",
      requiredApiKey: "{provider} 通常需要 API Key，请先填写。",
      autoOrganizePermission: "快速自动整理会在本地运行；平衡自动整理需要模型接口权限，完整自动整理还需要网站访问权限。",
      baseUrlRequired: "Base URL 不能为空。",
      baseUrlInvalid: "Base URL 必须是有效的 http 或 https 地址。",
      modelRequired: "模型名称不能为空。",
      currentApiAccessMissing: "未授权访问当前 API 地址。",
      hostAccessNotNeeded: "快速模式会本地运行，不需要模型接口或网站访问权限。",
      hostAccessNotNeededAction: "快速模式无需额外授权。只有需要检测模型接口时才使用“检测并保存”。",
      hostAccessChecking: "正在检查访问权限…",
      hostAccessRefreshFailed: "访问状态刷新失败。请检查 Chrome 扩展权限后重试。",
      apiTesting: "检测中…",
      apiTestFailed: "API 检测失败。",
      apiTestSucceeded: "API 检测成功。",
      apiTestSaved: "设置已保存。",
      apiTestSaveFailed: "API 检测成功，但设置保存失败。",
      apiTestAutoAccessFailed: "API 检测成功，但自动整理权限未授权。",
      apiTestException: "API 检测过程中发生异常。",
      apiKeyClearedOnProviderChange: "已清空 API Key，避免把旧服务商密钥用于新服务商。",
      backupCreateFailedAlert: "创建备份失败。",
      backupCreateExceptionAlert: "创建备份时发生异常。",
      backupRestoreFailedAlert: "恢复备份失败。",
      backupRestoreExceptionAlert: "恢复备份时发生异常。",
      backupDeleteFailedAlert: "删除备份失败。",
      backupDeleteExceptionAlert: "删除备份时发生异常。",
      hostAccessMissingAlert: "未授予访问权限。API 检测、平衡模式和完整模式需要访问当前模型接口，完整链接检查还需要网站访问权限。",
      hostAccessRequestException: "申请访问权限时发生异常。",
      backupReadFailed: "读取备份列表失败。",
      backupRatio: "{count} / 10",
      backupFolderPrefix: "书签整理备份",
      backupRecordPrefix: "书签快照",
      manualFolderTitle: "待手动分类",
      privacyPageTitle: "Marko - 隐私说明",
      privacyMeta: "Marko / 隐私说明",
      privacyMainTitle: "隐私说明",
      privacyLastUpdatedMeta: "最后更新：2026-06-09",
      privacyDataUseEyebrow: "数据使用",
      privacyDataUseTitle: "数据使用范围",
      privacyLocalDataTitle: "读取的本地数据",
      privacyLocalDataDesc: "书签标题、URL、当前文件夹路径、插件设置、备份快照。",
      privacyThirdPartyTitle: "发送到第三方的数据",
      privacyThirdPartyDesc:
        "只有在平衡或完整模式预览、或已开启自动整理且仍需要模型分类时，书签标题、URL、现有路径和自定义 Prompt 才会发送到你选择的模型服务商。应用已保存预览不会再次请求模型。",
      privacyDeadLinkTitle: "失效链接检测",
      privacyDeadLinkDesc: "平衡模式会跳过直接网站检测，但可以使用模型分类。开启完整模式时，预览和整理流程会直接向书签对应的网站发送 HEAD / GET 请求，并使用模型分类；较快服务商可能会额外请求目录规划，慢模型会跳过这一步。快速模式会跳过这些外部请求。",
      privacyStorageTitle: "本地存储",
      privacyStorageDesc: "API Key、服务商设置、模型名、白名单和备份快照都保存在你的浏览器本地存储与 IndexedDB 中。",
      privacyControlEyebrow: "控制项",
      privacyControlTitle: "你可以控制的内容",
      privacyHostAccessTitle: "授权访问",
      privacyHostAccessDesc: "需要模型的预览会先要求你显式授权模型接口访问。完整链接检查需要更广的网站访问权限，你也可以稍后在 Chrome 扩展权限里撤销。",
      privacyWhitelistTitle: "白名单与待手动分类",
      privacyWhitelistDesc: "白名单域名不会被自动整理；状态不明确的书签会进入“待手动分类”。",
      privacyBackupTitle: "备份与恢复",
      privacyBackupDesc: "应用预览方案、自动整理重建和恢复旧备份前都会先创建本地快照备份。你可以在设置页管理备份并恢复旧版本。",
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
    const fallbackDocument =
      globalScope.document && typeof globalScope.document.querySelectorAll === "function"
        ? globalScope.document
        : null;
    const target = root || fallbackDocument;
    if (!target || typeof target.querySelectorAll !== "function") {
      return;
    }

    const targetDocument = target.documentElement
      ? target
      : target.ownerDocument || fallbackDocument;
    if (targetDocument?.documentElement) {
      targetDocument.documentElement.lang = langTag;
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

    const titleNode =
      typeof target.querySelector === "function"
        ? target.querySelector("title[data-i18n]")
        : null;
    if (titleNode) {
      titleNode.textContent = t(titleNode.dataset.i18n);
    }
  }

  globalScope.MarkoI18n = {
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
