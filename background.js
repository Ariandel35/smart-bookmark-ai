const STORAGE_KEYS = {
  config: "smartBookmarkConfig",
  status: "smartBookmarkJobStatus",
  job: "smartBookmarkActiveJob",
  rootFolderId: "smartBookmarkRootFolderId",
  managedFolderIds: "smartBookmarkManagedFolderIds",
  latestBackupFolderId: "smartBookmarkLatestBackupFolderId",
  latestSnapshotBackupFolderId: "smartBookmarkLatestSnapshotBackupFolderId",
  backupRecords: "smartBookmarkBackupRecords",
  unresolvedFolderId: "smartBookmarkUnresolvedFolderId"
};

const ALARM_NAME = "smart-bookmark-ai-next-batch";
const AUTO_ORGANIZE_ALARM_NAME = "smart-bookmark-ai-auto-organize";
const HOST_ACCESS_ORIGINS = ["https://*/*", "http://*/*"];
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_DEAD_SCAN_BATCH_SIZE = 20;
const DEFAULT_ROOT_FOLDER = "Smart Bookmark AI";
const BACKUP_DB_NAME = "smart-bookmark-ai-backups";
const BACKUP_DB_VERSION = 1;
const BACKUP_DB_STORE = "snapshots";
const BACKUP_FOLDER_PREFIX = "书签整理备份";
const BACKUP_RECORD_PREFIX = "书签快照";
const DEAD_LINK_CHECK_TIMEOUT_MS = 10_000;
const DEAD_LINK_DELETE_STATUS_CODES = new Set([404, 410, 451]);
const KEEP_ALIVE_INTERVAL_MS = 25_000;
const FIRST_RESPONSE_TIMEOUT_MS = 25_000;
const REQUEST_TIMEOUT_MS = 90_000;
const NEXT_BATCH_DELAY_MS = 150;
const MAX_BACKUP_RECORDS = 10;

const LEGACY_DEFAULT_PROMPT = `你是一名资深信息架构师，请根据书签标题、URL 和现有路径，为每条书签分配稳定、可复用、便于长期维护的中文分类。

要求：
1. 优先使用宽泛且可长期复用的大类，不要给单个链接创建独占文件夹。
2. folderPath 控制在 1 到 3 层之间，命名简洁清晰。
3. 同类内容尽量归并，避免只在措辞上略有差异的重复分类。
4. 如果信息不足以准确判断，请放入“待手动分类”。`;

