importScripts("i18n.js", "providers.js", "rules.js", "json-utils.js", "cache-utils.js");

const STORAGE_KEYS = {
  config: "smartBookmarkConfig",
  status: "smartBookmarkJobStatus",
  job: "smartBookmarkActiveJob",
  previewPlan: "smartBookmarkPreviewPlan",
  rootFolderId: "smartBookmarkRootFolderId",
  managedFolderIds: "smartBookmarkManagedFolderIds",
  managedRootBookmarkIds: "smartBookmarkManagedRootBookmarkIds",
  latestBackupFolderId: "smartBookmarkLatestBackupFolderId",
  latestSnapshotBackupFolderId: "smartBookmarkLatestSnapshotBackupFolderId",
  backupRecords: "smartBookmarkBackupRecords",
  unresolvedFolderId: "smartBookmarkUnresolvedFolderId",
  classificationCache: "smartBookmarkClassificationCache",
  deadLinkCache: "smartBookmarkDeadLinkCache"
};

const ALARM_NAME = "smart-bookmark-ai-next-batch";
const AUTO_ORGANIZE_ALARM_NAME = "smart-bookmark-ai-auto-organize";
const HOST_ACCESS_ORIGINS = ["https://*/*", "http://*/*"];
const I18N = globalThis.SmartBookmarkI18n;
const Providers = globalThis.SmartBookmarkProviders;
const Rules = globalThis.SmartBookmarkRules;
const JsonUtils = globalThis.SmartBookmarkJson;
const CacheUtils = globalThis.SmartBookmarkCache;
const t = (key, params) => I18N.t(key, params);
const isZh = I18N.locale === "zh_CN";
const ux = (zh, en) => (isZh ? zh : en);
const DEFAULT_BATCH_SIZE = 50;
const MIN_BATCH_SIZE = 5;
const MIN_AUTO_RETRY_BATCH_SIZE = 1;
const MAX_AUTO_RETRY_BATCH_SIZE = 20;
const RUNTIME_BATCH_SIZE_CAPS = {
  deepseek: 15
};
const MODEL_REQUEST_BATCH_SIZE_CAPS = {
  deepseek: 5
};
const MODEL_REQUEST_CONCURRENCY_CAPS = {
  deepseek: 3
};
const DEFAULT_DEAD_SCAN_BATCH_SIZE = 20;
const DEFAULT_TAXONOMY_SAMPLE_SIZE = 160;
const TAXONOMY_SAMPLE_SIZE_CAPS = {
  deepseek: 80
};
const DEFAULT_TAXONOMY_TIMEOUT_MS = 30_000;
const TAXONOMY_TIMEOUT_CAPS_MS = {
  deepseek: 15_000
};
const LINK_CHECK_MODE_FAST = "fast";
const LINK_CHECK_MODE_COMPLETE = "complete";
const DEFAULT_ROOT_FOLDER = "Marko";
const LEGACY_ROOT_FOLDERS = ["Smart Bookmark AI", "TidyMarks AI"];
const BACKUP_DB_NAME = "smart-bookmark-ai-backups";
const BACKUP_DB_VERSION = 1;
const BACKUP_DB_STORE = "snapshots";
const BACKUP_FOLDER_PREFIX = I18N.getBackupFolderPrefix();
const BACKUP_RECORD_PREFIX = I18N.getBackupRecordPrefix();
const MANUAL_FOLDER_TITLE = I18N.getManualFolderTitle();
const DUPLICATE_FOLDER_TITLE = ux("重复书签", "Duplicate Bookmarks");
const ROOT_DIRECT_FOLDER_MARKER = "__ROOT_DIRECT__";
const ROOT_DIRECT_FOLDER_TITLE = ux("根目录", "Root");
const MANUAL_FOLDER_ALIASES = [
  "待手动分类",
  "待整理",
  "待处理",
  "未分类",
  "未整理",
  "未处理",
  "Needs Manual Review",
  "Manual Review"
];
const ROOT_DIRECT_FOLDER_ALIASES = [
  "常用",
  "首页",
  "主页",
  "主頁",
  "常用网站",
  "常用網址",
  "常用与首页",
  "常用與首頁",
  "home",
  "homepage",
  "home page",
  "favorites",
  "favorite",
  "common",
  "quick access",
  "top sites",
  "start page"
];
const FAST_LOCAL_FOLDER_RULES = [
  {
    folderPath: [ux("AI/技术", "AI & Tech")],
    domains: [
      "github.com",
      "gitlab.com",
      "bitbucket.org",
      "stackoverflow.com",
      "stackexchange.com",
      "developer.mozilla.org",
      "npmjs.com",
      "pypi.org",
      "docker.com",
      "kubernetes.io",
      "k8s.io",
      "nodejs.org",
      "react.dev",
      "vuejs.org",
      "angular.dev",
      "vitejs.dev",
      "nextjs.org",
      "typescriptlang.org",
      "rust-lang.org",
      "go.dev",
      "python.org",
      "vercel.com",
      "netlify.com",
      "cloudflare.com",
      "tailwindcss.com",
      "w3.org",
      "caniuse.com"
    ]
  },
  {
    folderPath: [ux("学习/教程", "Learning & Tutorials")],
    domains: [
      "coursera.org",
      "edx.org",
      "udemy.com",
      "khanacademy.org",
      "freecodecamp.org",
      "codecademy.com",
      "w3schools.com"
    ]
  },
  {
    folderPath: [ux("工具/效率", "Tools & Productivity")],
    domains: [
      "notion.so",
      "trello.com",
      "asana.com",
      "airtable.com",
      "slack.com",
      "zoom.us",
      "calendly.com",
      "docs.google.com",
      "drive.google.com",
      "dropbox.com",
      "1password.com"
    ]
  },
  {
    folderPath: [ux("产品/设计", "Product & Design")],
    domains: [
      "figma.com",
      "dribbble.com",
      "behance.net",
      "canva.com",
      "producthunt.com",
      "uxdesign.cc"
    ]
  },
  {
    folderPath: [ux("资讯/社区", "News & Communities")],
    domains: [
      "news.ycombinator.com",
      "reddit.com",
      "x.com",
      "twitter.com",
      "medium.com",
      "substack.com",
      "zhihu.com",
      "juejin.cn",
      "v2ex.com"
    ]
  },
  {
    folderPath: [ux("购物/服务", "Shopping & Services")],
    domains: [
      "amazon.com",
      "ebay.com",
      "etsy.com",
      "taobao.com",
      "jd.com",
      "tmall.com",
      "aliexpress.com",
      "paypal.com"
    ]
  },
  {
    folderPath: [ux("娱乐/内容", "Entertainment & Content")],
    domains: [
      "netflix.com",
      "spotify.com",
      "twitch.tv",
      "imdb.com",
      "douban.com",
      "disneyplus.com"
    ]
  },
  {
    folderPath: [ux("生活/资源", "Life & Resources")],
    domains: [
      "airbnb.com",
      "booking.com",
      "tripadvisor.com",
      "expedia.com",
      "mayoclinic.org",
      "healthline.com",
      "webmd.com"
    ]
  }
];
const DEAD_LINK_CHECK_TIMEOUT_MS = 10_000;
const DEAD_LINK_SCAN_CONCURRENCY = 6;
const DEAD_LINK_DELETE_STATUS_CODES = new Set([404, 410, 451]);
const KEEP_ALIVE_INTERVAL_MS = 25_000;
const FIRST_RESPONSE_TIMEOUT_MS = 25_000;
const REQUEST_TIMEOUT_MS = 90_000;
const FIRST_RESPONSE_TIMEOUT_CAPS_MS = {
  deepseek: 15_000
};
const REQUEST_TIMEOUT_CAPS_MS = {
  deepseek: 45_000
};
const NEXT_BATCH_DELAY_MS = 150;
const MODEL_INPUT_TITLE_MAX_LENGTH = 120;
const MODEL_INPUT_URL_MAX_LENGTH = 260;
const MODEL_INPUT_PATH_MAX_LENGTH = 140;
const TAXONOMY_OUTPUT_TOKEN_BUDGET = 384;
const CLASSIFICATION_OUTPUT_TOKEN_BASE = 256;
const CLASSIFICATION_OUTPUT_TOKENS_PER_BOOKMARK = 80;
const CLASSIFICATION_OUTPUT_TOKEN_MAX = 4096;
const CLASSIFICATION_OUTPUT_BUDGET_PROFILES = {
  deepseek: {
    base: 160,
    perBookmark: 48,
    max: 768
  }
};
const LOCAL_REQUIREMENT_CHECK_TTL_MS = 15_000;
const BOOTSTRAP_BACKUP_SYNC_TTL_MS = 60_000;
const BOOTSTRAP_ROOT_CLEANUP_TTL_MS = 60_000;
const MAX_BACKUP_RECORDS = 10;
const MAX_CLASSIFICATION_SIGNATURES = 6;
const MAX_CLASSIFICATION_CACHE_ITEMS = 5000;

const LEGACY_DEFAULT_PROMPT = I18N.getLegacyDefaultPrompt();
const DEFAULT_PROMPT = I18N.getDefaultPrompt();
const COMPACT_DEFAULT_PROMPT_ZH = `目标：把书签整理成少量稳定、长期好找的目录。一级目录尽量 6 到 8 个，最多 9 个；每条最多 2 级；优先复用给定全局目录；二级目录只在确实有用时添加；宁可合并，不要细分；信息不足放入“${MANUAL_FOLDER_TITLE}”；只删除明确重复项，无法确认就保留。`;
const COMPACT_DEFAULT_PROMPT_EN = `Goal: organize bookmarks into a small, stable, easy-to-find folder structure. Aim for 6 to 8 top-level folders and never more than 9; use at most 2 levels per bookmark; prefer the provided top-level folders; add a second level only when useful; merge rather than split; put unclear items in "${MANUAL_FOLDER_TITLE}"; delete only clear duplicates.`;

let currentStatus = buildIdleStatus();
let batchLock = false;
let activeAbortController = null;
const activeModelAbortControllers = new Set();
let lastLocalRequirementCheck = null;
let lastBootstrapBackupSyncMs = 0;
let lastBootstrapRootCleanupMs = 0;
const activeDeadScanControllers = new Set();

chrome.runtime.onInstalled.addListener(() => {
  (async () => {
    await initializeDefaults();
    await syncAutoOrganizeAlarm();
  })().catch((error) => {
    console.error("Failed to initialize extension defaults:", error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  (async () => {
    await bootstrapState();
    await syncAutoOrganizeAlarm();
  })().catch((error) => {
    console.error("Failed to bootstrap state on startup:", error);
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes[STORAGE_KEYS.config] || changes[STORAGE_KEYS.classificationCache]) {
    clearLocalRequirementCheck();
  }

  if (!changes[STORAGE_KEYS.config]) {
    return;
  }

  void syncAutoOrganizeAlarm().catch((error) => {
    console.error("Failed to sync auto organize alarm after config change:", error);
  });
  const oldSignature = buildPreviewConfigSignature(
    mergeConfig(changes[STORAGE_KEYS.config].oldValue || {})
  );
  const nextSignature = buildPreviewConfigSignature(
    mergeConfig(changes[STORAGE_KEYS.config].newValue || {})
  );
  if (oldSignature === nextSignature) {
    return;
  }

  void invalidatePreviewPlan(
    ux(
      "整理设置已更新，请重新生成预览。",
      "Organize settings changed. Generate a new preview."
    ),
    ux(
      "旧预览已自动失效，避免用旧模型、规则或速度模式应用到新设置。",
      "The old preview was invalidated automatically so an old model, rule, or speed-mode plan is not applied to new settings."
    )
  ).catch((error) => {
    console.error("Failed to invalidate preview after config change:", error);
  });
});

function invalidatePreviewAfterBookmarkChange() {
  clearLocalRequirementCheck();
  void invalidatePreviewPlan(
    ux(
      "书签内容已变化，请重新生成预览。",
      "Bookmarks changed. Generate a new preview."
    ),
    ux(
      "Marko 检测到书签树发生变化，已自动清除旧预览，避免应用到不同的书签集合。",
      "Marko detected a bookmark tree change and cleared the old preview so it cannot be applied to a different bookmark set."
    )
  ).catch((error) => {
    console.error("Failed to invalidate preview after bookmark change:", error);
  });
}

chrome.bookmarks.onCreated?.addListener(invalidatePreviewAfterBookmarkChange);
chrome.bookmarks.onRemoved?.addListener(invalidatePreviewAfterBookmarkChange);
chrome.bookmarks.onChanged?.addListener(invalidatePreviewAfterBookmarkChange);
chrome.bookmarks.onMoved?.addListener(invalidatePreviewAfterBookmarkChange);
chrome.bookmarks.onChildrenReordered?.addListener(invalidatePreviewAfterBookmarkChange);

chrome.permissions.onAdded?.addListener(() => {
  void syncAutoOrganizeAlarm().catch((error) => {
    console.error("Failed to sync auto organize alarm after permission add:", error);
  });
});

chrome.permissions.onRemoved?.addListener(() => {
  void syncAutoOrganizeAlarm().catch((error) => {
    console.error("Failed to sync auto organize alarm after permission removal:", error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    await bootstrapState();

    if (message?.type === "GET_JOB_STATUS") {
      sendResponse({ ok: true, status: currentStatus });
      return;
    }

    if (message?.type === "CHECK_LOCAL_MODEL_REQUIREMENT") {
      try {
        const result = await checkLocalModelRequirement();
        sendResponse(result);
      } catch (error) {
        console.error("Failed to check local model requirement:", error);
        sendResponse({
          ok: false,
          error: toUserMessage(
            error,
            ux("检查本地规则和缓存覆盖情况失败。", "Failed to check local rules and cache coverage.")
          ),
          detail: error?.userDetail || ""
        });
      }
      return;
    }

    if (message?.type === "START_PREVIEW") {
      try {
        const result = await startOrganizeJob({
          trigger: "manual",
          mode: "preview",
          localRequirementCheckId: message.localRequirementCheckId || ""
        });
        sendResponse(result);
      } catch (error) {
        console.error("Failed to start preview job:", error);
        sendResponse({
          ok: false,
          error: toUserMessage(error, ux("启动整理预览失败。", "Failed to start the preview."))
        });
      }
      return;
    }

    if (message?.type === "APPLY_PREVIEW_PLAN") {
      try {
        const result = await applyPreviewPlan();
        sendResponse(result);
      } catch (error) {
        console.error("Failed to apply preview plan:", error);
        sendResponse({
          ok: false,
          error: toUserMessage(error, ux("应用预览方案失败。", "Failed to apply the preview plan.")),
          detail: error?.userDetail || ""
        });
      }
      return;
    }

    if (message?.type === "INVALIDATE_PREVIEW_PLAN") {
      try {
        await invalidatePreviewPlan(
          ux("模式已更新，请重新生成预览。", "Mode changed. Generate a new preview."),
          ux(
            "旧预览已自动失效，避免把旧速度模式的方案应用到新模式。",
            "The old preview was invalidated automatically so a plan from the previous speed mode is not applied to the new mode."
          )
        );
        sendResponse({ ok: true });
      } catch (error) {
        console.error("Failed to invalidate preview plan:", error);
        sendResponse({
          ok: false,
          error: toUserMessage(error, ux("清除旧预览失败。", "Failed to clear the old preview.")),
          detail: error?.userDetail || ""
        });
      }
      return;
    }

    if (message?.type === "CREATE_MANUAL_BACKUP") {
      try {
        const result = await createManualBackup();
        sendResponse(result);
      } catch (error) {
        console.error("Failed to create manual backup:", error);
        sendResponse({
          ok: false,
          error: toUserMessage(error, ux("创建手动备份失败。", "Failed to create a manual backup."))
        });
      }
      return;
    }

    if (message?.type === "GET_BACKUP_RECORDS") {
      try {
        const records = await listBackupRecords();
        sendResponse({ ok: true, records });
      } catch (error) {
        console.error("Failed to list backup records:", error);
        sendResponse({
          ok: false,
          error: toUserMessage(error, ux("读取备份列表失败。", "Failed to load backup records."))
        });
      }
      return;
    }

    if (message?.type === "RESTORE_LATEST_BACKUP") {
      try {
        const result = await restoreLatestBackup();
        sendResponse(result);
      } catch (error) {
        console.error("Failed to restore latest backup:", error);
        sendResponse({
          ok: false,
          error: toUserMessage(error, ux("恢复最近备份失败。", "Failed to restore the latest backup."))
        });
      }
      return;
    }

    if (message?.type === "RESTORE_BACKUP_ENTRY") {
      try {
        const result = await restoreBackupEntry(message.backupId);
        sendResponse(result);
      } catch (error) {
        console.error("Failed to restore backup entry:", error);
        sendResponse({
          ok: false,
          error: toUserMessage(error, ux("恢复备份失败。", "Failed to restore the backup."))
        });
      }
      return;
    }

    if (message?.type === "DELETE_BACKUP_ENTRY") {
      try {
        const result = await deleteBackupEntry(message.backupId);
        sendResponse(result);
      } catch (error) {
        console.error("Failed to delete backup entry:", error);
        sendResponse({
          ok: false,
          error: toUserMessage(error, ux("删除备份失败。", "Failed to delete the backup."))
        });
      }
      return;
    }

    if (message?.type === "RESOLVE_UNPROCESSED_ENTRY") {
      try {
        const result = await resolveUnprocessedEntry(message.entryId, message.action);
        sendResponse(result);
      } catch (error) {
        console.error("Failed to resolve unprocessed entry:", error);
        sendResponse({
          ok: false,
          error: toUserMessage(error, ux("处理未处理书签失败。", "Failed to handle the unprocessed bookmark."))
        });
      }
      return;
    }

    if (message?.type === "TEST_API_CONNECTION") {
      try {
        const result = await testApiConnection(message.config);
        sendResponse({ ok: true, ...result });
      } catch (error) {
        console.error("Failed to test API connection:", error);
        sendResponse({
          ok: false,
          error: error?.userMessage || toUserMessage(error, ux("API 检测失败。", "API test failed.")),
          detail:
            error?.userDetail ||
            ux(
              "请检查 Base URL、API Key、模型名是否正确，或确认接口当前没有被风控/限流。",
              "Check whether the Base URL, API key, and model name are correct, and make sure the endpoint is not currently rate-limited or blocked."
            )
        });
      }
      return;
    }

    if (message?.type === "CANCEL_JOB") {
      try {
        await requestCancellation();
        sendResponse({ ok: true });
      } catch (error) {
        console.error("Failed to cancel job:", error);
        sendResponse({
          ok: false,
          error: toUserMessage(error, ux("取消任务失败。", "Failed to cancel the task."))
        });
      }
      return;
    }

    sendResponse({ ok: false, error: ux("不支持的消息类型。", "Unsupported message type.") });
  })();

  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    void processNextBatch();
    return;
  }

  if (alarm.name === AUTO_ORGANIZE_ALARM_NAME) {
    void handleAutoOrganizeAlarm();
    return;
  }
});

void bootstrapState();

function buildIdleStatus(overrides = {}) {
  return {
    phase: "idle",
    cancelRequested: false,
    message: t("progressWaiting"),
    detail: "",
    provider: "",
    model: "",
    total: 0,
    processed: 0,
    moved: 0,
    deleted: 0,
    reused: 0,
    aiClassified: 0,
    batchSize: DEFAULT_BATCH_SIZE,
    warningCount: 0,
    lastWarning: "",
    warnings: [],
    deletedItems: [],
    previewFolders: [],
    protectedRootCount: 0,
    currentBatch: 0,
    totalBatches: 0,
    previewApplyRetryAvailable: false,
    startedAt: "",
    finishedAt: "",
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function getProviderDefaults(provider) {
  return Providers.getProvider(provider);
}

function getProviderLabel(provider) {
  return getProviderDefaults(provider).label || provider || "";
}

function getDefaultBatchSize(provider) {
  return provider === "deepseek" ? 15 : DEFAULT_BATCH_SIZE;
}

function getProviderPerformanceProfile(configOrProvider = {}) {
  const provider =
    typeof configOrProvider === "string"
      ? configOrProvider
      : String(configOrProvider?.provider || "");
  const baseUrl =
    typeof configOrProvider === "string" ? "" : String(configOrProvider?.baseUrl || "");
  const model =
    typeof configOrProvider === "string" ? "" : String(configOrProvider?.model || "");
  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedBaseUrl = baseUrl.trim().toLowerCase();
  const normalizedModel = model.trim().toLowerCase();

  if (
    normalizedProvider === "deepseek" ||
    normalizedBaseUrl.includes("deepseek") ||
    normalizedModel.includes("deepseek")
  ) {
    return "deepseek";
  }

  return normalizedProvider;
}

function getRuntimeProviderLabel(config = {}) {
  const profile = getProviderPerformanceProfile(config);
  if (profile === "deepseek" && config.provider !== "deepseek") {
    return "DeepSeek-compatible";
  }

  return getProviderLabel(config.provider);
}

function getRuntimeBatchSize(config = {}) {
  const configuredBatchSize = normalizeBatchSize(config.batchSize);
  const profile = getProviderPerformanceProfile(config);
  const cap = RUNTIME_BATCH_SIZE_CAPS[profile] || 0;
  return cap ? Math.min(configuredBatchSize, cap) : configuredBatchSize;
}

function getModelRequestBatchSizeCap(config = {}) {
  return MODEL_REQUEST_BATCH_SIZE_CAPS[getProviderPerformanceProfile(config)] || 0;
}

function getModelRequestConcurrency(config = {}) {
  const rawConcurrency = MODEL_REQUEST_CONCURRENCY_CAPS[getProviderPerformanceProfile(config)] || 1;
  const parsedConcurrency = Number.parseInt(String(rawConcurrency), 10);
  return Math.max(1, Number.isInteger(parsedConcurrency) ? parsedConcurrency : 1);
}

function splitIntoModelRequestBatches(batch, config = {}) {
  const safeBatch = Array.isArray(batch) ? batch : [];
  const cap = getModelRequestBatchSizeCap(config);
  if (!cap || safeBatch.length <= cap) {
    return [safeBatch];
  }

  return splitIntoFixedSizeChunks(safeBatch, cap);
}

function splitIntoFixedSizeChunks(items, chunkSize) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeChunkSize = Math.max(1, Number.parseInt(String(chunkSize || 1), 10) || 1);
  const chunks = [];
  for (let index = 0; index < safeItems.length; index += safeChunkSize) {
    chunks.push(safeItems.slice(index, index + safeChunkSize));
  }
  return chunks;
}

function getAdaptiveRetryBatchSize(batchLength) {
  const safeBatchLength = Math.max(1, Number.parseInt(String(batchLength || 1), 10) || 1);
  return Math.max(MIN_AUTO_RETRY_BATCH_SIZE, Math.floor(safeBatchLength / 2));
}

function buildRuntimeBatchAdjustmentNote(config = {}, runtimeBatchSize) {
  const configuredBatchSize = normalizeBatchSize(config.batchSize);
  if (runtimeBatchSize >= configuredBatchSize) {
    return "";
  }

  return ux(
    `${getRuntimeProviderLabel(config)} 本次运行已自动把批大小从 ${configuredBatchSize} 压到 ${runtimeBatchSize}，减少慢模型长时间等待。`,
    `${getRuntimeProviderLabel(config)} automatically capped this run from batch size ${configuredBatchSize} to ${runtimeBatchSize} to reduce slow-model stalls.`
  );
}

function getFirstResponseTimeoutMs(config = {}) {
  const cap = FIRST_RESPONSE_TIMEOUT_CAPS_MS[getProviderPerformanceProfile(config)] || 0;
  return cap ? Math.min(FIRST_RESPONSE_TIMEOUT_MS, cap) : FIRST_RESPONSE_TIMEOUT_MS;
}

function getRequestTimeoutMs(config = {}) {
  const cap = REQUEST_TIMEOUT_CAPS_MS[getProviderPerformanceProfile(config)] || 0;
  return cap ? Math.min(REQUEST_TIMEOUT_MS, cap) : REQUEST_TIMEOUT_MS;
}

function formatTimeoutSeconds(milliseconds) {
  return Math.max(1, Math.floor(milliseconds / 1000));
}

function getTaxonomyPlanningSampleSize(config = {}) {
  return TAXONOMY_SAMPLE_SIZE_CAPS[getProviderPerformanceProfile(config)] || DEFAULT_TAXONOMY_SAMPLE_SIZE;
}

function getTaxonomyPlanningTimeoutMs(config = {}) {
  return TAXONOMY_TIMEOUT_CAPS_MS[getProviderPerformanceProfile(config)] || DEFAULT_TAXONOMY_TIMEOUT_MS;
}

function getClassificationOutputBudgetProfile(configOrProvider) {
  return CLASSIFICATION_OUTPUT_BUDGET_PROFILES[getProviderPerformanceProfile(configOrProvider)] || {
    base: CLASSIFICATION_OUTPUT_TOKEN_BASE,
    perBookmark: CLASSIFICATION_OUTPUT_TOKENS_PER_BOOKMARK,
    max: CLASSIFICATION_OUTPUT_TOKEN_MAX
  };
}

function getClassificationOutputTokenBudget(batchLength, configOrProvider = "") {
  const safeBatchLength = Math.max(1, Number.parseInt(String(batchLength || 1), 10) || 1);
  const profile = getClassificationOutputBudgetProfile(configOrProvider);
  return Math.min(
    profile.max,
    profile.base + safeBatchLength * profile.perBookmark
  );
}

function buildModelStrategyPrompt(customPrompt) {
  const promptValue = typeof customPrompt === "string" ? customPrompt.trim() : "";
  if (
    !promptValue ||
    I18N.isBuiltInPromptValue(promptValue) ||
    promptValue === LEGACY_DEFAULT_PROMPT.trim()
  ) {
    return isZh ? COMPACT_DEFAULT_PROMPT_ZH : COMPACT_DEFAULT_PROMPT_EN;
  }

  return promptValue;
}

async function initializeDefaults() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.config, STORAGE_KEYS.status]);

  if (!stored[STORAGE_KEYS.config]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.config]: buildDefaultConfig("openai")
    });
  }

  if (!stored[STORAGE_KEYS.status]) {
    currentStatus = buildIdleStatus();
    await chrome.storage.local.set({
      [STORAGE_KEYS.status]: currentStatus
    });
  }
}

