const STORAGE_KEY = "smartBookmarkConfig";
const HOST_ACCESS_ORIGINS = ["https://*/*", "http://*/*"];
const I18N = globalThis.SmartBookmarkI18n;
const Providers = globalThis.SmartBookmarkProviders;
const t = (key, params) => I18N.t(key, params);
const LEGACY_DEFAULT_PROMPT = I18N.getLegacyDefaultPrompt();
const DEFAULT_PROMPT = I18N.getDefaultPrompt();
const DEFAULT_BATCH_SIZE = 50;
const MIN_BATCH_SIZE = 5;
const LINK_CHECK_MODE_FAST = "fast";
const LINK_CHECK_MODE_COMPLETE = "complete";

const form = document.getElementById("settingsForm");
const settingsFields = Array.from(form.querySelectorAll("input, select, textarea"));
const providerSelect = document.getElementById("provider");
const baseUrlInput = document.getElementById("baseUrl");
const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const batchSizeInput = document.getElementById("batchSize");
const linkCheckModeSelect = document.getElementById("linkCheckMode");
const autoOrganizeEnabledInput = document.getElementById("autoOrganizeEnabled");
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
let currentBackupRecords = [];
let pendingBackupAction = null;
let backupActionInFlight = false;
let settingsActionInFlight = false;
let hostAccessRefreshVersion = 0;
let hostAccessCheckingInFlight = false;
let hostAccessRefreshTimer = null;

I18N.applyDocument(document);
renderProviderOptions();
renderWhitelistSelection();
renderWhitelistDomainList();

function getDefaults(provider) {
  return Providers.getProvider(provider);
}