const DEFAULT_PROMPT = `你是一名极度克制的信息架构师，请整理浏览器书签，但目标不是“分类越细越专业”，而是“普通人以后能更快找到网页”。

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

const PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    requiresApiKey: true
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    requiresApiKey: true
  },
  minimax: {
    baseUrl: "https://api.minimaxi.com/v1",
    model: "MiniMax-M2.7",
    requiresApiKey: true
  },
  ollama: {
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2",
    requiresApiKey: false
  }
};

let currentStatus = buildIdleStatus();
let batchLock = false;
let activeAbortController = null;
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
  if (areaName !== "local" || !changes[STORAGE_KEYS.config]) {
    return;
  }

  void syncAutoOrganizeAlarm().catch((error) => {
    console.error("Failed to sync auto organize alarm after config change:", error);
  });
});

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

    if (message?.type === "START_ORGANIZE") {
      try {
        const result = await startOrganizeJob();
        sendResponse(result);
      } catch (error) {
        console.error("Failed to start organize job:", error);
        sendResponse({
          ok: false,
          error: toUserMessage(error, "启动书签整理任务失败。")
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
          error: toUserMessage(error, "创建手动备份失败。")
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
          error: toUserMessage(error, "读取备份列表失败。")
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
          error: toUserMessage(error, "恢复最近备份失败。")
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
          error: toUserMessage(error, "恢复备份失败。")
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
          error: toUserMessage(error, "删除备份失败。")
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
          error: toUserMessage(error, "处理未处理书签失败。")
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
          error: error?.userMessage || toUserMessage(error, "API 检测失败。"),
          detail:
            error?.userDetail ||
            "请检查 Base URL、API Key、模型名是否正确，或确认接口当前没有被风控/限流。"
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
          error: toUserMessage(error, "取消任务失败。")
        });
      }
      return;
    }

    sendResponse({ ok: false, error: "Unsupported message type." });
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
    message: "准备就绪，等待开始整理。",
    detail: "",
    provider: "",
    model: "",
    total: 0,
    processed: 0,
    moved: 0,
    deleted: 0,
    batchSize: DEFAULT_BATCH_SIZE,
    warningCount: 0,
    lastWarning: "",
    warnings: [],
    deletedItems: [],
    currentBatch: 0,
    totalBatches: 0,
    startedAt: "",
    finishedAt: "",
    updatedAt: new Date().toISOString(),
    ...overrides
  };
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

  try {
    await syncBackupRecords();
  } catch (error) {
    console.error("Failed to sync local backup records:", error);
  }

  if (stored[STORAGE_KEYS.job]?.phase !== "running") {
    try {
      const tree = await chrome.bookmarks.getTree();
      const bookmarkBarNode = findBookmarksBarNode(tree);
      await cleanupForbiddenAiRootFolders(bookmarkBarNode?.id);
    } catch (error) {
      console.error("Failed to clean forbidden Smart Bookmark root folders:", error);
    }
  }

}

function buildDefaultConfig(provider = "openai") {
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openai;

  return {
    provider,
    baseUrl: defaults.baseUrl,
    apiKey: "",
    model: defaults.model,
    batchSize: DEFAULT_BATCH_SIZE,
    autoOrganizeEnabled: false,
    autoOrganizeIntervalHours: 24,
    whitelistDomains: "",
    customPrompt: DEFAULT_PROMPT
  };
}

function mergeConfig(raw = {}) {
  const provider = raw.provider && PROVIDER_DEFAULTS[raw.provider] ? raw.provider : "openai";
  const defaults = buildDefaultConfig(provider);
  const promptValue =
    typeof raw.customPrompt === "string" && raw.customPrompt.trim()
      ? raw.customPrompt
      : defaults.customPrompt;

  return {
    provider,
    baseUrl: typeof raw.baseUrl === "string" && raw.baseUrl.trim() ? raw.baseUrl.trim() : defaults.baseUrl,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey.trim() : "",
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : defaults.model,
    batchSize: normalizeBatchSize(raw.batchSize),
    autoOrganizeEnabled: Boolean(raw.autoOrganizeEnabled),
    autoOrganizeIntervalHours: normalizeAutoInterval(raw.autoOrganizeIntervalHours),
    whitelistDomains:
      typeof raw.whitelistDomains === "string" ? raw.whitelistDomains.trim() : "",
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
    return true;
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

async function assertOrganizeHostAccess(trigger = "manual") {
  if (await hasBroadHostAccess()) {
    return;
  }

  if (trigger === "auto") {
    throw buildUserFacingError(
      "自动整理缺少网站访问权限，已跳过本次任务。",
      "请打开扩展设置页，点击“授权网站访问”后再继续使用自动整理。"
    );
  }

  throw buildUserFacingError(
    "缺少网站访问权限，无法开始整理。",
    "请先在弹窗开始整理时授权网站访问，或去设置页点击“授权网站访问”。"
  );
}

async function assertApiOriginAccess(baseUrl) {
  if (await hasOriginAccess(baseUrl)) {
    return;
  }

  throw buildUserFacingError(
    "缺少 API 访问权限。",
    "请在设置页检测 API 时授权当前接口域名，或先授权网站访问。"
  );
}

async function readStoredConfig() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.config);
  return mergeConfig(stored[STORAGE_KEYS.config]);
}

async function updateStatus(patch) {
  currentStatus = {
    ...currentStatus,
    ...patch,
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
    // Popup 关闭时发送消息会失败，忽略即可，状态已写入 storage.local。
  }

  return currentStatus;
}

async function startOrganizeJob(runContext = { trigger: "manual" }) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.job);
  const existingJob = stored[STORAGE_KEYS.job];

  if (existingJob?.phase === "running") {
    return {
      ok: false,
      error: "已经有一个后台整理任务在运行，请先等待完成或取消后再试。"
    };
  }

  const config = await readStoredConfig();
  validateConfig(config);
  await assertOrganizeHostAccess(runContext.trigger);

  const tree = await chrome.bookmarks.getTree();
  const bookmarkBarNode = findBookmarksBarNode(tree);
  const unresolvedFolderId = await findExistingUnresolvedFolderId(bookmarkBarNode.id);
  const whitelistMatcher = buildWhitelistMatcher(config.whitelistDomains);
  const collectedBookmarks = collectBookmarks(tree, {
    skipNodeIds: new Set([unresolvedFolderId].filter(Boolean))
  });
  const preservedBookmarks = collectedBookmarks
    .filter((bookmark) => whitelistMatcher(bookmark.url))
    .map((bookmark) => ({
      title: bookmark.title || "(无标题书签)",
      url: bookmark.url,
      folderPath: normalizePreservedFolderPath(bookmark.currentPath)
    }));
  const bookmarks = collectedBookmarks.filter((bookmark) => !whitelistMatcher(bookmark.url));

  if (!bookmarks.length) {
    await chrome.storage.local.remove(STORAGE_KEYS.job);
    await updateStatus(
      buildIdleStatus({
        phase: "completed",
        message: preservedBookmarks.length
          ? "当前书签都在白名单范围内，本次未改动。"
          : "没有发现需要整理的书签。",
        finishedAt: new Date().toISOString()
      })
    );

    return { ok: true };
  }

  const snapshotInfo = await createCurrentSnapshotBackup(
    bookmarkBarNode,
    runContext.trigger === "auto" ? "auto" : "manual"
  );

  if (collectedBookmarks.length && !snapshotInfo.created) {
    throw buildUserFacingError(
      "整理前备份失败，任务已停止。",
      "为避免直接改乱现有书签，扩展要求先成功创建快照备份后才会继续整理。请先检查书签栏权限或手动点击一次“手动备份”。"
    );
  }

  const totalBatches = Math.ceil(bookmarks.length / config.batchSize);
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  const job = {
    runId,
    jobType: "organize",
    phase: "running",
    cancelRequested: false,
    trigger: runContext.trigger || "manual",
    config,
    rootFolderId: bookmarkBarNode.id,
    rootFolderName: bookmarkBarNode.title || "BOOKMARK_BAR",
    batchSize: config.batchSize,
    total: bookmarks.length,
    totalBatches,
    processed: 0,
    moved: 0,
    deleted: 0,
    warningCount: 0,
    lastWarning: "",
    warnings: [],
    deletedItems: [],
    bookmarks,
    preservedBookmarks,
    plannedBookmarks: [],
    pendingWarnings: [],
    exactDuplicateSeenByUrl: {},
    taxonomyLocks: {},
    managedFolderIds: [],
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
      message: `已创建整理队列，共 ${bookmarks.length} 条书签，准备开始第 1 批。`,
      provider: config.provider,
      model: config.model,
      total: bookmarks.length,
      processed: 0,
      moved: 0,
      deleted: 0,
      batchSize: config.batchSize,
      warningCount: 0,
      warnings: [],
      deletedItems: [],
      currentBatch: 0,
      totalBatches,
      startedAt,
      finishedAt: "",
      detail: `${runContext.trigger === "auto" ? "这是一次自动静默整理。" : "这是一次手动整理。"} 批大小 ${config.batchSize}。${snapshotInfo.detail} 本次会先生成完整整理方案，最后再一次性清空旧结构并重建新结构，处理中不会边跑边改动现有书签。`.trim()
    })
  );

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
        message: "当前没有正在执行的整理任务。",
        finishedAt: new Date().toISOString()
      })
    );
    return;
  }

  job.cancelRequested = true;
  await chrome.storage.local.set({
    [STORAGE_KEYS.job]: job
  });

  if (activeAbortController) {
    activeAbortController.abort("cancelled-by-user");
  }

  for (const controller of activeDeadScanControllers) {
    controller.abort("cancelled-by-user");
  }

  await updateStatus({
    phase: "running",
    message: "已收到取消请求，当前批次结束后会停止任务。",
    detail: "如果模型请求仍在进行，会尝试立即中止；已经完成的移动和删除不会回滚。"
  });
}

async function createManualBackup() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.job);

  if (stored[STORAGE_KEYS.job]?.phase === "running") {
    return {
      ok: false,
      error: "已经有一个后台任务在运行，请先等待完成或取消后再试。"
    };
  }

  const tree = await chrome.bookmarks.getTree();
  const bookmarkBarNode = findBookmarksBarNode(tree);
  const snapshotInfo = await createCurrentSnapshotBackup(bookmarkBarNode, "manual");

  await updateStatus(
    buildIdleStatus({
      phase: snapshotInfo.created ? "completed" : "idle",
      message: snapshotInfo.created ? "已完成手动备份。" : "当前没有可备份的书签。",
      detail: snapshotInfo.detail,
      finishedAt: new Date().toISOString()
    })
  );

  return {
    ok: true,
    created: snapshotInfo.created,
    message: snapshotInfo.created ? "已完成手动备份。" : "当前没有可备份的书签。"
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
      error: "当前没有可恢复的备份。"
    };
  }

  return await restoreBackupEntry(records[0].id);
}

async function restoreBackupEntry(backupId) {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.job]);

  if (stored[STORAGE_KEYS.job]?.phase === "running") {
    return {
      ok: false,
      error: "已经有一个后台任务在运行，请先等待完成或取消后再试。"
    };
  }

  if (!backupId) {
    return {
      ok: false,
      error: "备份参数无效。"
    };
  }

  const snapshotNodes = await readBackupSnapshot(backupId);

  if (!snapshotNodes) {
    await removeBackupRecord(backupId);
    return {
      ok: false,
      error: "最近备份已不存在，请先重新创建备份。"
    };
  }

  const tree = await chrome.bookmarks.getTree();
  const bookmarkBarNode = findBookmarksBarNode(tree);
  const currentChildren = await chrome.bookmarks.getChildren(bookmarkBarNode.id);

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
    [STORAGE_KEYS.rootFolderId]: "",
    [STORAGE_KEYS.unresolvedFolderId]: await findExistingUnresolvedFolderId(bookmarkBarNode.id)
  });

  const records = await syncBackupRecords();
  const restoredRecord = records.find((record) => record.id === backupId);

  await updateStatus(
    buildIdleStatus({
      phase: "completed",
      message: "已恢复最近备份。",
      detail: `已从“${restoredRecord?.title || "最近备份"}”恢复 ${restoredTopLevelNodes.length} 个顶层项目。`,
      finishedAt: new Date().toISOString()
    })
  );

  return {
    ok: true,
    message: "已恢复备份。"
  };
}

async function deleteBackupEntry(backupId) {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.job);
  if (stored[STORAGE_KEYS.job]?.phase === "running") {
    return {
      ok: false,
      error: "已经有一个后台任务在运行，请先等待完成或取消后再试。"
    };
  }

  if (!backupId) {
    return {
      ok: false,
      error: "备份参数无效。"
    };
  }

  await deleteBackupSnapshot(backupId);
  await removeBackupRecord(backupId);

  return {
    ok: true,
    message: "已删除备份。"
  };
}

async function resolveUnprocessedEntry(entryId, action) {
  if (!entryId || !["keep", "delete"].includes(action)) {
    return {
      ok: false,
      error: "未处理项参数无效。"
    };
  }

  const stored = await chrome.storage.local.get(STORAGE_KEYS.job);
  if (stored[STORAGE_KEYS.job]?.phase === "running") {
    return {
      ok: false,
      error: "后台任务正在运行，请等待当前批次结束后再处理未处理项。"
    };
  }

  const warnings = Array.isArray(currentStatus.warnings) ? [...currentStatus.warnings] : [];
  const targetEntry = warnings.find((entry) => entry.id === entryId);

  if (!targetEntry) {
    return {
      ok: false,
      error: "这条未处理记录已经不存在，请刷新后重试。"
    };
  }

  const remainingWarnings = warnings.filter((entry) => entry.id !== entryId);
  let deletedItems = Array.isArray(currentStatus.deletedItems) ? [...currentStatus.deletedItems] : [];
  let message = "";
  let detail = "";

  if (targetEntry.bookmarkId) {
    if (action === "delete") {
      await removeBookmarkIfExists(targetEntry.bookmarkId);
      deletedItems = appendLimitedEntries(deletedItems, [
        buildLogEntry(
          "manual_deleted",
          {
            id: targetEntry.bookmarkId,
            title: targetEntry.title,
            url: targetEntry.url
          },
          "用户已在未处理列表中手动删除这条书签。",
          "如果之后仍然需要，可以手动重新添加。"
        )
      ]);
      message = "已删除未处理书签。";
      detail = `书签《${targetEntry.title || targetEntry.url}》已删除。`;
    } else {
      const tree = await chrome.bookmarks.getTree();
      const bookmarkBarNode = findBookmarksBarNode(tree);
      const unresolvedFolderId = await ensureUnresolvedFolder(bookmarkBarNode.id);
      await chrome.bookmarks.move(targetEntry.bookmarkId, { parentId: unresolvedFolderId });
      message = "已保留书签。";
      detail = `书签《${targetEntry.title || targetEntry.url}》已移动到根目录的“待手动分类”文件夹。`;
    }
  } else {
    message = "已更新未处理列表。";
    detail = "这条记录没有可操作的书签实体，因此只从列表中移除了。";
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
    const job = stored[STORAGE_KEYS.job];

    if (!job || job.phase !== "running") {
      return;
    }

    if (job.cancelRequested) {
      await finishJob("cancelled", "任务已取消，未继续处理后续批次。", job);
      return;
    }

    if (job.jobType === "dead_scan") {
      await processNextDeadScanBatch(job);
      return;
    }

    const batch = job.bookmarks.slice(job.processed, job.processed + job.batchSize);

    if (!batch.length) {
      await finishJob("completed", `书签整理完成，已处理 ${job.processed} / ${job.total} 条。`, job);
      return;
    }

    const currentBatch = Math.floor(job.processed / job.batchSize) + 1;

    await updateBatchStatus(job, currentBatch, {
      message: `正在检测第 ${currentBatch}/${job.totalBatches} 批链接状态 (${job.processed}/${job.total})。`,
      detail: `本批 ${batch.length} 条。会先识别确认失效的链接，把状态不明确的链接留到“待手动分类”，再对剩余书签做 AI 分类。提交前不会改动现有书签树。`
    });

    const scanResult = await scanDeadBookmarksBatch(
      batch,
      (stage) => updateBatchStatus(job, currentBatch, stage),
      { mutate: false }
    );
    const duplicateState = markHealthyExactDuplicates(
      scanResult.healthyBookmarks,
      job.exactDuplicateSeenByUrl
    );
    const aliveBatch = duplicateState.bookmarks;
    job.exactDuplicateSeenByUrl = duplicateState.seenByUrl;
    const exactDuplicatePlans = buildExactDuplicatePlans(aliveBatch);
    const bookmarksToClassify = aliveBatch.filter((bookmark) => !bookmark.exactDuplicateOf);
    const classifications = bookmarksToClassify.length
      ? await withKeepAlive(
          () =>
            classifyBatchWithModel(
              bookmarksToClassify,
              job.config,
              (stage) => updateBatchStatus(job, currentBatch, stage),
              job.taxonomyLocks
            ),
          () =>
            updateBatchStatus(job, currentBatch, {
              message: `第 ${currentBatch}/${job.totalBatches} 批正在等待模型返回。`,
              detail:
                "已启用后台 keep-alive 心跳。若模型 25 秒内没有返回响应，会主动超时并提示减小批大小或检查网络。"
            })
        )
      : [];
    const normalized = applyTaxonomyLocks(
      normalizeClassificationResults(classifications, bookmarksToClassify),
      job.taxonomyLocks
    );
    job.taxonomyLocks = normalized.taxonomyLocks;

    await updateBatchStatus(job, currentBatch, {
      message: `第 ${currentBatch}/${job.totalBatches} 批模型结果已返回，正在写入最终整理方案。`,
      detail: aliveBatch.length
        ? "正在把本批结果加入最终重建方案，原有书签结构暂时不会变化。"
        : "本批没有可进入 AI 分类的有效书签，正在记录删除和未处理结果。"
    });

    const planResult = buildBatchClassificationPlan(
      aliveBatch,
      [...normalized.results, ...exactDuplicatePlans]
    );

    job.processed += batch.length;
    job.moved += planResult.keepCount;
    job.deleted += scanResult.deletedCount + planResult.deletedCount;
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

    await chrome.storage.local.set({
      [STORAGE_KEYS.job]: job
    });

    await updateBatchStatus(job, currentBatch, {
      message: `第 ${currentBatch}/${job.totalBatches} 批完成，累计已处理 ${job.processed}/${job.total} 条。`,
      detail: `本批已写入 ${planResult.keepCount} 条整理结果，标记删除 ${scanResult.deletedCount + planResult.deletedCount} 条，未处理 ${scanResult.warningCount + planResult.warningCount} 条。旧书签结构尚未改动。`,
      warnings: job.warnings,
      deletedItems: job.deletedItems
    });

    if (job.cancelRequested) {
      await finishJob("cancelled", "任务已取消，当前批次的结果已保存。", job);
      return;
    }

    if (job.processed >= job.total) {
      await updateBatchStatus(job, currentBatch, {
        message: "全部批次已分析完成，正在清空旧结构并重建新结构。",
        detail: "接下来会删除当前书签栏中的旧书签结构，并根据完整方案一次性创建新的分类目录。备份已经提前完成。"
      });

      const rebuildResult = await rebuildOrganizedBookmarks(job);
      job.managedFolderIds = rebuildResult.managedFolderIds;
      job.warnings = rebuildResult.warningEntries;
      job.warningCount = rebuildResult.warningEntries.length;
      job.lastWarning = rebuildResult.warningEntries.at(-1)?.reason || "";

      await finishJob(
        "completed",
        `书签整理完成，已重建 ${rebuildResult.createdCount} 条书签，并删除 ${job.deleted} 条失效或重复书签。`,
        job,
        {
          detail: `本次先生成完整方案，再整体重建书签结构。AI 已归类 ${job.moved} 条，白名单保留 ${rebuildResult.preservedCount} 条，待手动分类 ${rebuildResult.warningEntries.length} 条。`
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
      await finishJob("cancelled", "任务已取消，后台请求已中止。", job, {
        detail: "如果你是主动取消，这属于正常停止；如果不是主动取消，请检查网络、模型响应速度或批大小设置。"
      });
      return;
    }

    await updateStatus({
      phase: "error",
      message:
        error?.userMessage ||
        toUserMessage(error, "整理过程中出错，请检查 API 配置、网络连接或模型返回的 JSON 格式。"),
      detail:
        error?.userDetail ||
        [
          "任务已停止。建议先查看扩展的 Service Worker 控制台日志，再检查 Base URL、API Key、模型名和批大小设置。",
          job?.snapshotBackupTitle
            ? `如果重建阶段已经开始，你可以去设置页的备份管理恢复“${job.snapshotBackupTitle}”。`
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
      `失效书签扫描完成，共检查 ${job.processed} 条，自动删除 ${job.deleted} 条确认失效的书签。`,
      job
    );
    return;
  }

  const currentBatch = Math.floor(job.processed / job.batchSize) + 1;
  await updateBatchStatus(job, currentBatch, {
    message: `正在扫描第 ${currentBatch}/${job.totalBatches} 批失效书签 (${job.processed}/${job.total})。`,
    detail: `本批 ${batch.length} 条。会先尝试 HEAD，必要时回退 GET；只有确认失效的链接才会自动删除。`
  });

  const scanResult = await scanDeadBookmarksBatch(batch, (stage) =>
    updateBatchStatus(job, currentBatch, stage)
  );

  job.processed += batch.length;
  job.deleted += scanResult.deletedCount;
  job.warningCount += scanResult.warningCount;
  job.lastWarning = scanResult.lastWarning || job.lastWarning || "";
  job.warnings = appendLimitedEntries(job.warnings, scanResult.warningEntries);
  job.deletedItems = appendLimitedEntries(job.deletedItems, scanResult.deletedEntries);

  await chrome.storage.local.set({
    [STORAGE_KEYS.job]: job
  });

  await updateBatchStatus(job, currentBatch, {
    message: `第 ${currentBatch}/${job.totalBatches} 批失效书签扫描完成，累计已检查 ${job.processed}/${job.total} 条。`,
    detail: `本批删除 ${scanResult.deletedCount} 条确认失效书签，警告 ${scanResult.warningCount} 条。`,
    warnings: job.warnings,
    deletedItems: job.deletedItems
  });

  if (job.cancelRequested) {
    await finishJob("cancelled", "失效书签扫描已取消，当前批次结果已保存。", job);
    return;
  }

  if (job.processed >= job.total) {
    await finishJob(
      "completed",
      `失效书签扫描完成，共检查 ${job.processed} 条，自动删除 ${job.deleted} 条确认失效的书签。`,
      job
    );
    return;
  }

  await scheduleNextBatch();
}

async function finishJob(phase, message, job, overrides = {}) {
  await chrome.alarms.clear(ALARM_NAME);
  const finalManagedFolderIds = Array.isArray(job?.managedFolderIds) ? job.managedFolderIds : [];
  await chrome.storage.local.remove(STORAGE_KEYS.job);
  await chrome.storage.local.set({
    [STORAGE_KEYS.managedFolderIds]: finalManagedFolderIds,
    [STORAGE_KEYS.rootFolderId]: ""
  });

  const processed = job?.processed ?? currentStatus.processed ?? 0;
  const moved = job?.moved ?? currentStatus.moved ?? 0;
  const deleted = job?.deleted ?? currentStatus.deleted ?? 0;
  const warningCount = job?.warningCount ?? currentStatus.warningCount ?? 0;
  const warnings = Array.isArray(job?.warnings) ? job.warnings : currentStatus.warnings || [];
  const deletedItems = Array.isArray(job?.deletedItems)
    ? job.deletedItems
    : currentStatus.deletedItems || [];

  await updateStatus({
    phase,
    message,
    provider: job?.jobType === "dead_scan" ? "" : job?.config?.provider || currentStatus.provider || "",
    model: job?.jobType === "dead_scan" ? "" : job?.config?.model || currentStatus.model || "",
    total: job?.total ?? currentStatus.total ?? 0,
    processed,
    moved,
    deleted,
    batchSize: job?.batchSize ?? currentStatus.batchSize ?? DEFAULT_BATCH_SIZE,
    warningCount,
    lastWarning: job?.lastWarning || currentStatus.lastWarning || "",
    warnings,
    deletedItems,
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

function validateConfig(config) {
  const defaults = PROVIDER_DEFAULTS[config.provider] || PROVIDER_DEFAULTS.openai;

  if (!config.baseUrl) {
    throw new Error("Base URL 不能为空。");
  }

  if (!config.model) {
    throw new Error("Model Name 不能为空。");
  }

  if (!Number.isInteger(config.batchSize) || config.batchSize < 5 || config.batchSize > 100) {
    throw new Error("批大小必须是 5 到 100 之间的整数。");
  }

  if (
    !Number.isInteger(config.autoOrganizeIntervalHours) ||
    config.autoOrganizeIntervalHours < 1 ||
    config.autoOrganizeIntervalHours > 168
  ) {
    throw new Error("自动整理间隔必须是 1 到 168 小时之间的整数。");
  }

  if (defaults.requiresApiKey && !config.apiKey) {
    throw new Error(`${config.provider} 需要 API Key。`);
  }
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
      (title.startsWith(`${DEFAULT_ROOT_FOLDER} Backup`) || title.startsWith(BACKUP_FOLDER_PREFIX))
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
          title: node.title || "(无标题书签)",
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
        title: node.title || "(无标题书签)",
        url: node.url
      };
    }

    return {
      title: node?.title || "未命名文件夹",
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
          title: node.title || "(无标题书签)",
          url: node.url
        })
      );
      continue;
    }

    const folder = await chrome.bookmarks.create({
      parentId,
      title: node.title || "未命名文件夹"
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
      reject(request.error || new Error("打开本地备份数据库失败。"));
  });
}

function waitForTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error || new Error("本地备份事务被中止。"));
    transaction.onerror = () =>
      reject(transaction.error || new Error("本地备份事务失败。"));
  });
}

function waitForRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("本地备份读写失败。"));
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

function limitBackupRecords(records, maxRecords = MAX_BACKUP_RECORDS) {
  const normalized = normalizeBackupRecords(records);
  if (normalized.length <= maxRecords) {
    return {
      keptRecords: normalized,
      overflowRecords: []
    };
  }

  const keepIds = new Set();
  const manualRecords = normalized.filter((record) => record.source === "manual");
  const autoRecords = normalized.filter((record) => record.source === "auto");

  for (const record of manualRecords) {
    if (keepIds.size >= maxRecords) {
      break;
    }

    keepIds.add(record.id);
  }

  for (const record of autoRecords) {
    if (keepIds.size >= maxRecords) {
      break;
    }

    keepIds.add(record.id);
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

async function addBackupRecord(record, source = "manual") {
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

  const { keptRecords, overflowRecords } = limitBackupRecords(nextRecords);

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
      if (existing.title !== "待手动分类") {
        await chrome.bookmarks.update(existing.id, { title: "待手动分类" });
      }
      return existing.id;
    }
  }

  if (!bookmarkBarId) {
    return "";
  }

  const children = await chrome.bookmarks.getChildren(bookmarkBarId);
  const folder = children.find(
    (node) => !node.url && (node.title === "待手动分类" || node.title === "未处理" || node.title === "待整理")
  );

  if (!folder) {
    return "";
  }

  if (folder.title !== "待手动分类") {
    await chrome.bookmarks.update(folder.id, { title: "待手动分类" });
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
    title: "待手动分类"
  });

  await chrome.storage.local.set({
    [STORAGE_KEYS.unresolvedFolderId]: folder.id
  });

  return folder.id;
}

async function createCurrentSnapshotBackup(bookmarkBarNode, source = "manual") {
  const topLevelNodes = Array.isArray(bookmarkBarNode?.children)
    ? flattenForbiddenRootNodes(bookmarkBarNode.children.filter((node) => !isBackupFolderNode(node)))
    : [];

  if (!bookmarkBarNode?.id || !topLevelNodes.length) {
    return {
      created: false,
      detail: "当前没有可备份的书签。"
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
    source
  );

  return {
    created: true,
    folderId: backupId,
    folderTitle: backupTitle,
    detail: `已创建本地快照备份“${backupTitle}”。`
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
    // 用户可能已经手动删掉了，忽略即可。
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
        // 如果节点已被其他同步源移动或删除，忽略即可。
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

  if (!(await hasBroadHostAccess())) {
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
        toUserMessage(error, "自动静默整理失败，请检查配置、网络或批大小设置。"),
      detail:
        error?.userDetail ||
        "这是一次自动定时任务触发的失败。你可以稍后手动打开 Popup 或设置页查看并重试。",
      finishedAt: new Date().toISOString()
    });
  }
}

async function testApiConnection(rawConfig) {
  const config = mergeConfig(rawConfig || {});
  validateConfig(config);
  await assertApiOriginAccess(config.baseUrl);

  const endpoint = buildChatCompletionsEndpoint(config.baseUrl);
  const headers = {
    "Content-Type": "application/json"
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("api-test-timeout"), 20_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: "You are a connectivity test."
          },
          {
            role: "user",
            content: "Reply with OK."
          }
        ],
        temperature: 0,
        stream: false,
        max_tokens: 8
      }),
      signal: controller.signal
    });

    const rawBody = await response.text();

    if (!response.ok) {
      throw buildUserFacingError(
        `API 检测失败，接口返回 ${response.status}。`,
        `接口响应片段：${truncate(rawBody, 220)}`
      );
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      throw buildUserFacingError(
        "API 检测失败，接口没有返回 JSON。",
        `原始响应片段：${truncate(rawBody, 220)}`
      );
    }

    const content = extractAssistantContent(parsedBody);
    return {
      message: `API 检测成功，${config.provider} / ${config.model} 当前可用。`,
      detail: content
        ? `模型已返回内容：${truncate(content.replace(/\s+/g, " "), 80)}`
        : "接口返回正常，已成功拿到结构化响应。"
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw buildUserFacingError(
        "API 检测超时，20 秒内没有拿到响应。",
        "请检查 Base URL、网络、模型负载，或确认当前接口没有排队过久。"
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function scanDeadBookmarksBatch(batch, reportStage = () => {}, options = {}) {
  const shouldMutate = options.mutate !== false;
  let deletedCount = 0;
  let warningCount = 0;
  let lastWarning = "";
  const warningEntries = [];
  const deletedEntries = [];
  const healthyBookmarks = [];
  const pendingWarnings = [];

  for (let index = 0; index < batch.length; index += 1) {
    const bookmark = batch[index];
    await reportStage({
      message: `正在检测失效书签：${bookmark.title || bookmark.url}`,
      detail: `当前进度 ${index + 1}/${batch.length}。正在检查 ${truncate(bookmark.url, 90)}`
    });

    try {
      const result = await checkBookmarkHealth(bookmark.url);
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
              ? `已确认失效并自动删除：${result.reason || "HTTP 404 / 410 / 451"}`
              : `已确认失效，重建时不会保留：${result.reason || "HTTP 404 / 410 / 451"}`,
            shouldMutate
              ? "扩展只会删除明确失效的链接。如果你仍然需要它，可以稍后手动重新添加。"
              : "本次整理会在最终重建时跳过这类明确失效的链接，原始结构仍已备份。"
          )
        );
      } else if (!result.isHealthy) {
        const reason = `书签《${bookmark.title}》状态不明确，未自动删除：${result.reason || "检测超时或目标站点拒绝访问"}`;
        const suggestion = "这通常是目标站点拒绝 HEAD 请求、需要登录或暂时超时。建议手动打开确认，扩展不会直接删除这类链接。";
        warningCount += 1;
        lastWarning = reason;
        warningEntries.push(buildLogEntry("scan_uncertain", bookmark, reason, suggestion));
        pendingWarnings.push({
          title: bookmark.title || "(无标题书签)",
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
      lastWarning = `书签《${bookmark.title}》检测失败：${toUserMessage(error, "未知错误")}`;
      warningEntries.push(
        buildLogEntry(
          "scan_failed",
          bookmark,
          lastWarning,
          "建议稍后重试一次；如果目标网站限制访问，手动打开通常比后台探测更准确。"
        )
      );
      pendingWarnings.push({
        title: bookmark.title || "(无标题书签)",
        url: bookmark.url,
        kind: "scan_failed",
        reason: lastWarning,
        suggestion: "建议稍后重试一次；如果目标网站限制访问，手动打开通常比后台探测更准确。"
      });
    }
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

async function checkBookmarkHealth(rawUrl) {
  if (!/^https?:\/\//i.test(rawUrl)) {
    return {
      isDead: false,
      isHealthy: true,
      shouldRetryWithGet: false,
      reason: ""
    };
  }

  const headResult = await requestBookmarkHealth(rawUrl, "HEAD");
  if (headResult.isDead) {
    return headResult;
  }

  if (headResult.isHealthy) {
    return headResult;
  }

  if (!headResult.shouldRetryWithGet) {
    return headResult;
  }

  return requestBookmarkHealth(rawUrl, "GET");
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
        // 忽略 body 取消失败。
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
        throw buildUserFacingError("失效书签扫描已被取消。", "后台已经停止当前 URL 检测。", "cancelled-by-user");
      }

      return {
        isDead: false,
        isHealthy: false,
        shouldRetryWithGet: false,
        reason: "请求超时"
      };
    }

    return {
      isDead: false,
      isHealthy: false,
      shouldRetryWithGet: method === "HEAD",
      reason: toUserMessage(error, "网络错误")
    };
  } finally {
    clearTimeout(timer);
    activeDeadScanControllers.delete(controller);
  }
}

async function classifyBatchWithModel(batch, config, reportStage = () => {}, taxonomyLocks = {}) {
  const endpoint = buildChatCompletionsEndpoint(config.baseUrl);
  const messages = buildClassificationMessages(batch, config.customPrompt, taxonomyLocks);
  const payload = {
    model: config.model,
    messages,
    temperature: config.provider === "minimax" ? 0.2 : 0.1,
    stream: false
  };

  if (config.provider === "minimax") {
    payload.reasoning_split = true;
  }

  const headers = {
    "Content-Type": "application/json"
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  activeAbortController = new AbortController();
  let abortReason = "";
  const abortWithReason = (reason) => {
    abortReason = reason;
    if (activeAbortController && !activeAbortController.signal.aborted) {
      activeAbortController.abort(reason);
    }
  };
  const firstResponseTimer = setTimeout(() => {
    abortWithReason("first-response-timeout");
  }, FIRST_RESPONSE_TIMEOUT_MS);
  const totalTimeoutTimer = setTimeout(() => {
    abortWithReason("request-timeout");
  }, REQUEST_TIMEOUT_MS);

  try {
    await reportStage({
      message: `第 1 阶段：正在向模型发送 ${batch.length} 条书签的分类请求。`,
      detail: `请求地址：${truncate(endpoint, 90)}。如果 25 秒内没有收到响应，会主动停止并提示你减小批大小。`
    });

    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: activeAbortController.signal
      });
    } catch (error) {
      if (activeAbortController?.signal?.aborted) {
        throw buildRequestAbortError(
          abortReason || `${activeAbortController.signal.reason || ""}`,
          config,
          batch.length
        );
      }

      throw error;
    }

    clearTimeout(firstResponseTimer);

    await reportStage({
      message: "第 2 阶段：模型已响应，正在读取返回内容。",
      detail: "已经收到服务器响应头，接下来会读取文本并进行 JSON 提取。"
    });

    let rawBody;
    try {
      rawBody = await response.text();
    } catch (error) {
      if (activeAbortController?.signal?.aborted) {
        throw buildRequestAbortError(
          abortReason || `${activeAbortController.signal.reason || ""}`,
          config,
          batch.length
        );
      }

      throw error;
    }

    if (!response.ok) {
      throw new Error(`API 请求失败 (${response.status})：${truncate(rawBody, 280)}`);
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawBody);
    } catch (error) {
      throw new Error(`API 返回了非 JSON 响应：${truncate(rawBody, 200)}`);
    }

    const content = extractAssistantContent(parsedResponse);
    if (!content) {
      throw new Error("模型返回为空，未获取到可解析的文本内容。");
    }

    await reportStage({
      message: "第 3 阶段：模型文本已收到，正在提取并解析 JSON。",
      detail: "后台会自动剥离 ```json 代码块和多余说明文字，只保留合法 JSON 数组。"
    });

    try {
      return extractJsonArray(content);
    } catch (error) {
      throw new Error(
        `模型返回内容无法解析为 JSON 数组。请检查 Prompt 或模型能力。原始片段：${truncate(
          content,
          220
        )}`
      );
    }
  } finally {
    clearTimeout(firstResponseTimer);
    clearTimeout(totalTimeoutTimer);
  }
}