async function bootstrapState() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.status,
    STORAGE_KEYS.job,
    STORAGE_KEYS.config
  ]);

  if (!stored[STORAGE_KEYS.config]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.config]: buildDefaultConfig("openai")
    });
  }

  if (stored[STORAGE_KEYS.status]) {
    currentStatus = stored[STORAGE_KEYS.status];
  } else {
    currentStatus = buildIdleStatus();
    await chrome.storage.local.set({
      [STORAGE_KEYS.status]: currentStatus
    });
  }

  const activeJob = stored[STORAGE_KEYS.job];
  const alarm = await chrome.alarms.get(ALARM_NAME);

  if (activeJob?.phase === "running" && !alarm) {
    await scheduleNextBatch();
  }

  await syncBackupRecordsForBootstrap();
  await cleanupForbiddenRootFoldersForBootstrap(stored[STORAGE_KEYS.job]);
}

async function syncBackupRecordsForBootstrap() {
  const now = Date.now();
  if (now - lastBootstrapBackupSyncMs < BOOTSTRAP_BACKUP_SYNC_TTL_MS) {
    return;
  }

  lastBootstrapBackupSyncMs = now;
  try {
    await syncBackupRecords();
  } catch (error) {
    console.error("Failed to sync local backup records:", error);
  }
}

async function cleanupForbiddenRootFoldersForBootstrap(activeJob) {
  if (activeJob?.phase === "running") {
    return;
  }

  const now = Date.now();
  if (now - lastBootstrapRootCleanupMs < BOOTSTRAP_ROOT_CLEANUP_TTL_MS) {
    return;
  }

  lastBootstrapRootCleanupMs = now;
  try {
    const tree = await chrome.bookmarks.getTree();
    const bookmarkBarNode = findBookmarksBarNode(tree);
    await cleanupForbiddenAiRootFolders(bookmarkBarNode?.id);
  } catch (error) {
    console.error("Failed to clean forbidden Smart Bookmark root folders:", error);
  }
}

function buildDefaultConfig(provider = "openai") {
  const defaults = getProviderDefaults(provider);

  return {
    provider,
    baseUrl: defaults.baseUrl,
    apiKey: "",
    model: defaults.model,
    batchSize: getDefaultBatchSize(provider),
    linkCheckMode: LINK_CHECK_MODE_FAST,
    autoOrganizeEnabled: false,
    autoOrganizeIntervalHours: 24,
    whitelistDomains: "",
    protectedRootFolders: "",
    domainFolderRules: "",
    customPrompt: DEFAULT_PROMPT
  };
}

function mergeConfig(raw = {}) {
  const providerKnown = Boolean(raw.provider && Providers.hasProvider(raw.provider));
  const provider = providerKnown ? raw.provider : "openai";
  const defaults = buildDefaultConfig(provider);
  const promptValue =
    typeof raw.customPrompt === "string" && raw.customPrompt.trim()
      ? raw.customPrompt
      : defaults.customPrompt;
  const apiKey = providerKnown && typeof raw.apiKey === "string" ? raw.apiKey.trim() : "";
  const autoOrganizeEnabled = Boolean(raw.autoOrganizeEnabled) && Boolean(defaults.apiKeyOptional || apiKey);

  return {
    provider,
    baseUrl:
      providerKnown && typeof raw.baseUrl === "string" && raw.baseUrl.trim()
        ? raw.baseUrl.trim()
        : defaults.baseUrl,
    apiKey,
    model:
      providerKnown && typeof raw.model === "string" && raw.model.trim()
        ? raw.model.trim()
        : defaults.model,
    batchSize: normalizeBatchSize(raw.batchSize, defaults.batchSize),
    linkCheckMode: normalizeLinkCheckMode(raw.linkCheckMode || defaults.linkCheckMode),
    autoOrganizeEnabled,
    autoOrganizeIntervalHours: normalizeAutoInterval(raw.autoOrganizeIntervalHours),
    whitelistDomains:
      typeof raw.whitelistDomains === "string" ? raw.whitelistDomains.trim() : "",
    protectedRootFolders:
      typeof raw.protectedRootFolders === "string" ? raw.protectedRootFolders.trim() : "",
    domainFolderRules:
      typeof raw.domainFolderRules === "string" ? raw.domainFolderRules.trim() : "",
    customPrompt: normalizePromptValue(promptValue)
  };
}

function buildHostOriginPattern(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!/^https?:$/i.test(url.protocol)) {
      return "";
    }

    return `${url.origin}/*`;
  } catch (error) {
    return "";
  }
}

function isValidHttpUrl(rawUrl) {
  return Boolean(buildHostOriginPattern(rawUrl));
}

async function hasBroadHostAccess() {
  try {
    return await chrome.permissions.contains({ origins: HOST_ACCESS_ORIGINS });
  } catch (error) {
    return false;
  }
}

async function hasOriginAccess(rawUrl) {
  const originPattern = buildHostOriginPattern(rawUrl);
  if (!originPattern) {
    return false;
  }

  if (await hasBroadHostAccess()) {
    return true;
  }

  try {
    return await chrome.permissions.contains({ origins: [originPattern] });
  } catch (error) {
    return false;
  }
}

async function assertOrganizeHostAccess(trigger = "manual", config = {}) {
  if (!shouldCheckDeadLinks(config)) {
    return;
  }

  if (await hasBroadHostAccess()) {
    return;
  }

  if (trigger === "auto") {
    throw buildUserFacingError(
      ux(
        "自动整理缺少网站访问权限，已跳过本次任务。",
        "Auto organize skipped because site access has not been granted."
      ),
      ux(
        "请打开扩展设置页，点击“授权网站访问”后再继续使用自动整理。",
        "Open the settings page and grant site access before using auto organize again."
      )
    );
  }

  throw buildUserFacingError(
    ux("缺少网站访问权限，无法开始整理。", "Cannot start organizing without site access."),
    ux(
      "请先在弹窗开始整理时授权网站访问，或去设置页点击“授权网站访问”。",
      "Grant site access from the popup or from the settings page first."
    )
  );
}

async function assertApiOriginAccess(baseUrl) {
  if (await hasOriginAccess(baseUrl)) {
    return;
  }

  throw buildUserFacingError(
    ux("缺少 API 访问权限。", "Missing permission for the API origin."),
    ux(
      "请在设置页检测 API 时授权当前接口域名，或先授权网站访问。",
      "Authorize the current API origin from the settings page, or grant broad site access first."
    )
  );
}

async function readStoredConfig() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.config);
  return mergeConfig(stored[STORAGE_KEYS.config]);
}

async function updateStatus(patch) {
  const statusPatch = {
    previewApplyRetryAvailable: false,
    ...patch
  };
  currentStatus = {
    ...currentStatus,
    ...statusPatch,
    updatedAt: new Date().toISOString()
  };

  await chrome.storage.local.set({
    [STORAGE_KEYS.status]: currentStatus
  });

  try {
    await chrome.runtime.sendMessage({
      type: "JOB_STATUS_UPDATE",
      status: currentStatus
    });
  } catch (error) {
    // Ignore popup messaging failures. The latest state is already stored in storage.local.
  }

  return currentStatus;
}

async function invalidatePreviewPlan(message, detail) {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.job,
    STORAGE_KEYS.previewPlan,
    STORAGE_KEYS.status
  ]);

  if (stored[STORAGE_KEYS.job]?.phase === "running" || !stored[STORAGE_KEYS.previewPlan]) {
    return;
  }

  await chrome.storage.local.remove(STORAGE_KEYS.previewPlan);

  const status = stored[STORAGE_KEYS.status] || currentStatus;
  if (status?.phase !== "preview") {
    return;
  }

  await updateStatus(
    buildIdleStatus({
      phase: "idle",
      message,
      detail,
      finishedAt: new Date().toISOString()
    })
  );
}

function normalizeTopLevelFolderList(rawFolders) {
  const list = (Array.isArray(rawFolders) ? rawFolders : [])
    .map((item) => sanitizeFolderName(String(item || "")))
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 9);

  if (!list.includes(MANUAL_FOLDER_TITLE)) {
    list.push(MANUAL_FOLDER_TITLE);
  }

  return list.slice(0, 9);
}

function buildTaxonomyPlanningSample(bookmarks, maxItems = DEFAULT_TAXONOMY_SAMPLE_SIZE) {
  const selected = [];
  const seenHosts = new Set();

  for (const bookmark of Array.isArray(bookmarks) ? bookmarks : []) {
    if (selected.length >= maxItems) {
      break;
    }

    const host = extractHostname(bookmark.url);
    if (host && seenHosts.has(host) && selected.length < Math.floor(maxItems * 0.6)) {
      continue;
    }

    if (host) {
      seenHosts.add(host);
    }

    selected.push({
      title: bookmark.title || t("untitledBookmark"),
      url: bookmark.url,
      currentPath: bookmark.currentPath
    });
  }

  return selected;
}

function buildTaxonomyPlanningMessages(bookmarks, customPrompt, sampleSize = DEFAULT_TAXONOMY_SAMPLE_SIZE) {
  const sample = buildTaxonomyPlanningSample(bookmarks, sampleSize);
  const strategyPrompt = buildModelStrategyPrompt(customPrompt || DEFAULT_PROMPT);
  const fixedFolders = buildTaxonomyFallbackTopFolders();

  return [
    {
      role: "system",
      content: isZh
        ? "你是一个极度克制的目录规划助手。你只能输出合法 JSON，不能输出解释、Markdown 或额外文字。"
        : "You are a restrained taxonomy planning assistant. Output valid JSON only, with no explanations, Markdown, or extra text."
    },
    {
      role: "user",
      content: isZh
        ? `${strategyPrompt}

请先为整批书签规划一个全局一级目录方案。

输出格式必须是：
{
  "topFolders": ["一级目录1", "一级目录2", "..."]
}

强制规则：
1. topFolders 只允许 4 到 9 个目录名。
2. 必须包含“${MANUAL_FOLDER_TITLE}”。
3. 优先复用稳定大类，不要发明零碎目录。
4. 这些目录名优先参考：${fixedFolders.join("、")}。
5. 不要因为同一网站出现很多次，或存在重复入口，就额外拆出新的目录。
6. 只输出合法 JSON 对象。

书签样本：
${JSON.stringify(sample, null, 2)}`
        : `${strategyPrompt}

Plan a global top-level taxonomy for the whole bookmark set first.

The output format must be:
{
  "topFolders": ["Top Folder 1", "Top Folder 2", "..."]
}

Hard rules:
1. topFolders must contain 4 to 9 folder names.
2. It must include "${MANUAL_FOLDER_TITLE}".
3. Reuse stable broad categories instead of inventing fragmented ones.
4. Prefer names close to: ${fixedFolders.join(", ")}.
5. Do not create extra folders only because the same site appears many times or contains duplicate entries.
6. Output valid JSON only.

Bookmark sample:
${JSON.stringify(sample, null, 2)}`
    }
  ];
}

