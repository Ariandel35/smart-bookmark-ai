const STORAGE_KEY = "smartBookmarkConfig";
const HOST_ACCESS_ORIGINS = ["https://*/*", "http://*/*"];
const I18N = globalThis.SmartBookmarkI18n;
const Providers = globalThis.SmartBookmarkProviders;
const t = (key, params) => I18N.t(key, params);
const LEGACY_DEFAULT_PROMPT = I18N.getLegacyDefaultPrompt();
const DEFAULT_PROMPT = I18N.getDefaultPrompt();
const DEFAULT_BATCH_SIZE = 50;
const MIN_BATCH_SIZE = 5;
const DEEPSEEK_RUNTIME_BATCH_SIZE = 9;
const RUNTIME_BATCH_SIZE_CAPS = {
  deepseek: DEEPSEEK_RUNTIME_BATCH_SIZE
};
const LINK_CHECK_MODE_FAST = "fast";
const LINK_CHECK_MODE_BALANCED = "balanced";
const LINK_CHECK_MODE_COMPLETE = "complete";

const form = document.getElementById("settingsForm");
const settingsFields = Array.from(form.querySelectorAll("input, select, textarea"));
const providerSelect = document.getElementById("provider");
const baseUrlInput = document.getElementById("baseUrl");
const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const batchSizeInput = document.getElementById("batchSize");
const batchSizeCapHint = document.getElementById("batchSizeCapHint");
const linkCheckModeSelect = document.getElementById("linkCheckMode");
const linkCheckModeButtons = Array.from(document.querySelectorAll("[data-settings-speed-mode]"));
const connectionModeHint = document.getElementById("connectionModeHint");
const aiConnectionBlock = document.getElementById("aiConnectionBlock");
const aiConnectionSummaryNote = document.getElementById("aiConnectionSummaryNote");
const autoOrganizeEnabledInput = document.getElementById("autoOrganizeEnabled");
const autoOrganizeState = document.getElementById("autoOrganizeState");
const autoOrganizeAccessHint = document.getElementById("autoOrganizeAccessHint");
const autoOrganizeIntervalInput = document.getElementById("autoOrganizeIntervalHours");
const whitelistSearchInput = document.getElementById("whitelistSearch");
const whitelistDomainsInput = document.getElementById("whitelistDomains");
const whitelistSelectionStatus = document.getElementById("whitelistSelectionStatus");
const whitelistSelected = document.getElementById("whitelistSelected");
const whitelistSelectedEmpty = document.getElementById("whitelistSelectedEmpty");
const whitelistDomainList = document.getElementById("whitelistDomainList");
const protectedRootFoldersInput = document.getElementById("protectedRootFolders");
const domainFolderRulesInput = document.getElementById("domainFolderRules");
const customPromptInput = document.getElementById("customPrompt");
const apiTestStatus = document.getElementById("apiTestStatus");
const hostAccessStatus = document.getElementById("hostAccessStatus");
const settingsActionStatus = document.getElementById("settingsActionStatus");
const saveBadge = document.getElementById("saveBadge");
const saveButton = document.getElementById("saveButton");
const testApiButton = document.getElementById("testApiButton");
const grantAccessButton = document.getElementById("grantAccessButton");
const resetButton = document.getElementById("resetButton");
const privacyButton = document.getElementById("privacyButton");
const backupList = document.getElementById("backupList");
const backupStatusBadge = document.getElementById("backupStatusBadge");
const backupActionStatus = document.getElementById("backupActionStatus");
const createBackupButton = document.getElementById("createBackupButton");
const navButtons = Array.from(document.querySelectorAll("[data-section-target]"));
const sectionPanels = Array.from(document.querySelectorAll("[data-section-panel]"));

let lastProvider = "openai";
let whitelistSelection = [];
let whitelistCatalog = [];
let whitelistCatalogLoaded = false;
let whitelistCatalogLoadFailed = false;
let currentBackupRecords = [];
let pendingBackupAction = null;
let backupActionInFlight = false;
let settingsActionInFlight = false;
let settingsReady = false;
let hostAccessRefreshVersion = 0;
let hostAccessCheckingInFlight = false;
let hostAccessRefreshTimer = null;

I18N.applyDocument(document);
syncNavigationButtonLabels();
syncPrimaryActionButtonLabels();
renderProviderOptions();
renderWhitelistSelection();
renderWhitelistDomainList();

function setButtonLabel(button, label) {
  const safeLabel = String(label || "").trim();
  button.textContent = safeLabel;
  button.title = safeLabel;
  button.setAttribute("aria-label", safeLabel);
}

function setGrantAccessButtonState(granted = false, options = {}) {
  const isGranted = Boolean(granted);
  const accessNeeded = options.accessNeeded !== false;
  grantAccessButton.dataset.granted = String(isGranted);
  grantAccessButton.dataset.accessNeeded = String(accessNeeded);
  setButtonLabel(
    grantAccessButton,
    !accessNeeded
      ? t("hostAccessNotNeededButton")
      : isGranted
        ? t("hostAccessGrantedButton")
        : t("hostAccessButton")
  );
}

function syncPrimaryActionButtonLabels() {
  setButtonLabel(saveButton, t("saveButton"));
  setButtonLabel(resetButton, t("resetButton"));
  setButtonLabel(privacyButton, t("privacyButton"));
  setButtonLabel(testApiButton, t("testApiButton"));
  setButtonLabel(createBackupButton, t("createBackupNow"));
  setGrantAccessButtonState(grantAccessButton.dataset.granted === "true", {
    accessNeeded: grantAccessButton.dataset.accessNeeded !== "false"
  });
}

function syncNavigationButtonLabels() {
  navButtons.forEach((button) => {
    const label = button.querySelector(".nav-button__title")?.textContent || "";
    const safeLabel = label.trim();
    if (!safeLabel) {
      return;
    }

    button.title = safeLabel;
    button.setAttribute("aria-label", safeLabel);
  });
}

function getDefaults(provider) {
  return Providers.getProvider(provider);
}

function getDefaultBatchSize(provider) {
  return provider === "deepseek" ? DEEPSEEK_RUNTIME_BATCH_SIZE : DEFAULT_BATCH_SIZE;
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

function getRuntimeBatchSizeCap(config = {}) {
  return RUNTIME_BATCH_SIZE_CAPS[getProviderPerformanceProfile(config)] || 0;
}

function buildDefaultConfig(provider = "openai") {
  const defaults = getDefaults(provider);
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
  const linkCheckMode = normalizeLinkCheckMode(raw.linkCheckMode || defaults.linkCheckMode);
  const autoOrganizeEnabled =
    Boolean(raw.autoOrganizeEnabled) &&
    (!shouldRequireModelAccess({ linkCheckMode }) || Boolean(defaults.apiKeyOptional || apiKey));
  const baseUrl =
    providerKnown && typeof raw.baseUrl === "string" && raw.baseUrl.trim()
      ? raw.baseUrl.trim()
      : defaults.baseUrl;
  const model =
    providerKnown && typeof raw.model === "string" && raw.model.trim()
      ? raw.model.trim()
      : defaults.model;
  const batchProfileConfig = { provider, baseUrl, model };

  return {
    provider,
    baseUrl,
    apiKey,
    model,
    batchSize: normalizeConfigBatchSize(raw.batchSize, batchProfileConfig, defaults.batchSize),
    linkCheckMode,
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

function parseWhitelistDomains(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return [];
  }

  return Array.from(
    new Set(
      rawValue
        .split(/[\n,]+/g)
        .map((entry) => normalizeWhitelistDomain(entry))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "en"));
}

function serializeWhitelistDomains() {
  return whitelistSelection.join("\n");
}

function extractHostname(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!/^https?:$/i.test(url.protocol)) {
      return "";
    }

    return url.hostname.toLowerCase();
  } catch (error) {
    return "";
  }
}