function buildClassificationMessages(batch, customPrompt, taxonomyLocks = {}) {
  const strategyPrompt = (customPrompt || DEFAULT_PROMPT).trim();
  const inputPayload = batch.map((item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    currentPath: item.currentPath
  }));
  const lockLines = Object.entries(taxonomyLocks)
    .sort(([a], [b]) => a.localeCompare(b, "zh-CN"))
    .slice(0, 80)
    .map(([subfolder, topLevel]) => `- ${subfolder} 必须放到 ${topLevel}`)
    .join("\n");

  return [
    {
      role: "system",
      content:
        "你是一个非常严格的书签整理助手。你只能输出合法 JSON，不能输出解释、Markdown、注释或额外文本。"
    },
    {
      role: "user",
      content: `${strategyPrompt}

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
5. 一级目录尽量只使用这些固定大类：AI/技术、学习/教程、工具/效率、产品/设计、资讯/社区、购物/服务、娱乐/内容、生活/资源、待手动分类。
6. 如果无法确认重复，不要删除，action 必须返回 keep。
7. 如果同一个二级目录名已经被固定归属到某个一级目录，你必须复用该归属，不能换父目录。
8. 信息不足时统一归入 ["待手动分类"]。

已有固定归属：
${lockLines || "- 当前还没有已锁定的二级目录归属"}

以下是待整理书签：
${JSON.stringify(inputPayload, null, 2)}`
    }
  ];
}