async function planGlobalTaxonomy(bookmarks, config) {
  if (!Array.isArray(bookmarks) || !bookmarks.length) {
    return buildTaxonomyFallbackTopFolders();
  }

  const messages = buildTaxonomyPlanningMessages(
    bookmarks,
    config.customPrompt,
    getTaxonomyPlanningSampleSize(config)
  );
  const requestSpec = Providers.buildRequest(config, messages, {
    mode: "organize",
    outputTokenBudget: TAXONOMY_OUTPUT_TOKEN_BUDGET
  });
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort("taxonomy-timeout"),
    getTaxonomyPlanningTimeoutMs(config)
  );
  let response;
  let rawBody = "";

  try {
    response = await fetch(requestSpec.endpoint, {
      method: "POST",
      headers: requestSpec.headers,
      body: JSON.stringify(requestSpec.body),
      signal: controller.signal
    });
    rawBody = await response.text();
  } finally {
    clearTimeout(timer);
  }

  if (controller.signal.aborted) {
    throw new Error(
      ux(
        "全局目录规划超时，已改用默认稳定大类。",
        "Global taxonomy planning timed out, so the extension fell back to the default stable folders."
      )
    );
  }

  if (!response.ok) {
    throw new Error(
      ux(
        `全局目录规划失败 (${response.status})：${truncate(rawBody, 220)}`,
        `Global taxonomy planning failed (${response.status}): ${truncate(rawBody, 220)}`
      )
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch (error) {
    throw new Error(
      ux(
        `全局目录规划返回了非 JSON 响应：${truncate(rawBody, 180)}`,
        `Global taxonomy planning returned a non-JSON response: ${truncate(rawBody, 180)}`
      )
    );
  }

  const content = Providers.extractText(parsed, config.provider);
  const payload = JsonUtils.extractJsonObject(content);
  const topFolders = normalizeTopLevelFolderList(payload.topFolders);
  return topFolders.length ? topFolders : buildTaxonomyFallbackTopFolders();
}

function collectProtectedRootFolderIds(bookmarkBarNode, rawProtectedFolders = "") {
  const protectedFolderNames = Rules.parseProtectedRootFolders(rawProtectedFolders);
  if (!Array.isArray(bookmarkBarNode?.children) || !protectedFolderNames.length) {
    return [];
  }

  const normalizedTargets = new Set(
    protectedFolderNames.map((name) => Rules.normalizeFolderSegment(name))
  );

  return bookmarkBarNode.children
    .filter((node) => !node.url && normalizedTargets.has(Rules.normalizeFolderSegment(node.title)))
    .map((node) => node.id);
}

async function collectBookmarkPlanningState(config) {
  const tree = await chrome.bookmarks.getTree();
  const bookmarkBarNode = findBookmarksBarNode(tree);
  const unresolvedFolderId = await findExistingUnresolvedFolderId(bookmarkBarNode.id);
  const protectedRootFolderIds = collectProtectedRootFolderIds(
    bookmarkBarNode,
    config.protectedRootFolders
  );
  const whitelistMatcher = buildWhitelistMatcher(config.whitelistDomains);
  const skipNodeIds = new Set([
    unresolvedFolderId,
    ...protectedRootFolderIds
  ].filter(Boolean));
  const collectedBookmarks = collectBookmarks(tree, {
    skipNodeIds
  });
  const preservedBookmarks = collectedBookmarks
    .filter((bookmark) => whitelistMatcher(bookmark.url))
    .map((bookmark) => ({
      title: bookmark.title || t("untitledBookmark"),
      url: bookmark.url,
      folderPath: normalizePreservedFolderPath(bookmark.currentPath)
    }));

  return {
    tree,
    bookmarkBarNode,
    unresolvedFolderId,
    protectedRootFolderIds,
    collectedBookmarks,
    preservedBookmarks,
    bookmarks: collectedBookmarks.filter((bookmark) => !whitelistMatcher(bookmark.url))
  };
}

function buildForcedPlans(bookmarks, domainFolderRules = []) {
  const plans = [];
  const remaining = [];

  for (const bookmark of Array.isArray(bookmarks) ? bookmarks : []) {
    const matchedRule = Rules.matchDomainRule(extractHostname(bookmark.url), domainFolderRules);
    if (!matchedRule) {
      remaining.push(bookmark);
      continue;
    }

    plans.push({
      id: bookmark.id,
      action: "keep",
      folderPath: normalizeFolderPath(matchedRule.folderPath),
      duplicateOf: ""
    });
  }

  return {
    plans,
    remaining
  };
}

function buildBuiltInFastFolderPlans(bookmarks) {
  const plans = [];
  const remaining = [];

  for (const bookmark of Array.isArray(bookmarks) ? bookmarks : []) {
    const folderPath = matchBuiltInFastFolderPath(bookmark);
    if (!folderPath) {
      remaining.push(bookmark);
      continue;
    }

    plans.push({
      id: bookmark.id,
      action: "keep",
      folderPath,
      duplicateOf: ""
    });
  }

  return {
    plans,
    remaining
  };
}

function matchBuiltInFastFolderPath(bookmark) {
  const hostname = extractHostname(bookmark?.url || "");
  if (!hostname) {
    return null;
  }

  const normalizedHost = hostname.replace(/^www\./i, "").toLowerCase();
  const matchedRule = FAST_LOCAL_FOLDER_RULES.find((rule) =>
    rule.domains.some((domain) => domainMatchesHost(normalizedHost, domain))
  );

  return matchedRule ? matchedRule.folderPath : null;
}

function domainMatchesHost(hostname, domain) {
  const safeHost = String(hostname || "").trim().toLowerCase();
  const safeDomain = String(domain || "").trim().toLowerCase();

  if (!safeHost || !safeDomain) {
    return false;
  }

  return safeHost === safeDomain || safeHost.endsWith(`.${safeDomain}`);
}

function buildCachedPlans(bookmarks, cacheBucket = {}) {
  const plans = [];
  const remaining = [];

  for (const bookmark of Array.isArray(bookmarks) ? bookmarks : []) {
    const fingerprint = Rules.buildBookmarkFingerprint(bookmark);
    const cached = fingerprint ? cacheBucket[fingerprint] : null;

    if (!cached?.folderPath?.length) {
      remaining.push(bookmark);
      continue;
    }

    plans.push({
      id: bookmark.id,
      action: "keep",
      folderPath: normalizeFolderPath(cached.folderPath),
      duplicateOf: ""
    });
  }

  return {
    plans,
    remaining
  };
}

function buildFastLocalClassificationPlan(
  bookmarks,
  domainFolderRules = [],
  cacheBucket = {},
  options = {}
) {
  const scanResult = buildSkippedDeadLinkScanResult(bookmarks);
  const duplicateState = markHealthyExactDuplicates(scanResult.healthyBookmarks, {});
  const aliveBookmarks = duplicateState.bookmarks;
  const exactDuplicatePlans = buildExactDuplicatePlans(aliveBookmarks);
  const nonDuplicateBookmarks = aliveBookmarks.filter((bookmark) => !bookmark.exactDuplicateOf);
  const forcedPlans = buildForcedPlans(nonDuplicateBookmarks, domainFolderRules);
  const cachedPlans = buildCachedPlans(forcedPlans.remaining, cacheBucket);
  const builtInFastPlans = options.useBuiltInFastRules === false
    ? { plans: [], remaining: cachedPlans.remaining }
    : buildBuiltInFastFolderPlans(cachedPlans.remaining);
  const planResult = buildBatchClassificationPlan(aliveBookmarks, [
    ...forcedPlans.plans,
    ...cachedPlans.plans,
    ...builtInFastPlans.plans,
    ...exactDuplicatePlans
  ]);

  return {
    aiCandidates: builtInFastPlans.remaining,
    scanResult,
    planResult,
    reusedCount: cachedPlans.plans.length,
    fastRuleCount: builtInFastPlans.plans.length,
    forcedCount: forcedPlans.plans.length,
    exactDuplicateSeenByUrl: duplicateState.seenByUrl
  };
}

async function finishFastLocalJob(job, localPlan) {
  const scanResult = localPlan.scanResult;
  const planResult = localPlan.planResult;

  job.exactDuplicateSeenByUrl = localPlan.exactDuplicateSeenByUrl || {};
  job.processed = job.total;
  job.moved = planResult.keepCount;
  job.deleted = scanResult.deletedCount + planResult.deletedCount;
  job.reused = localPlan.reusedCount;
  job.aiClassified = 0;
  job.warningCount = scanResult.warningCount + planResult.warningCount;
  job.lastWarning = planResult.lastWarning || scanResult.lastWarning || job.lastWarning || "";
  job.warnings = appendLimitedEntries(job.warnings, [
    ...(scanResult.warningEntries || []),
    ...(planResult.warningEntries || [])
  ]);
  job.deletedItems = appendLimitedEntries(job.deletedItems, [
    ...(scanResult.deletedEntries || []),
    ...(planResult.deletedEntries || [])
  ]);
  job.plannedBookmarks = appendPlanEntries(job.plannedBookmarks, planResult.keepEntries);
  job.pendingWarnings = appendPlanEntries(job.pendingWarnings, scanResult.pendingWarnings);

  await chrome.storage.local.set({
    [STORAGE_KEYS.job]: job
  });

  if (job.jobMode === "preview") {
    const previewFolders = buildPreviewFolderSummary(
      [...(job.preservedBookmarks || []), ...(job.plannedBookmarks || [])],
      job.pendingWarnings
    );
    job.previewFolders = previewFolders;
    await savePreviewPlan(job, previewFolders);
    await finishJob(
      "preview",
      ux(
        `整理预览已生成，共分析 ${job.total} 条书签。`,
        `Preview is ready. Analyzed ${job.total} bookmarks.`
      ),
      job,
      {
        detail: ux(
        `快速模式下自定义规则、分类缓存和内置快速规则已覆盖全部书签，本次没有调用模型。预计归类 ${job.moved} 条，其中复用缓存 ${job.reused} 条、内置快速规则 ${localPlan.fastRuleCount || 0} 条；删除 ${job.deleted} 条，${MANUAL_FOLDER_TITLE} ${job.pendingWarnings.length} 条。确认无误后点击“应用方案”正式重建。`,
        `Fast mode covered every bookmark with custom rules, the classification cache, and built-in fast rules, so this preview did not call the model. It would categorize ${job.moved}, including ${job.reused} reused cached results and ${localPlan.fastRuleCount || 0} from built-in fast rules, delete ${job.deleted}, and leave ${job.pendingWarnings.length} items in "${MANUAL_FOLDER_TITLE}". If it looks good, click Apply Plan to rebuild.`
        ),
        previewFolders
      }
    );
    return;
  }

  await updateBatchStatus(job, job.totalBatches, {
    message: ux(
      "自定义规则、分类缓存和内置快速规则已覆盖全部书签，正在直接重建书签结构。",
      "Custom rules, the classification cache, and built-in fast rules covered every bookmark. Rebuilding directly."
    ),
    detail: ux(
      "快速模式无需等待模型返回；备份已经提前完成，接下来会按本地方案一次性重建。",
      "Fast mode does not need to wait for the model. A backup has already been created, and the local plan will be rebuilt in one pass."
    )
  });

  const rebuildResult = await rebuildOrganizedBookmarks(job);
  job.managedFolderIds = rebuildResult.managedFolderIds;
  job.managedRootBookmarkIds = rebuildResult.managedRootBookmarkIds;
  job.warnings = rebuildResult.warningEntries;
  job.warningCount = rebuildResult.warningEntries.length;
  job.lastWarning = rebuildResult.warningEntries.at(-1)?.reason || "";

  await finishJob(
    "completed",
    buildOrganizeCompletedMessage(job, rebuildResult),
    job,
    {
      detail: ux(
        `本次快速模式完全复用自定义规则、分类缓存和内置快速规则，没有调用模型。共归类 ${job.moved} 条，其中复用缓存 ${job.reused} 条、内置快速规则 ${localPlan.fastRuleCount || 0} 条；白名单保留 ${rebuildResult.preservedCount} 条，受保护根目录保留 ${job.protectedRootFolderIds.length} 个，${MANUAL_FOLDER_TITLE} ${rebuildResult.warningEntries.length} 条。`,
        `This fast-mode run reused only custom rules, the classification cache, and built-in fast rules without calling the model. It categorized ${job.moved} bookmarks, including ${job.reused} reused cached results and ${localPlan.fastRuleCount || 0} from built-in fast rules, preserved ${rebuildResult.preservedCount} whitelisted bookmarks, kept ${job.protectedRootFolderIds.length} protected root folders untouched, and left ${rebuildResult.warningEntries.length} items in "${MANUAL_FOLDER_TITLE}".`
      )
    }
  );
}

function clearLocalRequirementCheck() {
  lastLocalRequirementCheck = null;
}

async function buildLocalRequirementCheck(config) {
  const runtimeBatchSize = getRuntimeBatchSize(config);
  const runtimeConfig = {
    ...config,
    batchSize: runtimeBatchSize
  };
  const bookmarkState = await collectBookmarkPlanningState(config);
  const domainFolderRules = Rules.parseDomainFolderRules(
    runtimeConfig.domainFolderRules,
    MANUAL_FOLDER_TITLE
  );
  const classificationSignature = Rules.buildClassificationSignature(runtimeConfig, MANUAL_FOLDER_TITLE);
  const classificationCacheStore = await loadClassificationCacheStore();
  const classificationCacheBucket = normalizeClassificationCacheBucket(
    classificationCacheStore[classificationSignature]?.items || {}
  );
  const localPlan = buildFastLocalClassificationPlan(
    bookmarkState.bookmarks,
    domainFolderRules,
    classificationCacheBucket,
    { useBuiltInFastRules: !shouldCheckDeadLinks(runtimeConfig) }
  );
  const aiCandidateCount = localPlan.aiCandidates.length;

  return {
    checkId: crypto.randomUUID(),
    createdAtMs: Date.now(),
    configSignature: buildPreviewConfigSignature(runtimeConfig),
    bookmarkState,
    domainFolderRules,
    classificationSignature,
    localPlan,
    aiCandidateCount,
    requiresBroadHostAccess: shouldCheckDeadLinks(runtimeConfig)
  };
}

function takeReusableLocalRequirementCheck(config, runContext = {}) {
  if (!runContext.localRequirementCheckId || !lastLocalRequirementCheck) {
    return null;
  }

  const check = lastLocalRequirementCheck;
  if (check.checkId !== runContext.localRequirementCheckId) {
    return null;
  }

  if (Date.now() - check.createdAtMs > LOCAL_REQUIREMENT_CHECK_TTL_MS) {
    clearLocalRequirementCheck();
    return null;
  }

  if (check.configSignature !== buildPreviewConfigSignature(config)) {
    clearLocalRequirementCheck();
    return null;
  }

  clearLocalRequirementCheck();
  return check;
}

async function checkLocalModelRequirement() {
  const config = await readStoredConfig();
  validateConfig(config, { requireModelAccess: false });

  const check = await buildLocalRequirementCheck(config);
  lastLocalRequirementCheck = check;

  return {
    ok: true,
    checkId: check.checkId,
    needsModel: check.aiCandidateCount > 0,
    canFinishWithoutModel: check.aiCandidateCount === 0,
    requiresBroadHostAccess: check.requiresBroadHostAccess,
    total: check.bookmarkState.bookmarks.length,
    aiCandidateCount: check.aiCandidateCount,
    protectedRootCount: check.bookmarkState.protectedRootFolderIds.length
  };
}

function updateClassificationCacheBucket(cacheBucket, bookmarks, normalizedResults) {
  const nextBucket = {
    ...(cacheBucket && typeof cacheBucket === "object" ? cacheBucket : {})
  };
  const bookmarkById = new Map((Array.isArray(bookmarks) ? bookmarks : []).map((bookmark) => [bookmark.id, bookmark]));

  for (const result of Array.isArray(normalizedResults) ? normalizedResults : []) {
    if (result?.action !== "keep") {
      continue;
    }

    const bookmark = bookmarkById.get(result.id);
    if (!bookmark) {
      continue;
    }

    const fingerprint = Rules.buildBookmarkFingerprint(bookmark);
    if (!fingerprint) {
      continue;
    }

    nextBucket[fingerprint] = {
      folderPath: normalizeFolderPath(result.folderPath),
      updatedAt: new Date().toISOString()
    };
  }

  return normalizeClassificationCacheBucket(nextBucket);
}

async function startOrganizeJob(runContext = { trigger: "manual", mode: "organize" }) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.job);
  const existingJob = stored[STORAGE_KEYS.job];
  const jobMode = runContext.mode === "preview" ? "preview" : "organize";

  if (existingJob?.phase === "running") {
    return {
      ok: false,
      error: ux(
        "已经有一个后台整理任务在运行，请先等待完成或取消后再试。",
        "A background organize task is already running. Wait for it to finish or cancel it first."
      ),
      detail: ux(
        "当前任务结束后，弹窗会自动刷新最新状态；如果任务卡住，可以先取消再重新预览。",
        "The popup will refresh when the current task finishes. If it is stuck, cancel it first and generate a new preview."
      )
    };
  }

  const config = await readStoredConfig();
  validateConfig(config, { requireModelAccess: false });
  await assertOrganizeHostAccess(runContext.trigger, config);
  const runtimeBatchSize = getRuntimeBatchSize(config);
  const runtimeConfig = {
    ...config,
    batchSize: runtimeBatchSize
  };
  const runtimeBatchAdjustmentNote = buildRuntimeBatchAdjustmentNote(config, runtimeBatchSize);
  const reusableLocalCheck = takeReusableLocalRequirementCheck(config, runContext);

  const bookmarkState = reusableLocalCheck?.bookmarkState || await collectBookmarkPlanningState(config);
  const {
    bookmarkBarNode,
    unresolvedFolderId,
    protectedRootFolderIds,
    collectedBookmarks,
    preservedBookmarks,
    bookmarks
  } = bookmarkState;

  if (!bookmarks.length) {
    await chrome.storage.local.remove([STORAGE_KEYS.job, STORAGE_KEYS.previewPlan]);
    await updateStatus(
      buildIdleStatus({
        phase: jobMode === "preview" ? "preview" : "completed",
        message: preservedBookmarks.length
          ? ux("当前书签都在白名单范围内，本次未改动。", "All current bookmarks are covered by the whitelist. Nothing changed.")
          : ux("没有发现需要整理的书签。", "No bookmarks need to be organized."),
        protectedRootCount: protectedRootFolderIds.length,
        finishedAt: new Date().toISOString()
      })
    );

    return { ok: true };
  }

  await chrome.storage.local.remove(STORAGE_KEYS.previewPlan);

  const snapshotInfo =
    jobMode === "organize"
      ? await createCurrentSnapshotBackup(
          bookmarkBarNode,
          runContext.trigger === "auto" ? "auto" : "manual"
        )
      : {
          created: false,
          folderId: "",
          folderTitle: "",
          detail: ux("本次仅生成预览，不会修改现有书签。", "This run generates a preview only and will not change current bookmarks.")
        };

  if (jobMode === "organize" && collectedBookmarks.length && !snapshotInfo.created) {
    throw buildUserFacingError(
      ux("整理前备份失败，任务已停止。", "Backup before organize failed, so the task was stopped."),
      ux(
        "为避免直接改乱现有书签，扩展要求先成功创建快照备份后才会继续整理。请先检查书签栏权限或手动点击一次“手动备份”。",
        "To avoid corrupting your current bookmarks, the extension requires a successful snapshot backup before continuing. Check bookmark permissions or create a manual backup first."
      )
    );
  }

  const classificationSignature =
    reusableLocalCheck?.classificationSignature ||
    Rules.buildClassificationSignature(runtimeConfig, MANUAL_FOLDER_TITLE);
  const domainFolderRules =
    reusableLocalCheck?.domainFolderRules ||
    Rules.parseDomainFolderRules(runtimeConfig.domainFolderRules, MANUAL_FOLDER_TITLE);
  let startupLocalPlan = reusableLocalCheck?.localPlan || null;
  if (!startupLocalPlan) {
    const startupClassificationCacheStore = await loadClassificationCacheStore();
    const startupClassificationCacheBucket = normalizeClassificationCacheBucket(
      startupClassificationCacheStore[classificationSignature]?.items || {}
    );
    startupLocalPlan = buildFastLocalClassificationPlan(
      bookmarks,
      domainFolderRules,
      startupClassificationCacheBucket,
      { useBuiltInFastRules: !shouldCheckDeadLinks(runtimeConfig) }
    );
  }
  const startupAiCandidateCount = startupLocalPlan.aiCandidates.length;
  let taxonomyTopFolders = buildTaxonomyFallbackTopFolders();
  let taxonomyPlanningNote = "";

  if (startupAiCandidateCount) {
    validateConfig(config, { requireModelAccess: true });
    await assertApiOriginAccess(config.baseUrl);
  }

  const planTaxonomy = shouldPlanGlobalTaxonomy(runtimeConfig);
  if (startupAiCandidateCount && planTaxonomy) {
    try {
      taxonomyTopFolders = await withKeepAlive(() => planGlobalTaxonomy(bookmarks, runtimeConfig));
    } catch (error) {
      console.warn("Failed to plan global taxonomy, falling back to defaults:", error);
      taxonomyPlanningNote = ux(
        "全局目录规划失败，已回退到默认稳定大类。",
        "Global taxonomy planning failed, so the extension fell back to the default stable folders."
      );
    }
  } else if (startupAiCandidateCount) {
    taxonomyPlanningNote = ux(
      "快速模式已跳过单独的全局目录规划请求，直接使用内置稳定大类。",
      "Fast mode skipped the separate taxonomy-planning request and used the built-in stable folders."
    );
  } else {
    taxonomyPlanningNote = "";
  }
  const taxonomyFlowDetail = !startupAiCandidateCount
    ? ux(
        "当前书签已命中本地规则或分类缓存，跳过模型目录规划。",
        "Local rules or the classification cache cover the current bookmarks, so model taxonomy planning is skipped."
      )
    : planTaxonomy
      ? ux(
          "完整模式会先生成全局目录方案，再按批分类。",
          "Complete mode plans a global taxonomy first, then classifies in batches."
        )
      : ux(
          "快速模式会跳过单独的全局目录规划，直接按内置稳定大类分类。",
          "Fast mode skips the separate taxonomy-planning request and classifies directly into built-in stable folders."
        );
  const linkCheckDetail = shouldCheckDeadLinks(runtimeConfig)
    ? ux(
        "完整模式会在分类前检测失效链接，并保留额外的全局目录规划。",
        "Complete mode checks dead links before classification and keeps the extra global taxonomy planning step."
      )
    : ux(
        "快速模式会跳过失效链接检测和单独目录规划，先做去重、自定义规则、缓存复用和内置快速规则，剩余书签才进入模型分类。",
        "Fast mode skips dead-link checks and the separate taxonomy-planning request, then runs duplicate cleanup, custom rules, cache reuse, built-in fast rules, and model classification only for the remaining bookmarks."
      );

  const totalBatches = Math.ceil(bookmarks.length / runtimeBatchSize);
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const job = {
    runId,
    jobType: "organize",
    jobMode,
    phase: "running",
    cancelRequested: false,
    trigger: runContext.trigger || "manual",
    config: runtimeConfig,
    rootFolderId: bookmarkBarNode.id,
    rootFolderName: bookmarkBarNode.title || "BOOKMARK_BAR",
    batchSize: runtimeBatchSize,
    total: bookmarks.length,
    totalBatches,
    processed: 0,
    moved: 0,
    deleted: 0,
    reused: 0,
    aiClassified: 0,
    warningCount: 0,
    lastWarning: "",
    warnings: [],
    deletedItems: [],
    previewFolders: [],
    bookmarks,
    preservedBookmarks,
    plannedBookmarks: [],
    pendingWarnings: [],
    exactDuplicateSeenByUrl: {},
    taxonomyLocks: {},
    taxonomyTopFolders,
    classificationSignature,
    domainFolderRules,
    protectedRootFolderIds,
    managedFolderIds: [],
    managedRootBookmarkIds: [],
    snapshotBackupId: snapshotInfo.folderId || "",
    snapshotBackupTitle: snapshotInfo.folderTitle || "",
    unresolvedFolderId,
    startedAt
  };

  await chrome.storage.local.set({
    [STORAGE_KEYS.job]: job
  });

  await updateStatus(
    buildIdleStatus({
      phase: "running",
      message: ux(
        `${jobMode === "preview" ? "已创建整理预览队列" : "已创建整理队列"}，共 ${bookmarks.length} 条书签，准备开始第 1 批。`,
        `${jobMode === "preview" ? "Created a preview queue" : "Created an organize queue"} for ${bookmarks.length} bookmarks. Preparing batch 1.`
      ),
      provider: getRuntimeProviderLabel(runtimeConfig),
      model: config.model,
      total: bookmarks.length,
      processed: 0,
      moved: 0,
      deleted: 0,
      reused: 0,
      aiClassified: 0,
      batchSize: runtimeBatchSize,
      warningCount: 0,
      warnings: [],
      deletedItems: [],
      previewFolders: [],
      protectedRootCount: protectedRootFolderIds.length,
      currentBatch: 0,
      totalBatches,
      startedAt,
      finishedAt: "",
      detail: ux(
        `${runContext.trigger === "auto" ? "这是一次自动静默整理。" : jobMode === "preview" ? "这是一次手动预览。" : "这是一次手动整理。"} 批大小 ${runtimeBatchSize}。${runtimeBatchAdjustmentNote ? `${runtimeBatchAdjustmentNote} ` : ""}${linkCheckDetail} ${snapshotInfo.detail} ${taxonomyFlowDetail}${taxonomyPlanningNote ? ` ${taxonomyPlanningNote}` : ""}${jobMode === "preview" ? " 预览不会落地改动。" : " 最终会一次性重建书签结构，中途不会边跑边改。"} 受保护根目录 ${protectedRootFolderIds.length} 个，目录规则 ${domainFolderRules.length} 条。`.trim(),
        `${runContext.trigger === "auto" ? "This is an automatic silent run." : jobMode === "preview" ? "This is a manual preview." : "This is a manual organize run."} Batch size ${runtimeBatchSize}. ${runtimeBatchAdjustmentNote ? `${runtimeBatchAdjustmentNote} ` : ""}${linkCheckDetail} ${snapshotInfo.detail} ${taxonomyFlowDetail}${taxonomyPlanningNote ? ` ${taxonomyPlanningNote}` : ""}${jobMode === "preview" ? " The preview does not apply any changes." : " The final rebuild happens in one pass instead of mutating bookmarks mid-run."} Protected root folders: ${protectedRootFolderIds.length}. Domain rules: ${domainFolderRules.length}.`.trim()
      )
    })
  );

  if (!shouldCheckDeadLinks(runtimeConfig) && !startupAiCandidateCount) {
    await finishFastLocalJob(job, startupLocalPlan);
    return { ok: true };
  }

  await scheduleNextBatch();
  return { ok: true };
}

async function requestCancellation() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.job);
  const job = stored[STORAGE_KEYS.job];

  if (!job || job.phase !== "running") {
    await updateStatus(
      buildIdleStatus({
        phase: "cancelled",
        message: ux("当前没有正在执行的整理任务。", "There is no running organize task right now."),
        finishedAt: new Date().toISOString()
      })
    );
    return;
  }

  job.cancelRequested = true;
  await chrome.storage.local.set({
    [STORAGE_KEYS.job]: job
  });

  abortActiveModelRequests("cancelled-by-user");

  for (const controller of activeDeadScanControllers) {
    controller.abort("cancelled-by-user");
  }

  await updateStatus({
    phase: "running",
    cancelRequested: true,
    message: ux("已收到取消请求，当前批次结束后会停止任务。", "Cancellation requested. The task will stop after the current batch."),
    detail: ux(
      "如果模型请求仍在进行，会尝试立即中止；已经完成的移动和删除不会回滚。",
      "If a model request is still running, the extension will try to abort it immediately. Finished moves and deletions will not be rolled back."
    )
  });
}

async function isStoredCancellationRequested() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.job);
  return Boolean(stored[STORAGE_KEYS.job]?.phase === "running" && stored[STORAGE_KEYS.job]?.cancelRequested);
}

async function mergeStoredCancellationFlag(job) {
  if (!job) {
    return false;
  }

  const stored = await chrome.storage.local.get(STORAGE_KEYS.job);
  const storedJob = stored[STORAGE_KEYS.job];
  const sameJob = storedJob && (!job.runId || storedJob.runId === job.runId);
  if (sameJob && storedJob.cancelRequested) {
    job.cancelRequested = true;
  }

  return Boolean(job.cancelRequested);
}

async function assertNoStoredCancellationBeforeModelRequest(config, batchLength) {
  if (await isStoredCancellationRequested()) {
    throw buildRequestAbortError("cancelled-by-user", config, batchLength);
  }
}

function abortActiveModelRequests(reason = "model-request-aborted") {
  if (activeAbortController && !activeAbortController.signal.aborted) {
    activeAbortController.abort(reason);
  }

  for (const controller of activeModelAbortControllers) {
    if (!controller.signal.aborted) {
      controller.abort(reason);
    }
  }
}

async function createManualBackup() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.job);

  if (stored[STORAGE_KEYS.job]?.phase === "running") {
    return {
      ok: false,
      error: ux(
        "已经有一个后台任务在运行，请先等待完成或取消后再试。",
        "A background task is already running. Wait for it to finish or cancel it first."
      )
    };
  }

  const tree = await chrome.bookmarks.getTree();
  const bookmarkBarNode = findBookmarksBarNode(tree);
  const snapshotInfo = await createCurrentSnapshotBackup(bookmarkBarNode, "manual");

  await updateStatus(
    buildIdleStatus({
      phase: snapshotInfo.created ? "completed" : "idle",
      message: snapshotInfo.created
        ? ux("已完成手动备份。", "Manual backup completed.")
        : ux("当前没有可备份的书签。", "There are no bookmarks to back up."),
      detail: snapshotInfo.detail,
      finishedAt: new Date().toISOString()
    })
  );

  return {
    ok: true,
    created: snapshotInfo.created,
    message: snapshotInfo.created
      ? ux("已完成手动备份。", "Manual backup completed.")
      : ux("当前没有可备份的书签。", "There are no bookmarks to back up.")
  };
}

async function listBackupRecords() {
  return await syncBackupRecords();
}

async function restoreLatestBackup() {
  const records = await syncBackupRecords();
  if (!records.length) {
    return {
      ok: false,
      error: ux("当前没有可恢复的备份。", "There is no backup available to restore.")
    };
  }

  return await restoreBackupEntry(records[0].id);
}

async function restoreBackupEntry(backupId) {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.job]);

  if (stored[STORAGE_KEYS.job]?.phase === "running") {
    return {
      ok: false,
      error: ux(
        "已经有一个后台任务在运行，请先等待完成或取消后再试。",
        "A background task is already running. Wait for it to finish or cancel it first."
      )
    };
  }

  if (!backupId) {
    return {
      ok: false,
      error: ux("备份参数无效。", "Invalid backup parameters.")
    };
  }

  const snapshotNodes = await readBackupSnapshot(backupId);

  if (!snapshotNodes) {
    await removeBackupRecord(backupId);
    return {
      ok: false,
      error: ux("最近备份已不存在，请先重新创建备份。", "The selected backup no longer exists. Create a new backup first.")
    };
  }

  const tree = await chrome.bookmarks.getTree();
  const bookmarkBarNode = findBookmarksBarNode(tree);
  const currentChildren = await chrome.bookmarks.getChildren(bookmarkBarNode.id);
  const currentRestorableNodes = flattenForbiddenRootNodes(
    currentChildren.filter((node) => !isBackupFolderNode(node))
  );
  const preRestoreSnapshotInfo = currentRestorableNodes.length
    ? await createCurrentSnapshotBackup(bookmarkBarNode, "manual", { preserveIds: [backupId] })
    : {
        created: false,
        detail: ux(
          "恢复前没有需要额外备份的当前书签。",
          "There were no current bookmarks that needed an extra pre-restore backup."
        )
      };

  if (currentRestorableNodes.length && !preRestoreSnapshotInfo.created) {
    throw buildUserFacingError(
      ux("恢复前备份失败，任务已停止。", "Pre-restore backup failed, so the task was stopped."),
      ux(
        "为避免恢复后无法回到当前书签状态，Marko 需要先创建当前状态快照。请检查浏览器存储空间后再重试。",
        "To make the restore reversible, Marko needs to create a snapshot of the current bookmark state first. Check browser storage space and try again."
      )
    );
  }

  for (const child of currentChildren) {
    if (child.url) {
      await chrome.bookmarks.remove(child.id);
    } else {
      await chrome.bookmarks.removeTree(child.id);
    }
  }

  const restoredTopLevelNodes = await cloneBookmarkTreeNodes(
    flattenForbiddenRootNodes(snapshotNodes),
    bookmarkBarNode.id
  );

  await chrome.storage.local.set({
    [STORAGE_KEYS.managedFolderIds]: [],
    [STORAGE_KEYS.managedRootBookmarkIds]: [],
    [STORAGE_KEYS.rootFolderId]: "",
    [STORAGE_KEYS.unresolvedFolderId]: await findExistingUnresolvedFolderId(bookmarkBarNode.id)
  });
  await chrome.storage.local.remove(STORAGE_KEYS.previewPlan);

  const records = await syncBackupRecords();
  const restoredRecord = records.find((record) => record.id === backupId);
  const preRestoreDetail = preRestoreSnapshotInfo.created ? `${preRestoreSnapshotInfo.detail} ` : "";

  await updateStatus(
    buildIdleStatus({
      phase: "completed",
      message: ux("已恢复最近备份。", "Latest backup restored."),
      detail: ux(
        `${preRestoreDetail}已从“${restoredRecord?.title || "最近备份"}”恢复 ${restoredTopLevelNodes.length} 个顶层项目。`,
        `${preRestoreDetail}Restored ${restoredTopLevelNodes.length} top-level items from "${restoredRecord?.title || "latest backup"}".`
      ),
      finishedAt: new Date().toISOString()
    })
  );

  return {
    ok: true,
    message: ux("已恢复备份。", "Backup restored.")
  };
}

async function deleteBackupEntry(backupId) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.job);
  if (stored[STORAGE_KEYS.job]?.phase === "running") {
    return {
      ok: false,
      error: ux(
        "已经有一个后台任务在运行，请先等待完成或取消后再试。",
        "A background task is already running. Wait for it to finish or cancel it first."
      )
    };
  }

  if (!backupId) {
    return {
      ok: false,
      error: ux("备份参数无效。", "Invalid backup parameters.")
    };
  }

  await deleteBackupSnapshot(backupId);
  await removeBackupRecord(backupId);

  return {
    ok: true,
    message: ux("已删除备份。", "Backup deleted.")
  };
}