function setWhitelistSelection(domains, options = {}) {
  whitelistSelection = Array.from(
    new Set((Array.isArray(domains) ? domains : []).map((domain) => normalizeWhitelistDomain(domain)).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "en"));
  whitelistDomainsInput.value = serializeWhitelistDomains();
  renderWhitelistSelection();
  renderWhitelistDomainList();

  if (options.markDirty) {
    markPending();
  }
}

function toggleWhitelistDomain(domain) {
  const normalized = normalizeWhitelistDomain(domain);
  if (!normalized) {
    return;
  }

  const next = new Set(whitelistSelection);
  if (next.has(normalized)) {
    next.delete(normalized);
  } else {
    next.add(normalized);
  }

  setWhitelistSelection(Array.from(next), { markDirty: true });
}

function renderWhitelistSelection() {
  whitelistSelected.replaceChildren();

  whitelistSelection.forEach((domain) => {
    const removeLabel = t("whitelistRemoveDomain", { domain });
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip chip--interactive is-active";
    button.title = removeLabel;
    button.setAttribute("aria-label", removeLabel);

    const label = document.createElement("span");
    label.textContent = domain;

    const remove = document.createElement("span");
    remove.className = "chip__remove";
    remove.textContent = "×";
    remove.setAttribute("aria-hidden", "true");

    button.append(label, remove);
    button.addEventListener("click", () => {
      toggleWhitelistDomain(domain);
    });

    whitelistSelected.appendChild(button);
  });

  whitelistSelectedEmpty.classList.toggle("hidden", whitelistSelection.length > 0);
  whitelistSelectionStatus.textContent = t("whitelistSelectionCount", {
    count: whitelistSelection.length
  });
  whitelistSelectionStatus.hidden = false;
}

function renderWhitelistDomainList() {
  whitelistDomainList.replaceChildren();

  if (!whitelistCatalogLoaded) {
    const loading = document.createElement("div");
    loading.className = "empty-state";
    loading.textContent = t("whitelistLoading");
    whitelistDomainList.appendChild(loading);
    return;
  }

  if (whitelistCatalogLoadFailed) {
    const error = document.createElement("div");
    error.className = "empty-state";
    error.textContent = t("whitelistCatalogLoadFailed");
    whitelistDomainList.appendChild(error);
    return;
  }

  const keyword = whitelistSearchInput.value.trim().toLowerCase();
  const selectedSet = new Set(whitelistSelection);
  const filtered = whitelistCatalog
    .filter((item) => item.domain.includes(keyword))
    .sort((a, b) => {
      const aSelected = selectedSet.has(a.domain);
      const bSelected = selectedSet.has(b.domain);
      if (aSelected !== bSelected) {
        return aSelected ? -1 : 1;
      }

      return b.count - a.count || a.domain.localeCompare(b.domain, "en");
    });

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = keyword
      ? t("whitelistNoResults")
      : whitelistCatalog.length
        ? t("whitelistNoResults")
        : t("whitelistCatalogEmpty");
    whitelistDomainList.appendChild(empty);
    return;
  }

  filtered.slice(0, keyword ? 120 : 80).forEach((item) => {
    const isSelected = selectedSet.has(item.domain);
    const actionLabel = t(isSelected ? "whitelistRemoveDomainWithCount" : "whitelistAddDomainWithCount", {
      domain: item.domain,
      count: item.count
    });
    const button = document.createElement("button");
    button.type = "button";
    button.className = `whitelist-option${isSelected ? " is-selected" : ""}`;
    button.title = actionLabel;
    button.setAttribute("aria-label", actionLabel);
    button.setAttribute("aria-pressed", String(isSelected));

    const domain = document.createElement("span");
    domain.className = "whitelist-option__domain";
    domain.textContent = item.domain;

    const meta = document.createElement("span");
    meta.className = "whitelist-option__meta";
    meta.textContent = t("whitelistBookmarkCount", {
      count: item.count
    });

    button.append(domain, meta);
    button.addEventListener("click", () => {
      toggleWhitelistDomain(item.domain);
    });

    whitelistDomainList.appendChild(button);
  });
}

async function loadWhitelistDomainCatalog() {
  whitelistCatalogLoaded = false;
  whitelistCatalogLoadFailed = false;
  renderWhitelistDomainList();

  try {
    const tree = await chrome.bookmarks.getTree();
    const counts = new Map();

    const walk = (node) => {
      if (node.url) {
        const hostname = extractHostname(node.url);
        if (hostname) {
          counts.set(hostname, (counts.get(hostname) || 0) + 1);
        }
        return;
      }

      for (const child of node.children || []) {
        walk(child);
      }
    };

    for (const node of tree) {
      walk(node);
    }

    whitelistCatalog = Array.from(counts.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain, "en"));
    whitelistCatalogLoadFailed = false;
  } catch (error) {
    console.error("Failed to load whitelist domain catalog:", error);
    whitelistCatalog = [];
    whitelistCatalogLoadFailed = true;
  } finally {
    whitelistCatalogLoaded = true;
    renderWhitelistDomainList();
  }
}

function renderProviderOptions() {
  const selectedProvider = Providers.hasProvider(providerSelect.value)
    ? providerSelect.value
    : Providers.hasProvider(lastProvider)
      ? lastProvider
      : "openai";

  providerSelect.replaceChildren();

  Providers.listProviders().forEach((provider) => {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    providerSelect.appendChild(option);
  });

  providerSelect.value = Providers.hasProvider(selectedProvider) ? selectedProvider : "openai";
  lastProvider = providerSelect.value;
}

function setSaveBadge(text, variant = "") {
  saveBadge.textContent = text;
  saveBadge.className = variant ? `pill pill--${variant}` : "pill";
}

function setApiTestStatus(message = "", isError = false) {
  apiTestStatus.textContent = message;
  apiTestStatus.hidden = !message;
  apiTestStatus.classList.toggle("is-error", Boolean(message) && isError);
}

function setBackupBadge(text, variant = "") {
  backupStatusBadge.textContent = text;
  backupStatusBadge.className = variant ? `pill pill--${variant}` : "pill";
}

function setBackupActionStatus(message = "", isError = false) {
  backupActionStatus.textContent = message;
  backupActionStatus.hidden = !message;
  backupActionStatus.classList.toggle("is-error", Boolean(message) && isError);
}

function setSettingsActionStatus(message = "", isError = false) {
  settingsActionStatus.textContent = message;
  settingsActionStatus.hidden = !message;
  settingsActionStatus.classList.toggle("is-error", Boolean(message) && isError);
}

function clearSettingsActionStatus() {
  setSettingsActionStatus("");
  clearSettingsFieldIssues();
}

function clearApiTestStatus() {
  setApiTestStatus("");
}

async function openPrivacyPage() {
  const privacyUrl = globalThis.chrome?.runtime?.getURL
    ? chrome.runtime.getURL("privacy.html")
    : "privacy.html";

  try {
    if (chrome.tabs?.create) {
      await chrome.tabs.create({ url: privacyUrl });
      return;
    }
  } catch (error) {
    // Fall back to window.open when tab creation is not available in this context.
  }

  const openedWindow = window.open(privacyUrl, "_blank", "noopener");
  if (!openedWindow) {
    throw new Error(t("privacyOpenFailed"));
  }
}