function buildChatCompletionsEndpoint(baseUrl) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(normalized)) {
    return normalized;
  }

  return `${normalized}/chat/completions`;
}

function extractAssistantContent(responseBody) {
  const choice = responseBody?.choices?.[0];
  const messageContent = choice?.message?.content;

  if (typeof messageContent === "string") {
    return messageContent;
  }

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (typeof part?.text === "string") {
          return part.text;
        }

        return "";
      })
      .join("\n")
      .trim();
  }

  if (typeof responseBody?.output_text === "string") {
    return responseBody.output_text;
  }

  return "";
}

function extractJsonArray(rawText) {
  if (typeof rawText !== "string" || !rawText.trim()) {
    throw new Error("模型返回为空字符串。");
  }

  const normalizedText = rawText.trim().replace(/^\uFEFF/, "");
  const direct = tryParseJsonCandidate(normalizedText);

  if (direct) {
    return direct;
  }

  const fencedCandidates = [];
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let fenceMatch;

  while ((fenceMatch = fenceRegex.exec(normalizedText))) {
    fencedCandidates.push(fenceMatch[1].trim());
  }

  for (const candidate of fencedCandidates) {
    const parsed = tryParseJsonCandidate(candidate);
    if (parsed) {
      return parsed;
    }
  }

  const stripped = normalizedText.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const fragments = collectBalancedJsonFragments(stripped);

  for (const fragment of fragments) {
    const parsed = tryParseJsonCandidate(fragment);
    if (parsed) {
      return parsed;
    }
  }

  throw new Error("未找到合法 JSON 数组。");
}