async function resolveUnprocessedEntry(entryId, action) {
  if (!entryId || !["keep", "delete"].includes(action)) {
    return {
      ok: false,
      error: ux("未处理项参数无效。", "Invalid unprocessed item parameters.")
    };
  }

  const stored = await chrome.storage.local.get(STORAGE_KEYS.job);
  if (stored[STORAGE_KEYS.job]?.phase === "running") {
    return {
      ok: false,
      error: ux(
        "后台任务正在运行，请等待当前批次结束后再处理未处理项。",
        "A background task is running. Wait for the current batch to finish before handling unprocessed items."
      )
    };
  }

  if (currentStatus?.phase !== "completed") {
    return {
      ok: false,
      error: ux(
        "请先应用并完成整理方案，再处理未处理项。",
        "Apply and finish the organize plan before handling unprocessed items."
      )
    };
  }

  const warnings = Array.isArray(currentStatus.warnings) ? [...currentStatus.warnings] : [];
  const targetEntry = warnings.find((entry) => entry.id === entryId);

  if (!targetEntry) {
    return {
      ok: false,
      error: ux(
        "这条未处理记录已经不存在，请刷新后重试。",
        "This unprocessed record no longer exists. Refresh and try again."
      )
    };
  }

  const remainingWarnings = warnings.filter((entry) => entry.id !== entryId);
  let deletedItems = Array.isArray(currentStatus.deletedItems) ? [...currentStatus.deletedItems] : [];
  let message = "";
  let detail = "";

  if (targetEntry.bookmarkId) {
    const existingBookmark = await getBookmarkById(targetEntry.bookmarkId);

    if (!existingBookmark) {
      message = ux("已移除过期未处理记录。", "Stale unprocessed record removed.");
      detail = ux(
        `书签《${targetEntry.title || targetEntry.url}》已经不存在，已从未处理列表移除。`,
        `"${targetEntry.title || targetEntry.url}" no longer exists, so it was removed from the unprocessed list.`
      );
    } else if (action === "delete") {
      await removeBookmarkIfExists(existingBookmark.id);
      deletedItems = appendLimitedEntries(deletedItems, [
        buildLogEntry(
          "manual_deleted",
          {
            id: existingBookmark.id,
            title: existingBookmark.title || targetEntry.title,
            url: existingBookmark.url || targetEntry.url
          },
          ux("用户已在未处理列表中手动删除这条书签。", "This bookmark was manually deleted from the unprocessed list."),
          ux("如果之后仍然需要，可以手动重新添加。", "If you still need it later, you can add it again manually.")
        )
      ]);
      message = ux("已删除未处理书签。", "Unprocessed bookmark deleted.");
      detail = ux(
        `书签《${targetEntry.title || targetEntry.url}》已删除。`,
        `Deleted "${targetEntry.title || targetEntry.url}".`
      );
    } else {
      const tree = await chrome.bookmarks.getTree();
      const bookmarkBarNode = findBookmarksBarNode(tree);
      const unresolvedFolderId = await ensureUnresolvedFolder(bookmarkBarNode.id);
      await chrome.bookmarks.move(existingBookmark.id, { parentId: unresolvedFolderId });
      message = ux("已保留书签。", "Bookmark kept.");
      detail = ux(
        `书签《${targetEntry.title || targetEntry.url}》已移动到根目录的“${MANUAL_FOLDER_TITLE}”文件夹。`,
        `"${targetEntry.title || targetEntry.url}" was moved into "${MANUAL_FOLDER_TITLE}" at the root level.`
      );
    }
  } else {
    message = ux("已更新未处理列表。", "Unprocessed list updated.");
    detail = ux(
      "这条记录没有可操作的书签实体，因此只从列表中移除了。",
      "This record no longer has a bookmark node to act on, so it was only removed from the list."
    );
  }

  await updateStatus({
    warningCount: remainingWarnings.length,
    warnings: remainingWarnings,
    lastWarning: remainingWarnings.length ? remainingWarnings[remainingWarnings.length - 1].reason || "" : "",
    deletedItems,
    message,
    detail,
    finishedAt: new Date().toISOString()
  });

  return {
    ok: true,
    message
  };
}

async function scheduleNextBatch() {
  await chrome.alarms.create(ALARM_NAME, {
    when: Date.now() + NEXT_BATCH_DELAY_MS
  });
}

async function processNextBatch() {
  if (batchLock) {
    return;
  }

  batchLock = true;

  try {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.job);
    let job = stored[STORAGE_KEYS.job];

    if (!job || job.phase !== "running") {
      return;
    }

    const normalizedRuntimeJob = normalizeRunningOrganizeJobRuntime(job);
    if (normalizedRuntimeJob.changed) {
      job = normalizedRuntimeJob.job;
      await chrome.storage.local.set({
        [STORAGE_KEYS.job]: job
      });
    }

    if (job.cancelRequested) {
      await finishJob(
        "cancelled",
        ux("任务已取消，未继续处理后续批次。", "Task cancelled. Remaining batches were not processed."),
        job
      );
      return;
    }

    if (job.jobType === "dead_scan") {
      await processNextDeadScanBatch(job);
      return;
    }

    const batch = job.bookmarks.slice(job.processed, job.processed + job.batchSize);

    if (!batch.length) {
      await finishJob(
        "completed",
        ux(
          `书签整理完成，已处理 ${job.processed} / ${job.total} 条。`,
          `Bookmark organizing finished. Processed ${job.processed} / ${job.total}.`
        ),
        job
      );
      return;
    }

    const currentBatch = Math.floor(job.processed / job.batchSize) + 1;
    const checkDeadLinks = shouldCheckDeadLinks(job.config);

    await updateBatchStatus(job, currentBatch, {
      message: ux(
        checkDeadLinks
          ? `正在检测第 ${currentBatch}/${job.totalBatches} 批链接状态 (${job.processed}/${job.total})。`
          : `正在快速处理第 ${currentBatch}/${job.totalBatches} 批书签 (${job.processed}/${job.total})。`,
        checkDeadLinks
          ? `Checking link health for batch ${currentBatch}/${job.totalBatches} (${job.processed}/${job.total}).`
          : `Fast processing batch ${currentBatch}/${job.totalBatches} (${job.processed}/${job.total}).`
      ),
      detail: ux(
        checkDeadLinks
          ? `本批 ${batch.length} 条。会先识别确认失效的链接，把状态不明确的链接留到“${MANUAL_FOLDER_TITLE}”，再对剩余书签做 AI 分类。提交前不会改动现有书签树。`
          : `本批 ${batch.length} 条。快速模式会跳过链接可用性探测和单独目录规划，先做去重、自定义规则、缓存复用和内置快速规则，剩余部分才进入 AI 分类。提交前不会改动现有书签树。`,
        checkDeadLinks
          ? `${batch.length} items in this batch. Confirmed dead links are removed first, uncertain links are kept in "${MANUAL_FOLDER_TITLE}", and only the remaining bookmarks are sent to AI. The bookmark tree is not changed before the final rebuild.`
          : `${batch.length} items in this batch. Fast mode skips link availability checks and the separate taxonomy plan, then uses duplicate cleanup, custom rules, cache reuse, built-in fast rules, and AI only for anything left. The bookmark tree is not changed before the final rebuild.`
      )
    });

    let scanResult;
    if (checkDeadLinks) {
      const deadLinkCache = await loadDeadLinkCache();
      scanResult = await scanDeadBookmarksBatch(
        batch,
        (stage) => updateBatchStatus(job, currentBatch, stage),
        { mutate: false, cache: deadLinkCache }
      );
      await saveDeadLinkCache(scanResult.nextDeadLinkCache || deadLinkCache);
    } else {
      scanResult = buildSkippedDeadLinkScanResult(batch);
    }
    const duplicateState = markHealthyExactDuplicates(
      scanResult.healthyBookmarks,
      job.exactDuplicateSeenByUrl
    );
    const aliveBatch = duplicateState.bookmarks;
    job.exactDuplicateSeenByUrl = duplicateState.seenByUrl;
    const exactDuplicatePlans = buildExactDuplicatePlans(aliveBatch);
    const nonDuplicateBookmarks = aliveBatch.filter((bookmark) => !bookmark.exactDuplicateOf);
    const forcedPlans = buildForcedPlans(nonDuplicateBookmarks, job.domainFolderRules);
    const classificationCacheStore = await loadClassificationCacheStore();
    const classificationCacheBucket = normalizeClassificationCacheBucket(
      classificationCacheStore[job.classificationSignature]?.items || {}
    );
    const cachedPlans = buildCachedPlans(forcedPlans.remaining, classificationCacheBucket);
    const builtInFastPlans = checkDeadLinks
      ? { plans: [], remaining: cachedPlans.remaining }
      : buildBuiltInFastFolderPlans(cachedPlans.remaining);
    const bookmarksToClassify = builtInFastPlans.remaining;
    const needsModelClassification = bookmarksToClassify.length > 0;
    const classifications = needsModelClassification
      ? await withKeepAlive(
          () =>
            classifyBatchWithModel(
              bookmarksToClassify,
              job.config,
              (stage) => updateBatchStatus(job, currentBatch, stage),
              job.taxonomyLocks,
              job.taxonomyTopFolders
            ),
          () =>
            updateBatchStatus(job, currentBatch, {
              message: ux(
                `第 ${currentBatch}/${job.totalBatches} 批正在等待模型返回。`,
                `Waiting for the model response for batch ${currentBatch}/${job.totalBatches}.`
              ),
              detail: ux(
                `已启用后台 keep-alive 心跳。若模型 ${formatTimeoutSeconds(getFirstResponseTimeoutMs(job.config))} 秒内没有返回响应，会主动超时并提示减小批大小或检查网络。`,
                `Keep-alive is active. If the model does not return a first response within ${formatTimeoutSeconds(getFirstResponseTimeoutMs(job.config))} seconds, the task will time out and suggest reducing batch size or checking the network.`
              )
            })
        )
      : [];
    const normalized = applyTaxonomyLocks(
      normalizeClassificationResults(classifications, bookmarksToClassify),
      job.taxonomyLocks
    );
    job.taxonomyLocks = normalized.taxonomyLocks;
    const nextClassificationCacheBucket = updateClassificationCacheBucket(
      classificationCacheBucket,
      bookmarksToClassify,
      normalized.results
    );
    await saveClassificationCacheBucket(job.classificationSignature, nextClassificationCacheBucket);

    await updateBatchStatus(job, currentBatch, {
      message: ux(
        needsModelClassification
          ? `第 ${currentBatch}/${job.totalBatches} 批模型结果已返回，正在写入最终整理方案。`
          : `第 ${currentBatch}/${job.totalBatches} 批已由本地规则覆盖，正在写入最终整理方案。`,
        needsModelClassification
          ? `Model output for batch ${currentBatch}/${job.totalBatches} received. Writing it into the final organize plan.`
          : `Batch ${currentBatch}/${job.totalBatches} was covered by local rules. Writing it into the final organize plan.`
      ),
      detail: aliveBatch.length
        ? ux(
            needsModelClassification
              ? "正在把本批结果加入最终重建方案，原有书签结构暂时不会变化。"
              : "本批没有等待模型，直接把本地结果加入最终重建方案；原有书签结构暂时不会变化。",
            needsModelClassification
              ? "This batch is being added to the final rebuild plan. The current bookmark structure is still unchanged."
              : "This batch did not wait for the model. Local results are being added to the final rebuild plan, and the current bookmark structure is still unchanged."
          )
        : ux(
            "本批没有可进入 AI 分类的有效书签，正在记录删除和未处理结果。",
            "This batch has no valid bookmarks left for AI classification. Only deletions and unresolved items are being recorded."
          )
    });

    const planResult = buildBatchClassificationPlan(
      aliveBatch,
      [
        ...forcedPlans.plans,
        ...cachedPlans.plans,
        ...builtInFastPlans.plans,
        ...normalized.results,
        ...exactDuplicatePlans
      ]
    );

    job.processed += batch.length;
    job.moved += planResult.keepCount;
    job.deleted += scanResult.deletedCount + planResult.deletedCount;
    job.reused += cachedPlans.plans.length;
    job.aiClassified += normalized.results.length;
    job.warningCount += scanResult.warningCount + planResult.warningCount;
    job.lastWarning = planResult.lastWarning || scanResult.lastWarning || job.lastWarning || "";
    job.warnings = appendLimitedEntries(job.warnings, [
      ...(scanResult.warningEntries || []),
      ...(planResult.warningEntries || [])
    ]);
    job.deletedItems = appendLimitedEntries(job.deletedItems, [
      ...(scanResult.deletedEntries || []),
      ...(planResult.deletedEntries || [])
    ]);
    job.plannedBookmarks = appendPlanEntries(job.plannedBookmarks, planResult.keepEntries);
    job.pendingWarnings = appendPlanEntries(job.pendingWarnings, scanResult.pendingWarnings);

    await mergeStoredCancellationFlag(job);
    await chrome.storage.local.set({
      [STORAGE_KEYS.job]: job
    });

    await updateBatchStatus(job, currentBatch, {
      message: ux(
        `第 ${currentBatch}/${job.totalBatches} 批完成，累计已处理 ${job.processed}/${job.total} 条。`,
        `Batch ${currentBatch}/${job.totalBatches} finished. Processed ${job.processed}/${job.total} so far.`
      ),
      detail: ux(
        `本批已写入 ${planResult.keepCount} 条整理结果，其中自定义规则命中 ${forcedPlans.plans.length} 条、缓存复用 ${cachedPlans.plans.length} 条、内置快速规则命中 ${builtInFastPlans.plans.length} 条、AI 新分类 ${normalized.results.length} 条；标记删除 ${scanResult.deletedCount + planResult.deletedCount} 条，未处理 ${scanResult.warningCount + planResult.warningCount} 条。旧书签结构尚未改动。`,
        `This batch added ${planResult.keepCount} organize results, including ${forcedPlans.plans.length} matched by custom rules, ${cachedPlans.plans.length} reused from cache, ${builtInFastPlans.plans.length} matched by built-in fast rules, and ${normalized.results.length} newly classified by AI. It also marked ${scanResult.deletedCount + planResult.deletedCount} deletions and left ${scanResult.warningCount + planResult.warningCount} unresolved items. The original bookmark tree is still unchanged.`
      ),
      warnings: job.warnings,
      deletedItems: job.deletedItems
    });

    if (job.cancelRequested) {
      await finishJob(
        "cancelled",
        ux("任务已取消，当前批次的结果已保存。", "Task cancelled. The current batch result has been preserved."),
        job
      );
      return;
    }

    if (job.processed >= job.total) {
      if (job.jobMode === "preview") {
        const previewFolders = buildPreviewFolderSummary(
          [...(job.preservedBookmarks || []), ...(job.plannedBookmarks || [])],
          job.pendingWarnings
        );
        const previewTaxonomyDetailZh = shouldPlanGlobalTaxonomy(job.config)
          ? "本次预览生成了全局目录方案。"
          : "本次预览使用内置稳定大类，跳过了单独的目录规划请求。";
        const previewTaxonomyDetailEn = shouldPlanGlobalTaxonomy(job.config)
          ? "This preview generated a global taxonomy plan."
          : "This preview used the built-in stable folders and skipped the separate taxonomy-planning request.";
        job.previewFolders = previewFolders;
        await savePreviewPlan(job, previewFolders);
        await finishJob(
          "preview",
          ux(
            `整理预览已生成，共分析 ${job.total} 条书签。`,
            `Preview is ready. Analyzed ${job.total} bookmarks.`
          ),
          job,
          {
            detail: ux(
              `${previewTaxonomyDetailZh}预计归类 ${job.moved} 条，复用缓存 ${job.reused} 条，AI 新分类 ${job.aiClassified} 条，删除 ${job.deleted} 条，${MANUAL_FOLDER_TITLE} ${job.pendingWarnings.length} 条。确认无误后点击“应用方案”正式重建。`,
              `${previewTaxonomyDetailEn} It would categorize ${job.moved} bookmarks, reuse ${job.reused} cached results, classify ${job.aiClassified} new bookmarks with AI, delete ${job.deleted}, and leave ${job.pendingWarnings.length} items in "${MANUAL_FOLDER_TITLE}". If it looks good, click Apply Plan to rebuild.`
            ),
            previewFolders
          }
        );
        return;
      }

      await updateBatchStatus(job, currentBatch, {
        message: ux(
          "全部批次已分析完成，正在清空旧结构并重建新结构。",
          "All batches are analyzed. Clearing the old structure and rebuilding the new one."
        ),
        detail: ux(
          "接下来会删除当前书签栏中的旧书签结构，并根据完整方案一次性创建新的分类目录。备份已经提前完成。",
          "Next, the old bookmark bar structure will be removed and the final folder plan will be rebuilt in one pass. A backup has already been created."
        )
      });

      const rebuildResult = await rebuildOrganizedBookmarks(job);
      job.managedFolderIds = rebuildResult.managedFolderIds;
      job.managedRootBookmarkIds = rebuildResult.managedRootBookmarkIds;
      job.warnings = rebuildResult.warningEntries;
      job.warningCount = rebuildResult.warningEntries.length;
      job.lastWarning = rebuildResult.warningEntries.at(-1)?.reason || "";

      await finishJob(
        "completed",
        buildOrganizeCompletedMessage(job, rebuildResult),
        job,
        {
          detail: ux(
            `本次先生成完整方案，再整体重建书签结构。共归类 ${job.moved} 条，其中缓存复用 ${job.reused} 条、AI 新分类 ${job.aiClassified} 条；白名单保留 ${rebuildResult.preservedCount} 条，受保护根目录保留 ${job.protectedRootFolderIds.length} 个，${MANUAL_FOLDER_TITLE} ${rebuildResult.warningEntries.length} 条。`,
            `This run generated a full plan first and rebuilt the structure afterward. It categorized ${job.moved} bookmarks in total, including ${job.reused} reused from cache and ${job.aiClassified} newly classified by AI. It preserved ${rebuildResult.preservedCount} whitelisted bookmarks, kept ${job.protectedRootFolderIds.length} protected root folders untouched, and left ${rebuildResult.warningEntries.length} items in "${MANUAL_FOLDER_TITLE}".`
          )
        }
      );
      return;
    }

    await scheduleNextBatch();
  } catch (error) {
    console.error("Failed to process batch:", error);
    const stored = await chrome.storage.local.get(STORAGE_KEYS.job);
    const job = stored[STORAGE_KEYS.job];

    if (isAbortError(error)) {
      await finishJob("cancelled", ux("任务已取消，后台请求已中止。", "Task cancelled and the background request was aborted."), job, {
        detail: ux(
          "如果你是主动取消，这属于正常停止；如果不是主动取消，请检查网络、模型响应速度或批大小设置。",
          "If you cancelled it yourself, this is expected. Otherwise, check the network, model latency, or batch size."
        )
      });
      return;
    }

    if (isModelTimeoutError(error) && (await retryCurrentBatchWithSmallerBatch(job, error))) {
      return;
    }

    await updateStatus({
      phase: "error",
      message:
        error?.userMessage ||
        toUserMessage(
          error,
          ux(
            "整理过程中出错，请检查 API 配置、网络连接或模型返回的 JSON 格式。",
            "An error occurred while organizing bookmarks. Check the API config, network, or model JSON output."
          )
        ),
      detail:
        error?.userDetail ||
        [
          ux(
            "任务已停止。建议先查看扩展的 Service Worker 控制台日志，再检查 Base URL、API Key、模型名和批大小设置。",
            "The task has stopped. Check the extension Service Worker logs, then verify Base URL, API key, model name, and batch size."
          ),
          job?.snapshotBackupTitle
            ? ux(
                `如果重建阶段已经开始，你可以去设置页的备份管理恢复“${job.snapshotBackupTitle}”。`,
                `If rebuild had already started, you can restore "${job.snapshotBackupTitle}" from Backup Management in Settings.`
              )
            : ""
        ]
          .filter(Boolean)
          .join(" "),
      finishedAt: new Date().toISOString()
    });

    await chrome.storage.local.remove(STORAGE_KEYS.job);
  } finally {
    activeAbortController = null;
    batchLock = false;
  }
}

async function processNextDeadScanBatch(job) {
  const batch = job.bookmarks.slice(job.processed, job.processed + job.batchSize);

  if (!batch.length) {
    await finishJob(
      "completed",
      ux(
        `失效书签扫描完成，共检查 ${job.processed} 条，自动删除 ${job.deleted} 条确认失效的书签。`,
        `Dead-link scan completed. Checked ${job.processed} bookmarks and automatically removed ${job.deleted} confirmed dead links.`
      ),
      job
    );
    return;
  }

  const currentBatch = Math.floor(job.processed / job.batchSize) + 1;
  await updateBatchStatus(job, currentBatch, {
    message: ux(
      `正在扫描第 ${currentBatch}/${job.totalBatches} 批失效书签 (${job.processed}/${job.total})。`,
      `Scanning dead links for batch ${currentBatch}/${job.totalBatches} (${job.processed}/${job.total}).`
    ),
    detail: ux(
      `本批 ${batch.length} 条。会先尝试 HEAD，必要时回退 GET；只有确认失效的链接才会自动删除。`,
      `${batch.length} items in this batch. HEAD is tried first, then GET if needed. Only confirmed dead links are removed automatically.`
    )
  });

  const deadLinkCache = await loadDeadLinkCache();
  const scanResult = await scanDeadBookmarksBatch(
    batch,
    (stage) => updateBatchStatus(job, currentBatch, stage),
    { cache: deadLinkCache }
  );
  await saveDeadLinkCache(scanResult.nextDeadLinkCache || deadLinkCache);

  job.processed += batch.length;
  job.deleted += scanResult.deletedCount;
  job.warningCount += scanResult.warningCount;
  job.lastWarning = scanResult.lastWarning || job.lastWarning || "";
  job.warnings = appendLimitedEntries(job.warnings, scanResult.warningEntries);
  job.deletedItems = appendLimitedEntries(job.deletedItems, scanResult.deletedEntries);

  await mergeStoredCancellationFlag(job);
  await chrome.storage.local.set({
    [STORAGE_KEYS.job]: job
  });

  await updateBatchStatus(job, currentBatch, {
    message: ux(
      `第 ${currentBatch}/${job.totalBatches} 批失效书签扫描完成，累计已检查 ${job.processed}/${job.total} 条。`,
      `Dead-link scan batch ${currentBatch}/${job.totalBatches} finished. Checked ${job.processed}/${job.total} so far.`
    ),
    detail: ux(
      `本批删除 ${scanResult.deletedCount} 条确认失效书签，警告 ${scanResult.warningCount} 条。`,
      `This batch removed ${scanResult.deletedCount} confirmed dead bookmarks and left ${scanResult.warningCount} warnings.`
    ),
    warnings: job.warnings,
    deletedItems: job.deletedItems
  });

  if (job.cancelRequested) {
    await finishJob(
      "cancelled",
      ux("失效书签扫描已取消，当前批次结果已保存。", "Dead-link scan cancelled. The current batch result has been preserved."),
      job
    );
    return;
  }

  if (job.processed >= job.total) {
    await finishJob(
      "completed",
      ux(
        `失效书签扫描完成，共检查 ${job.processed} 条，自动删除 ${job.deleted} 条确认失效的书签。`,
        `Dead-link scan completed. Checked ${job.processed} bookmarks and automatically removed ${job.deleted} confirmed dead links.`
      ),
      job
    );
    return;
  }

  await scheduleNextBatch();
}

function buildOrganizeCompletedMessage(job, rebuildResult) {
  if (shouldCheckDeadLinks(job?.config)) {
    return ux(
      `书签整理完成，已重建 ${rebuildResult.createdCount} 条书签，并删除 ${job.deleted} 条失效或重复书签。`,
      `Bookmark organizing completed. Rebuilt ${rebuildResult.createdCount} bookmarks and removed ${job.deleted} dead or duplicate entries.`
    );
  }

  return ux(
    `书签整理完成，已重建 ${rebuildResult.createdCount} 条书签，并删除 ${job.deleted} 条重复书签。快速模式未检查失效链接。`,
    `Bookmark organizing completed. Rebuilt ${rebuildResult.createdCount} bookmarks and removed ${job.deleted} duplicate entries. Fast mode did not check dead links.`
  );
}