function getDescribedByTokens(field) {
  return String(field.getAttribute("aria-describedby") || "")
    .split(/\s+/)
    .filter(Boolean);
}

function setDescribedByTokens(field, tokens) {
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
  if (!uniqueTokens.length) {
    field.removeAttribute("aria-describedby");
    return;
  }

  field.setAttribute("aria-describedby", uniqueTokens.join(" "));
}

function addDescribedByToken(field, token) {
  if (!token) {
    return;
  }

  setDescribedByTokens(field, [...getDescribedByTokens(field), token]);
}

function removeDescribedByTokens(field, tokensToRemove) {
  const removeSet = new Set(tokensToRemove.filter(Boolean));
  setDescribedByTokens(
    field,
    getDescribedByTokens(field).filter((token) => !removeSet.has(token))
  );
}

function clearSettingsFieldIssues() {
  Array.from(form.querySelectorAll("[aria-invalid]")).forEach((field) => {
    field.removeAttribute("aria-invalid");
    removeDescribedByTokens(field, [settingsActionStatus.id, apiTestStatus.id]);
  });
}

function clearSettingsFieldIssue(fieldId) {
  const field = fieldId ? document.getElementById(fieldId) : null;
  if (!field) {
    return;
  }

  field.removeAttribute("aria-invalid");
  removeDescribedByTokens(field, [settingsActionStatus.id, apiTestStatus.id]);
}

function updateSettingsOperationControls() {
  const isLocked = !settingsReady || settingsActionInFlight;
  const granted = grantAccessButton.dataset.granted === "true";
  const accessNeeded = grantAccessButton.dataset.accessNeeded !== "false";
  settingsFields.forEach((field) => {
    field.disabled = isLocked;
  });
  linkCheckModeButtons.forEach((button) => {
    button.disabled = isLocked;
  });
  saveButton.disabled = isLocked;
  testApiButton.disabled = isLocked;
  resetButton.disabled = isLocked;
  grantAccessButton.disabled = isLocked || !accessNeeded || granted || hostAccessCheckingInFlight;
}

function updateBackupOperationControls() {
  createBackupButton.disabled = !settingsReady || backupActionInFlight;
}

function setSettingsReady(isReady) {
  settingsReady = Boolean(isReady);
  updateSettingsOperationControls();
  updateBackupOperationControls();
}

function setSettingsActionInFlight(isInFlight) {
  settingsActionInFlight = Boolean(isInFlight);
  updateSettingsOperationControls();
}

function setHostAccessStatus(message = "", isGranted = false) {
  hostAccessStatus.textContent = message;
  hostAccessStatus.hidden = !message;
  hostAccessStatus.classList.toggle("is-error", Boolean(message) && !isGranted);
}

function renderHostAccessRefreshFailure(message = t("hostAccessRefreshFailed")) {
  hostAccessCheckingInFlight = false;
  setHostAccessStatus(message, false);
  setGrantAccessButtonState(false);
  updateSettingsOperationControls();
}

function focusSettingsField(fieldId) {
  const field = fieldId ? document.getElementById(fieldId) : null;
  if (!field) {
    return;
  }

  window.requestAnimationFrame(() => {
    field.focus();
  });
}

function markSettingsFieldIssue(fieldId, describedByElement = settingsActionStatus) {
  const field = fieldId ? document.getElementById(fieldId) : null;
  if (!field) {
    return;
  }

  field.setAttribute("aria-invalid", "true");
  if (describedByElement?.id) {
    addDescribedByToken(field, describedByElement.id);
  }
}

function showSettingsIssue(message, sectionId = "", fieldId = "") {
  if (sectionId) {
    setActiveSection(sectionId);
  }

  markSettingsFieldIssue(fieldId);
  setSettingsActionStatus(message, true);
  focusSettingsField(fieldId);
}

function showApiTestIssue(message, fieldId = "") {
  setActiveSection("connection");
  markSettingsFieldIssue(fieldId, apiTestStatus);
  setSaveBadge(t("saveBadgeFailed"), "danger");
  setApiTestStatus(message, true);
  focusSettingsField(fieldId);
}

