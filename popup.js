const CONFIG_KEY = "smartBookmarkConfig";
const STATUS_KEY = "smartBookmarkJobStatus";
const PREVIEW_PLAN_KEY = "smartBookmarkPreviewPlan";
const MANAGED_FOLDER_IDS_KEY = "smartBookmarkManagedFolderIds";
const MANAGED_ROOT_BOOKMARK_IDS_KEY = "smartBookmarkManagedRootBookmarkIds";
const HOST_ACCESS_ORIGINS = ["https://*/*", "http://*/*"];
const LINK_CHECK_MODE_FAST = "fast";
const LINK_CHECK_MODE_COMPLETE = "complete";
const I18N = globalThis.SmartBookmarkI18n;
const Providers = globalThis.SmartBookmarkProviders;
const t = (key, params) => I18N.t(key, params);

const phaseBadge = document.getElementById("phaseBadge");
const progressTrack = document.getElementById("progressTrack");
const progressBar = document.getElementById("progressBar");
const progressPercent = document.getElementById("progressPercent");
const progressSummary = document.getElementById("progressSummary");
const progressMeta = document.getElementById("progressMeta");
const totalValue = document.getElementById("totalValue");
const movedValue = document.getElementById("movedValue");
const deletedValue = document.getElementById("deletedValue");
const warningValue = document.getElementById("warningValue");
const detailPanel = document.getElementById("detailPanel");
const startButton = document.getElementById("startButton");
const backupButton = document.getElementById("backupButton");
const cancelButton = document.getElementById("cancelButton");
const optionsButton = document.getElementById("optionsButton");
const popupActionStatus = document.getElementById("popupActionStatus");
const speedModeButtons = Array.from(document.querySelectorAll("[data-popup-speed-mode]"));

let refreshTimer = null;
let currentConfig = null;
let currentStatus = null;
let currentPreviewPlan = null;
let currentFolderViews = [];
let detailRequestVersion = 0;
let applyConfirmationVisible = false;
let popupActionInFlight = false;

I18N.applyDocument(document);

const DEFAULT_STATUS_DETAIL = t("defaultStatusDetail");

function setButtonLabel(button, label) {
  const safeLabel = String(label || "").trim();
  button.textContent = safeLabel;
  button.title = safeLabel;
  button.setAttribute("aria-label", safeLabel);
}

function setButtonAccessibleLabel(button, label) {
  const safeLabel = String(label || "").trim();
  button.title = safeLabel;
  button.setAttribute("aria-label", safeLabel);
}

function getOptionsSectionUrl(sectionId = "connection") {
  const safeSection = ["connection", "organize", "automation", "backup"].includes(sectionId)
    ? sectionId
    : "connection";
  return chrome.runtime.getURL(`options.html#${safeSection}`);
}

async function openOptionsSection(sectionId = "connection") {
  const url = getOptionsSectionUrl(sectionId);

  try {
    if (chrome.tabs?.create) {
      await chrome.tabs.create({ url });
      return;
    }
  } catch (error) {
    // Fall back to Chrome's options opener if tab creation is unavailable.
  }

  chrome.runtime.openOptionsPage();
}

async function hasBroadHostAccess() {
  try {
    return await chrome.permissions.contains({ origins: HOST_ACCESS_ORIGINS });
  } catch (error) {
    return false;
  }
}

function buildOriginPattern(rawUrl) {
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
  return Boolean(buildOriginPattern(rawUrl));
}

