const CONFIG_KEY = "smartBookmarkConfig";
const STATUS_KEY = "smartBookmarkJobStatus";
const MANAGED_FOLDER_IDS_KEY = "smartBookmarkManagedFolderIds";
const MANAGED_ROOT_BOOKMARK_IDS_KEY = "smartBookmarkManagedRootBookmarkIds";
const HOST_ACCESS_ORIGINS = ["https://*/*", "http://*/*"];
const I18N = globalThis.SmartBookmarkI18n;
const t = (key, params) => I18N.t(key, params);

const phaseBadge = document.getElementById("phaseBadge");
const progressBar = document.getElementById("progressBar");
const progressPercent = document.getElementById("progressPercent");
const progressSummary = document.getElementById("progressSummary");
const progressMeta = document.getElementById("progressMeta");
const totalValue = document.getElementById("totalValue");
const processedValue = document.getElementById("processedValue");
const movedValue = document.getElementById("movedValue");
const deletedValue = document.getElementById("deletedValue");
const warningValue = document.getElementById("warningValue");
const detailPanel = document.getElementById("detailPanel");
const startButton = document.getElementById("startButton");
const backupButton = document.getElementById("backupButton");
const cancelButton = document.getElementById("cancelButton");
const optionsButton = document.getElementById("optionsButton");

let refreshTimer = null;
let currentConfig = null;
let currentStatus = null;
let currentFolderViews = [];
let detailRequestVersion = 0;

I18N.applyDocument(document);

const DEFAULT_STATUS_DETAIL = t("defaultStatusDetail");

async function hasBroadHostAccess() {
  try {
    return await chrome.permissions.contains({ origins: HOST_ACCESS_ORIGINS });
  } catch (error) {
    return false;
  }
}

async function ensureBroadHostAccess() {
  if (await hasBroadHostAccess()) {
    return true;
  }

  try {
    return await chrome.permissions.request({ origins: HOST_ACCESS_ORIGINS });
  } catch (error) {
    return false;
  }
}

function titleCasePhase(phase) {
  const phaseMap = {
    idle: t("phaseIdle"),
    preview: t("phasePreview"),
    running: t("phaseRunning"),
    completed: t("phaseCompleted"),
    cancelled: t("phaseCancelled"),
    error: t("phaseError")
  };

  return phaseMap[phase] || t("phaseUnknown");
}