function formatDate(dateString) {
  return I18N.formatDate(dateString, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function updateProviderHints(provider) {
  const defaults = getDefaults(provider);
  modelInput.placeholder = defaults.model;
  baseUrlInput.placeholder = defaults.baseUrl;
  apiKeyInput.placeholder = defaults.apiKeyOptional
    ? t("placeholderApiKeyOptional")
    : t("placeholderApiKey");
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

async function hasBroadHostAccess() {
  try {
    return await chrome.permissions.contains({ origins: HOST_ACCESS_ORIGINS });
  } catch (error) {
    return false;
  }
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

async function refreshHostAccessStatus() {
  clearScheduledHostAccessStatusRefresh();
  const refreshVersion = ++hostAccessRefreshVersion;
  const config = collectFormData();
  const requiresBroadAccess = shouldRequireBroadHostAccess(config);
  const requiresModelAccess = shouldRequireModelAccess(config);

  if (!requiresBroadAccess && !requiresModelAccess) {
    hostAccessCheckingInFlight = false;
    setHostAccessStatus(t("hostAccessNotNeeded"), true);
    setGrantAccessButtonState(false, { accessNeeded: false });
    updateSettingsOperationControls();
    return;
  }

  if (!config.baseUrl) {
    hostAccessCheckingInFlight = false;
    setHostAccessStatus(t("baseUrlRequired"), false);
    setGrantAccessButtonState(false);
    updateSettingsOperationControls();
    return;
  }
  if (!isValidHttpUrl(config.baseUrl)) {
    hostAccessCheckingInFlight = false;
    setHostAccessStatus(t("baseUrlInvalid"), false);
    setGrantAccessButtonState(false);
    updateSettingsOperationControls();
    return;
  }

  hostAccessCheckingInFlight = true;
  setHostAccessStatus(t("hostAccessChecking"), true);
  setGrantAccessButtonState(false);
  updateSettingsOperationControls();

  let granted;
  try {
    granted = requiresBroadAccess
      ? await hasBroadHostAccess()
      : await hasOriginAccess(config.baseUrl);
  } catch (error) {
    if (refreshVersion === hostAccessRefreshVersion) {
      renderHostAccessRefreshFailure();
    }
    throw error;
  }

  if (refreshVersion !== hostAccessRefreshVersion) {
    return;
  }

  hostAccessCheckingInFlight = false;
  setHostAccessStatus(
    granted ? "" : requiresBroadAccess ? t("hostAccessMissing") : t("currentApiAccessMissing"),
    granted
  );
  setGrantAccessButtonState(granted);
  updateSettingsOperationControls();
}

function clearScheduledHostAccessStatusRefresh() {
  if (!hostAccessRefreshTimer) {
    return;
  }

  clearTimeout(hostAccessRefreshTimer);
  hostAccessRefreshTimer = null;
}

function scheduleHostAccessStatusRefresh(reason) {
  clearScheduledHostAccessStatusRefresh();
  hostAccessRefreshVersion += 1;
  hostAccessCheckingInFlight = true;
  setHostAccessStatus(t("hostAccessChecking"), true);
  setGrantAccessButtonState(false);
  updateSettingsOperationControls();

  hostAccessRefreshTimer = setTimeout(() => {
    hostAccessRefreshTimer = null;
    void refreshHostAccessStatus().catch((error) => {
      console.error(`Failed to refresh host access status after ${reason}:`, error);
      renderHostAccessRefreshFailure();
    });
  }, 250);
}

function renderLinkCheckModeButtons(mode = normalizeLinkCheckMode(linkCheckModeSelect.value)) {
  const activeMode = normalizeLinkCheckMode(mode);
  const modeLabels = {
    [LINK_CHECK_MODE_FAST]: t("popupSpeedModeFastAria"),
    [LINK_CHECK_MODE_BALANCED]: t("popupSpeedModeBalancedAria"),
    [LINK_CHECK_MODE_COMPLETE]: t("popupSpeedModeCompleteAria")
  };

  linkCheckModeButtons.forEach((button) => {
    const buttonMode = normalizeLinkCheckMode(button.dataset.settingsSpeedMode);
    const isActive = buttonMode === activeMode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-checked", String(isActive));
    button.title = modeLabels[buttonMode] || "";
    button.setAttribute("aria-label", modeLabels[buttonMode] || button.textContent.trim());
    button.tabIndex = isActive ? 0 : -1;
  });
}

function setLinkCheckMode(mode, options = {}) {
  const nextMode = normalizeLinkCheckMode(mode);
  const previousMode = normalizeLinkCheckMode(linkCheckModeSelect.value);

  linkCheckModeSelect.value = nextMode;
  renderLinkCheckModeButtons(nextMode);

  if (options.emitChange && nextMode !== previousMode) {
    linkCheckModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function renderAutoOrganizeToggle() {
  const enabled = Boolean(autoOrganizeEnabledInput.checked);
  autoOrganizeEnabledInput.setAttribute("aria-checked", String(enabled));
  if (autoOrganizeState) {
    autoOrganizeState.textContent = t(enabled ? "autoOrganizeOn" : "autoOrganizeOff");
  }
}

function populateForm(config) {
  providerSelect.value = config.provider;
  baseUrlInput.value = config.baseUrl;
  apiKeyInput.value = config.apiKey;
  modelInput.value = config.model;
  batchSizeInput.value = String(config.batchSize);
  setLinkCheckMode(config.linkCheckMode);
  autoOrganizeEnabledInput.checked = Boolean(config.autoOrganizeEnabled);
  renderAutoOrganizeToggle();
  autoOrganizeIntervalInput.value = String(config.autoOrganizeIntervalHours);
  setWhitelistSelection(parseWhitelistDomains(config.whitelistDomains));
  protectedRootFoldersInput.value = config.protectedRootFolders;
  domainFolderRulesInput.value = config.domainFolderRules;
  customPromptInput.value = config.customPrompt;
  lastProvider = config.provider;
  updateProviderHints(config.provider);
  updateConnectionModeHint();
  updateBatchSizeCapHint();
  updateAutoOrganizeAccessHint();
}

function collectFormData() {
  const provider = providerSelect.value;

  return {
    provider,
    baseUrl: baseUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim(),
    batchSize: parseIntegerInput(batchSizeInput.value),
    linkCheckMode: normalizeLinkCheckMode(linkCheckModeSelect.value),
    autoOrganizeEnabled: Boolean(autoOrganizeEnabledInput.checked),
    autoOrganizeIntervalHours: parseIntegerInput(autoOrganizeIntervalInput.value),
    whitelistDomains: serializeWhitelistDomains(),
    protectedRootFolders: protectedRootFoldersInput.value.trim(),
    domainFolderRules: domainFolderRulesInput.value.trim(),
    customPrompt: customPromptInput.value.trim() || DEFAULT_PROMPT
  };
}

function getCurrentBatchProfileConfig() {
  return {
    provider: providerSelect.value,
    baseUrl: baseUrlInput.value.trim(),
    model: modelInput.value.trim()
  };
}

function updateBatchSizeCapHint() {
  const cap = getRuntimeBatchSizeCap(getCurrentBatchProfileConfig());
  const batchSize = parseIntegerInput(batchSizeInput.value);
  const shouldShow = Boolean(cap && Number.isInteger(batchSize) && batchSize > cap);

  batchSizeCapHint.hidden = !shouldShow;
  batchSizeCapHint.textContent = shouldShow ? t("batchSizeCapHint", { count: cap }) : "";

  if (shouldShow) {
    addDescribedByToken(batchSizeInput, batchSizeCapHint.id);
  } else {
    removeDescribedByTokens(batchSizeInput, [batchSizeCapHint.id]);
  }
}

function updateConnectionModeHint() {
  const mode = normalizeLinkCheckMode(linkCheckModeSelect.value);
  const key =
    mode === LINK_CHECK_MODE_COMPLETE
      ? "connectionModeCompleteHint"
      : mode === LINK_CHECK_MODE_BALANCED
        ? "connectionModeBalancedHint"
        : "connectionModeFastHint";
  const requiresAccess = mode !== LINK_CHECK_MODE_FAST;

  connectionModeHint.hidden = false;
  connectionModeHint.textContent = t(key);
  connectionModeHint.className = requiresAccess ? "field__hint panel__hint field__hint--warm" : "field__hint panel__hint";
  updateAiConnectionDisclosure(mode);
}

function updateAiConnectionDisclosure(mode = normalizeLinkCheckMode(linkCheckModeSelect.value)) {
  const requiresConnection = mode !== LINK_CHECK_MODE_FAST;

  if (aiConnectionSummaryNote) {
    aiConnectionSummaryNote.textContent = t(
      requiresConnection ? "aiConnectionRequiredSummary" : "aiConnectionFastSummary"
    );
    aiConnectionSummaryNote.classList.toggle("field__hint--warm", requiresConnection);
  }

  if (!aiConnectionBlock) {
    return;
  }

  aiConnectionBlock.dataset.mode = mode;
  if (requiresConnection) {
    aiConnectionBlock.open = true;
  } else if (!aiConnectionBlock.contains(document.activeElement)) {
    aiConnectionBlock.open = false;
  }
}

function updateAutoOrganizeAccessHint() {
  renderAutoOrganizeToggle();
  const enabled = Boolean(autoOrganizeEnabledInput.checked);
  const mode = normalizeLinkCheckMode(linkCheckModeSelect.value);
  const key = !enabled
    ? "autoOrganizeDisabledHint"
    : mode === LINK_CHECK_MODE_COMPLETE
      ? "autoOrganizeCompleteHint"
      : mode === LINK_CHECK_MODE_BALANCED
        ? "autoOrganizeBalancedHint"
        : "autoOrganizeFastHint";
  const caution = enabled && mode !== LINK_CHECK_MODE_FAST;

  autoOrganizeAccessHint.hidden = false;
  autoOrganizeAccessHint.textContent = t(key);
  autoOrganizeAccessHint.className = caution ? "field__hint field__hint--warm" : "field__hint";
  addDescribedByToken(autoOrganizeEnabledInput, autoOrganizeAccessHint.id);
}

function capConfigBatchSize(config) {
  const batchSize = normalizeConfigBatchSize(config.batchSize, config, getDefaultBatchSize(config.provider));
  return {
    config: {
      ...config,
      batchSize
    },
    changed: batchSize !== config.batchSize
  };
}

function parseIntegerInput(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!/^-?\d+$/.test(value)) {
    return Number.NaN;
  }

  return Number.parseInt(value, 10);
}

function normalizeBatchSize(rawValue, fallback = DEFAULT_BATCH_SIZE) {
  const parsed = Number.parseInt(String(rawValue ?? fallback), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(100, Math.max(MIN_BATCH_SIZE, parsed));
}

function normalizeConfigBatchSize(rawValue, config = {}, fallback = DEFAULT_BATCH_SIZE) {
  const normalizedBatchSize = normalizeBatchSize(rawValue, fallback);
  const cap = getRuntimeBatchSizeCap(config);
  return cap ? Math.min(normalizedBatchSize, cap) : normalizedBatchSize;
}

function normalizeLinkCheckMode(rawValue) {
  return [LINK_CHECK_MODE_FAST, LINK_CHECK_MODE_BALANCED, LINK_CHECK_MODE_COMPLETE].includes(rawValue)
    ? rawValue
    : LINK_CHECK_MODE_FAST;
}

function shouldRequireBroadHostAccess(config) {
  return normalizeLinkCheckMode(config?.linkCheckMode) === LINK_CHECK_MODE_COMPLETE;
}

function shouldRequireModelAccess(config) {
  return normalizeLinkCheckMode(config?.linkCheckMode) !== LINK_CHECK_MODE_FAST;
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

function resolveSection(sectionId) {
  return sectionPanels.some((panel) => panel.dataset.sectionPanel === sectionId)
    ? sectionId
    : navButtons[0]?.dataset.sectionTarget || "connection";
}

function setActiveSection(sectionId, updateHash = true) {
  const activeSection = resolveSection(sectionId);

  navButtons.forEach((button) => {
    const isActive = button.dataset.sectionTarget === activeSection;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });

  sectionPanels.forEach((panel) => {
    const isActive = panel.dataset.sectionPanel === activeSection;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });

  if (updateHash) {
    const nextHash = `#${activeSection}`;
    if (window.location.hash !== nextHash) {
      history.replaceState(null, "", nextHash);
    }
  }
}

function focusNavigationTarget(currentButton, key) {
  const currentIndex = navButtons.indexOf(currentButton);
  if (currentIndex < 0) {
    return;
  }

  const lastIndex = navButtons.length - 1;
  const nextIndexByKey = {
    ArrowDown: currentIndex >= lastIndex ? 0 : currentIndex + 1,
    ArrowRight: currentIndex >= lastIndex ? 0 : currentIndex + 1,
    ArrowUp: currentIndex <= 0 ? lastIndex : currentIndex - 1,
    ArrowLeft: currentIndex <= 0 ? lastIndex : currentIndex - 1,
    Home: 0,
    End: lastIndex
  };
  const nextIndex = nextIndexByKey[key];
  if (typeof nextIndex !== "number") {
    return;
  }

  const nextButton = navButtons[nextIndex];
  setActiveSection(nextButton.dataset.sectionTarget);
  nextButton.focus();
}

function handleNavigationKeydown(event) {
  if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key)) {
    return;
  }

  event.preventDefault();
  focusNavigationTarget(event.currentTarget, event.key);
}

function markPending() {
  setSaveBadge(t("saveBadgeUnsaved"), "warm");
  clearSettingsActionStatus();
}

function initializeNavigation() {
  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveSection(button.dataset.sectionTarget);
    });
    button.addEventListener("keydown", handleNavigationKeydown);
  });

  window.addEventListener("hashchange", () => {
    const nextSection = window.location.hash.replace(/^#/, "");
    setActiveSection(nextSection, false);
  });

  const initialSection = window.location.hash.replace(/^#/, "") || "connection";
  setActiveSection(initialSection, Boolean(window.location.hash));
}

async function loadConfig() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const config = mergeConfig(stored[STORAGE_KEY]);
  populateForm(config);
  clearApiTestStatus();
  setSaveBadge(t("saveBadgeSynced"), "success");
  clearSettingsActionStatus();

  await refreshBackupStatus("config load");
  await refreshHostAccessStatus().catch((error) => {
    console.error("Failed to refresh host access status after config load:", error);
    renderHostAccessRefreshFailure();
  });
  setSettingsReady(true);
}

async function refreshBackupStatus(reason = "manual refresh", options = {}) {
  updateBackupOperationControls();
  pendingBackupAction = null;
  backupList.replaceChildren();

  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: "GET_BACKUP_RECORDS"
    });
  } catch (error) {
    console.error(`Failed to refresh backup status after ${reason}:`, error);
    renderBackupLoadFailure(t("backupReadFailed"), {
      preserveActionStatus: options.preserveActionStatus
    });
    return false;
  }

  if (!response?.ok) {
    renderBackupLoadFailure(response?.error || t("backupReadFailed"), {
      preserveActionStatus: options.preserveActionStatus
    });
    return false;
  }

  const records = Array.isArray(response.records) ? response.records : [];
  currentBackupRecords = records;
  clearBackupErrorStatus();
  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = t("backupEmpty");
    backupList.appendChild(empty);
    setBackupBadge(t("backupRatio", { count: 0 }));
    return true;
  }

  renderBackupRecords(records);
  setBackupBadge(t("backupRatio", { count: records.length }), "success");
  return true;
}