async function hasOriginAccess(rawUrl) {
  const originPattern = buildOriginPattern(rawUrl);
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

async function ensureOriginAccess(rawUrl) {
  const originPattern = buildOriginPattern(rawUrl);
  if (!originPattern) {
    return false;
  }

  if (await hasOriginAccess(rawUrl)) {
    return true;
  }

  try {
    return await chrome.permissions.request({ origins: [originPattern] });
  } catch (error) {
    return false;
  }
}

function shouldRequireBroadHostAccess(config) {
  return config?.linkCheckMode === LINK_CHECK_MODE_COMPLETE;
}

function normalizeLinkCheckMode(rawValue) {
  return rawValue === LINK_CHECK_MODE_COMPLETE ? LINK_CHECK_MODE_COMPLETE : LINK_CHECK_MODE_FAST;
}

function mergePopupConfig(raw = {}) {
  const providerKnown = Boolean(raw?.provider && Providers?.hasProvider?.(raw.provider));
  const provider = providerKnown ? raw.provider : "openai";
  const defaults = Providers?.getProvider?.(provider) || {};

  return {
    ...(raw && typeof raw === "object" ? raw : {}),
    provider,
    baseUrl:
      providerKnown && typeof raw.baseUrl === "string" && raw.baseUrl.trim()
        ? raw.baseUrl.trim()
        : defaults.baseUrl || "",
    apiKey: providerKnown && typeof raw.apiKey === "string" ? raw.apiKey.trim() : "",
    model:
      providerKnown && typeof raw.model === "string" && raw.model.trim()
        ? raw.model.trim()
        : defaults.model || "",
    linkCheckMode: normalizeLinkCheckMode(raw.linkCheckMode)
  };
}

async function ensureOrganizeAccess(config) {
  return shouldRequireBroadHostAccess(config)
    ? await ensureBroadHostAccess()
    : await ensureOriginAccess(config?.baseUrl);
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
      manual_deleted: t("logManualDeleted"),
      fast_local_unclassified: t("logFastLocalUnclassified")
    }[kind] || t("logRecord")
  );
}

function hasPreviewAttemptConfig(config) {
  if (!config?.provider || !Providers?.hasProvider?.(config.provider) || !config?.baseUrl || !config?.model) {
    return false;
  }

  if (!isValidHttpUrl(config.baseUrl)) {
    return false;
  }

  return true;
}

function hasModelAccessConfig(config) {
  if (!hasPreviewAttemptConfig(config)) {
    return false;
  }

  const provider = Providers?.getProvider?.(config.provider);
  return Boolean(provider?.apiKeyOptional || config.apiKey);
}

function getSetupProblem(config) {
  if (!config?.provider || !Providers?.hasProvider?.(config.provider)) {
    return t("setupMissingProvider");
  }

  if (!config?.baseUrl) {
    return t("setupMissingBaseUrl");
  }

  if (!isValidHttpUrl(config.baseUrl)) {
    return t("setupInvalidBaseUrl");
  }

  if (!config?.model) {
    return t("setupMissingModel");
  }

  const provider = Providers?.getProvider?.(config.provider);
  if (!provider?.apiKeyOptional && !config?.apiKey) {
    return t("setupMissingApiKey");
  }

  return t("setupRequiredDesc");
}

function isPreviewReady() {
  return currentStatus?.phase === "preview" && Number(currentStatus?.total || 0) > 0;
}

function isSavedPreviewPlanUsable(previewPlan) {
  return Boolean(
    previewPlan &&
      previewPlan.version === 1 &&
      typeof previewPlan.configSignature === "string" &&
      typeof previewPlan.sourceBookmarkSignature === "string" &&
      Array.isArray(previewPlan.plannedBookmarks)
  );
}

function canApplyPreviewPlan() {
  return (
    isPreviewReady() ||
    (Boolean(currentStatus?.previewApplyRetryAvailable) && isSavedPreviewPlanUsable(currentPreviewPlan))
  );
}

function syncActionButtons() {
  const isRunning = currentStatus?.phase === "running";
  const isCancelling = Boolean(currentStatus?.cancelRequested);
  const isConfigured = hasPreviewAttemptConfig(currentConfig);
  const startLabel = !isConfigured
    ? t("setupButton")
    : canApplyPreviewPlan()
      ? t("confirmOrganizeButton")
      : t("previewButton");
  const cancelLabel = isCancelling ? t("cancelRequestedButton") : t("cancelButton");

  startButton.disabled = popupActionInFlight || isRunning;
  backupButton.disabled = popupActionInFlight || isRunning;
  cancelButton.disabled = popupActionInFlight || !isRunning || isCancelling;
  speedModeButtons.forEach((button) => {
    button.disabled = popupActionInFlight || isRunning;
    button.setAttribute("aria-busy", String(popupActionInFlight));
  });
  cancelButton.hidden = !isRunning;
  startButton.setAttribute("aria-busy", String(popupActionInFlight));
  backupButton.setAttribute("aria-busy", String(popupActionInFlight));
  cancelButton.setAttribute("aria-busy", String(popupActionInFlight));
  setButtonLabel(optionsButton, t("optionsButton"));
  setButtonLabel(startButton, startLabel);
  setButtonLabel(backupButton, t("backupButton"));
  setButtonLabel(cancelButton, cancelLabel);
}

