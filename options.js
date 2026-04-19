const STORAGE_KEY = "smartBookmarkConfig";
const HOST_ACCESS_ORIGINS = ["https://*/*", "http://*/*"];

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
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKeyOptional: false
  },
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    apiKeyOptional: false
  },
  minimax: {
    label: "MiniMax",
    baseUrl: "https://api.minimaxi.com/v1",
    model: "MiniMax-M2.7",
    apiKeyOptional: false
  },
  ollama: {
    label: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.2",
    apiKeyOptional: true
  }
};

const form = document.getElementById("settingsForm");
const providerSelect = document.getElementById("provider");
const baseUrlInput = document.getElementById("baseUrl");
const apiKeyInput = document.getElementById("apiKey");
const modelInput = document.getElementById("model");
const batchSizeInput = document.getElementById("batchSize");
const autoOrganizeEnabledInput = document.getElementById("autoOrganizeEnabled");
const autoOrganizeIntervalInput = document.getElementById("autoOrganizeIntervalHours");
const whitelistDomainsInput = document.getElementById("whitelistDomains");
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

let lastProvider = providerSelect.value;

function getDefaults(provider) {
  return PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openai;
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
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : defaults.model,
    batchSize: normalizeBatchSize(raw.batchSize),
    autoOrganizeEnabled: Boolean(raw.autoOrganizeEnabled),
    autoOrganizeIntervalHours: normalizeAutoInterval(raw.autoOrganizeIntervalHours),
    whitelistDomains:
      typeof raw.whitelistDomains === "string" ? raw.whitelistDomains.trim() : "",
    customPrompt: normalizePromptValue(promptValue)
  };
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
  if (!dateString) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(dateString));
  } catch (error) {
    return "—";
  }
}

function updateProviderHints(provider) {
  const defaults = getDefaults(provider);
  modelInput.placeholder = defaults.model;
  baseUrlInput.placeholder = defaults.baseUrl;
  apiKeyInput.placeholder = defaults.apiKeyOptional ? "本地模型可留空" : "请输入 API Key";
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
  setHostAccessStatus(granted ? "已授权网站访问" : "未授权网站访问", granted);
  grantAccessButton.textContent = granted ? "已授权" : "授权网站访问";
}

function populateForm(config) {
  providerSelect.value = config.provider;
  baseUrlInput.value = config.baseUrl;
  apiKeyInput.value = config.apiKey;
  modelInput.value = config.model;
  batchSizeInput.value = String(config.batchSize);
  autoOrganizeEnabledInput.value = config.autoOrganizeEnabled ? "true" : "false";
  autoOrganizeIntervalInput.value = String(config.autoOrganizeIntervalHours);
  whitelistDomainsInput.value = config.whitelistDomains;
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
    whitelistDomains: whitelistDomainsInput.value.trim(),
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
  setSaveBadge("待保存", "warm");
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
  setSaveBadge("已同步", "success");
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
    empty.textContent = response?.error || "读取备份列表失败。";
    backupList.appendChild(empty);
    setBackupBadge("异常", "danger");
    return;
  }

  const records = Array.isArray(response.records) ? response.records : [];
  if (!records.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "暂无备份";
    backupList.appendChild(empty);
    setBackupBadge("0 / 10");
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
      record.source === "auto" ? "自动" : "手动",
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
    restoreButton.textContent = "恢复";
    restoreButton.addEventListener("click", () => {
      restoreBackupEntry(record.id).catch((error) => {
        console.error("Failed to restore backup entry:", error);
        setBackupBadge("异常", "danger");
        window.alert("恢复备份时发生异常。");
      });
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button button--danger button--compact";
    deleteButton.textContent = "删除";
    deleteButton.addEventListener("click", () => {
      deleteBackupEntry(record.id).catch((error) => {
        console.error("Failed to delete backup entry:", error);
        setBackupBadge("异常", "danger");
        window.alert("删除备份时发生异常。");
      });
    });

    actions.append(restoreButton, deleteButton);
    row.append(meta, actions);
    backupList.appendChild(row);
  });

  setBackupBadge(`${records.length} / 10`, "success");
}

async function saveConfig(event) {
  event.preventDefault();
  const config = collectFormData();
  const defaults = getDefaults(config.provider);

  if (!config.baseUrl) {
    showAlert("Base URL 不能为空。", "connection");
    return;
  }

  if (!config.model) {
    showAlert("Model Name 不能为空。", "connection");
    return;
  }

  if (!Number.isInteger(config.batchSize) || config.batchSize < 5 || config.batchSize > 100) {
    showAlert("批大小必须是 5 到 100 之间的整数。", "organize");
    return;
  }

  if (
    !Number.isInteger(config.autoOrganizeIntervalHours) ||
    config.autoOrganizeIntervalHours < 1 ||
    config.autoOrganizeIntervalHours > 168
  ) {
    showAlert("自动整理间隔必须是 1 到 168 小时之间的整数。", "automation");
    return;
  }

  if (!defaults.apiKeyOptional && !config.apiKey) {
    showAlert(`${defaults.label} 通常需要 API Key，请先填写。`, "connection");
    return;
  }

  if (config.autoOrganizeEnabled) {
    const granted = await ensureBroadHostAccess();
    await refreshHostAccessStatus();
    if (!granted) {
      showAlert("自动整理需要网站访问权限。请先授权网站访问，再保存自动任务配置。", "automation");
      return;
    }
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: config });
  setSaveBadge("已保存", "success");
}

