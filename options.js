const STORAGE_KEY = "smartBookmarkConfig";
const HOST_ACCESS_ORIGINS = ["https://*/*", "http://*/*"];
const I18N = globalThis.SmartBookmarkI18n;
const Providers = globalThis.SmartBookmarkProviders;
const t = (key, params) => I18N.t(key, params);
const LEGACY_DEFAULT_PROMPT = I18N.getLegacyDefaultPrompt();
const DEFAULT_PROMPT = I18N.getDefaultPrompt();

const form = document.getElementById("settingsForm");
const providerSelect = document.getElementById("provider");
const baseUrlInput = document.getElementById("baseUrl");
const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const batchSizeInput = document.getElementById("batchSize");
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
const saveBadge = document.getElementById("saveBadge");
const testApiButton = document.getElementById("testApiButton");
const grantAccessButton = document.getElementById("grantAccessButton");
const resetButton = document.getElementById("resetButton");
const privacyButton = document.getElementById("privacyButton");
const backupList = document.getElementById("backupList");
const backupStatusBadge = document.getElementById("backupStatusBadge");
const createBackupButton = document.getElementById("createBackupButton");
const navButtons = Array.from(document.querySelectorAll("[data-section-target]"));
const sectionPanels = Array.from(document.querySelectorAll("[data-section-panel]"));

let lastProvider = "openai";
let whitelistSelection = [];
let whitelistCatalog = [];
let whitelistCatalogLoaded = false;

I18N.applyDocument(document);
renderProviderOptions();
renderWhitelistSelection();
renderWhitelistDomainList();

function getDefaults(provider) {
  return Providers.getProvider(provider);
}

function buildDefaultConfig(provider = "openai") {
  const defaults = getDefaults(provider);
  return {
    provider,
    baseUrl: defaults.baseUrl,
    apiKey: "",
    model: defaults.model,
    batchSize: 50,
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
    batchSize: normalizeBatchSize(raw.batchSize),
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
    button.setAttribute("aria-label", domain);

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
    const button = document.createElement("button");
    button.type = "button";
    button.className = `whitelist-option${selectedSet.has(item.domain) ? " is-selected" : ""}`;
    button.title = item.domain;

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

function clearApiTestStatus() {
  setApiTestStatus("");
}

function setHostAccessStatus(message = "", isGranted = false) {
  hostAccessStatus.textContent = message;
  hostAccessStatus.hidden = !message;
  hostAccessStatus.classList.toggle("is-error", Boolean(message) && !isGranted);
}

function showAlert(message, sectionId = "") {
  if (sectionId) {
    setActiveSection(sectionId);
  }

  window.alert(message);
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
  const granted = await hasBroadHostAccess();
  setHostAccessStatus(granted ? t("hostAccessGranted") : t("hostAccessMissing"), granted);
  grantAccessButton.textContent = granted ? t("hostAccessGrantedButton") : t("hostAccessButton");
}

function populateForm(config) {
  providerSelect.value = config.provider;
  baseUrlInput.value = config.baseUrl;
  apiKeyInput.value = config.apiKey;
  modelInput.value = config.model;
  batchSizeInput.value = String(config.batchSize);
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
  const defaults = getDefaults(provider);

  return {
    provider,
    baseUrl: baseUrlInput.value.trim() || defaults.baseUrl,
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim() || defaults.model,
    batchSize: normalizeBatchSize(batchSizeInput.value),
    autoOrganizeEnabled: autoOrganizeEnabledInput.value === "true",
    autoOrganizeIntervalHours: normalizeAutoInterval(autoOrganizeIntervalInput.value),
    whitelistDomains: serializeWhitelistDomains(),
    protectedRootFolders: protectedRootFoldersInput.value.trim(),
    domainFolderRules: domainFolderRulesInput.value.trim(),
    customPrompt: customPromptInput.value.trim() || DEFAULT_PROMPT
  };
}

function normalizeBatchSize(rawValue) {
  const parsed = Number.parseInt(String(rawValue ?? 50), 10);
  if (!Number.isFinite(parsed)) {
    return 50;
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

function markPending() {
  setSaveBadge(t("saveBadgeUnsaved"), "warm");
}

function initializeNavigation() {
  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveSection(button.dataset.sectionTarget);
    });
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
  createBackupButton.disabled = false;
  backupList.replaceChildren();

  const response = await chrome.runtime.sendMessage({
    type: "GET_BACKUP_RECORDS"
  });

  if (!response?.ok) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = response?.error || t("backupReadFailed");
    backupList.appendChild(empty);
    setBackupBadge(t("backupErrorBadge"), "danger");
    return;
  }

  const records = Array.isArray(response.records) ? response.records : [];
  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = t("backupEmpty");
    backupList.appendChild(empty);
    setBackupBadge(t("backupRatio", { count: 0 }));
    return;
  }

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

    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.className = "button button--ghost button--compact";
    restoreButton.textContent = t("restoreButton");
    restoreButton.addEventListener("click", () => {
      restoreBackupEntry(record.id).catch((error) => {
        console.error("Failed to restore backup entry:", error);
        setBackupBadge(t("backupErrorBadge"), "danger");
        window.alert(t("backupRestoreExceptionAlert"));
      });
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button button--danger button--compact";
    deleteButton.textContent = t("deleteButton");
    deleteButton.addEventListener("click", () => {
      deleteBackupEntry(record.id).catch((error) => {
        console.error("Failed to delete backup entry:", error);
        setBackupBadge(t("backupErrorBadge"), "danger");
        window.alert(t("backupDeleteExceptionAlert"));
      });
    });

    actions.append(restoreButton, deleteButton);
    row.append(meta, actions);
    backupList.appendChild(row);
  });

  setBackupBadge(t("backupRatio", { count: records.length }), "success");
}