function setPopupActionStatus(message = "", options = {}) {
  const text = String(message || "").trim();
  popupActionStatus.textContent = text;
  popupActionStatus.hidden = !text;
  popupActionStatus.classList.toggle("is-error", Boolean(text && options.isError));
}

function setPopupActionInFlight(inFlight, message = "") {
  popupActionInFlight = Boolean(inFlight);
  setPopupActionStatus(popupActionInFlight ? message : "");
  syncActionButtons();
}

function renderConfig(config) {
  const activeMode = normalizeLinkCheckMode(config?.linkCheckMode);
  speedModeButtons.forEach((button) => {
    const isActive = button.dataset.popupSpeedMode === activeMode;
    const modeLabel =
      button.dataset.popupSpeedMode === LINK_CHECK_MODE_COMPLETE
        ? t("popupSpeedModeCompleteAria")
        : t("popupSpeedModeFastAria");
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-checked", String(isActive));
    setButtonAccessibleLabel(button, modeLabel);
    button.tabIndex = isActive ? 0 : -1;
  });
  syncActionButtons();
}

function renderStatus(status) {
  currentStatus = status || null;
  if (!canApplyPreviewPlan()) {
    applyConfirmationVisible = false;
  }

  const phase = status?.phase || "idle";
  const total = Number(status?.total || 0);
  const processed = Number(status?.processed || 0);
  const moved = Number(status?.moved || 0);
  const deleted = Number(status?.deleted || 0);
  const warnings = Number(status?.warningCount || 0);
  const progress = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const isRunning = phase === "running";

  const phaseLabel = titleCasePhase(phase);
  if (phaseBadge.textContent !== phaseLabel) {
    phaseBadge.textContent = phaseLabel;
  }
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
  progressTrack.setAttribute("aria-valuenow", String(progress));
  progressPercent.textContent = `${progress}%`;
  const progressSummaryText = total > 0 ? `${processed} / ${total}` : "0 / 0";
  progressSummary.textContent = progressSummaryText;
  progressTrack.setAttribute("aria-valuetext", `${progress}%, ${progressSummaryText}`);

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

function createSetupRequiredState() {
  const empty = createEmptyState(t("setupRequiredTitle"), getSetupProblem(currentConfig));

  empty.appendChild(createSettingsShortcutButton());
  return empty;
}

function createSettingsShortcutButton() {
  const action = document.createElement("button");
  action.type = "button";
  action.className = "button button--primary button--compact";
  action.textContent = t("settingsShortcutButton");
  action.addEventListener("click", () => {
    void openOptionsSection("connection");
  });

  return action;
}

function shouldShowSettingsShortcut() {
  if (currentStatus?.phase !== "error") {
    return false;
  }

  if (!hasPreviewAttemptConfig(currentConfig) || !hasModelAccessConfig(currentConfig)) {
    return true;
  }

  const message = currentStatus?.message || "";
  return message === t("hostPermissionRequiredTitle") || message === t("setupMissingApiKey");
}

function canResolveUnprocessedEntries() {
  return currentStatus?.phase === "completed";
}

function createApplyConfirmationState() {
  const wrapper = document.createElement("section");
  wrapper.id = "applyConfirmation";
  wrapper.className = "confirm-strip";
  wrapper.setAttribute("role", "group");
  wrapper.setAttribute("aria-labelledby", "applyConfirmTitle");
  wrapper.setAttribute("aria-describedby", "applyConfirmDesc");

  const copy = document.createElement("div");
  copy.className = "confirm-strip__copy";

  const title = document.createElement("strong");
  title.id = "applyConfirmTitle";
  title.className = "confirm-strip__title";
  title.textContent = t("applyConfirmTitle");

  const desc = document.createElement("div");
  desc.id = "applyConfirmDesc";
  desc.className = "confirm-strip__desc";
  desc.textContent = t("applyConfirmDesc");

  copy.append(title, desc);

  const actions = document.createElement("div");
  actions.className = "confirm-strip__actions";

  const applyButton = document.createElement("button");
  applyButton.type = "button";
  applyButton.className = "button button--primary button--compact";
  applyButton.setAttribute("aria-describedby", popupActionStatus.id);
  applyButton.dataset.applyConfirmationPrimary = "true";
  const applyLabel = t("applyConfirmPrimary");
  setButtonLabel(applyButton, applyLabel);
  applyButton.addEventListener("click", () => {
    applyButton.disabled = true;
    cancelButton.disabled = true;
    applyConfirmationVisible = false;
    renderDetailPanelContent();
    startJob().catch((error) => {
      console.error("Failed to apply preview plan:", error);
      renderStatus({
        ...(currentStatus || {}),
        phase: "error",
        message: t("startJobException")
      });
      renderDetailPanelContent();
    });
  });

  const confirmationCancelButton = document.createElement("button");
  confirmationCancelButton.type = "button";
  confirmationCancelButton.className = "button button--secondary button--compact";
  const cancelApplyLabel = t("applyConfirmSecondary");
  setButtonLabel(confirmationCancelButton, cancelApplyLabel);
  confirmationCancelButton.addEventListener("click", () => {
    applyConfirmationVisible = false;
    renderDetailPanelContent();
    startButton.focus();
  });

  actions.append(applyButton, confirmationCancelButton);
  wrapper.append(copy, actions);
  return wrapper;
}

function focusApplyConfirmationPrimary() {
  detailPanel.querySelector("[data-apply-confirmation-primary]")?.focus();
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

function renderCompactFolderSummary(folderViews) {
  if (!folderViews.length) {
    return null;
  }

  const section = document.createElement("div");
  section.className = "detail-group";

  const title = document.createElement("h3");
  title.id = "folderSummaryTitle";
  title.className = "detail-group__title";
  title.textContent = t("navFolders");

  const table = document.createElement("table");
  table.className = "result-table";
  table.setAttribute("aria-labelledby", title.id);

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const folderHeader = document.createElement("th");
  folderHeader.scope = "col";
  folderHeader.textContent = t("tableFolder");
  const countHeader = document.createElement("th");
  countHeader.scope = "col";
  countHeader.textContent = t("tableCount");
  headerRow.append(folderHeader, countHeader);
  thead.appendChild(headerRow);

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
    const recordTitle = entry.title || t("untitledBookmark");

    const topRow = document.createElement("div");
    topRow.className = "record-item__row";

    const titleWrap = document.createElement("div");

    const titleEl = document.createElement("div");
    titleEl.className = "record-item__title";
    titleEl.textContent = recordTitle;

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

      const keepLabel = t("keepBookmarkAria", { title: recordTitle });
      const keepButton = document.createElement("button");
      keepButton.type = "button";
      keepButton.className = "button button--secondary button--compact";
      keepButton.textContent = t("keepButton");
      keepButton.title = keepLabel;
      keepButton.setAttribute("aria-label", keepLabel);
      keepButton.setAttribute("aria-describedby", popupActionStatus.id);
      keepButton.disabled = popupActionInFlight;

      const deleteLabel = t("deleteBookmarkAria", { title: recordTitle });
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "button button--danger button--compact";
      deleteButton.textContent = t("deleteButton");
      deleteButton.title = deleteLabel;
      deleteButton.setAttribute("aria-label", deleteLabel);
      deleteButton.setAttribute("aria-describedby", popupActionStatus.id);
      deleteButton.disabled = popupActionInFlight;

      const lockEntryActions = () => {
        keepButton.disabled = true;
        deleteButton.disabled = true;
      };

      keepButton.addEventListener("click", () => {
        lockEntryActions();
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

      deleteButton.addEventListener("click", () => {
        lockEntryActions();
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
  if (!hasPreviewAttemptConfig(currentConfig)) {
    return createSetupRequiredState();
  }

  const wrapper = document.createElement("div");
  wrapper.className = "detail-stack";

  if (applyConfirmationVisible) {
    wrapper.appendChild(createApplyConfirmationState());
  }

  const summary = document.createElement("article");
  summary.className = "record-item";

  const summaryTitle = document.createElement("div");
  summaryTitle.className = "record-item__title";
  summaryTitle.textContent = currentStatus?.message || t("notStartedMessage");

  const summaryDesc = document.createElement("div");
  summaryDesc.className = "record-item__suggestion";
  const summaryDetail =
    currentStatus?.detail ||
    (currentStatus?.phase === "error" || currentStatus?.phase === "preview"
      ? DEFAULT_STATUS_DETAIL
      : "");
  summaryDesc.textContent = summaryDetail;

  summary.append(summaryTitle);
  if (summaryDetail) {
    summary.append(summaryDesc);
  }
  if (shouldShowSettingsShortcut()) {
    const summaryActions = document.createElement("div");
    summaryActions.className = "record-item__actions";
    summaryActions.appendChild(createSettingsShortcutButton());
    summary.appendChild(summaryActions);
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
        { allowActions: canResolveUnprocessedEntries() }
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

function renderResponseError(response, fallbackMessage) {
  renderStatus({
    ...(currentStatus || {}),
    phase: "error",
    message: response?.error || fallbackMessage,
    detail: response?.detail || ""
  });
  renderDetailPanelContent();
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
  const stored = await chrome.storage.local.get([CONFIG_KEY, STATUS_KEY, PREVIEW_PLAN_KEY]);
  currentConfig = mergePopupConfig(stored[CONFIG_KEY] || {});
  currentPreviewPlan = stored[PREVIEW_PLAN_KEY] || null;
  renderConfig(currentConfig);
  renderStatus(stored[STATUS_KEY]);
  await refreshDetailPanel();
}

async function updatePopupSpeedMode(rawMode) {
  const nextMode = normalizeLinkCheckMode(rawMode);
  const currentMode = normalizeLinkCheckMode(currentConfig?.linkCheckMode);

  if (nextMode === currentMode || popupActionInFlight || currentStatus?.phase === "running") {
    return;
  }

  popupActionInFlight = true;
  setPopupActionStatus(t("popupSavingSpeedModeStatus"));
  syncActionButtons();

  try {
    const stored = await chrome.storage.local.get(CONFIG_KEY);
    const storedConfig = stored[CONFIG_KEY] || currentConfig;
    if (!storedConfig) {
      setPopupActionStatus("");
      await openOptionsSection("organize");
      return;
    }

    const nextConfig = {
      ...storedConfig,
      linkCheckMode: nextMode
    };
    await chrome.storage.local.set({ [CONFIG_KEY]: nextConfig });
    const invalidation = await chrome.runtime.sendMessage({ type: "INVALIDATE_PREVIEW_PLAN" });
    if (!invalidation?.ok) {
      throw new Error(invalidation?.error || t("popupSpeedModeFailedStatus"));
    }

    currentConfig = nextConfig;
    currentPreviewPlan = null;
    applyConfirmationVisible = false;
    renderConfig(currentConfig);
    await refreshAll();
    setPopupActionStatus(t("popupSpeedModeSavedStatus"));
  } catch (error) {
    console.error("Failed to update speed mode:", error);
    setPopupActionStatus(t("popupSpeedModeFailedStatus"), { isError: true });
  } finally {
    popupActionInFlight = false;
    syncActionButtons();
  }
}

async function startJob() {
  setPopupActionInFlight(true, t("popupApplyingPlanStatus"));

  try {
    const response = await chrome.runtime.sendMessage({ type: "APPLY_PREVIEW_PLAN" });

    if (!response?.ok) {
      await refreshAll();
      renderResponseError(response, t("startJobFailed"));
      return;
    }

    await refreshAll();
  } finally {
    setPopupActionInFlight(false);
  }
}

async function startPreview() {
  setPopupActionInFlight(true, t("popupCheckingCoverageStatus"));

  try {
    const requirement = await chrome.runtime.sendMessage({ type: "CHECK_LOCAL_MODEL_REQUIREMENT" });

    if (!requirement?.ok) {
      await refreshAll();
      renderResponseError(requirement, t("previewStartFailed"));
      return;
    }

    if (requirement.needsModel && !hasModelAccessConfig(currentConfig)) {
      await refreshAll();
      renderResponseError(
        {
          error: t("setupMissingApiKey"),
          detail: t("modelAccessRequiredForUncachedPreview")
        },
        t("setupMissingApiKey")
      );
      return;
    }

    const shouldRequestAccess = requirement.needsModel || requirement.requiresBroadHostAccess;
    if (shouldRequestAccess) {
      setPopupActionStatus(t("popupRequestingAccessStatus"));
    }
    const granted = shouldRequestAccess ? await ensureOrganizeAccess(currentConfig) : true;

    if (!granted) {
      await refreshAll();
      renderResponseError(
        { error: t("hostPermissionRequiredTitle"), detail: t("hostPermissionRequiredDetail") },
        t("hostPermissionRequiredTitle")
      );
      return;
    }

    setPopupActionStatus(t("popupStartingPreviewStatus"));
    const response = await chrome.runtime.sendMessage({
      type: "START_PREVIEW",
      localRequirementCheckId: requirement.checkId || ""
    });

    if (!response?.ok) {
      await refreshAll();
      renderResponseError(response, t("previewStartFailed"));
      return;
    }

    await refreshAll();
  } finally {
    setPopupActionInFlight(false);
  }
}

async function handlePrimaryAction() {
  if (!hasPreviewAttemptConfig(currentConfig)) {
    await openOptionsSection("connection");
    return;
  }

  if (canApplyPreviewPlan()) {
    applyConfirmationVisible = true;
    renderDetailPanelContent();
    focusApplyConfirmationPrimary();
    return;
  }

  await startPreview();
}

async function createManualBackup() {
  setPopupActionInFlight(true, t("popupCreatingBackupStatus"));

  try {
    const response = await chrome.runtime.sendMessage({ type: "CREATE_MANUAL_BACKUP" });

    if (!response?.ok) {
      await refreshAll();
      renderResponseError(response, t("createBackupFailed"));
      return;
    }

    await refreshAll();
  } finally {
    setPopupActionInFlight(false);
  }
}

async function resolveUnprocessedEntry(entryId, action) {
  setPopupActionInFlight(true, t("popupResolvingItemStatus"));

  try {
    const response = await chrome.runtime.sendMessage({
      type: "RESOLVE_UNPROCESSED_ENTRY",
      entryId,
      action
    });

    if (!response?.ok) {
      await refreshAll();
      renderResponseError(response, t("resolveUnprocessedFailed"));
      return;
    }

    await refreshAll();
  } finally {
    setPopupActionInFlight(false);
  }
}

async function cancelJob() {
  setPopupActionInFlight(true, t("popupCancellingStatus"));

  try {
    const response = await chrome.runtime.sendMessage({ type: "CANCEL_JOB" });

    if (!response?.ok) {
      await refreshAll();
      renderResponseError(response, t("cancelJobFailed"));
      return;
    }

    await refreshAll();
  } finally {
    setPopupActionInFlight(false);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "JOB_STATUS_UPDATE" && message.status) {
    renderStatus(message.status);
    void refreshDetailPanel();
  }
});

optionsButton.addEventListener("click", () => {
  void openOptionsSection("connection");
});

speedModeButtons.forEach((button, index) => {
  button.addEventListener("click", () => {
    updatePopupSpeedMode(button.dataset.popupSpeedMode).catch((error) => {
      console.error("Failed to switch speed mode:", error);
      setPopupActionStatus(t("popupSpeedModeFailedStatus"), { isError: true });
    });
  });

  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + speedModeButtons.length) % speedModeButtons.length;
    const nextButton = speedModeButtons[nextIndex];
    nextButton.focus();
    updatePopupSpeedMode(nextButton.dataset.popupSpeedMode).catch((error) => {
      console.error("Failed to switch speed mode from keyboard:", error);
      setPopupActionStatus(t("popupSpeedModeFailedStatus"), { isError: true });
    });
  });
});

startButton.addEventListener("click", () => {
  handlePrimaryAction().catch((error) => {
    console.error("Failed to run primary action:", error);
    renderStatus({
      ...(currentStatus || {}),
      phase: "error",
      message: canApplyPreviewPlan() ? t("startJobException") : t("previewStartException")
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