async function testApiConnection() {
  const config = collectFormData();
  const defaults = getDefaults(config.provider);

  if (!config.baseUrl) {
    setActiveSection("connection");
    setApiTestStatus("Base URL 不能为空。", true);
    return;
  }

  if (!config.model) {
    setActiveSection("connection");
    setApiTestStatus("Model Name 不能为空。", true);
    return;
  }

  if (!defaults.apiKeyOptional && !config.apiKey) {
    setActiveSection("connection");
    setApiTestStatus(`${defaults.label} 通常需要 API Key，请先填写。`, true);
    return;
  }

  const granted = await ensureOriginAccess(config.baseUrl);
  await refreshHostAccessStatus();
  if (!granted) {
    setActiveSection("connection");
    setApiTestStatus("未授权访问当前 API 地址。", true);
    return;
  }

  testApiButton.disabled = true;
  setApiTestStatus("检测中…");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "TEST_API_CONNECTION",
      config
    });

    if (!response?.ok) {
      setApiTestStatus(
        [response?.error || "API 检测失败。", response?.detail].filter(Boolean).join(" "),
        true
      );
      return;
    }

    setApiTestStatus([response.message || "API 检测成功。", response.detail].filter(Boolean).join(" "));
  } catch (error) {
    console.error("Failed to test API connection:", error);
    setApiTestStatus("API 检测过程中发生异常。", true);
  } finally {
    testApiButton.disabled = false;
  }
}

async function createManualBackup() {
  createBackupButton.disabled = true;
  setBackupBadge("创建中", "accent");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "CREATE_MANUAL_BACKUP"
    });

    if (!response?.ok) {
      setBackupBadge("异常", "danger");
      window.alert(response?.error || "创建备份失败。");
      return;
    }

    await refreshBackupStatus();
  } catch (error) {
    console.error("Failed to create manual backup:", error);
    setBackupBadge("异常", "danger");
    window.alert("创建备份时发生异常。");
  } finally {
    createBackupButton.disabled = false;
    await refreshBackupStatus();
  }
}

async function restoreBackupEntry(backupId) {
  if (!window.confirm("恢复这个备份后，当前书签栏内容会被该备份覆盖。继续吗？")) {
    return;
  }

  createBackupButton.disabled = true;
  setBackupBadge("恢复中", "accent");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "RESTORE_BACKUP_ENTRY",
      backupId
    });

    if (!response?.ok) {
      setBackupBadge("异常", "danger");
      window.alert(response?.error || "恢复备份失败。");
      return;
    }

    await refreshBackupStatus();
  } catch (error) {
    console.error("Failed to restore backup entry:", error);
    setBackupBadge("异常", "danger");
    window.alert("恢复备份时发生异常。");
  } finally {
    createBackupButton.disabled = false;
    await refreshBackupStatus();
  }
}

async function deleteBackupEntry(backupId) {
  if (!window.confirm("确定要删除这个备份吗？删除后无法恢复。")) {
    return;
  }

  createBackupButton.disabled = true;
  setBackupBadge("删除中", "accent");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "DELETE_BACKUP_ENTRY",
      backupId
    });

    if (!response?.ok) {
      setBackupBadge("异常", "danger");
      window.alert(response?.error || "删除备份失败。");
      return;
    }

    await refreshBackupStatus();
  } catch (error) {
    console.error("Failed to delete backup entry:", error);
    setBackupBadge("异常", "danger");
    window.alert("删除备份时发生异常。");
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
  setSaveBadge("待保存", "warm");
}

async function requestHostAccess() {
  const granted = await ensureBroadHostAccess();
  await refreshHostAccessStatus();
  if (!granted) {
    showAlert("未授予网站访问权限。整理书签和自动整理都需要这项授权。", "connection");
  }
}

function handleFormMutation(event) {
  const targetId = event.target?.id;
  if (!targetId || targetId === "provider") {
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
  setSaveBadge("待保存", "warm");
});

form.addEventListener("submit", saveConfig);
form.addEventListener("input", handleFormMutation);
form.addEventListener("change", handleFormMutation);
testApiButton.addEventListener("click", testApiConnection);
grantAccessButton.addEventListener("click", () => {
  requestHostAccess().catch((error) => {
    console.error("Failed to request host access:", error);
    showAlert("申请网站访问权限时发生异常。", "connection");
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

loadConfig().catch((error) => {
  console.error("Failed to load config:", error);
  const fallback = buildDefaultConfig("openai");
  populateForm(fallback);
  void refreshBackupStatus().catch((backupError) => {
    console.error("Failed to refresh backup status:", backupError);
  });
  clearApiTestStatus();
  setSaveBadge("读取失败", "danger");
});