async function applyPreviewPlan() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.job, STORAGE_KEYS.previewPlan]);
  const existingJob = stored[STORAGE_KEYS.job];

  if (existingJob?.phase === "running") {
    return {
      ok: false,
      error: ux(
        "已经有一个后台整理任务在运行，请先等待完成或取消后再试。",
        "A background organize task is already running. Wait for it to finish or cancel it first."
      )
    };
  }

  const previewPlan = stored[STORAGE_KEYS.previewPlan];
  if (!isUsablePreviewPlan(previewPlan)) {
    return rejectApplyPreviewPlan(
      ux(
        "没有可应用的预览方案，请先重新生成预览。",
        "There is no preview plan to apply. Generate a new preview first."
      ),
      ux(
        "预览方案只保存在本地浏览器中；重新打开或清理扩展数据后，需要先点击预览整理。",
        "Preview plans are stored locally in this browser. If extension data was cleared or no preview exists, run Preview first."
      )
    );
  }

  const config = await readStoredConfig();
  const configSignature = buildPreviewConfigSignature(config);
  if (configSignature !== previewPlan.configSignature) {
    return rejectApplyPreviewPlan(
      ux(
        "整理设置已变化，请重新生成预览后再应用。",
        "The organize settings changed. Generate a new preview before applying it."
      ),
      ux(
        "预览方案只对生成时的服务商、模型、速度模式、规则和 Prompt 有效，避免用旧方案覆盖新设置。",
        "Preview plans are tied to the provider, model, speed mode, rules, and prompt used when they were generated, so old plans are not applied over new settings."
      )
    );
  }

  const bookmarkState = await collectBookmarkPlanningState(config);
  const sourceBookmarkSignature = buildBookmarkSetSignature(bookmarkState.bookmarks);
  if (sourceBookmarkSignature !== previewPlan.sourceBookmarkSignature) {
    return rejectApplyPreviewPlan(
      ux(
        "书签内容已变化，请重新生成预览后再应用。",
        "Bookmarks changed since the preview was generated. Generate a new preview before applying it."
      ),
      ux(
        "Marko 检测到当前待整理书签集合和预览时不同，为避免误删或错放，会要求重新生成方案。",
        "Marko detected that the bookmark set no longer matches the preview. To avoid deleting or placing the wrong items, it requires a fresh plan."
      )
    );
  }

  let snapshotInfo;
  try {
    snapshotInfo = await createCurrentSnapshotBackup(bookmarkState.bookmarkBarNode, "manual");
    if (bookmarkState.collectedBookmarks.length && !snapshotInfo.created) {
      throw buildUserFacingError(
        ux("应用预览前备份失败，任务已停止。", "Backup before applying the preview failed, so the task was stopped."),
        ux(
          "为避免直接改乱现有书签，扩展要求先成功创建快照备份后才会继续应用预览方案。",
          "To avoid corrupting your current bookmarks, the extension requires a successful snapshot backup before applying the preview plan."
        )
      );
    }
  } catch (error) {
    return await keepPreviewApplyRetryAvailable(error);
  }

  const startedAt = new Date().toISOString();
  const total = Number.isFinite(previewPlan.total) ? previewPlan.total : bookmarkState.bookmarks.length;
  const batchSize = normalizePreviewPlanBatchSize(previewPlan.batchSize, config.batchSize);
  const totalBatches = Number.isFinite(previewPlan.totalBatches)
    ? previewPlan.totalBatches
    : Math.max(1, Math.ceil(total / batchSize));
  const job = {
    runId: crypto.randomUUID(),
    jobType: "organize",
    jobMode: "organize",
    phase: "running",
    cancelRequested: false,
    trigger: "manual",
    config,
    rootFolderId: bookmarkState.bookmarkBarNode.id,
    rootFolderName: bookmarkState.bookmarkBarNode.title || "BOOKMARK_BAR",
    batchSize,
    total,
    totalBatches,
    processed: total,
    moved: Number.isFinite(previewPlan.moved) ? previewPlan.moved : 0,
    deleted: Number.isFinite(previewPlan.deleted) ? previewPlan.deleted : 0,
    reused: Number.isFinite(previewPlan.reused) ? previewPlan.reused : 0,
    aiClassified: Number.isFinite(previewPlan.aiClassified) ? previewPlan.aiClassified : 0,
    warningCount: Number.isFinite(previewPlan.warningCount) ? previewPlan.warningCount : 0,
    lastWarning: previewPlan.lastWarning || "",
    warnings: Array.isArray(previewPlan.warnings) ? previewPlan.warnings : [],
    deletedItems: Array.isArray(previewPlan.deletedItems) ? previewPlan.deletedItems : [],
    previewFolders: Array.isArray(previewPlan.previewFolders) ? previewPlan.previewFolders : [],
    bookmarks: bookmarkState.bookmarks,
    preservedBookmarks: Array.isArray(previewPlan.preservedBookmarks)
      ? previewPlan.preservedBookmarks
      : bookmarkState.preservedBookmarks,
    plannedBookmarks: Array.isArray(previewPlan.plannedBookmarks) ? previewPlan.plannedBookmarks : [],
    pendingWarnings: Array.isArray(previewPlan.pendingWarnings) ? previewPlan.pendingWarnings : [],
    exactDuplicateSeenByUrl: {},
    taxonomyLocks: {},
    taxonomyTopFolders: Array.isArray(previewPlan.taxonomyTopFolders)
      ? previewPlan.taxonomyTopFolders
      : buildTaxonomyFallbackTopFolders(),
    classificationSignature: previewPlan.classificationSignature || Rules.buildClassificationSignature(config, MANUAL_FOLDER_TITLE),
    domainFolderRules: Rules.parseDomainFolderRules(config.domainFolderRules, MANUAL_FOLDER_TITLE),
    protectedRootFolderIds: bookmarkState.protectedRootFolderIds,
    managedFolderIds: [],
    managedRootBookmarkIds: [],
    snapshotBackupId: snapshotInfo.folderId || "",
    snapshotBackupTitle: snapshotInfo.folderTitle || "",
    unresolvedFolderId: bookmarkState.unresolvedFolderId,
    startedAt
  };

  await chrome.alarms.clear(ALARM_NAME);
  await chrome.storage.local.set({
    [STORAGE_KEYS.job]: job
  });
  await updateStatus(
    buildIdleStatus({
      phase: "running",
      message: ux(
        "正在应用预览方案，已跳过模型分类。",
        "Applying the preview plan. Model classification is skipped."
      ),
      provider: getProviderLabel(config.provider),
      model: config.model,
      total,
      processed: total,
      moved: job.moved,
      deleted: job.deleted,
      reused: job.reused,
      aiClassified: job.aiClassified,
      batchSize,
      warningCount: job.warningCount,
      warnings: job.warnings,
      deletedItems: job.deletedItems,
      previewFolders: job.previewFolders,
      protectedRootCount: bookmarkState.protectedRootFolderIds.length,
      currentBatch: totalBatches,
      totalBatches,
      startedAt,
      finishedAt: "",
      detail: ux(
        `本次直接使用已确认的预览方案重建书签结构，不会再次请求模型。${snapshotInfo.detail}`,
        `This run rebuilds bookmarks from the confirmed preview plan and does not call the model again. ${snapshotInfo.detail}`
      )
    })
  );

  try {
    const rebuildResult = await rebuildOrganizedBookmarks(job);
    job.managedFolderIds = rebuildResult.managedFolderIds;
    job.managedRootBookmarkIds = rebuildResult.managedRootBookmarkIds;
    job.warnings = rebuildResult.warningEntries;
    job.warningCount = rebuildResult.warningEntries.length;
    job.lastWarning = rebuildResult.warningEntries.at(-1)?.reason || "";

    await finishJob(
      "completed",
      buildOrganizeCompletedMessage(job, rebuildResult),
      job,
      {
        detail: ux(
          `已直接应用预览方案，未再次调用模型。共重建 ${rebuildResult.createdCount} 条书签，白名单保留 ${rebuildResult.preservedCount} 条，受保护根目录保留 ${job.protectedRootFolderIds.length} 个，${MANUAL_FOLDER_TITLE} ${rebuildResult.warningEntries.length} 条。`,
          `Applied the preview plan without calling the model again. Rebuilt ${rebuildResult.createdCount} bookmarks, preserved ${rebuildResult.preservedCount} whitelisted bookmarks, kept ${job.protectedRootFolderIds.length} protected root folders untouched, and left ${rebuildResult.warningEntries.length} items in "${MANUAL_FOLDER_TITLE}".`
        )
      }
    );
    await chrome.storage.local.remove(STORAGE_KEYS.previewPlan);
    return { ok: true };
  } catch (error) {
    return await keepPreviewApplyRetryAvailable(error);
  }
}

async function keepPreviewApplyRetryAvailable(error) {
  const detail =
    error?.userDetail ||
    ux(
      "任务已停止。预览方案仍保留，你可以修复问题后重试；如果书签已发生变化，请重新生成预览。",
      "The task has stopped. The preview plan is still kept so you can retry after fixing the issue. If bookmarks changed, generate a new preview."
    );

  await updateStatus({
    phase: "error",
    message:
      error?.userMessage ||
      toUserMessage(error, ux("应用预览方案时出错。", "An error occurred while applying the preview plan.")),
    detail,
    previewApplyRetryAvailable: true,
    finishedAt: new Date().toISOString()
  });
  await chrome.storage.local.remove(STORAGE_KEYS.job);

  return {
    ok: false,
    error: toUserMessage(error, ux("应用预览方案失败。", "Failed to apply the preview plan.")),
    detail
  };
}

async function rejectApplyPreviewPlan(error, detail) {
  await chrome.storage.local.remove(STORAGE_KEYS.previewPlan);
  await updateStatus({
    phase: "error",
    message: error,
    detail,
    finishedAt: new Date().toISOString()
  });

  return {
    ok: false,
    error,
    detail
  };
}

async function savePreviewPlan(job, previewFolders) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.previewPlan]: {
      version: 1,
      runId: job.runId || "",
      createdAt: new Date().toISOString(),
      configSignature: buildPreviewConfigSignature(job.config || {}),
      sourceBookmarkSignature: buildBookmarkSetSignature(job.bookmarks),
      classificationSignature: job.classificationSignature || "",
      linkCheckMode: normalizeLinkCheckMode(job.config?.linkCheckMode),
      batchSize: job.batchSize,
      total: job.total,
      totalBatches: job.totalBatches,
      moved: job.moved,
      deleted: job.deleted,
      reused: job.reused,
      aiClassified: job.aiClassified,
      warningCount: job.warningCount,
      lastWarning: job.lastWarning || "",
      warnings: sanitizePreviewLogEntries(job.warnings),
      deletedItems: sanitizePreviewLogEntries(job.deletedItems),
      previewFolders: Array.isArray(previewFolders) ? previewFolders : [],
      preservedBookmarks: sanitizePreviewPlanEntries(job.preservedBookmarks),
      plannedBookmarks: sanitizePreviewPlanEntries(job.plannedBookmarks),
      pendingWarnings: sanitizePreviewPlanEntries(job.pendingWarnings),
      taxonomyTopFolders: Array.isArray(job.taxonomyTopFolders) ? job.taxonomyTopFolders : []
    }
  });
}

function isUsablePreviewPlan(previewPlan) {
  return Boolean(
    previewPlan &&
      previewPlan.version === 1 &&
      typeof previewPlan.configSignature === "string" &&
      typeof previewPlan.sourceBookmarkSignature === "string" &&
      Array.isArray(previewPlan.plannedBookmarks)
  );
}

function buildPreviewConfigSignature(config = {}) {
  const normalized = mergeConfig(config);
  return JSON.stringify({
    classification: Rules.buildClassificationSignature(normalized, MANUAL_FOLDER_TITLE),
    linkCheckMode: normalizeLinkCheckMode(normalized.linkCheckMode),
    whitelistDomains: parseWhitelistDomains(normalized.whitelistDomains)
  });
}

function buildBookmarkSetSignature(bookmarks = []) {
  const rows = (Array.isArray(bookmarks) ? bookmarks : [])
    .map((bookmark) => [
      String(bookmark?.id || ""),
      String(bookmark?.title || "").trim(),
      String(bookmark?.url || "").trim(),
      ...(Array.isArray(bookmark?.currentPath)
        ? bookmark.currentPath.map((segment) => String(segment || "").trim())
        : [])
    ])
    .sort((a, b) => a.join("\u001f").localeCompare(b.join("\u001f")));

  return JSON.stringify(rows);
}

function sanitizePreviewPlanEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      if (!entry?.url) {
        return null;
      }

      return {
        title: entry.title || t("untitledBookmark"),
        url: entry.url,
        folderPath: normalizeFolderPath(entry.folderPath),
        kind: typeof entry.kind === "string" ? entry.kind : "",
        reason: typeof entry.reason === "string" ? entry.reason : "",
        suggestion: typeof entry.suggestion === "string" ? entry.suggestion : ""
      };
    })
    .filter(Boolean);
}

function sanitizePreviewLogEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      kind: typeof entry?.kind === "string" ? entry.kind : "",
      title: typeof entry?.title === "string" ? entry.title : "",
      url: typeof entry?.url === "string" ? entry.url : "",
      reason: typeof entry?.reason === "string" ? entry.reason : "",
      suggestion: typeof entry?.suggestion === "string" ? entry.suggestion : ""
    }))
    .filter((entry) => entry.title || entry.url || entry.reason || entry.suggestion);
}

async function finishJob(phase, message, job, overrides = {}) {
  await chrome.alarms.clear(ALARM_NAME);
  const storedManagedState = await chrome.storage.local.get([
    STORAGE_KEYS.managedFolderIds,
    STORAGE_KEYS.managedRootBookmarkIds
  ]);
  const finalManagedFolderIds = Array.isArray(job?.managedFolderIds)
    ? job.managedFolderIds
    : Array.isArray(storedManagedState[STORAGE_KEYS.managedFolderIds])
      ? storedManagedState[STORAGE_KEYS.managedFolderIds]
      : [];
  const finalManagedRootBookmarkIds = Array.isArray(job?.managedRootBookmarkIds)
    ? job.managedRootBookmarkIds
    : Array.isArray(storedManagedState[STORAGE_KEYS.managedRootBookmarkIds])
      ? storedManagedState[STORAGE_KEYS.managedRootBookmarkIds]
      : [];
  await chrome.storage.local.remove(STORAGE_KEYS.job);
  await chrome.storage.local.set({
    [STORAGE_KEYS.managedFolderIds]: finalManagedFolderIds,
    [STORAGE_KEYS.managedRootBookmarkIds]: finalManagedRootBookmarkIds,
    [STORAGE_KEYS.rootFolderId]: ""
  });

  const processed = job?.processed ?? currentStatus.processed ?? 0;
  const moved = job?.moved ?? currentStatus.moved ?? 0;
  const deleted = job?.deleted ?? currentStatus.deleted ?? 0;
  const reused = job?.reused ?? currentStatus.reused ?? 0;
  const aiClassified = job?.aiClassified ?? currentStatus.aiClassified ?? 0;
  const warningCount = job?.warningCount ?? currentStatus.warningCount ?? 0;
  const warnings = Array.isArray(job?.warnings) ? job.warnings : currentStatus.warnings || [];
  const deletedItems = Array.isArray(job?.deletedItems)
    ? job.deletedItems
    : currentStatus.deletedItems || [];

  await updateStatus({
    phase,
    cancelRequested: false,
    message,
    provider:
      job?.jobType === "dead_scan"
        ? ""
        : getProviderLabel(job?.config?.provider || "") || currentStatus.provider || "",
    model: job?.jobType === "dead_scan" ? "" : job?.config?.model || currentStatus.model || "",
    total: job?.total ?? currentStatus.total ?? 0,
    processed,
    moved,
    deleted,
    reused,
    aiClassified,
    batchSize: job?.batchSize ?? currentStatus.batchSize ?? DEFAULT_BATCH_SIZE,
    warningCount,
    lastWarning: job?.lastWarning || currentStatus.lastWarning || "",
    warnings,
    deletedItems,
    previewFolders: overrides.previewFolders || currentStatus.previewFolders || [],
    protectedRootCount:
      job?.protectedRootFolderIds?.length ??
      currentStatus.protectedRootCount ??
      0,
    currentBatch:
      processed > 0
        ? Math.ceil(processed / (job?.batchSize || DEFAULT_BATCH_SIZE))
        : currentStatus.currentBatch ?? 0,
    totalBatches: job?.totalBatches ?? currentStatus.totalBatches ?? 0,
    startedAt: job?.startedAt || currentStatus.startedAt || "",
    finishedAt: new Date().toISOString(),
    detail: overrides.detail || currentStatus.detail || ""
  });
}

function validateConfig(config, options = {}) {
  const requireModelAccess = options.requireModelAccess !== false;

  if (!config.baseUrl) {
    throw new Error(ux("Base URL 不能为空。", "Base URL is required."));
  }

  if (!isValidHttpUrl(config.baseUrl)) {
    throw new Error(
      ux(
        "Base URL 必须是有效的 http 或 https 地址。",
        "Base URL must be a valid http or https URL."
      )
    );
  }

  if (!config.model) {
    throw new Error(ux("模型名称不能为空。", "Model Name is required."));
  }

  if (!Number.isInteger(config.batchSize) || config.batchSize < 5 || config.batchSize > 100) {
    throw new Error(ux("批大小必须是 5 到 100 之间的整数。", "Batch size must be an integer between 5 and 100."));
  }

  if (
    !Number.isInteger(config.autoOrganizeIntervalHours) ||
    config.autoOrganizeIntervalHours < 1 ||
    config.autoOrganizeIntervalHours > 168
  ) {
    throw new Error(
      ux(
        "自动整理间隔必须是 1 到 168 小时之间的整数。",
        "Auto organize interval must be an integer between 1 and 168 hours."
      )
    );
  }

  if (requireModelAccess && !hasRequiredProviderCredential(config)) {
    throw new Error(
      ux(
        `${getProviderLabel(config.provider)} 需要 API Key。`,
        `${getProviderLabel(config.provider)} requires an API key.`
      )
    );
  }
}

function hasRequiredProviderCredential(config = {}) {
  const defaults = getProviderDefaults(config.provider);
  return Boolean(defaults.apiKeyOptional || config.apiKey);
}

function findBookmarksBarNode(tree) {
  const root = tree[0];
  const directChildren = root?.children || [];
  const explicitBar = directChildren.find((node) => node.id === "1");

  if (explicitBar) {
    return explicitBar;
  }

  return directChildren.find((node) => !node.url) || root;
}

function isBackupFolderNode(node) {
  const title = typeof node?.title === "string" ? node.title.trim() : "";
  return Boolean(
    !node?.url &&
      (title.startsWith(`${DEFAULT_ROOT_FOLDER} Backup`) ||
        LEGACY_ROOT_FOLDERS.some((folderName) => title.startsWith(`${folderName} Backup`)) ||
        title.startsWith(BACKUP_FOLDER_PREFIX))
  );
}

function collectBookmarks(tree, options = {}) {
  const skipNodeIds = options.skipNodeIds || new Set();
  const results = [];

  function walk(node, trail = [], ancestorIds = [], skipBranch = false) {
    const safeTrail = Array.isArray(trail) ? trail : [];
    const safeAncestorIds = Array.isArray(ancestorIds) ? ancestorIds : [];
    const nextSkipBranch =
      skipBranch ||
      skipNodeIds.has(node.id) ||
      isBackupFolderNode(node);

    if (node.url) {
      if (!nextSkipBranch) {
        results.push({
          id: node.id,
          title: node.title || t("untitledBookmark"),
          url: node.url,
          currentPath: safeTrail,
          ancestorIds: safeAncestorIds
        });
      }
      return;
    }

    const shouldAppendTitle =
      node.id !== "0" &&
      node.parentId !== "0" &&
      !nextSkipBranch &&
      typeof node.title === "string" &&
      node.title.trim();

    const nextTrail = shouldAppendTitle ? [...safeTrail, node.title.trim()] : safeTrail;
    const nextAncestorIds = node.id !== "0" ? [...safeAncestorIds, node.id] : safeAncestorIds;

    for (const child of node.children || []) {
      walk(child, nextTrail, nextAncestorIds, nextSkipBranch);
    }
  }

  for (const node of tree) {
    walk(node, [], [], false);
  }

  return results;
}

function isForbiddenManagedFolderName(value) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    isForbiddenAiRootFolderName(normalized) ||
    normalized.startsWith(BACKUP_FOLDER_PREFIX.toLowerCase())
  );
}

function isForbiddenAiRootFolderName(value) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized === DEFAULT_ROOT_FOLDER.toLowerCase() ||
    LEGACY_ROOT_FOLDERS.some((folderName) => normalized === folderName.toLowerCase()) ||
    /^smart\s*bookmark(\s*ai)?$/i.test(normalized)
  );
}

function flattenForbiddenRootNodes(nodes) {
  const flattened = [];

  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node?.url && isForbiddenManagedFolderName(node.title)) {
      flattened.push(...(Array.isArray(node.children) ? node.children : []));
      continue;
    }

    flattened.push(node);
  }

  return flattened;
}

function serializeBookmarkTreeNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : []).map((node) => {
    if (node?.url) {
      return {
        title: node.title || t("untitledBookmark"),
        url: node.url
      };
    }

    return {
      title: node?.title || t("unnamedCategory"),
      children: serializeBookmarkTreeNodes(node?.children || [])
    };
  });
}

async function cloneBookmarkTreeNodes(nodes, parentId) {
  const createdNodes = [];

  for (const node of nodes || []) {
    if (node.url) {
      createdNodes.push(
        await chrome.bookmarks.create({
          parentId,
          title: node.title || t("untitledBookmark"),
          url: node.url
        })
      );
      continue;
    }

    const folder = await chrome.bookmarks.create({
      parentId,
      title: node.title || t("unnamedCategory")
    });
    await cloneBookmarkTreeNodes(node.children || [], folder.id);
    createdNodes.push(folder);
  }

  return createdNodes;
}

function openBackupDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BACKUP_DB_NAME, BACKUP_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(BACKUP_DB_STORE)) {
        database.createObjectStore(BACKUP_DB_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error(ux("打开本地备份数据库失败。", "Failed to open the local backup database.")));
  });
}

function waitForTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error || new Error(ux("本地备份事务被中止。", "The local backup transaction was aborted.")));
    transaction.onerror = () =>
      reject(transaction.error || new Error(ux("本地备份事务失败。", "The local backup transaction failed.")));
  });
}

function waitForRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error(ux("本地备份读写失败。", "Failed to read or write local backup data.")));
  });
}

async function readBackupSnapshot(backupId) {
  if (!backupId) {
    return null;
  }

  const database = await openBackupDatabase();
  try {
    const transaction = database.transaction(BACKUP_DB_STORE, "readonly");
    const transactionDone = waitForTransaction(transaction);
    const request = transaction.objectStore(BACKUP_DB_STORE).get(backupId);
    const record = await waitForRequest(request);
    await transactionDone;
    return Array.isArray(record?.nodes) ? record.nodes : null;
  } finally {
    database.close();
  }
}

async function saveBackupSnapshot(backupId, nodes) {
  const database = await openBackupDatabase();
  try {
    const transaction = database.transaction(BACKUP_DB_STORE, "readwrite");
    const transactionDone = waitForTransaction(transaction);
    transaction.objectStore(BACKUP_DB_STORE).put({
      id: backupId,
      nodes: serializeBookmarkTreeNodes(nodes)
    });
    await transactionDone;
  } finally {
    database.close();
  }
}

async function deleteBackupSnapshot(backupId) {
  if (!backupId) {
    return;
  }

  const database = await openBackupDatabase();
  try {
    const transaction = database.transaction(BACKUP_DB_STORE, "readwrite");
    const transactionDone = waitForTransaction(transaction);
    transaction.objectStore(BACKUP_DB_STORE).delete(backupId);
    await transactionDone;
  } finally {
    database.close();
  }
}

function normalizeBackupSource(source) {
  return ["auto", "manual"].includes(source) ? source : "manual";
}

function normalizeBackupRecords(rawRecords) {
  const seen = new Set();

  return (Array.isArray(rawRecords) ? rawRecords : [])
    .map((record) => ({
      id: typeof record?.id === "string" ? record.id : "",
      title: typeof record?.title === "string" ? record.title : "",
      createdAt: typeof record?.createdAt === "string" ? record.createdAt : "",
      source: normalizeBackupSource(record?.source)
    }))
    .filter((record) => record.id && !seen.has(record.id) && seen.add(record.id));
}