function tryParseJsonCandidate(candidate) {
  if (!candidate) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.items)) {
        return parsed.items;
      }

      if (Array.isArray(parsed.data)) {
        return parsed.data;
      }

      if (Array.isArray(parsed.bookmarks)) {
        return parsed.bookmarks;
      }
    }
  } catch (error) {
    return null;
  }

  return null;
}

function collectBalancedJsonFragments(text) {
  const fragments = [];

  for (let start = 0; start < text.length; start += 1) {
    const firstChar = text[start];

    if (firstChar !== "[" && firstChar !== "{") {
      continue;
    }

    const end = findBalancedJsonEnd(text, start);
    if (end !== -1) {
      fragments.push(text.slice(start, end + 1));
    }
  }

  return fragments;
}

function findBalancedJsonEnd(text, startIndex) {
  const stack = [];
  let inString = false;
  let escaping = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "[") {
      stack.push("]");
      continue;
    }

    if (char === "{") {
      stack.push("}");
      continue;
    }

    if (char === "]" || char === "}") {
      if (!stack.length || stack[stack.length - 1] !== char) {
        return -1;
      }

      stack.pop();
      if (!stack.length) {
        return index;
      }
    }
  }

  return -1;
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
    folderPath: resultMap.get(item.id)?.folderPath || ["待手动分类"],
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

  if (["待整理", "待处理", "未分类", "未整理"].includes(trimmed)) {
    return "待手动分类";
  }

  return trimmed;
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

  if (cleaned.includes("待手动分类")) {
    return ["待手动分类"];
  }

  return cleaned.length ? cleaned : ["待手动分类"];
}