function clearBackupErrorStatus() {
  if (backupActionStatus.classList.contains("is-error")) {
    setBackupActionStatus("");
  }
}

function renderBackupLoadFailure(message, options = {}) {
  currentBackupRecords = [];
  pendingBackupAction = null;
  backupList.replaceChildren();

  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message || t("backupReadFailed");
  backupList.appendChild(empty);
  setBackupBadge(t("backupErrorBadge"), "danger");
  if (!options.preserveActionStatus || !backupActionStatus.textContent.trim()) {
    setBackupActionStatus(message || t("backupReadFailed"), true);
  }
}

function renderBackupRecords(records = currentBackupRecords) {
  backupList.replaceChildren();

  records.forEach((record) => {
    const backupName = getBackupRecordAccessibleName(record);
    const row = document.createElement("div");
    row.className = "backup-row";

    const meta = document.createElement("div");
    meta.className = "backup-row__meta";

    const title = document.createElement("div");
    title.className = "backup-row__title";
    title.textContent = record.title || record.id;

    const desc = document.createElement("div");
    desc.className = "backup-row__desc";
    desc.textContent = [
      record.source === "auto" ? t("backupSourceAuto") : t("backupSourceManual"),
      formatDate(record.createdAt)
    ]
      .filter(Boolean)
      .join(" · ");

    meta.append(title, desc);

    const actions = document.createElement("div");
    actions.className = "backup-row__actions";

    if (pendingBackupAction?.id === record.id) {
      actions.appendChild(createBackupInlineConfirm(record, pendingBackupAction.action));
    } else {
      const restoreLabel = t("backupRestoreRecordAria", { title: backupName });
      const restoreButton = document.createElement("button");
      restoreButton.type = "button";
      restoreButton.className = "button button--ghost button--compact";
      restoreButton.textContent = t("restoreButton");
      restoreButton.title = restoreLabel;
      restoreButton.setAttribute("aria-label", restoreLabel);
      restoreButton.setAttribute("aria-describedby", backupActionStatus.id);
      restoreButton.dataset.backupId = String(record.id || "");
      restoreButton.dataset.backupActionButton = "restore";
      restoreButton.disabled = backupActionInFlight;
      restoreButton.addEventListener("click", () => {
        setPendingBackupAction(record.id, "restore");
      });

      const deleteLabel = t("backupDeleteRecordAria", { title: backupName });
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "button button--danger button--compact";
      deleteButton.textContent = t("deleteButton");
      deleteButton.title = deleteLabel;
      deleteButton.setAttribute("aria-label", deleteLabel);
      deleteButton.setAttribute("aria-describedby", backupActionStatus.id);
      deleteButton.dataset.backupId = String(record.id || "");
      deleteButton.dataset.backupActionButton = "delete";
      deleteButton.disabled = backupActionInFlight;
      deleteButton.addEventListener("click", () => {
        setPendingBackupAction(record.id, "delete");
      });

      actions.append(restoreButton, deleteButton);
    }

    row.append(meta, actions);
    backupList.appendChild(row);
  });
}