async function saveConfig(event) {
  event.preventDefault();
  const config = collectFormData();
  const defaults = getDefaults(config.provider);

  if (!config.baseUrl) {
    showAlert(t("baseUrlRequired"), "connection");
    return;
  }

  if (!config.model) {
    showAlert(t("modelRequired"), "connection");
    return;
  }

  if (!Number.isInteger(config.batchSize) || config.batchSize < 5 || config.batchSize > 100) {
    showAlert(t("batchSizeValidation"), "organize");
    return;
  }

  if (
    !Number.isInteger(config.autoOrganizeIntervalHours) ||
    config.autoOrganizeIntervalHours < 1 ||
    config.autoOrganizeIntervalHours > 168
  ) {
    showAlert(t("autoIntervalValidation"), "automation");
    return;
  }

  if (!defaults.apiKeyOptional && !config.apiKey) {
    showAlert(t("requiredApiKey", { provider: defaults.label }), "connection");
    return;
  }

  if (config.autoOrganizeEnabled) {
    const granted = await ensureBroadHostAccess();
    await refreshHostAccessStatus();
    if (!granted) {
      showAlert(t("autoOrganizePermission"), "automation");
      return;
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: config });
  setSaveBadge(t("saveBadgeSaved"), "success");
}

async function testApiConnection() {
  const config = collectFormData();
  const defaults = getDefaults(config.provider);

  if (!config.baseUrl) {
    setActiveSection("connection");
    setApiTestStatus(t("baseUrlRequired"), true);
    return;
  }

  if (!config.model) {
    setActiveSection("connection");
    setApiTestStatus(t("modelRequired"), true);
    return;
  }

  if (!defaults.apiKeyOptional && !config.apiKey) {
    setActiveSection("connection");
    setApiTestStatus(t("requiredApiKey", { provider: defaults.label }), true);
    return;
  }

  const granted = await ensureOriginAccess(config.baseUrl);
  await refreshHostAccessStatus();
  if (!granted) {
    setActiveSection("connection");
    setApiTestStatus(t("currentApiAccessMissing"), true);
    return;
  }

  testApiButton.disabled = true;
  setApiTestStatus(t("apiTesting"));

  try {
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

    setApiTestStatus([response.message || t("apiTestSucceeded"), response.detail].filter(Boolean).join(" "));
  } catch (error) {
    console.error("Failed to test API connection:", error);
    setApiTestStatus(t("apiTestException"), true);
  } finally {
    testApiButton.disabled = false;
  }
}