function limitBackupRecords(records, maxRecords = MAX_BACKUP_RECORDS, options = {}) {
  const normalized = normalizeBackupRecords(records);
  if (normalized.length <= maxRecords) {
    return {
      keptRecords: normalized,
      overflowRecords: []
    };
  }

  const keepIds = new Set();
  const preserveIds = new Set(
    Array.isArray(options.preserveIds)
      ? options.preserveIds.map((id) => String(id || "")).filter(Boolean)
      : []
  );
  const manualRecords = normalized.filter((record) => record.source === "manual");
  const autoRecords = normalized.filter((record) => record.source === "auto");

  const addKeptRecord = (record) => {
    if (keepIds.size >= maxRecords) {
      return;
    }

    keepIds.add(record.id);
  };

  for (const record of normalized) {
    if (preserveIds.has(record.id)) {
      addKeptRecord(record);
    }
  }

  for (const record of manualRecords) {
    addKeptRecord(record);
  }

  for (const record of autoRecords) {
    addKeptRecord(record);
  }

  return {
    keptRecords: normalized.filter((record) => keepIds.has(record.id)),
    overflowRecords: normalized.filter((record) => !keepIds.has(record.id))
  };
}

async function saveBackupRecords(records) {
  const normalized = normalizeBackupRecords(records);
  await chrome.storage.local.set({
    [STORAGE_KEYS.backupRecords]: normalized,
    [STORAGE_KEYS.latestSnapshotBackupFolderId]: "",
    [STORAGE_KEYS.latestBackupFolderId]: ""
  });
}

async function migrateLegacyBackupFolderRecord(record, folder) {
  const subtree = await chrome.bookmarks.getSubTree(folder.id).catch(() => null);
  const root = subtree?.[0];
  if (!root || root.url) {
    return null;
  }

  await saveBackupSnapshot(record.id, root.children || []);
  await removeFolderIfExists(root.id);

  return {
    id: record.id,
    title: record.title || `${BACKUP_RECORD_PREFIX} ${formatBackupTimestamp(new Date(root.dateAdded || Date.now()))}`,
    createdAt: record.createdAt || new Date(root.dateAdded || Date.now()).toISOString(),
    source: normalizeBackupSource(record.source)
  };
}

async function migrateLegacyBookmarkBackupFolders(records, stored = {}) {
  const knownRecords = normalizeBackupRecords(records);
  const knownIds = new Set(knownRecords.map((record) => record.id));
  const tree = await chrome.bookmarks.getTree().catch(() => []);
  const bookmarkBarNode = findBookmarksBarNode(tree);
  const legacyFolderIds = new Set(
    [
      stored[STORAGE_KEYS.latestSnapshotBackupFolderId],
      stored[STORAGE_KEYS.latestBackupFolderId]
    ].filter(Boolean)
  );

  if (bookmarkBarNode?.id) {
    const children = await chrome.bookmarks.getChildren(bookmarkBarNode.id).catch(() => []);
    for (const child of children) {
      if (isBackupFolderNode(child)) {
        legacyFolderIds.add(child.id);
      }
    }
  }

  const migratedRecords = [...knownRecords];

  for (const legacyId of legacyFolderIds) {
    if (!legacyId || knownIds.has(legacyId)) {
      continue;
    }

    const folder = await getFolderById(legacyId);
    if (!folder || folder.url || !isBackupFolderNode(folder)) {
      continue;
    }

    const migrated = await migrateLegacyBackupFolderRecord(
      {
        id: legacyId,
        title: folder.title || `${BACKUP_RECORD_PREFIX} ${formatBackupTimestamp(new Date(folder.dateAdded || Date.now()))}`,
        createdAt: folder.dateAdded ? new Date(folder.dateAdded).toISOString() : new Date().toISOString(),
        source: "manual"
      },
      folder
    );

    if (migrated) {
      migratedRecords.push(migrated);
      knownIds.add(migrated.id);
    }
  }

  for (const record of knownRecords) {
    const snapshot = await readBackupSnapshot(record.id);
    if (snapshot) {
      continue;
    }

    const folder = await getFolderById(record.id);
    if (!folder || folder.url || !isBackupFolderNode(folder)) {
      continue;
    }

    const migrated = await migrateLegacyBackupFolderRecord(record, folder);
    if (!migrated) {
      continue;
    }

    const index = migratedRecords.findIndex((item) => item.id === migrated.id);
    if (index === -1) {
      migratedRecords.push(migrated);
    } else {
      migratedRecords[index] = migrated;
    }
  }

  return normalizeBackupRecords(migratedRecords);
}

async function syncBackupRecords() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEYS.backupRecords,
    STORAGE_KEYS.latestSnapshotBackupFolderId,
    STORAGE_KEYS.latestBackupFolderId
  ]);
  let records = normalizeBackupRecords(stored[STORAGE_KEYS.backupRecords]);
  records = await migrateLegacyBookmarkBackupFolders(records, stored);

  const validRecords = [];
  for (const record of records) {
    const snapshot = await readBackupSnapshot(record.id);
    if (snapshot) {
      validRecords.push(record);
    }
  }

  const { keptRecords, overflowRecords } = limitBackupRecords(validRecords);

  for (const record of overflowRecords) {
    await deleteBackupSnapshot(record.id);
  }

  await saveBackupRecords(keptRecords);
  return keptRecords;
}

async function addBackupRecord(record, source = "manual", options = {}) {
  const currentRecords = await syncBackupRecords();
  const nextRecords = [
    {
      id: record.id,
      title: record.title || record.id,
      createdAt: record.createdAt || new Date().toISOString(),
      source: normalizeBackupSource(source)
    },
    ...currentRecords.filter((item) => item.id !== record.id)
  ];

  const { keptRecords, overflowRecords } = limitBackupRecords(nextRecords, MAX_BACKUP_RECORDS, options);

  for (const record of overflowRecords) {
    await deleteBackupSnapshot(record.id);
  }

  await saveBackupRecords(keptRecords);
  return keptRecords;
}

async function removeBackupRecord(backupId) {
  const records = await syncBackupRecords();
  const nextRecords = records.filter((record) => record.id !== backupId);
  await saveBackupRecords(nextRecords);
}

async function findExistingUnresolvedFolderId(bookmarkBarId) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.unresolvedFolderId);
  const storedFolderId = stored[STORAGE_KEYS.unresolvedFolderId];

  if (storedFolderId) {
    const existing = await getFolderById(storedFolderId);
    if (existing && !existing.url) {
      if (existing.title !== MANUAL_FOLDER_TITLE) {
        await chrome.bookmarks.update(existing.id, { title: MANUAL_FOLDER_TITLE });
      }
      return existing.id;
    }
  }

  if (!bookmarkBarId) {
    return "";
  }

  const children = await chrome.bookmarks.getChildren(bookmarkBarId);
  const folder = children.find(
    (node) => !node.url && MANUAL_FOLDER_ALIASES.includes(node.title)
  );

  if (!folder) {
    return "";
  }

  if (folder.title !== MANUAL_FOLDER_TITLE) {
    await chrome.bookmarks.update(folder.id, { title: MANUAL_FOLDER_TITLE });
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.unresolvedFolderId]: folder.id
  });

  return folder.id;
}

async function ensureUnresolvedFolder(bookmarkBarId) {
  const existingFolderId = await findExistingUnresolvedFolderId(bookmarkBarId);
  if (existingFolderId) {
    return existingFolderId;
  }

  const folder = await chrome.bookmarks.create({
    parentId: bookmarkBarId,
    title: MANUAL_FOLDER_TITLE
  });

  await chrome.storage.local.set({
    [STORAGE_KEYS.unresolvedFolderId]: folder.id
  });

  return folder.id;
}

async function createCurrentSnapshotBackup(bookmarkBarNode, source = "manual", options = {}) {
  const topLevelNodes = Array.isArray(bookmarkBarNode?.children)
    ? flattenForbiddenRootNodes(bookmarkBarNode.children.filter((node) => !isBackupFolderNode(node)))
    : [];

  if (!bookmarkBarNode?.id || !topLevelNodes.length) {
    return {
      created: false,
      detail: ux("当前没有可备份的书签。", "There are no bookmarks to back up.")
    };
  }

  const backupId = crypto.randomUUID();
  const backupTitle = `${BACKUP_RECORD_PREFIX} ${formatBackupTimestamp()}`;
  await saveBackupSnapshot(backupId, topLevelNodes);
  await addBackupRecord(
    {
      id: backupId,
      title: backupTitle,
      createdAt: new Date().toISOString()
    },
    source,
    {
      preserveIds: Array.isArray(options.preserveIds) ? options.preserveIds : []
    }
  );

  return {
    created: true,
    folderId: backupId,
    folderTitle: backupTitle,
    detail: ux(`已创建本地快照备份“${backupTitle}”。`, `Created local snapshot backup "${backupTitle}".`)
  };
}

async function getFolderById(folderId) {
  if (!folderId) {
    return null;
  }

  try {
    const folder = await chrome.bookmarks.get(folderId);
    return folder?.[0] || null;
  } catch (error) {
    return null;
  }
}

async function removeFolderIfExists(folderId) {
  if (!folderId) {
    return;
  }

  try {
    await chrome.bookmarks.removeTree(folderId);
  } catch (error) {
    // Ignore if the user already removed it manually.
  }
}

async function cleanupForbiddenAiRootFolders(bookmarkBarId) {
  if (!bookmarkBarId) {
    return;
  }

  const children = await chrome.bookmarks.getChildren(bookmarkBarId).catch(() => []);
  const forbiddenFolders = children.filter(
    (node) => !node.url && isForbiddenAiRootFolderName(node.title) && !isBackupFolderNode(node)
  );

  for (const folder of forbiddenFolders) {
    const folderChildren = await chrome.bookmarks.getChildren(folder.id).catch(() => []);
    for (const child of folderChildren) {
      try {
        await chrome.bookmarks.move(child.id, { parentId: bookmarkBarId });
      } catch (error) {
        // Ignore if another sync source already moved or removed the node.
      }
    }

    await removeFolderIfExists(folder.id);
  }
}

function formatBackupTimestamp(date = new Date()) {
  const parts = [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate())
  ];
  const time = [pad2(date.getHours()), pad2(date.getMinutes()), pad2(date.getSeconds())].join("-");
  return `${parts.join("-")} ${time}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function buildWhitelistMatcher(rawWhitelist) {
  const rules = parseWhitelistDomains(rawWhitelist);

  if (!rules.length) {
    return () => false;
  }

  return (rawUrl) => {
    const hostname = extractHostname(rawUrl);
    if (!hostname) {
      return false;
    }

    return rules.some((rule) => {
      if (rule.startsWith("*.")) {
        const suffix = rule.slice(2);
        return hostname === suffix || hostname.endsWith(`.${suffix}`);
      }

      return hostname === rule || hostname.endsWith(`.${rule}`);
    });
  };
}

function parseWhitelistDomains(rawWhitelist) {
  if (typeof rawWhitelist !== "string" || !rawWhitelist.trim()) {
    return [];
  }

  return Array.from(
    new Set(
      rawWhitelist
        .split(/[\n,]+/g)
        .map((entry) => normalizeWhitelistDomain(entry))
        .filter(Boolean)
    )
  );
}

function normalizeWhitelistDomain(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//.test(trimmed)) {
    return extractHostname(trimmed);
  }

  return trimmed.replace(/\/+$/, "");
}

function extractHostname(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch (error) {
    return "";
  }
}

async function syncAutoOrganizeAlarm() {
  const config = await readStoredConfig();
  const existingAlarm = await chrome.alarms.get(AUTO_ORGANIZE_ALARM_NAME);

  if (!config.autoOrganizeEnabled) {
    if (existingAlarm) {
      await chrome.alarms.clear(AUTO_ORGANIZE_ALARM_NAME);
    }

    return;
  }

  if (!hasRequiredProviderCredential(config)) {
    if (existingAlarm) {
      await chrome.alarms.clear(AUTO_ORGANIZE_ALARM_NAME);
    }

    return;
  }

  if (shouldCheckDeadLinks(config) && !(await hasBroadHostAccess())) {
    if (existingAlarm) {
      await chrome.alarms.clear(AUTO_ORGANIZE_ALARM_NAME);
    }

    return;
  }

  if (!(await hasOriginAccess(config.baseUrl))) {
    if (existingAlarm) {
      await chrome.alarms.clear(AUTO_ORGANIZE_ALARM_NAME);
    }

    return;
  }

  const intervalMinutes = Math.max(1, config.autoOrganizeIntervalHours * 60);
  if (existingAlarm && existingAlarm.periodInMinutes === intervalMinutes) {
    return;
  }

  if (existingAlarm) {
    await chrome.alarms.clear(AUTO_ORGANIZE_ALARM_NAME);
  }

  await chrome.alarms.create(AUTO_ORGANIZE_ALARM_NAME, {
    delayInMinutes: intervalMinutes,
    periodInMinutes: intervalMinutes
  });
}

async function handleAutoOrganizeAlarm() {
  const config = await readStoredConfig();
  if (!config.autoOrganizeEnabled) {
    return;
  }

  const stored = await chrome.storage.local.get(STORAGE_KEYS.job);
  if (stored[STORAGE_KEYS.job]?.phase === "running") {
    return;
  }

  try {
    await startOrganizeJob({ trigger: "auto" });
  } catch (error) {
    console.error("Failed to run auto organize alarm:", error);
    await updateStatus({
      phase: "error",
      message:
        error?.userMessage ||
        toUserMessage(
          error,
          ux(
            "自动静默整理失败，请检查配置、网络或批大小设置。",
            "Auto silent organize failed. Check the configuration, network, or batch size."
          )
        ),
      detail:
        error?.userDetail ||
        ux(
          "这是一次自动定时任务触发的失败。你可以稍后手动打开 Popup 或设置页查看并重试。",
          "This failure happened during an automatic scheduled run. You can open the popup or settings page later to review it and try again."
        ),
      finishedAt: new Date().toISOString()
    });
  }
}

async function testApiConnection(rawConfig) {
  const config = mergeConfig(rawConfig || {});
  validateConfig(config);
  await assertApiOriginAccess(config.baseUrl);

  const requestSpec = Providers.buildRequest(
    config,
    [
      {
        role: "system",
        content: "You are a connectivity test."
      },
      {
        role: "user",
        content: "Reply with OK."
      }
    ],
    { mode: "test" }
  );
  const providerLabel = getProviderLabel(config.provider);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("api-test-timeout"), 20_000);

  try {
    const response = await fetch(requestSpec.endpoint, {
      method: "POST",
      headers: requestSpec.headers,
      body: JSON.stringify(requestSpec.body),
      signal: controller.signal
    });

    const rawBody = await response.text();

    if (!response.ok) {
      throw buildUserFacingError(
        ux(`API 检测失败，接口返回 ${response.status}。`, `API test failed with status ${response.status}.`),
        ux(`接口响应片段：${truncate(rawBody, 220)}`, `Response snippet: ${truncate(rawBody, 220)}`)
      );
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      throw buildUserFacingError(
        ux("API 检测失败，接口没有返回 JSON。", "API test failed because the response was not JSON."),
        ux(`原始响应片段：${truncate(rawBody, 220)}`, `Raw response snippet: ${truncate(rawBody, 220)}`)
      );
    }

    const content = Providers.extractText(parsedBody, config.provider);
    return {
      message: ux(
        `API 检测成功，${providerLabel} / ${config.model} 当前可用。`,
        `API test succeeded. ${providerLabel} / ${config.model} is available.`
      ),
      detail: content
        ? ux(
            `模型已返回内容：${truncate(content.replace(/\s+/g, " "), 80)}`,
            `Model returned: ${truncate(content.replace(/\s+/g, " "), 80)}`
          )
        : ux("接口返回正常，已成功拿到结构化响应。", "The endpoint responded normally with a structured response.")
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw buildUserFacingError(
        ux("API 检测超时，20 秒内没有拿到响应。", "API test timed out after 20 seconds."),
        ux(
          "请检查 Base URL、网络、模型负载，或确认当前接口没有排队过久。",
          "Check the Base URL, network, model load, or whether the endpoint is stuck in a queue."
        )
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function scanDeadBookmarksBatch(batch, reportStage = () => {}, options = {}) {
  const shouldMutate = options.mutate !== false;
  const nextDeadLinkCache = {
    ...((options.cache && typeof options.cache === "object") ? options.cache : {})
  };
  const safeBatch = Array.isArray(batch) ? batch : [];
  const scanConcurrency = Math.min(DEAD_LINK_SCAN_CONCURRENCY, Math.max(1, safeBatch.length));
  const inFlightHealthChecks = new Map();
  const scanResults = new Array(safeBatch.length);
  let completedCount = 0;
  let deletedCount = 0;
  let warningCount = 0;
  let lastWarning = "";
  const warningEntries = [];
  const deletedEntries = [];
  const healthyBookmarks = [];
  const pendingWarnings = [];

  if (!safeBatch.length) {
    return {
      deletedCount,
      warningCount,
      lastWarning,
      warningEntries,
      deletedEntries,
      healthyBookmarks,
      pendingWarnings,
      nextDeadLinkCache
    };
  }

  await reportStage({
    message: ux(
      `正在并发检测 ${safeBatch.length} 条链接状态。`,
      `Checking ${safeBatch.length} links in parallel.`
    ),
    detail: ux(
      `本批最多同时检测 ${scanConcurrency} 条链接；只有确认失效的链接才会自动删除或从重建方案中移除。`,
      `Up to ${scanConcurrency} links are checked at the same time. Only confirmed dead links are removed or excluded from rebuild.`
    )
  });

  await runWithConcurrency(safeBatch, scanConcurrency, async (bookmark, index) => {
    scanResults[index] = await scanSingleBookmarkHealth(bookmark, {
      shouldMutate,
      nextDeadLinkCache,
      inFlightHealthChecks
    });

    completedCount += 1;
    await reportStage({
      message: ux(
        `正在检测失效书签：${bookmark.title || bookmark.url}`,
        `Checking link health: ${bookmark.title || bookmark.url}`
      ),
      detail: ux(
        `当前进度 ${completedCount}/${safeBatch.length}。最近完成 ${truncate(bookmark.url, 90)}`,
        `Progress ${completedCount}/${safeBatch.length}. Recently finished ${truncate(bookmark.url, 90)}`
      )
    });
  });

  for (const result of scanResults) {
    if (!result) {
      continue;
    }

    deletedCount += result.deletedCount;
    warningCount += result.warningCount;
    lastWarning = result.lastWarning || lastWarning;
    warningEntries.push(...result.warningEntries);
    deletedEntries.push(...result.deletedEntries);
    healthyBookmarks.push(...result.healthyBookmarks);
    pendingWarnings.push(...result.pendingWarnings);
  }

  return {
    deletedCount,
    warningCount,
    lastWarning,
    warningEntries,
    deletedEntries,
    healthyBookmarks,
    pendingWarnings,
    nextDeadLinkCache
  };
}

function buildSkippedDeadLinkScanResult(batch) {
  return {
    deletedCount: 0,
    warningCount: 0,
    lastWarning: "",
    warningEntries: [],
    deletedEntries: [],
    healthyBookmarks: Array.isArray(batch) ? batch : [],
    pendingWarnings: [],
    nextDeadLinkCache: {}
  };
}

async function runWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  let firstError = null;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  async function runWorker() {
    while (nextIndex < items.length && !firstError) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      try {
        await worker(items[currentIndex], currentIndex);
      } catch (error) {
        firstError = error;
        break;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  if (firstError) {
    throw firstError;
  }
}

async function scanSingleBookmarkHealth(bookmark, options = {}) {
  const shouldMutate = options.shouldMutate !== false;
  const nextDeadLinkCache =
    options.nextDeadLinkCache && typeof options.nextDeadLinkCache === "object"
      ? options.nextDeadLinkCache
      : {};
  const inFlightHealthChecks =
    options.inFlightHealthChecks instanceof Map ? options.inFlightHealthChecks : new Map();
  const warningEntries = [];
  const deletedEntries = [];
  const healthyBookmarks = [];
  const pendingWarnings = [];
  let deletedCount = 0;
  let warningCount = 0;
  let lastWarning = "";

  try {
    const result = await checkBookmarkHealthWithBatchDedupe(
      bookmark.url,
      nextDeadLinkCache,
      inFlightHealthChecks
    );
    if (result.isDead) {
      if (shouldMutate) {
        await chrome.bookmarks.remove(bookmark.id);
      }
      deletedCount += 1;
      deletedEntries.push(
        buildLogEntry(
          "dead_link_deleted",
          bookmark,
          shouldMutate
            ? ux(
                `已确认失效并自动删除：${result.reason || "HTTP 404 / 410 / 451"}`,
                `Confirmed dead and removed automatically: ${result.reason || "HTTP 404 / 410 / 451"}`
              )
            : ux(
                `已确认失效，重建时不会保留：${result.reason || "HTTP 404 / 410 / 451"}`,
                `Confirmed dead and excluded from rebuild: ${result.reason || "HTTP 404 / 410 / 451"}`
              ),
          shouldMutate
            ? ux(
                "扩展只会删除明确失效的链接。如果你仍然需要它，可以稍后手动重新添加。",
                "The extension removes only clearly dead links. If you still need it, you can add it again manually later."
              )
            : ux(
                "本次整理会在最终重建时跳过这类明确失效的链接，原始结构仍已备份。",
                "This organize run will skip clearly dead links during the final rebuild. The original structure is still backed up."
              )
        )
      );
    } else if (!result.isHealthy) {
      const reason = ux(
        `书签《${bookmark.title}》状态不明确，未自动删除：${result.reason || "检测超时或目标站点拒绝访问"}`,
        `Bookmark "${bookmark.title}" has an uncertain status and was not deleted automatically: ${result.reason || "Timeout or the target site rejected the request"}`
      );
      const suggestion = ux(
        "这通常是目标站点拒绝 HEAD 请求、需要登录或暂时超时。建议手动打开确认，扩展不会直接删除这类链接。",
        "This usually means the target site rejects HEAD requests, requires sign-in, or timed out temporarily. Open it manually to confirm. The extension will not remove links like this automatically."
      );
      warningCount += 1;
      lastWarning = reason;
      warningEntries.push(buildLogEntry("scan_uncertain", bookmark, reason, suggestion));
      pendingWarnings.push({
        title: bookmark.title || t("untitledBookmark"),
        url: bookmark.url,
        kind: "scan_uncertain",
        reason,
        suggestion
      });
    } else {
      healthyBookmarks.push(bookmark);
    }
  } catch (error) {
    if (error?.abortReason === "cancelled-by-user") {
      throw error;
    }

    warningCount += 1;
    lastWarning = ux(
      `书签《${bookmark.title}》检测失败：${toUserMessage(error, "未知错误")}`,
      `Failed to check "${bookmark.title}": ${toUserMessage(error, "Unknown error")}`
    );
    warningEntries.push(
      buildLogEntry(
        "scan_failed",
        bookmark,
        lastWarning,
        ux(
          "建议稍后重试一次；如果目标网站限制访问，手动打开通常比后台探测更准确。",
          "Try again later. If the target site blocks background requests, opening it manually is usually more reliable."
        )
      )
    );
    pendingWarnings.push({
      title: bookmark.title || t("untitledBookmark"),
      url: bookmark.url,
      kind: "scan_failed",
      reason: lastWarning,
      suggestion: ux(
        "建议稍后重试一次；如果目标网站限制访问，手动打开通常比后台探测更准确。",
        "Try again later. If the target site blocks background requests, opening it manually is usually more reliable."
      )
    });
  }

  return {
    deletedCount,
    warningCount,
    lastWarning,
    warningEntries,
    deletedEntries,
    healthyBookmarks,
    pendingWarnings
  };
}

async function checkBookmarkHealthWithBatchDedupe(rawUrl, cacheStore, inFlightHealthChecks) {
  if (!/^https?:\/\//i.test(rawUrl)) {
    return await checkBookmarkHealth(rawUrl, cacheStore);
  }

  const cacheKey = CacheUtils.normalizeCacheUrl(rawUrl);
  if (!cacheKey) {
    return await checkBookmarkHealth(rawUrl, cacheStore);
  }

  const cachedEntry = cacheStore[cacheKey];
  if (cachedEntry && CacheUtils.isDeadLinkCacheFresh(cachedEntry)) {
    return {
      ...cachedEntry.result
    };
  }

  if (inFlightHealthChecks.has(cacheKey)) {
    return {
      ...(await inFlightHealthChecks.get(cacheKey))
    };
  }

  const healthCheck = checkBookmarkHealth(rawUrl, cacheStore);
  inFlightHealthChecks.set(cacheKey, healthCheck);

  try {
    return {
      ...(await healthCheck)
    };
  } finally {
    if (inFlightHealthChecks.get(cacheKey) === healthCheck) {
      inFlightHealthChecks.delete(cacheKey);
    }
  }
}

async function checkBookmarkHealth(rawUrl, cacheStore = {}) {
  if (!/^https?:\/\//i.test(rawUrl)) {
    return {
      isDead: false,
      isHealthy: true,
      shouldRetryWithGet: false,
      reason: ""
    };
  }

  const cacheKey = CacheUtils.normalizeCacheUrl(rawUrl);
  const cachedEntry = cacheStore[cacheKey];
  if (cachedEntry && CacheUtils.isDeadLinkCacheFresh(cachedEntry)) {
    return {
      ...cachedEntry.result
    };
  }

  const headResult = await requestBookmarkHealth(rawUrl, "HEAD");
  if (headResult.isDead) {
    const cacheEntry = CacheUtils.createDeadLinkCacheEntry(rawUrl, headResult);
    if (cacheEntry) {
      cacheStore[cacheEntry.cacheKey] = cacheEntry;
    }
    return headResult;
  }

  if (headResult.isHealthy) {
    const cacheEntry = CacheUtils.createDeadLinkCacheEntry(rawUrl, headResult);
    if (cacheEntry) {
      cacheStore[cacheEntry.cacheKey] = cacheEntry;
    }
    return headResult;
  }

  if (!headResult.shouldRetryWithGet) {
    const cacheEntry = CacheUtils.createDeadLinkCacheEntry(rawUrl, headResult);
    if (cacheEntry) {
      cacheStore[cacheEntry.cacheKey] = cacheEntry;
    }
    return headResult;
  }

  const getResult = await requestBookmarkHealth(rawUrl, "GET");
  const cacheEntry = CacheUtils.createDeadLinkCacheEntry(rawUrl, getResult);
  if (cacheEntry) {
    cacheStore[cacheEntry.cacheKey] = cacheEntry;
  }
  return getResult;
}

async function requestBookmarkHealth(rawUrl, method) {
  const controller = new AbortController();
  activeDeadScanControllers.add(controller);
  const timer = setTimeout(() => controller.abort("dead-link-timeout"), DEAD_LINK_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(rawUrl, {
      method,
      redirect: "follow",
      signal: controller.signal
    });

    if (response.body) {
      try {
        await response.body.cancel();
      } catch (error) {
        // Ignore body cancellation failures.
      }
    }

    if (DEAD_LINK_DELETE_STATUS_CODES.has(response.status)) {
      return {
        isDead: true,
        isHealthy: false,
        shouldRetryWithGet: false,
        reason: `HTTP ${response.status}`
      };
    }

    if (response.ok || [301, 302, 303, 307, 308, 401, 403].includes(response.status)) {
      return {
        isDead: false,
        isHealthy: true,
        shouldRetryWithGet: false,
        reason: ""
      };
    }

    return {
      isDead: false,
      isHealthy: false,
      shouldRetryWithGet: method === "HEAD" && [400, 405, 406, 500, 501].includes(response.status),
      reason: `HTTP ${response.status}`
    };
  } catch (error) {
    if (controller.signal.aborted) {
      if (`${controller.signal.reason || ""}` === "cancelled-by-user") {
        throw buildUserFacingError(
          ux("失效书签扫描已被取消。", "Dead-link scan was cancelled."),
          ux("后台已经停止当前 URL 检测。", "The background worker stopped checking the current URL."),
          "cancelled-by-user"
        );
      }

      return {
        isDead: false,
        isHealthy: false,
        shouldRetryWithGet: false,
        reason: ux("请求超时", "Request timed out")
      };
    }

    return {
      isDead: false,
      isHealthy: false,
      shouldRetryWithGet: method === "HEAD",
      reason: toUserMessage(error, ux("网络错误", "Network error"))
    };
  } finally {
    clearTimeout(timer);
    activeDeadScanControllers.delete(controller);
  }
}

async function classifyBatchWithModel(
  batch,
  config,
  reportStage = () => {},
  taxonomyLocks = {},
  taxonomyTopFolders = []
) {
  const requestBatches = splitIntoModelRequestBatches(batch, config);
  if (requestBatches.length > 1) {
    return classifySplitModelRequestBatches(
      requestBatches,
      config,
      reportStage,
      taxonomyLocks,
      taxonomyTopFolders
    );
  }

  return classifySingleModelRequest(
    batch,
    config,
    reportStage,
    taxonomyLocks,
    taxonomyTopFolders
  );
}

async function classifySplitModelRequestBatches(
  requestBatches,
  config,
  reportStage = () => {},
  taxonomyLocks = {},
  taxonomyTopFolders = []
) {
  const concurrency = Math.min(getModelRequestConcurrency(config), requestBatches.length);
  const resultsByIndex = new Array(requestBatches.length);
  let nextIndex = 0;
  let firstError = null;

  const workers = Array.from({ length: concurrency }, async () => {
    while (!firstError) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= requestBatches.length) {
        return;
      }

      const requestBatch = requestBatches[index];
      try {
        await assertNoStoredCancellationBeforeModelRequest(config, requestBatch.length);
        await reportStage({
          message: ux(
            `正在拆分慢模型请求 ${index + 1}/${requestBatches.length}。`,
            `Splitting slow-model request ${index + 1}/${requestBatches.length}.`
          ),
          detail:
            concurrency > 1
              ? ux(
                  `本次最多同时发送 ${concurrency} 个小请求，每个最多 ${requestBatch.length} 条，减少排队和单个大请求卡住。`,
                  `Up to ${concurrency} small requests run at once, with no more than ${requestBatch.length} bookmarks each, to reduce queueing and one large request stalling.`
                )
              : ux(
                  `本次只发送 ${requestBatch.length} 条，避免单个大批量请求长时间卡住。`,
                  `Only ${requestBatch.length} bookmarks are sent this time to avoid one large request stalling.`
                )
        });
        await assertNoStoredCancellationBeforeModelRequest(config, requestBatch.length);
        resultsByIndex[index] = await classifyAdaptiveModelRequestBatch(
          requestBatch,
          config,
          reportStage,
          taxonomyLocks,
          taxonomyTopFolders
        );
      } catch (error) {
        firstError = firstError || error;
        abortActiveModelRequests(error?.abortReason || "split-model-request-failed");
        return;
      }
    }
  });

  await Promise.allSettled(workers);

  if (firstError) {
    throw firstError;
  }

  return resultsByIndex.flatMap((results) => results || []);
}

async function classifyAdaptiveModelRequestBatch(
  requestBatch,
  config,
  reportStage = () => {},
  taxonomyLocks = {},
  taxonomyTopFolders = []
) {
  await assertNoStoredCancellationBeforeModelRequest(config, requestBatch.length);

  try {
    return await classifySingleModelRequest(
      requestBatch,
      {
        ...config,
        batchSize: requestBatch.length
      },
      reportStage,
      taxonomyLocks,
      taxonomyTopFolders
    );
  } catch (error) {
    if (
      error?.abortReason === "cancelled-by-user" ||
      !isModelTimeoutError(error) ||
      requestBatch.length <= MIN_AUTO_RETRY_BATCH_SIZE
    ) {
      throw error;
    }

    const nextBatchSize = getAdaptiveRetryBatchSize(requestBatch.length);
    if (nextBatchSize >= requestBatch.length) {
      throw error;
    }

    const retryBatches = splitIntoFixedSizeChunks(requestBatch, nextBatchSize);
    await reportStage({
      message: ux(
        `${getRuntimeProviderLabel(config)} 小请求仍然过慢，正在只拆分重试失败的 ${requestBatch.length} 条。`,
        `${getRuntimeProviderLabel(config)} mini request is still slow, so only the failed ${requestBatch.length} bookmarks are being split and retried.`
      ),
      detail: ux(
        `已完成的小请求结果会保留；这次把慢块拆成 ${retryBatches.length} 个更小请求，每个最多 ${nextBatchSize} 条。`,
        `Completed mini-request results are kept. This slow block is split into ${retryBatches.length} smaller retries with up to ${nextBatchSize} bookmarks each.`
      )
    });

    const retryResults = [];
    for (let index = 0; index < retryBatches.length; index += 1) {
      const retryBatch = retryBatches[index];
      await assertNoStoredCancellationBeforeModelRequest(config, retryBatch.length);
      await reportStage({
        message: ux(
          `正在重试慢模型小块 ${index + 1}/${retryBatches.length}。`,
          `Retrying slow-model mini block ${index + 1}/${retryBatches.length}.`
        ),
        detail: ux(
          `本次重试 ${retryBatch.length} 条；如果仍然超时，会继续拆到 1 条后再停止。`,
          `${retryBatch.length} bookmarks in this retry. If it still times out, it will keep shrinking down to one bookmark before stopping.`
        )
      });
      const results = await classifyAdaptiveModelRequestBatch(
        retryBatch,
        config,
        reportStage,
        taxonomyLocks,
        taxonomyTopFolders
      );
      retryResults.push(...results);
    }

    return retryResults;
  }
}

async function classifySingleModelRequest(
  batch,
  config,
  reportStage = () => {},
  taxonomyLocks = {},
  taxonomyTopFolders = []
) {
  const messages = buildClassificationMessages(
    batch,
    config.customPrompt,
    taxonomyLocks,
    taxonomyTopFolders
  );
  const outputTokenBudget = getClassificationOutputTokenBudget(batch.length, config);
  const requestSpec = Providers.buildRequest(config, messages, {
    mode: "organize",
    outputTokenBudget
  });
  const firstResponseTimeoutMs = getFirstResponseTimeoutMs(config);
  const requestTimeoutMs = getRequestTimeoutMs(config);

  const requestAbortController = new AbortController();
  activeAbortController = requestAbortController;
  activeModelAbortControllers.add(requestAbortController);
  let abortReason = "";
  const abortWithReason = (reason) => {
    abortReason = reason;
    if (!requestAbortController.signal.aborted) {
      requestAbortController.abort(reason);
    }
  };
  const firstResponseTimer = setTimeout(() => {
    abortWithReason("first-response-timeout");
  }, firstResponseTimeoutMs);
  const totalTimeoutTimer = setTimeout(() => {
    abortWithReason("request-timeout");
  }, requestTimeoutMs);

  try {
    await reportStage({
      message: ux(
        `第 1 阶段：正在向模型发送 ${batch.length} 条书签的分类请求。`,
        `Stage 1: sending a classification request for ${batch.length} bookmarks to the model.`
      ),
      detail: ux(
        `请求地址：${truncate(requestSpec.endpoint, 90)}。输出预算 ${outputTokenBudget} tokens；如果 ${formatTimeoutSeconds(firstResponseTimeoutMs)} 秒内没有收到响应，会主动停止并提示你减小批大小。`,
        `Endpoint: ${truncate(requestSpec.endpoint, 90)}. Output budget: ${outputTokenBudget} tokens. If no response is received within ${formatTimeoutSeconds(firstResponseTimeoutMs)} seconds, the request will stop and suggest reducing the batch size.`
      )
    });

    let response;
    try {
      response = await fetch(requestSpec.endpoint, {
        method: "POST",
        headers: requestSpec.headers,
        body: JSON.stringify(requestSpec.body),
        signal: requestAbortController.signal
      });
    } catch (error) {
      if (requestAbortController.signal.aborted) {
        throw buildRequestAbortError(
          abortReason || `${requestAbortController.signal.reason || ""}`,
          config,
          batch.length
        );
      }

      throw error;
    }

    clearTimeout(firstResponseTimer);

    await reportStage({
      message: ux(
        "第 2 阶段：模型已响应，正在读取返回内容。",
        "Stage 2: the model has responded and the body is being read."
      ),
      detail: ux(
        "已经收到服务器响应头，接下来会读取文本并进行 JSON 提取。",
        "Response headers have arrived. The extension will read the text and extract JSON next."
      )
    });

    let rawBody;
    try {
      rawBody = await response.text();
    } catch (error) {
      if (requestAbortController.signal.aborted) {
        throw buildRequestAbortError(
          abortReason || `${requestAbortController.signal.reason || ""}`,
          config,
          batch.length
        );
      }

      throw error;
    }

    if (!response.ok) {
      throw new Error(
        ux(
          `API 请求失败 (${response.status})：${truncate(rawBody, 280)}`,
          `API request failed (${response.status}): ${truncate(rawBody, 280)}`
        )
      );
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawBody);
    } catch (error) {
      throw new Error(
        ux(
          `API 返回了非 JSON 响应：${truncate(rawBody, 200)}`,
          `API returned a non-JSON response: ${truncate(rawBody, 200)}`
        )
      );
    }

    const content = Providers.extractText(parsedResponse, config.provider);
    if (!content) {
      throw new Error(
        ux(
          "模型返回为空，未获取到可解析的文本内容。",
          "The model returned empty content, so there was no parsable text."
        )
      );
    }

    await reportStage({
      message: ux(
        "第 3 阶段：模型文本已收到，正在提取并解析 JSON。",
        "Stage 3: model text received. Extracting and parsing JSON."
      ),
      detail: ux(
        "后台会自动剥离 ```json 代码块和多余说明文字，只保留合法 JSON 数组。",
        "The extension removes ```json fences and extra explanations automatically, then keeps only a valid JSON array."
      )
    });

    try {
      return JsonUtils.extractJsonArray(content);
    } catch (error) {
      throw new Error(
        ux(
          `模型返回内容无法解析为 JSON 数组。请检查 Prompt 或模型能力。原始片段：${truncate(
            content,
            220
          )}`,
          `The model output could not be parsed as a JSON array. Check the prompt or the model capability. Raw snippet: ${truncate(
            content,
            220
          )}`
        )
      );
    }
  } finally {
    clearTimeout(firstResponseTimer);
    clearTimeout(totalTimeoutTimer);
    activeModelAbortControllers.delete(requestAbortController);
    if (activeAbortController === requestAbortController) {
      activeAbortController = null;
    }
  }
}