function getBackupRecordAccessibleName(record) {
  return String(record?.title || record?.id || t("backupRecordFallback"));
}

function setPendingBackupAction(backupId, action) {
  if (backupActionInFlight) {
    return;
  }

  pendingBackupAction = { id: backupId, action };
  setBackupActionStatus("");
  renderBackupRecords();
  focusBackupConfirmationPrimary(backupId);
}

function findBackupActionButton(backupId, action) {
  return (
    Array.from(backupList.querySelectorAll("[data-backup-action-button]")).find(
      (button) =>
        button.dataset.backupId === String(backupId || "") &&
        button.dataset.backupActionButton === action
    ) || null
  );
}

function focusBackupConfirmationPrimary(backupId) {
  Array.from(backupList.querySelectorAll("[data-backup-confirm-primary]"))
    .find((button) => button.dataset.backupId === String(backupId || ""))
    ?.focus();
}

function getBackupConfirmMessageId(backupId) {
  const safeId = String(backupId || "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 80);
  return `backupConfirmMessage-${safeId || "record"}`;
}

function createBackupInlineConfirm(record, action) {
  const backupName = getBackupRecordAccessibleName(record);
  const messageId = getBackupConfirmMessageId(record.id);
  const wrapper = document.createElement("div");
  wrapper.className = "backup-confirm";
  wrapper.setAttribute("role", "group");
  wrapper.setAttribute("aria-labelledby", messageId);

  const message = document.createElement("div");
  message.id = messageId;
  message.className = "backup-confirm__message";
  message.textContent =
    action === "restore" ? t("backupRestoreInlineConfirm") : t("backupDeleteInlineConfirm");

  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className =
    action === "restore"
      ? "button button--primary button--compact"
      : "button button--danger button--compact";
  confirmButton.textContent =
    action === "restore" ? t("backupRestoreInlinePrimary") : t("backupDeleteInlinePrimary");
  const confirmLabel =
    action === "restore"
      ? t("backupConfirmRestoreRecordAria", { title: backupName })
      : t("backupConfirmDeleteRecordAria", { title: backupName });
  confirmButton.title = confirmLabel;
  confirmButton.setAttribute("aria-label", confirmLabel);
  confirmButton.setAttribute("aria-describedby", backupActionStatus.id);
  confirmButton.dataset.backupId = String(record.id || "");
  confirmButton.dataset.backupConfirmPrimary = "true";
  confirmButton.disabled = backupActionInFlight;
  confirmButton.addEventListener("click", () => {
    if (backupActionInFlight) {
      return;
    }

    backupActionInFlight = true;
    confirmButton.disabled = true;
    cancelButton.disabled = true;
    renderBackupRecords();
    const task = action === "restore" ? restoreBackupEntry(record.id) : deleteBackupEntry(record.id);
    task.catch((error) => {
      console.error(`Failed to ${action} backup entry:`, error);
      setBackupBadge(t("backupErrorBadge"), "danger");
      setBackupActionStatus(
        action === "restore" ? t("backupRestoreExceptionAlert") : t("backupDeleteExceptionAlert"),
        true
      );
    });
  });

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "button button--secondary button--compact";
  cancelButton.textContent = t("backupInlineCancel");
  const cancelLabel = t("backupCancelActionAria", { title: backupName });
  cancelButton.title = cancelLabel;
  cancelButton.setAttribute("aria-label", cancelLabel);
  cancelButton.disabled = backupActionInFlight;
  cancelButton.addEventListener("click", () => {
    if (backupActionInFlight) {
      return;
    }

    pendingBackupAction = null;
    renderBackupRecords();
    findBackupActionButton(record.id, action)?.focus();
  });

  wrapper.append(message, confirmButton, cancelButton);
  return wrapper;
}

async function saveConfig(event) {
  event.preventDefault();
  if (settingsActionInFlight) {
    return;
  }

  clearSettingsFieldIssues();
  const config = collectFormData();
  const defaults = getDefaults(config.provider);
  const requiresModelAccess = shouldRequireModelAccess(config);

  if (requiresModelAccess && !config.baseUrl) {
    showSettingsIssue(t("baseUrlRequired"), "connection", "baseUrl");
    return;
  }
  if (requiresModelAccess && !isValidHttpUrl(config.baseUrl)) {
    showSettingsIssue(t("baseUrlInvalid"), "connection", "baseUrl");
    return;
  }

  if (requiresModelAccess && !config.model) {
    showSettingsIssue(t("modelRequired"), "connection", "model");
    return;
  }

  if (!Number.isInteger(config.batchSize) || config.batchSize < 5 || config.batchSize > 100) {
    showSettingsIssue(t("batchSizeValidation"), "organize", "batchSize");
    return;
  }

  if (
    !Number.isInteger(config.autoOrganizeIntervalHours) ||
    config.autoOrganizeIntervalHours < 1 ||
    config.autoOrganizeIntervalHours > 168
  ) {
    showSettingsIssue(t("autoIntervalValidation"), "automation", "autoOrganizeIntervalHours");
    return;
  }

  if (
    config.autoOrganizeEnabled &&
    requiresModelAccess &&
    !defaults.apiKeyOptional &&
    !config.apiKey
  ) {
    showSettingsIssue(t("requiredApiKey", { provider: defaults.label }), "connection", "apiKey");
    return;
  }

  const cappedBatch = capConfigBatchSize(config);
  const configToSave = cappedBatch.config;
  if (cappedBatch.changed) {
    batchSizeInput.value = String(configToSave.batchSize);
    updateBatchSizeCapHint();
  }

  setSettingsActionInFlight(true);
  setSaveBadge(t("saveBadgeUnsaved"), "accent");
  setSettingsActionStatus(t("settingsSavingStatus"));
  try {
    if (configToSave.autoOrganizeEnabled) {
      const granted = shouldRequireBroadHostAccess(configToSave)
        ? await ensureBroadHostAccess()
        : shouldRequireModelAccess(configToSave)
          ? await ensureOriginAccess(configToSave.baseUrl)
          : true;
      await refreshHostAccessStatus().catch((error) => {
        console.error("Failed to refresh host access status after auto organize permission check:", error);
        renderHostAccessRefreshFailure();
      });
      if (!granted) {
        setSaveBadge(t("saveBadgeFailed"), "danger");
        showSettingsIssue(t("autoOrganizePermission"), "automation", "autoOrganizeEnabled");
        return;
      }
    }

    await saveConfigData(configToSave, { batchAdjusted: cappedBatch.changed });
  } catch (error) {
    console.error("Failed to save settings:", error);
    setSaveBadge(t("saveBadgeFailed"), "danger");
    setSettingsActionStatus(t("settingsSaveException"), true);
  } finally {
    setSettingsActionInFlight(false);
    await refreshHostAccessStatus().catch((error) => {
      console.error("Failed to refresh host access status after saving settings:", error);
      renderHostAccessRefreshFailure();
    });
  }
}

async function saveConfigData(config, options = {}) {
  await chrome.storage.local.set({ [STORAGE_KEY]: config });
  setSaveBadge(t("saveBadgeSaved"), "success");
  setSettingsActionStatus(
    options.batchAdjusted
      ? t("settingsSlowBatchAdjustedStatus", { count: config.batchSize })
      : t("settingsSavedStatus")
  );
}

async function testApiConnection() {
  if (settingsActionInFlight) {
    return;
  }

  clearSettingsFieldIssues();
  const config = collectFormData();
  const defaults = getDefaults(config.provider);

  if (!config.baseUrl) {
    showApiTestIssue(t("baseUrlRequired"), "baseUrl");
    return;
  }
  if (!isValidHttpUrl(config.baseUrl)) {
    showApiTestIssue(t("baseUrlInvalid"), "baseUrl");
    return;
  }

  if (!config.model) {
    showApiTestIssue(t("modelRequired"), "model");
    return;
  }

  if (!Number.isInteger(config.batchSize) || config.batchSize < 5 || config.batchSize > 100) {
    showApiTestIssue(t("batchSizeValidation"), "batchSize");
    return;
  }

  if (!defaults.apiKeyOptional && !config.apiKey) {
    showApiTestIssue(t("requiredApiKey", { provider: defaults.label }), "apiKey");
    return;
  }

  setSettingsActionInFlight(true);
  setSaveBadge(t("saveBadgeUnsaved"), "accent");
  setApiTestStatus(t("apiTesting"));

  try {
    const granted = await ensureOriginAccess(config.baseUrl);
    await refreshHostAccessStatus().catch((error) => {
      console.error("Failed to refresh host access status after API test access check:", error);
      renderHostAccessRefreshFailure();
    });
    if (!granted) {
      setActiveSection("connection");
      setSaveBadge(t("saveBadgeFailed"), "danger");
      setApiTestStatus(t("currentApiAccessMissing"), true);
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "TEST_API_CONNECTION",
      config
    });

    if (!response?.ok) {
      setSaveBadge(t("saveBadgeFailed"), "danger");
      setApiTestStatus(
        [response?.error || t("apiTestFailed"), response?.detail].filter(Boolean).join(" "),
        true
      );
      return;
    }

    const cappedBatch = capConfigBatchSize(config);
    const configToSave = cappedBatch.config;
    if (cappedBatch.changed) {
      batchSizeInput.value = String(configToSave.batchSize);
      updateBatchSizeCapHint();
    }

    if (configToSave.autoOrganizeEnabled) {
      const autoAccessGranted = shouldRequireBroadHostAccess(configToSave)
        ? await ensureBroadHostAccess()
        : true;
      await refreshHostAccessStatus().catch((error) => {
        console.error("Failed to refresh host access status after API test auto permission check:", error);
        renderHostAccessRefreshFailure();
      });
      if (!autoAccessGranted) {
        setSaveBadge(t("saveBadgeFailed"), "danger");
        setApiTestStatus(
          [response.message || t("apiTestSucceeded"), response.detail, t("apiTestAutoAccessFailed")]
            .filter(Boolean)
            .join(" "),
          true
        );
        showSettingsIssue(t("autoOrganizePermission"), "automation", "autoOrganizeEnabled");
        return;
      }
    }

    try {
      await saveConfigData(configToSave, { batchAdjusted: cappedBatch.changed });
    } catch (saveError) {
      console.error("Failed to save settings after API test:", saveError);
      setSaveBadge(t("saveBadgeFailed"), "danger");
      setApiTestStatus(
        [response.message || t("apiTestSucceeded"), response.detail, t("apiTestSaveFailed")]
          .filter(Boolean)
          .join(" "),
        true
      );
      return;
    }

    setApiTestStatus(
      [response.message || t("apiTestSucceeded"), response.detail, t("apiTestSaved")]
        .filter(Boolean)
        .join(" ")
    );
  } catch (error) {
    console.error("Failed to test API connection:", error);
    setSaveBadge(t("saveBadgeFailed"), "danger");
    setApiTestStatus(t("apiTestException"), true);
  } finally {
    setSettingsActionInFlight(false);
    await refreshHostAccessStatus().catch((error) => {
      console.error("Failed to refresh host access status after testing API:", error);
      renderHostAccessRefreshFailure();
    });
  }
}