function shorten(text, maxLength = 42) {
  if (!text) {
    return "-";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function formatDate(dateString) {
  return I18N.formatDate(dateString);
}

function getHostname(urlString) {
  if (!urlString) {
    return "";
  }

  try {
    return new URL(urlString).hostname;
  } catch (error) {
    return "";
  }
}

function getLogKindLabel(kind) {
  return (
    {
      move_failed: t("logMoveFailed"),
      delete_failed: t("logDeleteFailed"),
      scan_uncertain: t("logScanUncertain"),
      scan_failed: t("logScanFailed"),
      duplicate_deleted: t("logDuplicateDeleted"),
      dead_link_deleted: t("logDeadLinkDeleted"),
      manual_deleted: t("logManualDeleted")
    }[kind] || t("logRecord")
  );
}

function hasRunnableConfig(config) {
  return Boolean(config?.provider && config?.baseUrl && config?.model);
}

function isPreviewReady() {
  return currentStatus?.phase === "preview";
}

function syncActionButtons() {
  const isRunning = currentStatus?.phase === "running";
  startButton.disabled = isRunning || !hasRunnableConfig(currentConfig);
  backupButton.disabled = isRunning;
  cancelButton.disabled = !isRunning;
  startButton.textContent = isPreviewReady() ? t("confirmOrganizeButton") : t("startButton");
}

function renderConfig(_config) {
  syncActionButtons();
}

function renderStatus(status) {
  currentStatus = status || null;

  const phase = status?.phase || "idle";
  const total = Number(status?.total || 0);
  const processed = Number(status?.processed || 0);
  const moved = Number(status?.moved || 0);
  const deleted = Number(status?.deleted || 0);
  const warnings = Number(status?.warningCount || 0);
  const progress = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const isRunning = phase === "running";

  phaseBadge.textContent = titleCasePhase(phase);
  phaseBadge.className = "pill";

  if (phase === "running") {
    phaseBadge.classList.add("pill--accent");
  } else if (phase === "completed") {
    phaseBadge.classList.add("pill--success");
  } else if (phase === "error" || phase === "cancelled") {
    phaseBadge.classList.add("pill--danger");
  } else {
    phaseBadge.classList.add("pill--warm");
  }

  progressBar.style.width = `${progress}%`;
  progressPercent.textContent = `${progress}%`;
  progressSummary.textContent = total > 0 ? `${processed} / ${total}` : "0 / 0";

  const metaParts = [];
  if (status?.currentBatch && status?.totalBatches) {
    metaParts.push(t("batchMeta", { current: status.currentBatch, total: status.totalBatches }));
  }
  if (status?.batchSize) {
    metaParts.push(t("batchSizeMeta", { count: status.batchSize }));
  }
  if (status?.updatedAt) {
    metaParts.push(t("updatedMeta", { time: formatDate(status.updatedAt) }));
  }
  progressMeta.textContent = metaParts.join(" · ") || t("progressWaiting");

  totalValue.textContent = String(total);
  processedValue.textContent = String(processed);
  movedValue.textContent = String(moved);
  deletedValue.textContent = String(deleted);
  warningValue.textContent = String(warnings);

  syncActionButtons();
}

function createEmptyState(title, description) {
  const empty = document.createElement("div");
  empty.className = "empty-state";

  const titleEl = document.createElement("strong");
  titleEl.textContent = title;

  const descEl = document.createElement("div");
  descEl.className = "meta";
  descEl.textContent = description;

  empty.append(titleEl, descEl);
  return empty;
}

function createFactItem(label, value) {
  const item = document.createElement("article");
  item.className = "record-item";

  const labelEl = document.createElement("div");
  labelEl.className = "record-item__meta";
  labelEl.textContent = label;

  const valueEl = document.createElement("div");
  valueEl.className = "record-item__title";
  valueEl.textContent = value;

  item.append(labelEl, valueEl);
  return item;
}

function countBookmarks(node) {
  if (!node) {
    return 0;
  }

  if (node.url) {
    return 1;
  }

  return (node.children || []).reduce((sum, child) => sum + countBookmarks(child), 0);
}

function buildFolderViewModel(node) {
  return {
    id: node.id,
    title: node.title || t("unnamedCategory"),
    totalBookmarks: countBookmarks(node)
  };
}

async function loadManagedFolderViews() {
  const stored = await chrome.storage.local.get([
    MANAGED_FOLDER_IDS_KEY,
    MANAGED_ROOT_BOOKMARK_IDS_KEY
  ]);
  const folderIds = Array.isArray(stored[MANAGED_FOLDER_IDS_KEY]) ? stored[MANAGED_FOLDER_IDS_KEY] : [];
  const rootBookmarkIds = Array.isArray(stored[MANAGED_ROOT_BOOKMARK_IDS_KEY])
    ? stored[MANAGED_ROOT_BOOKMARK_IDS_KEY]
    : [];

  if (!folderIds.length && !rootBookmarkIds.length) {
    return [];
  }

  const views = [];

  for (const folderId of folderIds) {
    try {
      const subtree = await chrome.bookmarks.getSubTree(folderId);
      const rootNode = subtree?.[0];
      if (rootNode && !rootNode.url) {
        views.push(buildFolderViewModel(rootNode));
      }
    } catch (error) {
      // Ignore folders that were removed manually and continue loading the rest.
    }
  }

  let rootBookmarkCount = 0;
  for (const bookmarkId of rootBookmarkIds) {
    try {
      const [node] = await chrome.bookmarks.get(bookmarkId);
      if (node?.url) {
        rootBookmarkCount += 1;
      }
    } catch (error) {
      // Ignore bookmarks that were removed manually.
    }
  }

  if (rootBookmarkCount > 0) {
    views.push({
      id: "__root__",
      title: t("rootCategoryTitle"),
      totalBookmarks: rootBookmarkCount
    });
  }

  return views.filter((view) => view.totalBookmarks > 0);
}

function renderFolderDetail() {
  const folderViews =
    Array.isArray(currentStatus?.previewFolders) && currentStatus.previewFolders.length
      ? currentStatus.previewFolders
      : currentFolderViews;

  if (!folderViews.length) {
    return createEmptyState(
      t("emptyFoldersTitle"),
      t("emptyFoldersDesc")
    );
  }

  const wrapper = document.createElement("div");
  wrapper.className = "detail-stack";

  const summary = document.createElement("div");
  summary.className = "info-card";

  const summaryTitle = document.createElement("p");
  summaryTitle.className = "info-card__title";
  summaryTitle.textContent = t("folderStatsTitle");

  const summaryDesc = document.createElement("p");
  summaryDesc.className = "info-card__desc";
  summaryDesc.textContent = t("folderStatsDesc", {
    count: folderViews.reduce((sum, item) => sum + item.totalBookmarks, 0)
  });

  summary.append(summaryTitle, summaryDesc);
  wrapper.appendChild(summary);

  const tableWrap = document.createElement("div");
  tableWrap.className = "record-item";

  const table = document.createElement("table");
  table.className = "result-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>${t("tableFolder")}</th><th>${t("tableCount")}</th></tr>`;

  const tbody = document.createElement("tbody");
  [...folderViews]
    .sort((a, b) => {
      const rootTitle = t("rootCategoryTitle");
      const aRoot = a.id === "__root__" || a.title === rootTitle;
      const bRoot = b.id === "__root__" || b.title === rootTitle;
      if (aRoot !== bRoot) {
        return aRoot ? -1 : 1;
      }

      return b.totalBookmarks - a.totalBookmarks || a.title.localeCompare(b.title, "zh-CN");
    })
    .forEach((folderView) => {
      const row = document.createElement("tr");

      const titleCell = document.createElement("td");
      titleCell.textContent = folderView.title;

      const countCell = document.createElement("td");
      countCell.textContent = String(folderView.totalBookmarks);

      row.append(titleCell, countCell);
      tbody.appendChild(row);
    });

  table.append(thead, tbody);
  tableWrap.appendChild(table);
  wrapper.appendChild(tableWrap);

  return wrapper;
}

function renderCompactFolderSummary(folderViews) {
  if (!folderViews.length) {
    return null;
  }

  const section = document.createElement("div");
  section.className = "detail-group";

  const title = document.createElement("h3");
  title.className = "detail-group__title";
  title.textContent = t("navFolders");

  const table = document.createElement("table");
  table.className = "result-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>${t("tableFolder")}</th><th>${t("tableCount")}</th></tr>`;

  const tbody = document.createElement("tbody");
  [...folderViews]
    .sort((a, b) => {
      const rootTitle = t("rootCategoryTitle");
      const aRoot = a.id === "__root__" || a.title === rootTitle;
      const bRoot = b.id === "__root__" || b.title === rootTitle;
      if (aRoot !== bRoot) {
        return aRoot ? -1 : 1;
      }

      return b.totalBookmarks - a.totalBookmarks || a.title.localeCompare(b.title, "zh-CN");
    })
    .slice(0, 8)
    .forEach((folderView) => {
      const row = document.createElement("tr");

      const titleCell = document.createElement("td");
      titleCell.textContent = folderView.title;

      const countCell = document.createElement("td");
      countCell.textContent = String(folderView.totalBookmarks);

      row.append(titleCell, countCell);
      tbody.appendChild(row);
    });

  table.append(thead, tbody);
  section.append(title, table);
  return section;
}

function renderOverviewDetail() {
  const total = Number(currentStatus?.total || 0);
  const phase = titleCasePhase(currentStatus?.phase || "idle");
  const currentBatch =
    currentStatus?.currentBatch && currentStatus?.totalBatches
      ? `${currentStatus.currentBatch} / ${currentStatus.totalBatches}`
      : "—";
  const providerModel =
    currentStatus?.provider && currentStatus?.model
      ? `${currentStatus.provider} / ${currentStatus.model}`
      : t("noModelUsed");

  const wrapper = document.createElement("div");
  wrapper.className = "detail-stack";

  const summary = document.createElement("div");
  summary.className = "info-card";

  const title = document.createElement("p");
  title.className = "info-card__title";
  title.textContent = total ? t("totalBookmarksTitle", { count: total }) : t("noTaskTotal");

  const desc = document.createElement("p");
  desc.className = "info-card__desc";
  desc.textContent = total
    ? t("currentStatus", { phase })
    : t("overviewNoTaskDesc");

  summary.append(title, desc);
  wrapper.appendChild(summary);

  const messageCard = document.createElement("article");
  messageCard.className = "record-item";

  const messageTitle = document.createElement("div");
  messageTitle.className = "record-item__title";
  messageTitle.textContent = currentStatus?.message || t("notStartedMessage");

  const messageMeta = document.createElement("div");
  messageMeta.className = "record-item__suggestion";
  messageMeta.textContent = currentStatus?.detail || DEFAULT_STATUS_DETAIL;

  messageCard.append(messageTitle, messageMeta);
  wrapper.appendChild(messageCard);

  const facts = document.createElement("div");
  facts.className = "record-list";

  [
    [t("factPhase"), phase],
    [t("factCurrentBatch"), currentBatch],
    [t("factProviderModel"), providerModel],
    [t("factReused"), `${Number(currentStatus?.reused || 0)}`],
    [t("factProtectedRoots"), `${Number(currentStatus?.protectedRootCount || 0)}`],
    [t("factUpdatedAt"), formatDate(currentStatus?.updatedAt)]
  ].forEach(([label, value]) => {
    facts.appendChild(createFactItem(label, value));
  });

  wrapper.appendChild(facts);
  return wrapper;
}

function renderProcessedDetail() {
  const total = Number(currentStatus?.total || 0);
  const processed = Number(currentStatus?.processed || 0);
  const remaining = Math.max(0, total - processed);
  const progress = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const currentBatch =
    currentStatus?.currentBatch && currentStatus?.totalBatches
      ? `${currentStatus.currentBatch} / ${currentStatus.totalBatches}`
      : "—";

  const wrapper = document.createElement("div");
  wrapper.className = "detail-stack";

  const headline = document.createElement("div");
  headline.className = "info-card";

  const title = document.createElement("p");
  title.className = "info-card__title";
  title.textContent = t("processedTitle");

  const desc = document.createElement("p");
  desc.className = "info-card__desc";
  desc.textContent = t("processedDesc", { processed, total, progress, remaining });

  headline.append(title, desc);
  wrapper.appendChild(headline);

  const facts = document.createElement("div");
  facts.className = "record-list";
  [
    [t("factCurrentBatch"), currentBatch],
    [t("factBatchSize"), `${currentStatus?.batchSize || 0}`],
    [t("factReused"), `${Number(currentStatus?.reused || 0)}`],
    [t("factAiClassified"), `${Number(currentStatus?.aiClassified || 0)}`],
    [t("factUpdatedAt"), formatDate(currentStatus?.updatedAt)]
  ].forEach(([label, value]) => {
    facts.appendChild(createFactItem(label, value));
  });
  wrapper.appendChild(facts);

  const notes = document.createElement("article");
  notes.className = "record-item";

  const phaseEl = document.createElement("div");
  phaseEl.className = "record-item__title";
  phaseEl.textContent = currentStatus?.message || t("waitingProcessing");

  const metaEl = document.createElement("div");
  metaEl.className = "record-item__suggestion";
  metaEl.textContent = currentStatus?.detail || DEFAULT_STATUS_DETAIL;

  notes.append(phaseEl, metaEl);
  wrapper.appendChild(notes);

  return wrapper;
}

function renderLogDetail(logEntries, emptyTitle, emptyDescription, options = {}) {
  const allowActions = Boolean(options.allowActions);

  if (!Array.isArray(logEntries) || !logEntries.length) {
    return createEmptyState(emptyTitle, emptyDescription);
  }

  const wrapper = document.createElement("div");
  wrapper.className = "record-list";

  [...logEntries].reverse().forEach((entry) => {
    const item = document.createElement("article");
    item.className = "record-item";

    const topRow = document.createElement("div");
    topRow.className = "record-item__row";

    const titleWrap = document.createElement("div");

    const titleEl = document.createElement("div");
    titleEl.className = "record-item__title";
    titleEl.textContent = entry.title || t("untitledBookmark");

    const metaEl = document.createElement("div");
    metaEl.className = "record-item__meta";
    metaEl.textContent = [getLogKindLabel(entry.kind), formatDate(entry.createdAt), getHostname(entry.url)]
      .filter(Boolean)
      .join(" · ");

    titleWrap.append(titleEl, metaEl);

    const badge = document.createElement("span");
    badge.className = "pill";
    badge.textContent = getLogKindLabel(entry.kind);
    if ((entry.kind || "").includes("deleted")) {
      badge.classList.add("pill--success");
    } else {
      badge.classList.add("pill--warm");
    }

    topRow.append(titleWrap, badge);

    const reason = document.createElement("div");
    reason.className = "record-item__reason";
    reason.textContent = entry.reason || t("noReason");

    const suggestion = document.createElement("div");
    suggestion.className = "record-item__suggestion";
    suggestion.textContent = t("suggestionPrefix", {
      text: entry.suggestion || t("noSuggestion")
    });

    item.append(topRow, reason, suggestion);

    if (entry.url) {
      const link = document.createElement("a");
      link.className = "record-item__link";
      link.href = entry.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = entry.url;
      item.appendChild(link);
    }

    if (allowActions && entry.bookmarkId) {
      const actions = document.createElement("div");
      actions.className = "record-item__actions";

      const keepButton = document.createElement("button");
      keepButton.type = "button";
      keepButton.className = "button button--secondary button--compact";
      keepButton.textContent = t("keepButton");
      keepButton.addEventListener("click", () => {
        resolveUnprocessedEntry(entry.id, "keep").catch((error) => {
          console.error("Failed to keep unprocessed bookmark:", error);
          renderStatus({
            ...(currentStatus || {}),
            phase: "error",
            message: t("keepError")
          });
          renderDetailPanelContent();
        });
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "button button--danger button--compact";
      deleteButton.textContent = t("deleteButton");
      deleteButton.addEventListener("click", () => {
        resolveUnprocessedEntry(entry.id, "delete").catch((error) => {
          console.error("Failed to delete unprocessed bookmark:", error);
          renderStatus({
            ...(currentStatus || {}),
            phase: "error",
            message: t("deleteUnprocessedError")
          });
          renderDetailPanelContent();
        });
      });

      actions.append(keepButton, deleteButton);
      item.appendChild(actions);
    }

    wrapper.appendChild(item);
  });

  return wrapper;
}

function renderMainDetail() {
  if (!hasRunnableConfig(currentConfig)) {
    return createEmptyState(t("setupRequiredTitle"), t("setupRequiredDesc"));
  }

  const wrapper = document.createElement("div");
  wrapper.className = "detail-stack";

  const summary = document.createElement("article");
  summary.className = "record-item";

  const summaryTitle = document.createElement("div");
  summaryTitle.className = "record-item__title";
  summaryTitle.textContent = currentStatus?.message || t("notStartedMessage");

  const summaryDesc = document.createElement("div");
  summaryDesc.className = "record-item__suggestion";
  const summaryDetail =
    currentStatus?.phase === "error" || currentStatus?.phase === "preview"
      ? currentStatus?.detail || DEFAULT_STATUS_DETAIL
      : "";
  summaryDesc.textContent = summaryDetail;

  summary.append(summaryTitle);
  if (summaryDetail) {
    summary.append(summaryDesc);
  }
  wrapper.appendChild(summary);

  if (Array.isArray(currentStatus?.warnings) && currentStatus.warnings.length) {
    const warningsSection = document.createElement("div");
    warningsSection.className = "detail-group";

    const warningsTitle = document.createElement("h3");
    warningsTitle.className = "detail-group__title";
    warningsTitle.textContent = t("navWarnings");

    warningsSection.appendChild(warningsTitle);
    warningsSection.appendChild(
      renderLogDetail(
        currentStatus.warnings,
        t("noWarningsTitle"),
        t("noWarningsDesc"),
        { allowActions: true }
      )
    );
    wrapper.appendChild(warningsSection);
    return wrapper;
  }

  const folderViews =
    Array.isArray(currentStatus?.previewFolders) && currentStatus.previewFolders.length
      ? currentStatus.previewFolders
      : currentFolderViews;
  const folderSummary = renderCompactFolderSummary(folderViews);

  if (folderSummary) {
    wrapper.appendChild(folderSummary);
  }

  return wrapper;
}

function renderDetailPanelContent() {
  detailPanel.replaceChildren(renderMainDetail());
}

async function refreshDetailPanel() {
  const requestVersion = ++detailRequestVersion;

  if (Array.isArray(currentStatus?.previewFolders) && currentStatus.previewFolders.length) {
    currentFolderViews = [];
  } else {
    try {
      currentFolderViews = await loadManagedFolderViews();
    } catch (error) {
      console.error("Failed to load managed folders:", error);
      currentFolderViews = [];
    }

    if (requestVersion !== detailRequestVersion) {
      return;
    }
  }

  renderDetailPanelContent();
}

async function refreshAll() {
  const stored = await chrome.storage.local.get([CONFIG_KEY, STATUS_KEY]);
  currentConfig = stored[CONFIG_KEY] || null;
  renderConfig(currentConfig);
  renderStatus(stored[STATUS_KEY]);
  await refreshDetailPanel();
}

async function startJob() {
  startButton.disabled = true;
  const granted = await ensureBroadHostAccess();

  if (!granted) {
    await refreshAll();
    renderStatus({
      ...(currentStatus || {}),
      phase: "error",
      message: t("hostPermissionRequiredTitle"),
      detail: t("hostPermissionRequiredDetail")
    });
    renderDetailPanelContent();
    return;
  }

  const response = await chrome.runtime.sendMessage({ type: "START_ORGANIZE" });

  if (!response?.ok) {
    await refreshAll();
    renderStatus({
      ...(currentStatus || {}),
      phase: "error",
      message: response?.error || t("startJobFailed")
    });
    renderDetailPanelContent();
    return;
  }

  await refreshAll();
}

async function startPreview() {
  startButton.disabled = true;
  const granted = await ensureBroadHostAccess();

  if (!granted) {
    await refreshAll();
    renderStatus({
      ...(currentStatus || {}),
      phase: "error",
      message: t("hostPermissionRequiredTitle"),
      detail: t("hostPermissionRequiredDetail")
    });
    renderDetailPanelContent();
    return;
  }

  const response = await chrome.runtime.sendMessage({ type: "START_PREVIEW" });

  if (!response?.ok) {
    await refreshAll();
    renderStatus({
      ...(currentStatus || {}),
      phase: "error",
      message: response?.error || t("previewStartFailed")
    });
    renderDetailPanelContent();
    return;
  }

  await refreshAll();
}

async function handlePrimaryAction() {
  if (isPreviewReady()) {
    if (!window.confirm(t("previewReadyConfirm"))) {
      return;
    }

    await startJob();
    return;
  }

  await startPreview();
}

async function createManualBackup() {
  backupButton.disabled = true;
  const response = await chrome.runtime.sendMessage({ type: "CREATE_MANUAL_BACKUP" });

  if (!response?.ok) {
    await refreshAll();
    renderStatus({
      ...(currentStatus || {}),
      phase: "error",
      message: response?.error || t("createBackupFailed")
    });
    renderDetailPanelContent();
    return;
  }

  await refreshAll();
}

async function resolveUnprocessedEntry(entryId, action) {
  const response = await chrome.runtime.sendMessage({
    type: "RESOLVE_UNPROCESSED_ENTRY",
    entryId,
    action
  });

  if (!response?.ok) {
    await refreshAll();
    renderStatus({
      ...(currentStatus || {}),
      phase: "error",
      message: response?.error || t("resolveUnprocessedFailed")
    });
    renderDetailPanelContent();
    return;
  }

  await refreshAll();
}

async function cancelJob() {
  cancelButton.disabled = true;
  await chrome.runtime.sendMessage({ type: "CANCEL_JOB" });
  await refreshAll();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "JOB_STATUS_UPDATE" && message.status) {
    renderStatus(message.status);
    void refreshDetailPanel();
  }
});

optionsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

startButton.addEventListener("click", () => {
  handlePrimaryAction().catch((error) => {
    console.error("Failed to run primary action:", error);
    renderStatus({
      ...(currentStatus || {}),
      phase: "error",
      message: isPreviewReady() ? t("startJobException") : t("previewStartException")
    });
    renderDetailPanelContent();
  });
});

backupButton.addEventListener("click", () => {
  createManualBackup().catch((error) => {
    console.error("Failed to create manual backup:", error);
    renderStatus({
      ...(currentStatus || {}),
      phase: "error",
      message: t("createBackupException")
    });
    renderDetailPanelContent();
  });
});

cancelButton.addEventListener("click", () => {
  cancelJob().catch((error) => {
    console.error("Failed to cancel job:", error);
    renderStatus({
      ...(currentStatus || {}),
      phase: "error",
      message: t("cancelJobFailed")
    });
    renderDetailPanelContent();
  });
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshAll().catch(console.error);
  }
});

window.addEventListener("unload", () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});

refreshAll()
  .then(() => {
    refreshTimer = setInterval(() => {
      refreshAll().catch(console.error);
    }, 2000);
  })
  .catch((error) => {
    console.error("Failed to load popup state:", error);
    renderStatus({
      ...(currentStatus || {}),
      phase: "error",
      message: t("readStateFailed")
    });
    renderDetailPanelContent();
  });