function normalizePreservedFolderPath(folderPath) {
  const rawSegments = Array.isArray(folderPath) ? folderPath : [];

  const cleaned = rawSegments
    .map((segment) => canonicalizeFolderName(sanitizeFolderName(segment)))
    .filter(Boolean)
    .filter((segment) => !isForbiddenManagedFolderName(segment))
    .slice(0, 2);

  if (cleaned.includes("待手动分类")) {
    return ["待手动分类"];
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
    title: bookmark?.title || "(无标题书签)",
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
      folderPath: ["待手动分类"],
      duplicateOf: ""
    };

    if (plan.action === "delete_duplicate") {
      deletedCount += 1;
      deletedEntries.push(
        buildLogEntry(
          "duplicate_deleted",
          bookmark,
          "检测到同一 URL 的重复书签，重建时不会保留当前重复项。",
          "如果这是你刻意保留的多个入口，可以稍后手动重新添加，或在整理前把该网站加入白名单。"
        )
      );
      continue;
    }

    keepEntries.push({
      title: bookmark.title || "(无标题书签)",
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
  const preservedTopLevelIds = new Set([unresolvedFolderId].filter(Boolean));
  const currentChildren = await chrome.bookmarks.getChildren(rootFolderId);
  const folderCache = { [rootFolderName]: rootFolderId };
  const managedFolderIds = [];
  const planEntries = [
    ...(Array.isArray(job.preservedBookmarks) ? job.preservedBookmarks : []),
    ...(Array.isArray(job.plannedBookmarks) ? job.plannedBookmarks : [])
  ];
  let createdCount = 0;
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

  for (const entry of planEntries) {
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
    await chrome.bookmarks.create({
      parentId: folderId,
      title: entry.title || "(无标题书签)",
      url: entry.url
    });
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
        title: entry.title || "(无标题书签)",
        url: entry.url
      });
      realizedWarnings.push(
        buildLogEntry(
          entry.kind || "scan_uncertain",
          bookmarkNode,
          entry.reason || "该书签暂未自动处理。",
          entry.suggestion || "建议手动确认后再决定是否删除。"
        )
      );
      createdCount += 1;
    }
  }

  return {
    createdCount,
    preservedCount,
    warningEntries: realizedWarnings,
    managedFolderIds: Array.from(new Set(managedFolderIds))
  };
}