async function createManualBackup() {
  createBackupButton.disabled = true;
  backupActionInFlight = true;
  pendingBackupAction = null;
  setBackupActionStatus("");
  setBackupBadge(t("backupCreatingBadge"), "accent");
  renderBackupRecords();

  try {
    const response = await chrome.runtime.sendMessage({
      type: "CREATE_MANUAL_BACKUP"
    });

    if (!response?.ok) {
      setBackupBadge(t("backupErrorBadge"), "danger");
      setBackupActionStatus(response?.error || t("backupCreateFailedAlert"), true);
      return;
    }

    setBackupActionStatus(t("backupCreateSuccess"));
  } catch (error) {
    console.error("Failed to create manual backup:", error);
    setBackupBadge(t("backupErrorBadge"), "danger");
    setBackupActionStatus(t("backupCreateExceptionAlert"), true);
  } finally {
    backupActionInFlight = false;
    updateBackupOperationControls();
    await refreshBackupStatus("manual backup", { preserveActionStatus: true });
  }
}

async function restoreBackupEntry(backupId) {
  createBackupButton.disabled = true;
  backupActionInFlight = true;
  setBackupActionStatus("");
  setBackupBadge(t("backupRestoringBadge"), "accent");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "RESTORE_BACKUP_ENTRY",
      backupId
    });

    if (!response?.ok) {
      setBackupBadge(t("backupErrorBadge"), "danger");
      setBackupActionStatus(response?.error || t("backupRestoreFailedAlert"), true);
      return;
    }

    setBackupActionStatus(t("backupRestoreSuccess"));
  } catch (error) {
    console.error("Failed to restore backup entry:", error);
    setBackupBadge(t("backupErrorBadge"), "danger");
    setBackupActionStatus(t("backupRestoreExceptionAlert"), true);
  } finally {
    backupActionInFlight = false;
    updateBackupOperationControls();
    await refreshBackupStatus("backup restore", { preserveActionStatus: true });
  }
}

async function deleteBackupEntry(backupId) {
  createBackupButton.disabled = true;
  backupActionInFlight = true;
  setBackupActionStatus("");
  setBackupBadge(t("backupDeletingBadge"), "accent");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "DELETE_BACKUP_ENTRY",
      backupId
    });

    if (!response?.ok) {
      setBackupBadge(t("backupErrorBadge"), "danger");
      setBackupActionStatus(response?.error || t("backupDeleteFailedAlert"), true);
      return;
    }

    setBackupActionStatus(t("backupDeleteSuccess"));
  } catch (error) {
    console.error("Failed to delete backup entry:", error);
    setBackupBadge(t("backupErrorBadge"), "danger");
    setBackupActionStatus(t("backupDeleteExceptionAlert"), true);
  } finally {
    backupActionInFlight = false;
    updateBackupOperationControls();
    await refreshBackupStatus("backup delete", { preserveActionStatus: true });
  }
}