function getDefaultBatchSize(provider) {
  return provider === "deepseek" ? 8 : DEFAULT_BATCH_SIZE;
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
  const provider = raw.provider && Providers.hasProvider(raw.provider) ? raw.provider : "openai";
  const defaults = buildDefaultConfig(provider);
  const promptValue =
    typeof raw.customPrompt === "string" && raw.customPrompt.trim()
      ? raw.customPrompt
      : defaults.customPrompt;

  return {
    provider,
    baseUrl: typeof raw.baseUrl === "string" && raw.baseUrl.trim() ? raw.baseUrl.trim() : defaults.baseUrl,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : defaults.model,
    batchSize: normalizeBatchSize(raw.batchSize, defaults.batchSize),
    linkCheckMode: normalizeLinkCheckMode(raw.linkCheckMode || defaults.linkCheckMode),
    autoOrganizeEnabled: Boolean(raw.autoOrganizeEnabled),
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
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip chip--interactive is-active";
    button.title = domain;
    button.setAttribute("aria-label", t("whitelistRemoveDomain", { domain }));

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
    const button = document.createElement("button");
    button.type = "button";
    button.className = `whitelist-option${isSelected ? " is-selected" : ""}`;
    button.title = item.domain;
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
  } catch (error) {
    console.error("Failed to load whitelist domain catalog:", error);
    whitelistCatalog = [];
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
  Array.from(form.querySelectorAll("[aria-invalid], [aria-describedby]")).forEach((field) => {
    field.removeAttribute("aria-invalid");
    removeDescribedByTokens(field, [settingsActionStatus.id, apiTestStatus.id]);
  });
}

function updateSettingsOperationControls() {
  const granted = grantAccessButton.dataset.granted === "true";
  settingsFields.forEach((field) => {
    field.disabled = settingsActionInFlight;
  });
  saveButton.disabled = settingsActionInFlight;
  testApiButton.disabled = settingsActionInFlight;
  resetButton.disabled = settingsActionInFlight;
  grantAccessButton.disabled = settingsActionInFlight || granted || hostAccessCheckingInFlight;
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
    return true;
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
  if (!config.baseUrl) {
    hostAccessCheckingInFlight = false;
    setHostAccessStatus(t("baseUrlRequired"), false);
    grantAccessButton.textContent = t("hostAccessButton");
    grantAccessButton.dataset.granted = "false";
    updateSettingsOperationControls();
    return;
  }

  const requiresBroadAccess = shouldRequireBroadHostAccess(config);
  hostAccessCheckingInFlight = true;
  setHostAccessStatus(t("hostAccessChecking"), true);
  grantAccessButton.textContent = t("hostAccessButton");
  grantAccessButton.dataset.granted = "false";
  updateSettingsOperationControls();

  const granted = requiresBroadAccess
    ? await hasBroadHostAccess()
    : await hasOriginAccess(config.baseUrl);

  if (refreshVersion !== hostAccessRefreshVersion) {
    return;
  }

  hostAccessCheckingInFlight = false;
  setHostAccessStatus(
    granted ? "" : requiresBroadAccess ? t("hostAccessMissing") : t("currentApiAccessMissing"),
    granted
  );
  grantAccessButton.textContent = granted ? t("hostAccessGrantedButton") : t("hostAccessButton");
  grantAccessButton.dataset.granted = String(granted);
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
  grantAccessButton.textContent = t("hostAccessButton");
  grantAccessButton.dataset.granted = "false";
  updateSettingsOperationControls();

  hostAccessRefreshTimer = setTimeout(() => {
    hostAccessRefreshTimer = null;
    void refreshHostAccessStatus().catch((error) => {
      console.error(`Failed to refresh host access status after ${reason}:`, error);
    });
  }, 250);
}

function populateForm(config) {
  providerSelect.value = config.provider;
  baseUrlInput.value = config.baseUrl;
  apiKeyInput.value = config.apiKey;
  modelInput.value = config.model;
  batchSizeInput.value = String(config.batchSize);
  linkCheckModeSelect.value = normalizeLinkCheckMode(config.linkCheckMode);
  autoOrganizeEnabledInput.value = config.autoOrganizeEnabled ? "true" : "false";
  autoOrganizeIntervalInput.value = String(config.autoOrganizeIntervalHours);
  setWhitelistSelection(parseWhitelistDomains(config.whitelistDomains));
  protectedRootFoldersInput.value = config.protectedRootFolders;
  domainFolderRulesInput.value = config.domainFolderRules;
  customPromptInput.value = config.customPrompt;
  lastProvider = config.provider;
  updateProviderHints(config.provider);
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
    autoOrganizeEnabled: autoOrganizeEnabledInput.value === "true",
    autoOrganizeIntervalHours: parseIntegerInput(autoOrganizeIntervalInput.value),
    whitelistDomains: serializeWhitelistDomains(),
    protectedRootFolders: protectedRootFoldersInput.value.trim(),
    domainFolderRules: domainFolderRulesInput.value.trim(),
    customPrompt: customPromptInput.value.trim() || DEFAULT_PROMPT
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

function normalizeLinkCheckMode(rawValue) {
  return rawValue === LINK_CHECK_MODE_COMPLETE ? LINK_CHECK_MODE_COMPLETE : LINK_CHECK_MODE_FAST;
}

function shouldRequireBroadHostAccess(config) {
  return normalizeLinkCheckMode(config?.linkCheckMode) === LINK_CHECK_MODE_COMPLETE;
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
  await refreshBackupStatus();
  await refreshHostAccessStatus();
  clearApiTestStatus();
  setSaveBadge(t("saveBadgeSynced"), "success");
}

async function refreshBackupStatus() {
  createBackupButton.disabled = backupActionInFlight;
  pendingBackupAction = null;
  backupList.replaceChildren();

  const response = await chrome.runtime.sendMessage({
    type: "GET_BACKUP_RECORDS"
  });

  if (!response?.ok) {
    currentBackupRecords = [];
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = response?.error || t("backupReadFailed");
    backupList.appendChild(empty);
    setBackupBadge(t("backupErrorBadge"), "danger");
    return;
  }

  const records = Array.isArray(response.records) ? response.records : [];
  currentBackupRecords = records;
  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = t("backupEmpty");
    backupList.appendChild(empty);
    setBackupBadge(t("backupRatio", { count: 0 }));
    return;
  }

  renderBackupRecords(records);
  setBackupBadge(t("backupRatio", { count: records.length }), "success");
}

function renderBackupRecords(records = currentBackupRecords) {
  backupList.replaceChildren();

  records.forEach((record) => {
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
      const restoreButton = document.createElement("button");
      restoreButton.type = "button";
      restoreButton.className = "button button--ghost button--compact";
      restoreButton.textContent = t("restoreButton");
      restoreButton.setAttribute("aria-describedby", backupActionStatus.id);
      restoreButton.dataset.backupId = String(record.id || "");
      restoreButton.dataset.backupActionButton = "restore";
      restoreButton.disabled = backupActionInFlight;
      restoreButton.addEventListener("click", () => {
        setPendingBackupAction(record.id, "restore");
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "button button--danger button--compact";
      deleteButton.textContent = t("deleteButton");
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

  const config = collectFormData();
  const defaults = getDefaults(config.provider);

  if (!config.baseUrl) {
    showSettingsIssue(t("baseUrlRequired"), "connection", "baseUrl");
    return;
  }

  if (!config.model) {
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

  if (!defaults.apiKeyOptional && !config.apiKey) {
    showSettingsIssue(t("requiredApiKey", { provider: defaults.label }), "connection", "apiKey");
    return;
  }

  setSettingsActionInFlight(true);
  setSaveBadge(t("saveBadgeUnsaved"), "accent");
  setSettingsActionStatus(t("settingsSavingStatus"));
  try {
    if (config.autoOrganizeEnabled) {
      const granted = shouldRequireBroadHostAccess(config)
        ? await ensureBroadHostAccess()
        : await ensureOriginAccess(config.baseUrl);
      await refreshHostAccessStatus();
      if (!granted) {
        showSettingsIssue(t("autoOrganizePermission"), "automation", "autoOrganizeEnabled");
        return;
      }
    }

    await saveConfigData(config);
  } catch (error) {
    console.error("Failed to save settings:", error);
    setSaveBadge(t("saveBadgeFailed"), "danger");
    setSettingsActionStatus(t("settingsSaveException"), true);
  } finally {
    setSettingsActionInFlight(false);
    await refreshHostAccessStatus().catch((error) => {
      console.error("Failed to refresh host access status after saving settings:", error);
    });
  }
}

async function saveConfigData(config) {
  await chrome.storage.local.set({ [STORAGE_KEY]: config });
  setSaveBadge(t("saveBadgeSaved"), "success");
  setSettingsActionStatus(t("settingsSavedStatus"));
}

async function testApiConnection() {
  if (settingsActionInFlight) {
    return;
  }

  const config = collectFormData();
  const defaults = getDefaults(config.provider);

  if (!config.baseUrl) {
    showApiTestIssue(t("baseUrlRequired"), "baseUrl");
    return;
  }

  if (!config.model) {
    showApiTestIssue(t("modelRequired"), "model");
    return;
  }

  if (!defaults.apiKeyOptional && !config.apiKey) {
    showApiTestIssue(t("requiredApiKey", { provider: defaults.label }), "apiKey");
    return;
  }

  setSettingsActionInFlight(true);
  setApiTestStatus(t("apiTesting"));

  try {
    const granted = await ensureOriginAccess(config.baseUrl);
    await refreshHostAccessStatus();
    if (!granted) {
      setActiveSection("connection");
      setApiTestStatus(t("currentApiAccessMissing"), true);
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "TEST_API_CONNECTION",
      config
    });

    if (!response?.ok) {
      setApiTestStatus(
        [response?.error || t("apiTestFailed"), response?.detail].filter(Boolean).join(" "),
        true
      );
      return;
    }

    try {
      await saveConfigData(config);
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
    setApiTestStatus(t("apiTestException"), true);
  } finally {
    setSettingsActionInFlight(false);
    await refreshHostAccessStatus().catch((error) => {
      console.error("Failed to refresh host access status after testing API:", error);
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
    createBackupButton.disabled = false;
    await refreshBackupStatus();
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
    createBackupButton.disabled = false;
    await refreshBackupStatus();
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
    createBackupButton.disabled = false;
    await refreshBackupStatus();
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
  });
}

async function requestHostAccess() {
  if (settingsActionInFlight) {
    return;
  }

  const config = collectFormData();
  if (!config.baseUrl) {
    showSettingsIssue(t("baseUrlRequired"), "connection", "baseUrl");
    await refreshHostAccessStatus();
    return;
  }

  setSettingsActionInFlight(true);
  setSettingsActionStatus(t("settingsAccessRequestingStatus"));
  try {
    const granted = shouldRequireBroadHostAccess(config)
      ? await ensureBroadHostAccess()
      : await ensureOriginAccess(config.baseUrl);
    await refreshHostAccessStatus();
    if (!granted) {
      showSettingsIssue(t("hostAccessMissingAlert"), "connection", "grantAccessButton");
    }
  } finally {
    setSettingsActionInFlight(false);
    await refreshHostAccessStatus().catch((error) => {
      console.error("Failed to refresh host access status after requesting access:", error);
    });
  }
}

function handleFormMutation(event) {
  const targetId = event.target?.id;
  if (!targetId || ["provider", "whitelistSearch"].includes(targetId)) {
    return;
  }

  if (["baseUrl", "apiKey", "model"].includes(targetId)) {
    clearApiTestStatus();
  }

  if (targetId === "baseUrl" || targetId === "linkCheckMode") {
    scheduleHostAccessStatusRefresh(targetId === "baseUrl" ? "Base URL change" : "speed mode change");
  }

  markPending();
}

providerSelect.addEventListener("change", () => {
  const nextProvider = providerSelect.value;
  const previousDefaults = getDefaults(lastProvider);
  const nextDefaults = getDefaults(nextProvider);
  const previousDefaultBatchSize = getDefaultBatchSize(lastProvider);
  const nextDefaultBatchSize = getDefaultBatchSize(nextProvider);

  if (!baseUrlInput.value.trim() || baseUrlInput.value.trim() === previousDefaults.baseUrl) {
    baseUrlInput.value = nextDefaults.baseUrl;
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
  lastProvider = nextProvider;
  clearApiTestStatus();
  markPending();
  void refreshHostAccessStatus().catch((error) => {
    console.error("Failed to refresh host access status after provider change:", error);
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
  requestHostAccess().catch((error) => {
    console.error("Failed to request host access:", error);
    showSettingsIssue(t("hostAccessRequestException"), "connection", "grantAccessButton");
  });
});
resetButton.addEventListener("click", resetCurrentProviderDefaults);
createBackupButton.addEventListener("click", createManualBackup);
privacyButton.addEventListener("click", () => {
  const privacyUrl = globalThis.chrome?.runtime?.getURL
    ? chrome.runtime.getURL("privacy.html")
    : "privacy.html";
  window.open(privacyUrl, "_blank", "noopener");
});

globalThis.chrome?.permissions?.onAdded?.addListener(() => {
  void refreshHostAccessStatus().catch((error) => {
    console.error("Failed to refresh host access status after permission add:", error);
  });
});

globalThis.chrome?.permissions?.onRemoved?.addListener(() => {
  void refreshHostAccessStatus().catch((error) => {
    console.error("Failed to refresh host access status after permission removal:", error);
  });
});

initializeNavigation();
void loadWhitelistDomainCatalog();

loadConfig().catch((error) => {
  console.error("Failed to load config:", error);
  const fallback = buildDefaultConfig("openai");
  populateForm(fallback);
  void refreshHostAccessStatus().catch((hostAccessError) => {
    console.error("Failed to refresh host access status after config load failure:", hostAccessError);
  });
  void refreshBackupStatus().catch((backupError) => {
    console.error("Failed to refresh backup status:", backupError);
  });
  clearApiTestStatus();
  setSaveBadge(t("saveBadgeFailed"), "danger");
  setSettingsActionStatus(t("settingsLoadException"), true);
});