async function removeBookmarkIfExists(bookmarkId) {
  if (!bookmarkId) {
    return;
  }

  try {
    await chrome.bookmarks.remove(bookmarkId);
  } catch (error) {
    // 书签可能已经被删除或移动，忽略即可。
  }
}

async function ensureFolderPath(rootFolderId, rootFolderName, folderPath, folderCache, managedFolderIds) {
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

function normalizeBatchSize(rawValue) {
  const parsed = Number.parseInt(String(rawValue ?? DEFAULT_BATCH_SIZE), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BATCH_SIZE;
  }

  return Math.min(100, Math.max(5, parsed));
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

  return promptValue.trim() === LEGACY_DEFAULT_PROMPT.trim() ? DEFAULT_PROMPT : promptValue;
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
    provider: job.jobType === "dead_scan" ? "" : job.config.provider,
    model: job.jobType === "dead_scan" ? "" : job.config.model,
    total: job.total,
    processed: job.processed,
    moved: job.moved,
    deleted: job.deleted,
    batchSize: job.batchSize,
    warningCount: job.warningCount,
    lastWarning: job.lastWarning || "",
    warnings: Array.isArray(job.warnings) ? job.warnings : currentStatus.warnings || [],
    deletedItems: Array.isArray(job.deletedItems)
      ? job.deletedItems
      : currentStatus.deletedItems || [],
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
  if (reason === "first-response-timeout") {
    return buildUserFacingError(
      `${config.provider} 在 ${Math.floor(FIRST_RESPONSE_TIMEOUT_MS / 1000)} 秒内没有返回响应，任务已提前停止。`,
      `这通常意味着模型首包太慢，容易撞到 Chrome Manifest V3 后台生命周期限制。建议先把批大小调小到 10-20，再检查网络、Base URL 和模型负载。当前批量：${batchLength}。`,
      reason
    );
  }

  if (reason === "request-timeout") {
    return buildUserFacingError(
      `${config.provider} 请求超过 ${Math.floor(REQUEST_TIMEOUT_MS / 1000)} 秒仍未完成，任务已停止。`,
      `模型虽然可能已经开始处理，但完整响应仍然过慢。建议减小批大小、换更快的模型，或确认接口没有卡在排队状态。当前批量：${batchLength}。`,
      reason
    );
  }

  if (reason === "cancelled-by-user") {
    return buildUserFacingError(
      "任务已被你取消。",
      "后台已经中止当前模型请求，不会继续处理后续批次。",
      reason
    );
  }

  return buildUserFacingError(
    "模型请求被中止，任务已停止。",
    "如果这不是你主动取消的，请检查网络连接、接口稳定性，或先调小批大小后重试。",
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
      folderPath: ["重复书签"],
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