function resetCurrentProviderDefaults() {
  if (settingsActionInFlight) {
    return;
  }

  const provider = providerSelect.value;
  const config = buildDefaultConfig(provider);
  populateForm(config);
  setActiveSection("connection");
  clearApiTestStatus();
  clearSettingsActionStatus();
  setSaveBadge(t("saveBadgeUnsaved"), "warm");
  void refreshHostAccessStatus().catch((error) => {
    console.error("Failed to refresh host access status after reset:", error);
    renderHostAccessRefreshFailure();
  });
}

async function requestHostAccess() {
  if (settingsActionInFlight) {
    return;
  }

  const config = collectFormData();
  if (!shouldRequireBroadHostAccess(config) && !shouldRequireModelAccess(config)) {
    setSettingsActionStatus(t("hostAccessNotNeededAction"));
    await refreshHostAccessStatus();
    return;
  }

  if (!config.baseUrl) {
    showSettingsIssue(t("baseUrlRequired"), "connection", "baseUrl");
    await refreshHostAccessStatus();
    return;
  }
  if (!isValidHttpUrl(config.baseUrl)) {
    showSettingsIssue(t("baseUrlInvalid"), "connection", "baseUrl");
    await refreshHostAccessStatus();
    return;
  }

  setSettingsActionInFlight(true);
  setSettingsActionStatus(t("settingsAccessRequestingStatus"));
  try {
    const granted = shouldRequireBroadHostAccess(config)
      ? await ensureBroadHostAccess()
      : await ensureOriginAccess(config.baseUrl);
    await refreshHostAccessStatus().catch((error) => {
      console.error("Failed to refresh host access status after access decision:", error);
      renderHostAccessRefreshFailure();
    });
    if (!granted) {
      showSettingsIssue(t("hostAccessMissingAlert"), "connection", "grantAccessButton");
    } else {
      setSettingsActionStatus(t("hostAccessGranted"));
    }
  } catch (error) {
    console.error("Failed to request host access:", error);
    showSettingsIssue(t("hostAccessRequestException"), "connection", "grantAccessButton");
  } finally {
    setSettingsActionInFlight(false);
    await refreshHostAccessStatus().catch((error) => {
      console.error("Failed to refresh host access status after requesting access:", error);
      renderHostAccessRefreshFailure();
    });
  }
}

function handleFormMutation(event) {
  const targetId = event.target?.id;
  if (!targetId || ["provider", "whitelistSearch"].includes(targetId)) {
    return;
  }

  clearSettingsFieldIssue(targetId);

  if (["baseUrl", "apiKey", "model"].includes(targetId)) {
    clearApiTestStatus();
  }

  if (["baseUrl", "model", "batchSize"].includes(targetId)) {
    updateBatchSizeCapHint();
  }

  if (targetId === "autoOrganizeEnabled" || targetId === "linkCheckMode") {
    if (targetId === "linkCheckMode") {
      updateConnectionModeHint();
    }
    updateAutoOrganizeAccessHint();
  }

  if (targetId === "baseUrl" || targetId === "linkCheckMode") {
    scheduleHostAccessStatusRefresh(targetId === "baseUrl" ? "Base URL change" : "speed mode change");
  }

  markPending();
}

providerSelect.addEventListener("change", () => {
  const nextProvider = providerSelect.value;
  const providerChanged = nextProvider !== lastProvider;
  const previousDefaults = getDefaults(lastProvider);
  const nextDefaults = getDefaults(nextProvider);
  const previousDefaultBatchSize = getDefaultBatchSize(lastProvider);
  const nextDefaultBatchSize = getDefaultBatchSize(nextProvider);
  const shouldClearApiKey = providerChanged && Boolean(apiKeyInput.value.trim());

  if (!baseUrlInput.value.trim() || baseUrlInput.value.trim() === previousDefaults.baseUrl) {
    baseUrlInput.value = nextDefaults.baseUrl;
  }

  if (shouldClearApiKey) {
    apiKeyInput.value = "";
  }

  if (!modelInput.value.trim() || modelInput.value.trim() === previousDefaults.model) {
    modelInput.value = nextDefaults.model;
  }

  if (
    !batchSizeInput.value.trim() ||
    normalizeBatchSize(batchSizeInput.value) === previousDefaultBatchSize
  ) {
    batchSizeInput.value = String(nextDefaultBatchSize);
  }

  updateProviderHints(nextProvider);
  updateConnectionModeHint();
  updateBatchSizeCapHint();
  updateAutoOrganizeAccessHint();
  lastProvider = nextProvider;
  if (shouldClearApiKey) {
    setApiTestStatus(t("apiKeyClearedOnProviderChange"));
  } else {
    clearApiTestStatus();
  }
  markPending();
  void refreshHostAccessStatus().catch((error) => {
    console.error("Failed to refresh host access status after provider change:", error);
    renderHostAccessRefreshFailure();
  });
});

linkCheckModeButtons.forEach((button, index) => {
  button.addEventListener("click", () => {
    if (button.disabled) {
      return;
    }

    setLinkCheckMode(button.dataset.settingsSpeedMode, { emitChange: true });
  });

  button.addEventListener("keydown", (event) => {
    const handledKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!handledKeys.includes(event.key)) {
      return;
    }

    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? linkCheckModeButtons.length - 1
          : (index + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + linkCheckModeButtons.length) %
            linkCheckModeButtons.length;
    const nextButton = linkCheckModeButtons[nextIndex];
    nextButton.focus();
    setLinkCheckMode(nextButton.dataset.settingsSpeedMode, { emitChange: true });
  });
});

form.addEventListener("submit", saveConfig);
form.addEventListener("input", handleFormMutation);
form.addEventListener("change", handleFormMutation);
whitelistSearchInput.addEventListener("input", () => {
  renderWhitelistDomainList();
});
testApiButton.addEventListener("click", testApiConnection);
grantAccessButton.addEventListener("click", () => {
  void requestHostAccess().catch((error) => {
    console.error("Failed to request host access:", error);
    showSettingsIssue(t("hostAccessRequestException"), "connection", "grantAccessButton");
  });
});
resetButton.addEventListener("click", resetCurrentProviderDefaults);
createBackupButton.addEventListener("click", createManualBackup);
privacyButton.addEventListener("click", () => {
  openPrivacyPage().catch((error) => {
    console.error("Failed to open privacy page:", error);
    setSettingsActionStatus(t("privacyOpenFailed"), true);
  });
});

globalThis.chrome?.permissions?.onAdded?.addListener(() => {
  void refreshHostAccessStatus().catch((error) => {
    console.error("Failed to refresh host access status after permission add:", error);
    renderHostAccessRefreshFailure();
  });
});

globalThis.chrome?.permissions?.onRemoved?.addListener(() => {
  void refreshHostAccessStatus().catch((error) => {
    console.error("Failed to refresh host access status after permission removal:", error);
    renderHostAccessRefreshFailure();
  });
});

initializeNavigation();
setSaveBadge(t("saveBadgeLoading"), "accent");
setSettingsReady(false);
void loadWhitelistDomainCatalog();

loadConfig().catch((error) => {
  console.error("Failed to load config:", error);
  const fallback = buildDefaultConfig("openai");
  populateForm(fallback);
  void refreshHostAccessStatus().catch((hostAccessError) => {
    console.error("Failed to refresh host access status after config load failure:", hostAccessError);
    renderHostAccessRefreshFailure();
  });
  void refreshBackupStatus("config load failure");
  clearApiTestStatus();
  setSaveBadge(t("saveBadgeLoadFailed"), "danger");
  setSettingsActionStatus(t("settingsLoadException"), true);
  setSettingsReady(true);
});