function buildModelBookmarkInputPayload(batch) {
  return (Array.isArray(batch) ? batch : []).map((item) => ({
    id: String(item?.id || ""),
    title: compactModelText(item?.title || t("untitledBookmark"), MODEL_INPUT_TITLE_MAX_LENGTH),
    url: compactModelUrl(item?.url || ""),
    currentPath: compactModelText(
      Array.isArray(item?.currentPath) ? item.currentPath.join(" / ") : item?.currentPath || ROOT_DIRECT_FOLDER_TITLE,
      MODEL_INPUT_PATH_MAX_LENGTH
    )
  }));
}

function compactModelText(value, maxLength) {
  return truncate(
    String(value || "")
      .replace(/\s+/g, " ")
      .trim(),
    maxLength
  );
}

function compactModelUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return "";
  }

  try {
    const url = new URL(rawUrl.trim());
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    const keptParams = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|msclkid|yclid|spm|si|ref|ref_src|igshid)$/i.test(key)) {
        continue;
      }

      keptParams.push([key, compactModelText(value, 80)]);
    }

    keptParams.sort(([a], [b]) => a.localeCompare(b));
    url.search = "";
    for (const [key, value] of keptParams.slice(0, 6)) {
      url.searchParams.append(key, value);
    }

    return truncate(url.toString(), MODEL_INPUT_URL_MAX_LENGTH);
  } catch (error) {
    return compactModelText(rawUrl, MODEL_INPUT_URL_MAX_LENGTH);
  }
}

function buildClassificationMessages(
  batch,
  customPrompt,
  taxonomyLocks = {},
  taxonomyTopFolders = []
) {
  const strategyPrompt = buildModelStrategyPrompt(customPrompt || DEFAULT_PROMPT);
  const isZh = I18N.locale === "zh_CN";
  const allowedTopFolders = normalizeTopLevelFolderList(
    Array.isArray(taxonomyTopFolders) && taxonomyTopFolders.length
      ? taxonomyTopFolders
      : buildTaxonomyFallbackTopFolders()
  );
  const inputPayload = buildModelBookmarkInputPayload(batch);
  const lockLines = Object.entries(taxonomyLocks)
    .sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
    .slice(0, 80)
    .map(([subfolder, topLevel]) =>
      isZh ? `- ${subfolder} 必须放到 ${topLevel}` : `- ${subfolder} must stay under ${topLevel}`
    )
    .join("\n");

  return [
    {
      role: "system",
      content: isZh
        ? "你是一个非常严格的书签整理助手。你只能输出合法 JSON，不能输出解释、Markdown、注释或额外文本。"
        : "You are a very strict bookmark organizer. You must output valid JSON only. Do not output explanations, Markdown, comments, or extra text."
    },
    {
      role: "user",
      content: isZh
        ? `${strategyPrompt}

请严格遵守下面的输出约束：
1. 你只能输出 JSON 数组，不要输出 \`\`\`json、说明文字或开场白。
2. 数组里必须覆盖所有输入 id，且每个 id 恰好出现一次。
3. 输出结构必须是：
[
  {
    "id": "书签ID",
    "action": "keep 或 delete_duplicate",
    "folderPath": ["一级目录", "二级目录可选"],
    "duplicateOf": "如果 action 是 delete_duplicate，则填写被保留书签的 id，否则留空字符串"
  }
]
4. folderPath 必须是 1 到 2 层字符串数组；如果 action 是 delete_duplicate，也仍然要返回一个简短 folderPath，建议填 ["重复书签"]。
5. 先做去重判断，再做分类。请比较当前整批输入，优先识别重复入口。
6. 以下情况优先视为重复：规范化后 URL 相同；只差 http/https、www、结尾斜杠、锚点、明显追踪参数；或同一网站的移动版/桌面版、短链接/长链接但实际落到同一内容页。
7. 选择保留项时，优先保留 https、标题更完整清晰、参数更少、非移动版、非短链接、可读性更好的 URL。
8. 搜索结果页、列表页、登录后页面、带会话参数页面要保守；如果无法确认重复，不要删除，action 必须返回 keep。
9. 一级目录必须只从这个全局目录方案中选择：${allowedTopFolders.join("、")}。
10. 如果同一个二级目录名已经被固定归属到某个一级目录，你必须复用该归属，不能换父目录。
11. 信息不足时统一归入 ["${MANUAL_FOLDER_TITLE}"]。
12. 输入中的 url 和 currentPath 已经压缩过，用它们判断主题即可，不要在输出中复写 URL。

已有固定归属：
${lockLines || "- 当前还没有已锁定的二级目录归属"}

以下是待整理书签：
${JSON.stringify(inputPayload)}`
        : `${strategyPrompt}

Follow these output rules exactly:
1. Output a JSON array only. Do not output \`\`\`json, explanations, or introductions.
2. The array must cover every input id exactly once.
3. The schema must be:
[
  {
    "id": "bookmark id",
    "action": "keep or delete_duplicate",
    "folderPath": ["top level", "optional second level"],
    "duplicateOf": "If action is delete_duplicate, fill in the kept bookmark id, otherwise use an empty string"
  }
]
4. folderPath must be a string array with 1 or 2 levels. If action is delete_duplicate, still return a short folderPath, for example ["Duplicate Bookmarks"].
5. Decide duplicates before classification. Compare the whole current batch first and prioritize identifying duplicate entries.
6. Treat bookmarks as duplicates first when the normalized URL is the same, when the only differences are http/https, www, trailing slash, fragment, or obvious tracking parameters, or when mobile/desktop or short/long links clearly land on the same content page.
7. When choosing the kept bookmark, prefer https, clearer titles, fewer parameters, non-mobile pages, non-short links, and the more canonical-looking URL.
8. Be conservative with search pages, listing pages, logged-in pages, or session-specific URLs. If duplicate status is uncertain, do not delete it. action must be keep.
9. The top-level folder must be chosen only from this global taxonomy: ${allowedTopFolders.join(", ")}.
10. If a second-level folder has already been locked under a top-level folder, you must reuse that parent and not move it elsewhere.
11. If information is insufficient, place the bookmark in ["${MANUAL_FOLDER_TITLE}"].
12. The input url and currentPath fields are compacted for speed. Use them to infer the topic, but do not copy URLs into the output.

Locked mappings:
${lockLines || "- No locked second-level mappings yet"}

Bookmarks to organize:
${JSON.stringify(inputPayload)}`
    }
  ];
}

function normalizeClassificationResults(results, batch) {
  const resultMap = new Map();
  const batchIdSet = new Set(batch.map((item) => item.id));

  for (const entry of Array.isArray(results) ? results : []) {
    if (!entry || !batchIdSet.has(String(entry.id))) {
      continue;
    }

    resultMap.set(String(entry.id), {
      action: normalizeAction(entry.action),
      folderPath: normalizeFolderPath(entry.folderPath ?? entry.path ?? entry.category),
      duplicateOf: typeof entry.duplicateOf === "string" ? entry.duplicateOf.trim() : ""
    });
  }

  return batch.map((item) => ({
    id: item.id,
    action: resultMap.get(item.id)?.action || "keep",
    folderPath: resultMap.get(item.id)?.folderPath || [MANUAL_FOLDER_TITLE],
    duplicateOf: resultMap.get(item.id)?.duplicateOf || ""
  }));
}

function canonicalizeFolderName(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (MANUAL_FOLDER_ALIASES.includes(trimmed)) {
    return MANUAL_FOLDER_TITLE;
  }

  return trimmed;
}

function isRootDirectFolderAlias(value) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized ? ROOT_DIRECT_FOLDER_ALIASES.includes(normalized) : false;
}

function isRootDirectFolderPath(folderPath) {
  return Array.isArray(folderPath) && folderPath[0] === ROOT_DIRECT_FOLDER_MARKER;
}

function normalizeFolderPath(folderPath) {
  const rawSegments = Array.isArray(folderPath)
    ? folderPath
    : typeof folderPath === "string"
      ? folderPath.split(/\/|>|\\|\||｜|→|➡/g)
      : [];

  const cleaned = rawSegments
    .map((segment) => canonicalizeFolderName(sanitizeFolderName(segment)))
    .filter(Boolean)
    .filter((segment) => !isForbiddenManagedFolderName(segment))
    .filter((segment, index, arr) => arr.indexOf(segment) === index)
    .slice(0, 2);

  if (cleaned.includes(MANUAL_FOLDER_TITLE)) {
    return [MANUAL_FOLDER_TITLE];
  }

  if (cleaned.length && isRootDirectFolderAlias(cleaned[0])) {
    return [ROOT_DIRECT_FOLDER_MARKER];
  }

  return cleaned.length ? cleaned : [MANUAL_FOLDER_TITLE];
}

function normalizePreservedFolderPath(folderPath) {
  const rawSegments = Array.isArray(folderPath) ? folderPath : [];

  const cleaned = rawSegments
    .map((segment) => canonicalizeFolderName(sanitizeFolderName(segment)))
    .filter(Boolean)
    .filter((segment) => !isForbiddenManagedFolderName(segment))
    .slice(0, 2);

  if (cleaned.includes(MANUAL_FOLDER_TITLE)) {
    return [MANUAL_FOLDER_TITLE];
  }

  return cleaned;
}