async function createManualBackup() {
  createBackupButton.disabled = true;
  setBackupBadge(t("backupCreatingBadge"), "accent");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "CREATE_MANUAL_BACKUP"
    });

    if (!response?.ok) {
      setBackupBadge(t("backupErrorBadge"), "danger");
      window.alert(response?.error || t("backupCreateFailedAlert"));
      return;
    }

    await refreshBackupStatus();
  } catch (error) {
    console.error("Failed to create manual backup:", error);
    setBackupBadge(t("backupErrorBadge"), "danger");
    window.alert(t("backupCreateExceptionAlert"));
  } finally {
    createBackupButton.disabled = false;
    await refreshBackupStatus();
  }
}

async function restoreBackupEntry(backupId) {
  if (!window.confirm(t("backupRestoreConfirm"))) {
    return;
  }

  createBackupButton.disabled = true;
  setBackupBadge(t("backupRestoringBadge"), "accent");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "RESTORE_BACKUP_ENTRY",
      backupId
    });

    if (!response?.ok) {
      setBackupBadge(t("backupErrorBadge"), "danger");
      window.alert(response?.error || t("backupRestoreFailedAlert"));
      return;
    }

    await refreshBackupStatus();
  } catch (error) {
    console.error("Failed to restore backup entry:", error);
    setBackupBadge(t("backupErrorBadge"), "danger");
    window.alert(t("backupRestoreExceptionAlert"));
  } finally {
    createBackupButton.disabled = false;
    await refreshBackupStatus();
  }
}

async function deleteBackupEntry(backupId) {
  if (!window.confirm(t("backupDeleteConfirm"))) {
    return;
  }

  createBackupButton.disabled = true;
  setBackupBadge(t("backupDeletingBadge"), "accent");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "DELETE_BACKUP_ENTRY",
      backupId
    });

    if (!response?.ok) {
      setBackupBadge(t("backupErrorBadge"), "danger");
      window.alert(response?.error || t("backupDeleteFailedAlert"));
      return;
    }

    await refreshBackupStatus();
  } catch (error) {
    console.error("Failed to delete backup entry:", error);
    setBackupBadge(t("backupErrorBadge"), "danger");
    window.alert(t("backupDeleteExceptionAlert"));
  } finally {
    createBackupButton.disabled = false;
    await refreshBackupStatus();
  }
}

function resetCurrentProviderDefaults() {
  const provider = providerSelect.value;
  const config = buildDefaultConfig(provider);
  populateForm(config);
  setActiveSection("connection");
  clearApiTestStatus();
  setSaveBadge(t("saveBadgeUnsaved"), "warm");
}

async function requestHostAccess() {
  const granted = await ensureBroadHostAccess();
  await refreshHostAccessStatus();
  if (!granted) {
    showAlert(t("hostAccessMissingAlert"), "connection");
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

  markPending();
}

providerSelect.addEventListener("change", () => {
  const nextProvider = providerSelect.value;
  const previousDefaults = getDefaults(lastProvider);
  const nextDefaults = getDefaults(nextProvider);

  if (!baseUrlInput.value.trim() || baseUrlInput.value.trim() === previousDefaults.baseUrl) {
    baseUrlInput.value = nextDefaults.baseUrl;
  }

  if (!modelInput.value.trim() || modelInput.value.trim() === previousDefaults.model) {
    modelInput.value = nextDefaults.model;
  }

  updateProviderHints(nextProvider);
  lastProvider = nextProvider;
  clearApiTestStatus();
  setSaveBadge(t("saveBadgeUnsaved"), "warm");
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
    showAlert(t("hostAccessRequestException"), "connection");
  });
});
resetButton.addEventListener("click", resetCurrentProviderDefaults);
createBackupButton.addEventListener("click", createManualBackup);
privacyButton.addEventListener("click", () => {
  window.open(chrome.runtime.getURL("privacy.html"), "_blank", "noopener");
});

chrome.permissions.onAdded?.addListener(() => {
  void refreshHostAccessStatus().catch((error) => {
    console.error("Failed to refresh host access status after permission add:", error);
  });
});

chrome.permissions.onRemoved?.addListener(() => {
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
  void refreshBackupStatus().catch((backupError) => {
    console.error("Failed to refresh backup status:", backupError);
  });
  clearApiTestStatus();
  setSaveBadge(t("saveBadgeFailed"), "danger");
});
