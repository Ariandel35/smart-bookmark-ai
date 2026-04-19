const CONFIG_KEY = "smartBookmarkConfig";
const STATUS_KEY = "smartBookmarkJobStatus";
const MANAGED_FOLDER_IDS_KEY = "smartBookmarkManagedFolderIds";
const HOST_ACCESS_ORIGINS = ["https://*/*", "http://*/*"];

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
const detailViewButtons = Array.from(document.querySelectorAll("[data-detail-view]"));

let refreshTimer = null;
let currentConfig = null;
let currentStatus = null;
let currentFolderViews = [];
let selectedDetailView = "overview";
let detailRequestVersion = 0;

const DEFAULT_STATUS_DETAIL =
  "整理会尽量压缩为少量大类、最多两级，并清理明显重复或已失效的书签。";

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
    idle: "空闲",
    running: "执行中",
    completed: "已完成",
    cancelled: "已取消",
    error: "出错"
  };

  return phaseMap[phase] || "未知";
}

function shorten(text, maxLength = 42) {
  if (!text) {
    return "-";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function formatDate(dateString) {
  if (!dateString) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date(dateString));
  } catch (error) {
    return "—";
  }
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
      move_failed: "移动失败",
      delete_failed: "删除失败",
      scan_uncertain: "状态不明确",
      scan_failed: "扫描失败",
      duplicate_deleted: "重复删除",
      dead_link_deleted: "死链删除",
      manual_deleted: "手动删除"
    }[kind] || "记录"
  );
}

function hasRunnableConfig(config) {
  return Boolean(config?.provider && config?.baseUrl && config?.model);
}

function syncActionButtons() {
  const isRunning = currentStatus?.phase === "running";
  startButton.disabled = isRunning || !hasRunnableConfig(currentConfig);
  backupButton.disabled = isRunning;
  cancelButton.disabled = !isRunning;
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
    metaParts.push(`第 ${status.currentBatch}/${status.totalBatches} 批`);
  }
  if (status?.batchSize) {
    metaParts.push(`批大小 ${status.batchSize}`);
  }
  if (status?.updatedAt) {
    metaParts.push(`最近更新 ${formatDate(status.updatedAt)}`);
  }
  progressMeta.textContent = metaParts.join(" · ") || "等待开始";

  totalValue.textContent = String(total);
  processedValue.textContent = String(processed);
  movedValue.textContent = String(moved);
  deletedValue.textContent = String(deleted);
  warningValue.textContent = String(warnings);

  syncActionButtons();
  syncDetailViewButtons();
}

function syncDetailViewButtons() {
  detailViewButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.detailView === selectedDetailView);
  });
}

function setDetailView(view) {
  selectedDetailView = view;
  syncDetailViewButtons();
  void refreshDetailPanel();
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
    title: node.title || "未命名分类",
    totalBookmarks: countBookmarks(node)
  };
}

async function loadManagedFolderViews() {
  const stored = await chrome.storage.local.get(MANAGED_FOLDER_IDS_KEY);
  const folderIds = Array.isArray(stored[MANAGED_FOLDER_IDS_KEY]) ? stored[MANAGED_FOLDER_IDS_KEY] : [];

  if (!folderIds.length) {
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
      // 文件夹可能已被手动删除，忽略并继续读取其余分类。
    }
  }

  return views.filter((view) => view.totalBookmarks > 0);
}