function sanitizeFolderName(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/[\r\n\t]/g, " ")
    .replace(/[\/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function appendLimitedEntries(existingEntries, nextEntries, maxLength = 80) {
  const safeExisting = Array.isArray(existingEntries) ? existingEntries : [];
  const safeNext = Array.isArray(nextEntries) ? nextEntries.filter(Boolean) : [];

  if (!safeNext.length) {
    return safeExisting.slice(-maxLength);
  }

  return [...safeExisting, ...safeNext].slice(-maxLength);
}

function appendPlanEntries(existingEntries, nextEntries) {
  const safeExisting = Array.isArray(existingEntries) ? existingEntries : [];
  const safeNext = Array.isArray(nextEntries) ? nextEntries.filter(Boolean) : [];
  return [...safeExisting, ...safeNext];
}

function buildLogEntry(kind, bookmark, reason, suggestion) {
  return {
    id: crypto.randomUUID(),
    bookmarkId: bookmark?.id || "",
    kind,
    title: bookmark?.title || t("untitledBookmark"),
    url: bookmark?.url || "",
    reason,
    suggestion,
    createdAt: new Date().toISOString()
  };
}

function buildBatchClassificationPlan(batch, normalizedResults) {
  const resultMap = new Map(normalizedResults.map((item) => [item.id, item]));
  const keepEntries = [];
  let keepCount = 0;
  let deletedCount = 0;
  let warningCount = 0;
  let lastWarning = "";
  const warningEntries = [];
  const deletedEntries = [];

  for (const bookmark of batch) {
    const plan = resultMap.get(bookmark.id) || {
      action: "keep",
      folderPath: [MANUAL_FOLDER_TITLE],
      duplicateOf: ""
    };

    if (plan.action === "delete_duplicate") {
      deletedCount += 1;
      deletedEntries.push(
        buildLogEntry(
          "duplicate_deleted",
          bookmark,
          ux(
            "检测到同一 URL 的重复书签，重建时不会保留当前重复项。",
            "Duplicate bookmarks with the same URL were detected. The current duplicate will not be kept during rebuild."
          ),
          ux(
            "如果这是你刻意保留的多个入口，可以稍后手动重新添加，或在整理前把该网站加入白名单。",
            "If you intentionally keep multiple entries, you can add it back manually later or whitelist that site before organizing."
          )
        )
      );
      continue;
    }

    keepEntries.push({
      title: bookmark.title || t("untitledBookmark"),
      url: bookmark.url,
      folderPath: normalizeFolderPath(plan.folderPath)
    });
    keepCount += 1;
  }

  return {
    keepEntries,
    keepCount,
    deletedCount,
    warningCount,
    lastWarning,
    warningEntries,
    deletedEntries
  };
}

async function rebuildOrganizedBookmarks(job) {
  const tree = await chrome.bookmarks.getTree();
  const bookmarkBarNode = findBookmarksBarNode(tree);
  const rootFolderId = bookmarkBarNode.id;
  const rootFolderName = bookmarkBarNode.title || "BOOKMARK_BAR";
  const unresolvedFolderId = await findExistingUnresolvedFolderId(rootFolderId);
  const preservedTopLevelIds = new Set([
    unresolvedFolderId,
    ...(Array.isArray(job.protectedRootFolderIds) ? job.protectedRootFolderIds : [])
  ].filter(Boolean));
  const currentChildren = await chrome.bookmarks.getChildren(rootFolderId);
  const folderCache = { [rootFolderName]: rootFolderId };
  const managedFolderIds = [];
  const managedRootBookmarkIds = [];
  const planEntries = [
    ...(Array.isArray(job.preservedBookmarks) ? job.preservedBookmarks : []),
    ...(Array.isArray(job.plannedBookmarks) ? job.plannedBookmarks : [])
  ];
  const orderedPlanEntries = [...planEntries].sort((a, b) => {
    const aRoot = isRootDirectFolderPath(a?.folderPath);
    const bRoot = isRootDirectFolderPath(b?.folderPath);
    if (aRoot !== bRoot) {
      return aRoot ? -1 : 1;
    }

    return 0;
  });
  let createdCount = 0;
  let rootDirectInsertIndex = 0;
  const preservedCount = Array.isArray(job.preservedBookmarks) ? job.preservedBookmarks.length : 0;

  for (const child of currentChildren) {
    if (isBackupFolderNode(child) || preservedTopLevelIds.has(child.id)) {
      continue;
    }

    if (child.url) {
      await chrome.bookmarks.remove(child.id);
    } else {
      await chrome.bookmarks.removeTree(child.id);
    }
  }

  for (const entry of orderedPlanEntries) {
    if (!entry?.url) {
      continue;
    }

    const folderId = await ensureFolderPath(
      rootFolderId,
      rootFolderName,
      Array.isArray(entry.folderPath) ? entry.folderPath : [],
      folderCache,
      managedFolderIds
    );
    const createPayload = {
      parentId: folderId,
      title: entry.title || t("untitledBookmark"),
      url: entry.url
    };
    if (folderId === rootFolderId && isRootDirectFolderPath(entry.folderPath)) {
      createPayload.index = rootDirectInsertIndex;
      rootDirectInsertIndex += 1;
    }

    const createdBookmark = await chrome.bookmarks.create(createPayload);
    if (folderId === rootFolderId && isRootDirectFolderPath(entry.folderPath)) {
      managedRootBookmarkIds.push(createdBookmark.id);
    }
    createdCount += 1;
  }

  const realizedWarnings = [];
  const pendingWarnings = Array.isArray(job.pendingWarnings) ? job.pendingWarnings : [];
  if (pendingWarnings.length) {
    const pendingFolderId = await ensureUnresolvedFolder(rootFolderId);
    for (const entry of pendingWarnings) {
      if (!entry?.url) {
        continue;
      }

      const bookmarkNode = await chrome.bookmarks.create({
        parentId: pendingFolderId,
        title: entry.title || t("untitledBookmark"),
        url: entry.url
      });
      realizedWarnings.push(
        buildLogEntry(
          entry.kind || "scan_uncertain",
          bookmarkNode,
          entry.reason || ux("该书签暂未自动处理。", "This bookmark was not handled automatically yet."),
          entry.suggestion || ux("建议手动确认后再决定是否删除。", "Check it manually before deciding whether to delete it.")
        )
      );
      createdCount += 1;
    }
  }

  return {
    createdCount,
    preservedCount,
    warningEntries: realizedWarnings,
    managedFolderIds: Array.from(new Set(managedFolderIds)),
    managedRootBookmarkIds: Array.from(new Set(managedRootBookmarkIds))
  };
}

async function removeBookmarkIfExists(bookmarkId) {
  if (!bookmarkId) {
    return;
  }

  try {
    await chrome.bookmarks.remove(bookmarkId);
  } catch (error) {
    // Ignore if the bookmark has already been removed or moved.
  }
}

async function getBookmarkById(bookmarkId) {
  if (!bookmarkId) {
    return null;
  }

  try {
    const nodes = await chrome.bookmarks.get(bookmarkId);
    return nodes?.[0] || null;
  } catch (error) {
    return null;
  }
}

async function ensureFolderPath(rootFolderId, rootFolderName, folderPath, folderCache, managedFolderIds) {
  if (!Array.isArray(folderPath) || !folderPath.length || isRootDirectFolderPath(folderPath)) {
    return rootFolderId;
  }

  let parentId = rootFolderId;
  let currentPathKey = rootFolderName;

  for (let index = 0; index < folderPath.length; index += 1) {
    const segment = folderPath[index];
    if (!segment || isForbiddenManagedFolderName(segment)) {
      continue;
    }
    currentPathKey = `${currentPathKey}/${segment}`;

    if (folderCache[currentPathKey]) {
      parentId = folderCache[currentPathKey];
      if (index === 0 && !managedFolderIds.includes(parentId)) {
        managedFolderIds.push(parentId);
      }
      continue;
    }

    const children = await chrome.bookmarks.getChildren(parentId);
    let folder =
      index === 0
        ? children.find(
            (node) => !node.url && node.title === segment && managedFolderIds.includes(node.id)
          )
        : children.find((node) => !node.url && node.title === segment);

    if (!folder) {
      folder = await chrome.bookmarks.create({
        parentId,
        title: segment
      });
    }

    folderCache[currentPathKey] = folder.id;
    if (index === 0 && !managedFolderIds.includes(folder.id)) {
      managedFolderIds.push(folder.id);
    }
    parentId = folder.id;
  }

  return parentId;
}

function isAbortError(error) {
  return error?.abortReason === "cancelled-by-user";
}

function isModelTimeoutError(error) {
  if (["first-response-timeout", "request-timeout"].includes(error?.abortReason)) {
    return true;
  }

  const text = [error?.message, error?.userMessage, error?.userDetail]
    .filter(Boolean)
    .join(" ");
  return /first-response-timeout|request-timeout|15 秒|25 秒|45 秒|90 秒|within 15 seconds|within 25 seconds|within 45 seconds|within 90 seconds/i.test(text);
}

function normalizeRetryBatchSize(rawValue, fallback = MIN_BATCH_SIZE) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.max(MIN_AUTO_RETRY_BATCH_SIZE, parsed);
}

async function retryCurrentBatchWithSmallerBatch(job, error) {
  if (!job || job.phase !== "running" || job.jobType !== "organize") {
    return false;
  }

  const oldBatchSize = normalizeRetryBatchSize(job.batchSize);
  const remaining = Math.max(0, Number(job.total || 0) - Number(job.processed || 0));
  const attemptedBatchLength = Math.max(
    0,
    Number.parseInt(String(error?.batchLength || Math.min(oldBatchSize, remaining)), 10)
  );
  const retryBasis = Math.min(oldBatchSize, attemptedBatchLength || oldBatchSize);

  if (retryBasis <= MIN_AUTO_RETRY_BATCH_SIZE || oldBatchSize <= MIN_AUTO_RETRY_BATCH_SIZE) {
    return false;
  }

  const nextBatchSize = Math.max(
    MIN_AUTO_RETRY_BATCH_SIZE,
    Math.min(MAX_AUTO_RETRY_BATCH_SIZE, Math.floor(retryBasis / 2))
  );

  if (nextBatchSize >= oldBatchSize) {
    return false;
  }

  const nextJob = {
    ...job,
    batchSize: nextBatchSize,
    totalBatches: Math.ceil(job.total / nextBatchSize),
    timeoutRetryCount: Number(job.timeoutRetryCount || 0) + 1,
    config: {
      ...job.config,
      batchSize: nextBatchSize
    }
  };
  const currentBatch = Math.floor(nextJob.processed / nextBatchSize) + 1;

  await chrome.storage.local.set({
    [STORAGE_KEYS.job]: nextJob
  });

  await updateBatchStatus(nextJob, currentBatch, {
    message: ux(
      `${getRuntimeProviderLabel(nextJob.config)} 响应过慢，已自动把批大小从 ${oldBatchSize} 降到 ${nextBatchSize} 并重试当前批次。`,
      `${getRuntimeProviderLabel(nextJob.config)} was too slow, so the batch size was automatically reduced from ${oldBatchSize} to ${nextBatchSize} and the current batch will retry.`
    ),
    detail: ux(
      "这次重试不会丢失已经完成的批次，也不会改动原书签结构；如果 2 条仍然慢，会继续拆成 1 条的临时小批次后再停止。",
      "Completed batches are kept and the original bookmark tree is still unchanged. If two items are still slow, the extension can retry as a one-bookmark mini-batch before stopping."
    )
  });

  await scheduleNextBatch();
  return true;
}

function toUserMessage(error, fallback) {
  if (error?.message) {
    return error.message;
  }

  return fallback;
}

function truncate(value, maxLength = 140) {
  if (typeof value !== "string") {
    return "";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function normalizeBatchSize(rawValue, fallback = DEFAULT_BATCH_SIZE) {
  const parsed = Number.parseInt(String(rawValue ?? fallback), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(100, Math.max(MIN_BATCH_SIZE, parsed));
}

function normalizePreviewPlanBatchSize(rawValue, fallback = DEFAULT_BATCH_SIZE) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return normalizeBatchSize(fallback);
  }

  return Math.min(100, Math.max(MIN_AUTO_RETRY_BATCH_SIZE, parsed));
}

function normalizeRunningOrganizeJobRuntime(job) {
  if (!job || job.jobType !== "organize" || !job.config) {
    return {
      job,
      changed: false
    };
  }

  const cappedRuntimeBatchSize = getRuntimeBatchSize(job.config);
  const storedBatchSize = normalizeRetryBatchSize(job.batchSize, cappedRuntimeBatchSize);
  const runtimeBatchSize = Math.min(storedBatchSize, cappedRuntimeBatchSize);
  const total = Math.max(0, Number(job.total || 0));
  const totalBatches = total ? Math.ceil(total / runtimeBatchSize) : Number(job.totalBatches || 0);
  const changed =
    storedBatchSize !== runtimeBatchSize ||
    Number(job.config.batchSize || 0) !== runtimeBatchSize ||
    Number(job.totalBatches || 0) !== totalBatches;

  if (!changed) {
    return {
      job,
      changed: false
    };
  }

  return {
    job: {
      ...job,
      batchSize: runtimeBatchSize,
      totalBatches,
      config: {
        ...job.config,
        batchSize: runtimeBatchSize
      }
    },
    changed: true
  };
}

function normalizeLinkCheckMode(rawValue) {
  return rawValue === LINK_CHECK_MODE_COMPLETE ? LINK_CHECK_MODE_COMPLETE : LINK_CHECK_MODE_FAST;
}

function shouldCheckDeadLinks(config = {}) {
  return normalizeLinkCheckMode(config.linkCheckMode) === LINK_CHECK_MODE_COMPLETE;
}

function shouldPlanGlobalTaxonomy(config = {}) {
  return normalizeLinkCheckMode(config.linkCheckMode) === LINK_CHECK_MODE_COMPLETE;
}

function normalizeAutoInterval(rawValue) {
  const parsed = Number.parseInt(String(rawValue ?? 24), 10);
  if (!Number.isFinite(parsed)) {
    return 24;
  }

  return Math.min(168, Math.max(1, parsed));
}

function normalizePromptValue(promptValue) {
  if (typeof promptValue !== "string" || !promptValue.trim()) {
    return DEFAULT_PROMPT;
  }

  return I18N.isBuiltInPromptValue(promptValue) || promptValue.trim() === LEGACY_DEFAULT_PROMPT.trim()
    ? DEFAULT_PROMPT
    : promptValue;
}

async function loadClassificationCacheStore() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.classificationCache);
  const rawStore = stored[STORAGE_KEYS.classificationCache];
  return rawStore && typeof rawStore === "object" ? rawStore : {};
}

function normalizeClassificationCacheBucket(rawBucket) {
  const entries = Object.entries(rawBucket && typeof rawBucket === "object" ? rawBucket : {})
    .filter(([fingerprint, entry]) => {
      return (
        typeof fingerprint === "string" &&
        fingerprint &&
        Array.isArray(entry?.folderPath) &&
        entry.folderPath.length
      );
    })
    .map(([fingerprint, entry]) => [
      fingerprint,
      {
        folderPath: normalizeFolderPath(entry.folderPath),
        updatedAt: entry.updatedAt || new Date().toISOString()
      }
    ]);

  return Object.fromEntries(entries.slice(-MAX_CLASSIFICATION_CACHE_ITEMS));
}

async function saveClassificationCacheBucket(signature, bucket) {
  if (!signature) {
    return;
  }

  const store = await loadClassificationCacheStore();
  const normalizedBucket = normalizeClassificationCacheBucket(bucket);
  const nextStore = {
    ...store,
    [signature]: {
      updatedAt: new Date().toISOString(),
      items: normalizedBucket
    }
  };

  const ordered = Object.entries(nextStore).sort(
    (a, b) => Number(new Date(b[1]?.updatedAt || 0)) - Number(new Date(a[1]?.updatedAt || 0))
  );
  const limited = Object.fromEntries(ordered.slice(0, MAX_CLASSIFICATION_SIGNATURES));

  await chrome.storage.local.set({
    [STORAGE_KEYS.classificationCache]: limited
  });
}

async function loadDeadLinkCache() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.deadLinkCache);
  const rawCache = stored[STORAGE_KEYS.deadLinkCache];
  return rawCache && typeof rawCache === "object" ? rawCache : {};
}

async function saveDeadLinkCache(cache) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.deadLinkCache]: CacheUtils.trimCacheEntries(cache)
  });
}

function buildPreviewFolderSummary(planEntries, pendingWarnings = []) {
  const counts = new Map();

  for (const entry of Array.isArray(planEntries) ? planEntries : []) {
    if (!entry?.url) {
      continue;
    }

    const topLevel = isRootDirectFolderPath(entry.folderPath)
      ? ROOT_DIRECT_FOLDER_TITLE
      : Array.isArray(entry.folderPath) && entry.folderPath.length
        ? entry.folderPath[0]
        : MANUAL_FOLDER_TITLE;
    counts.set(topLevel, (counts.get(topLevel) || 0) + 1);
  }

  if (Array.isArray(pendingWarnings) && pendingWarnings.length) {
    counts.set(MANUAL_FOLDER_TITLE, (counts.get(MANUAL_FOLDER_TITLE) || 0) + pendingWarnings.length);
  }

  return Array.from(counts.entries())
    .map(([title, totalBookmarks]) => ({
      id: title,
      title,
      totalBookmarks
    }))
    .sort((a, b) => {
      const aRoot = a.title === ROOT_DIRECT_FOLDER_TITLE;
      const bRoot = b.title === ROOT_DIRECT_FOLDER_TITLE;
      if (aRoot !== bRoot) {
        return aRoot ? -1 : 1;
      }

      return b.totalBookmarks - a.totalBookmarks || a.title.localeCompare(b.title, "zh-CN");
    });
}

function buildTaxonomyFallbackTopFolders() {
  return isZh
    ? [
        "AI/技术",
        "学习/教程",
        "工具/效率",
        "产品/设计",
        "资讯/社区",
        "购物/服务",
        "娱乐/内容",
        "生活/资源",
        MANUAL_FOLDER_TITLE
      ]
    : [
        "AI & Tech",
        "Learning & Tutorials",
        "Tools & Productivity",
        "Product & Design",
        "News & Communities",
        "Shopping & Services",
        "Entertainment & Content",
        "Life & Resources",
        MANUAL_FOLDER_TITLE
      ];
}

function applyTaxonomyLocks(results, existingLocks = {}) {
  const nextLocks = { ...(existingLocks || {}) };
  const lockedResults = results.map((item) => {
    if (item.action !== "keep" || !Array.isArray(item.folderPath) || item.folderPath.length < 2) {
      return item;
    }

    const [topLevel, subfolder] = item.folderPath;
    const lockKey = normalizeTaxonomyLockKey(subfolder);
    if (!lockKey) {
      return item;
    }

    const lockedTopLevel = nextLocks[lockKey];
    if (lockedTopLevel && lockedTopLevel !== topLevel) {
      return {
        ...item,
        folderPath: [lockedTopLevel, subfolder]
      };
    }

    nextLocks[lockKey] = topLevel;
    return item;
  });

  return {
    results: lockedResults,
    taxonomyLocks: nextLocks
  };
}

function normalizeTaxonomyLockKey(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

async function updateBatchStatus(job, currentBatch, patch) {
  return updateStatus({
    phase: "running",
    cancelRequested: Boolean(job.cancelRequested),
    provider: job.jobType === "dead_scan" ? "" : getRuntimeProviderLabel(job.config),
    model: job.jobType === "dead_scan" ? "" : job.config.model,
    total: job.total,
    processed: job.processed,
    moved: job.moved,
    deleted: job.deleted,
    reused: job.reused || 0,
    aiClassified: job.aiClassified || 0,
    batchSize: job.batchSize,
    warningCount: job.warningCount,
    lastWarning: job.lastWarning || "",
    warnings: Array.isArray(job.warnings) ? job.warnings : currentStatus.warnings || [],
    deletedItems: Array.isArray(job.deletedItems)
      ? job.deletedItems
      : currentStatus.deletedItems || [],
    previewFolders: Array.isArray(job.previewFolders) ? job.previewFolders : currentStatus.previewFolders || [],
    protectedRootCount: Array.isArray(job.protectedRootFolderIds) ? job.protectedRootFolderIds.length : currentStatus.protectedRootCount || 0,
    currentBatch,
    totalBatches: job.totalBatches,
    startedAt: job.startedAt,
    finishedAt: "",
    ...patch
  });
}

async function withKeepAlive(task, onHeartbeatStart = null) {
  let intervalId = null;

  try {
    await chrome.runtime.getPlatformInfo();
    if (typeof onHeartbeatStart === "function") {
      await onHeartbeatStart();
    }

    intervalId = setInterval(() => {
      chrome.runtime.getPlatformInfo().catch(() => {});
    }, KEEP_ALIVE_INTERVAL_MS);

    return await task();
  } finally {
    if (intervalId !== null) {
      clearInterval(intervalId);
    }
  }
}

function buildRequestAbortError(reason, config, batchLength) {
  const providerLabel = getRuntimeProviderLabel(config);
  const firstResponseTimeoutSeconds = formatTimeoutSeconds(getFirstResponseTimeoutMs(config));
  const requestTimeoutSeconds = formatTimeoutSeconds(getRequestTimeoutMs(config));

  if (reason === "first-response-timeout") {
    const error = buildUserFacingError(
      ux(
        `${providerLabel} 在 ${firstResponseTimeoutSeconds} 秒内没有返回响应，任务已提前停止。`,
        `${providerLabel} did not return a response within ${firstResponseTimeoutSeconds} seconds, so the task was stopped early.`
      ),
      ux(
        `这通常意味着模型首包太慢，容易撞到 Chrome Manifest V3 后台生命周期限制。Marko 已按慢模型策略拆小请求；如果仍然超时，请换更快模型或检查接口排队。当前模型请求批量：${batchLength}。`,
        `This usually means the first token was too slow and may hit Chrome Manifest V3 service worker lifetime limits. Marko already split the work with the slow-model profile; if it still times out, switch to a faster model or check endpoint queueing. Current model-request batch size: ${batchLength}.`
      ),
      reason
    );
    error.batchLength = batchLength;
    return error;
  }

  if (reason === "request-timeout") {
    const error = buildUserFacingError(
      ux(
        `${providerLabel} 请求超过 ${requestTimeoutSeconds} 秒仍未完成，任务已停止。`,
        `${providerLabel} did not finish within ${requestTimeoutSeconds} seconds, so the task was stopped.`
      ),
      ux(
        `模型虽然可能已经开始处理，但完整响应仍然过慢。Marko 已按慢模型策略拆小请求；如果仍然超时，请换更快模型或确认接口没有卡在排队状态。当前模型请求批量：${batchLength}。`,
        `The model may have started working, but the full response was still too slow. Marko already split the work with the slow-model profile; if it still times out, switch to a faster model or confirm the endpoint is not stuck in queue. Current model-request batch size: ${batchLength}.`
      ),
      reason
    );
    error.batchLength = batchLength;
    return error;
  }

  if (reason === "cancelled-by-user") {
    return buildUserFacingError(
      ux("任务已被你取消。", "The task was cancelled by you."),
      ux("后台已经中止当前模型请求，不会继续处理后续批次。", "The current model request has been aborted and later batches will not continue."),
      reason
    );
  }

  return buildUserFacingError(
    ux("模型请求被中止，任务已停止。", "The model request was aborted and the task has stopped."),
    ux(
      "如果这不是你主动取消的，请检查网络连接、接口稳定性，或先调小批大小后重试。",
      "If you did not cancel it yourself, check the network connection, endpoint stability, or try again with a smaller batch size."
    ),
    reason
  );
}

function buildUserFacingError(message, detail = "", abortReason = "") {
  const error = new Error(message);
  error.userMessage = message;
  error.userDetail = detail;
  error.abortReason = abortReason;
  return error;
}

function normalizeAction(value) {
  return value === "delete_duplicate" ? "delete_duplicate" : "keep";
}

function buildExactDuplicatePlans(batch) {
  return batch
    .filter((bookmark) => bookmark.exactDuplicateOf)
    .map((bookmark) => ({
      id: bookmark.id,
      action: "delete_duplicate",
      folderPath: [DUPLICATE_FOLDER_TITLE],
      duplicateOf: bookmark.exactDuplicateOf
    }));
}

function markHealthyExactDuplicates(bookmarks, rawSeenByUrl = {}) {
  const seenByUrl = { ...(rawSeenByUrl || {}) };

  return {
    bookmarks: bookmarks.map((bookmark) => {
      const normalizedUrl = normalizeUrlForDuplicateCheck(bookmark.url);
      const duplicateOf = normalizedUrl ? seenByUrl[normalizedUrl] || "" : "";

      if (normalizedUrl && !duplicateOf) {
        seenByUrl[normalizedUrl] = bookmark.id;
      }

      return {
        ...bookmark,
        exactDuplicateOf: duplicateOf
      };
    }),
    seenByUrl
  };
}

function normalizeUrlForDuplicateCheck(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return "";
  }

  try {
    const url = new URL(rawUrl.trim());
    url.hash = "";

    const keptParams = [];
    for (const [key, value] of url.searchParams.entries()) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|spm|si|ref)$/i.test(key)) {
        continue;
      }

      keptParams.push([key, value]);
    }

    keptParams.sort(([a], [b]) => a.localeCompare(b));
    url.search = "";
    for (const [key, value] of keptParams) {
      url.searchParams.append(key, value);
    }

    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";

    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }

    return url.toString();
  } catch (error) {
    return rawUrl.trim();
  }
}