function renderFolderDetail() {
  if (!currentFolderViews.length) {
    return createEmptyState(
      "还没有可查看的分类结果",
      "开始整理后，这里会显示每个分类下当前有多少条书签。"
    );
  }

  const wrapper = document.createElement("div");
  wrapper.className = "detail-stack";

  const summary = document.createElement("div");
  summary.className = "info-card";

  const summaryTitle = document.createElement("p");
  summaryTitle.className = "info-card__title";
  summaryTitle.textContent = "分类统计";

  const summaryDesc = document.createElement("p");
  summaryDesc.className = "info-card__desc";
  summaryDesc.textContent = `共 ${currentFolderViews.reduce((sum, item) => sum + item.totalBookmarks, 0)} 条已归类书签。`;

  summary.append(summaryTitle, summaryDesc);
  wrapper.appendChild(summary);

  const tableWrap = document.createElement("div");
  tableWrap.className = "record-item";

  const table = document.createElement("table");
  table.className = "result-table";

  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>分类</th><th>书签数</th></tr>";

  const tbody = document.createElement("tbody");
  [...currentFolderViews]
    .sort((a, b) => b.totalBookmarks - a.totalBookmarks || a.title.localeCompare(b.title, "zh-CN"))
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
      : "当前任务未调用模型";

  const wrapper = document.createElement("div");
  wrapper.className = "detail-stack";

  const summary = document.createElement("div");
  summary.className = "info-card";

  const title = document.createElement("p");
  title.className = "info-card__title";
  title.textContent = total ? `共 ${total} 条书签` : "还没有任务总量";

  const desc = document.createElement("p");
  desc.className = "info-card__desc";
  desc.textContent = total
    ? `当前状态：${phase}`
    : "开始整理后，这里会显示本次任务总量。";

  summary.append(title, desc);
  wrapper.appendChild(summary);

  const messageCard = document.createElement("article");
  messageCard.className = "record-item";

  const messageTitle = document.createElement("div");
  messageTitle.className = "record-item__title";
  messageTitle.textContent = currentStatus?.message || "尚未开始整理。";

  const messageMeta = document.createElement("div");
  messageMeta.className = "record-item__suggestion";
  messageMeta.textContent = currentStatus?.detail || DEFAULT_STATUS_DETAIL;

  messageCard.append(messageTitle, messageMeta);
  wrapper.appendChild(messageCard);

  const facts = document.createElement("div");
  facts.className = "record-list";

  [
    ["阶段", phase],
    ["当前批次", currentBatch],
    ["Provider / Model", providerModel],
    ["最近更新", formatDate(currentStatus?.updatedAt)]
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
  title.textContent = "处理进度";

  const desc = document.createElement("p");
  desc.className = "info-card__desc";
  desc.textContent = `当前已处理 ${processed} / ${total}，完成度 ${progress}%，剩余 ${remaining} 条。`;

  headline.append(title, desc);
  wrapper.appendChild(headline);

  const facts = document.createElement("div");
  facts.className = "record-list";
  [
    ["当前批次", currentBatch],
    ["批大小", `${currentStatus?.batchSize || 0}`],
    ["最近更新", formatDate(currentStatus?.updatedAt)]
  ].forEach(([label, value]) => {
    facts.appendChild(createFactItem(label, value));
  });
  wrapper.appendChild(facts);

  const notes = document.createElement("article");
  notes.className = "record-item";

  const phaseEl = document.createElement("div");
  phaseEl.className = "record-item__title";
  phaseEl.textContent = currentStatus?.message || "等待开始处理。";

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
    titleEl.textContent = entry.title || "(无标题书签)";

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
    reason.textContent = entry.reason || "暂无说明。";

    const suggestion = document.createElement("div");
    suggestion.className = "record-item__suggestion";
    suggestion.textContent = `处理建议：${entry.suggestion || "暂无额外建议。"}`;

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
      keepButton.textContent = "保留";
      keepButton.addEventListener("click", () => {
        resolveUnprocessedEntry(entry.id, "keep").catch((error) => {
          console.error("Failed to keep unprocessed bookmark:", error);
          renderStatus({
            ...(currentStatus || {}),
            phase: "error",
            message: "保留书签时发生异常。"
          });
          renderDetailPanelContent();
        });
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "button button--danger button--compact";
      deleteButton.textContent = "删除";
      deleteButton.addEventListener("click", () => {
        resolveUnprocessedEntry(entry.id, "delete").catch((error) => {
          console.error("Failed to delete unprocessed bookmark:", error);
          renderStatus({
            ...(currentStatus || {}),
            phase: "error",
            message: "删除未处理书签时发生异常。"
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

function renderDetailPanelContent() {
  let content = null;

  if (selectedDetailView === "warnings") {
    content = renderLogDetail(
      currentStatus?.warnings || [],
      "暂无未处理项目",
      "扫描状态不明确、移动失败或其他需要你决定的书签会出现在这里。",
      { allowActions: true }
    );
  } else if (selectedDetailView === "deleted") {
    content = renderLogDetail(
      currentStatus?.deletedItems || [],
      "暂无删除记录",
      "自动删除重复书签或确认失效书签后，这里会留下可追溯的记录。"
    );
  } else if (selectedDetailView === "processed") {
    content = renderProcessedDetail();
  } else if (selectedDetailView === "overview") {
    content = renderOverviewDetail();
  } else {
    content = renderFolderDetail();
  }

  detailPanel.replaceChildren(content);
}

async function refreshDetailPanel() {
  const requestVersion = ++detailRequestVersion;

  if (selectedDetailView === "folders") {
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
      message: "未授权网站访问，无法开始整理。",
      detail: "书签整理会检测失效链接并访问你配置的模型接口。请先授权网站访问，再重新开始整理。"
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
      message: response?.error || "启动任务失败。"
    });
    renderDetailPanelContent();
    return;
  }

  await refreshAll();
}

async function createManualBackup() {
  backupButton.disabled = true;
  const response = await chrome.runtime.sendMessage({ type: "CREATE_MANUAL_BACKUP" });

  if (!response?.ok) {
    await refreshAll();
    renderStatus({
      ...(currentStatus || {}),
      phase: "error",
      message: response?.error || "创建备份失败。"
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
      message: response?.error || "处理未处理书签失败。"
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

detailViewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setDetailView(button.dataset.detailView || "folders");
  });
});

optionsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

startButton.addEventListener("click", () => {
  startJob().catch((error) => {
    console.error("Failed to start job:", error);
    renderStatus({
      ...(currentStatus || {}),
      phase: "error",
      message: "启动后台任务时发生异常。"
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
      message: "创建手动备份时发生异常。"
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
      message: "取消任务失败，请稍后重试。"
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
      message: "读取本地状态失败，请重开弹窗。"
    });
    renderDetailPanelContent();
  });
