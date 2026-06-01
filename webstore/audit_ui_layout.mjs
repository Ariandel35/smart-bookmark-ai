import crypto from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const CDP_COMMAND_TIMEOUT_MS = 20_000;
const AUDIT_PAGE_ATTEMPTS = 2;
const runHeadless = process.env.MARKO_SHOW_BROWSER !== "1" && process.env.MARKO_AUDIT_HEADLESS !== "0";

const chromeCandidates = [
  process.env.CHROME_EXECUTABLE,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
].filter(Boolean);

const previewSample = {
  language: "zh-CN",
  apiTestMessage: "API 可用",
  apiTestDetail: "deepseek / deepseek-chat 当前可正常响应",
  storage: {
    smartBookmarkConfig: {
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-marko-demo",
      model: "deepseek-chat",
      batchSize: 9,
      linkCheckMode: "fast",
      autoOrganizeEnabled: true,
      autoOrganizeIntervalHours: 24,
      whitelistDomains: "mail.google.com\ngithub.com\nyoutube.com",
      protectedRootFolders: "工作\n个人",
      domainFolderRules: "github.com => AI/技术\nmail.google.com => 常用与首页",
      customPrompt:
        "尽量减少文件夹数量；“常用与首页”直接放在根目录最前面；不确定的内容放入“待手动分类”。"
    },
    smartBookmarkJobStatus: {
      phase: "preview",
      total: 216,
      processed: 216,
      moved: 182,
      deleted: 24,
      warningCount: 10,
      currentBatch: 18,
      totalBatches: 18,
      batchSize: 9,
      updatedAt: "2026-04-19T08:40:00.000Z",
      provider: "deepseek",
      model: "deepseek-chat",
      message: "整理预览已生成，共分析 216 条书签。",
      detail: "确认后会先创建本地备份，再复用已保存方案本地重建，不会再次请求模型。",
      reused: 94,
      aiClassified: 122,
      protectedRootCount: 2,
      previewFolders: [
        { id: "__root__", title: "常用与首页", totalBookmarks: 18 },
        { id: "f-ai", title: "AI/技术", totalBookmarks: 46 },
        { id: "f-tools", title: "工具/效率", totalBookmarks: 33 },
        { id: "f-learn", title: "学习/教程", totalBookmarks: 29 },
        { id: "f-news", title: "资讯/社区", totalBookmarks: 25 },
        { id: "f-life", title: "生活/资源", totalBookmarks: 20 },
        { id: "f-manual", title: "待手动分类", totalBookmarks: 9 }
      ],
      warnings: []
    },
    smartBookmarkPreviewPlan: {
      signature: "demo",
      createdAt: "2026-04-19T08:40:00.000Z"
    }
  },
  backups: [
    {
      id: "backup-2026-04-19-0840",
      title: "书签快照 2026-04-19 08-40-00",
      source: "auto",
      createdAt: "2026-04-19T08:40:00.000Z"
    },
    {
      id: "backup-2026-04-18-2115",
      title: "书签快照 2026-04-18 21-15-00",
      source: "manual",
      createdAt: "2026-04-18T21:15:00.000Z"
    }
  ],
  bookmarkTree: [
    {
      id: "0",
      title: "",
      children: [
        {
          id: "1",
          title: "书签栏",
          children: [
            { id: "10", title: "OpenAI", url: "https://openai.com/" },
            { id: "11", title: "GitHub", url: "https://github.com/" }
          ]
        }
      ]
    }
  ]
};

const longErrorSample = {
  language: "en-US",
  apiTestMessage: "API available",
  apiTestDetail: "The selected OpenAI-compatible endpoint responded successfully.",
  storage: {
    smartBookmarkConfig: {
      provider: "openai_compatible",
      baseUrl: "https://very-long-openai-compatible-provider.example.com/v1",
      apiKey: "sk-marko-demo",
      model: "extremely-long-openai-compatible-classification-model-name-for-layout-testing",
      batchSize: 9,
      linkCheckMode: "complete",
      autoOrganizeEnabled: true,
      autoOrganizeIntervalHours: 168,
      whitelistDomains: "very-long-domain-name-for-layout-testing.example.com\nmail.google.com",
      protectedRootFolders: "A Very Long Protected Root Folder Name That Should Wrap Correctly",
      domainFolderRules:
        "very-long-domain-name-for-layout-testing.example.com => Research/Long Folder Name",
      customPrompt: "Keep folder names concise. Put uncertain bookmarks into Manual Review."
    },
    smartBookmarkJobStatus: {
      phase: "error",
      total: 216,
      processed: 137,
      moved: 93,
      deleted: 24,
      warningCount: 48,
      currentBatch: 12,
      totalBatches: 24,
      batchSize: 9,
      updatedAt: "2026-04-19T08:40:00.000Z",
      provider: "OpenAI-compatible custom provider with an unusually long display label",
      model: "extremely-long-openai-compatible-classification-model-name-for-layout-testing",
      message:
        "The model request did not finish before the timeout and Marko preserved completed mini-request classifications before falling back locally.",
      detail:
        "This intentionally long status detail verifies narrow popup wrapping, error status layout, and action button sizing.",
      reused: 94,
      aiClassified: 43,
      protectedRootCount: 2,
      warnings: [
        {
          id: "w1",
          title:
            "A bookmark with an exceptionally long title that should not overflow the popup action area",
          url: "https://very-long-domain-name-for-layout-testing.example.com/some/deep/path/that/keeps/going",
          kind: "model_timeout_fallback"
        },
        {
          id: "w2",
          title: "Another long unprocessed bookmark title for layout testing",
          url: "https://another-very-long-domain.example.org/path",
          kind: "fast_local_unclassified"
        }
      ]
    }
  },
  backups: [
    {
      id: "backup-long",
      title: "Very long backup snapshot name created before applying a generated preview plan",
      source: "manual",
      createdAt: "2026-04-19T08:40:00.000Z"
    }
  ],
  bookmarkTree: [
    {
      id: "0",
      title: "",
      children: [{ id: "1", title: "Bookmarks Bar", children: [] }]
    }
  ]
};

const auditCases = [
  { label: "popup zh preview 320", file: "popup.html", width: 320, height: 760, data: previewSample },
  { label: "popup zh preview 360", file: "popup.html", width: 360, height: 760, data: previewSample },
  { label: "popup zh preview 400", file: "popup.html", width: 400, height: 760, data: previewSample },
  {
    label: "popup en long error 320",
    file: "popup.html",
    width: 320,
    height: 800,
    data: longErrorSample
  },
  {
    label: "popup en long error 400",
    file: "popup.html",
    width: 400,
    height: 800,
    data: longErrorSample
  },
  {
    label: "settings zh connection 390",
    file: "options.html",
    hash: "#connection",
    width: 390,
    height: 980,
    data: previewSample
  },
  {
    label: "settings zh connection 720",
    file: "options.html",
    hash: "#connection",
    width: 720,
    height: 980,
    data: previewSample
  },
  {
    label: "settings en connection 390",
    file: "options.html",
    hash: "#connection",
    width: 390,
    height: 1040,
    data: longErrorSample
  },
  {
    label: "settings en backup 390",
    file: "options.html",
    hash: "#backup",
    width: 390,
    height: 1040,
    data: longErrorSample
  },
  {
    label: "settings zh backup 1280",
    file: "options.html",
    hash: "#backup",
    width: 1280,
    height: 900,
    data: previewSample
  }
];

async function resolveExecutablePath() {
  for (const candidate of chromeCandidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next browser candidate.
    }
  }

  throw new Error(`Unable to find Chrome. Checked: ${chromeCandidates.join(", ")}`);
}

async function waitForProcessExit(childProcess, timeoutMs = 3000) {
  if (childProcess.exitCode !== null || childProcess.signalCode) {
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    childProcess.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function removeDirectoryWithRetry(directoryPath) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await fs.rm(directoryPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 5) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

function buildMockInitSource(payload) {
  return `(() => {
    const payload = ${JSON.stringify(payload)};
    const deepClone = (value) => JSON.parse(JSON.stringify(value));
    const storageState = deepClone(payload.storage || {});
    const treeState = deepClone(payload.bookmarkTree || []);
    const grantedOrigins = new Set();
    const event = () => ({
      addListener() {},
      removeListener() {},
      hasListener() { return false; }
    });
    const findBookmarkNode = (targetId, nodes = treeState) => {
      for (const node of nodes) {
        if (node.id === targetId) {
          return node;
        }
        if (Array.isArray(node.children)) {
          const match = findBookmarkNode(targetId, node.children);
          if (match) {
            return match;
          }
        }
      }
      return null;
    };
    const normalizeKeys = (keys) => Array.isArray(keys) ? keys : [keys];
    const getFromStorage = (keys) => {
      if (keys == null) {
        return deepClone(storageState);
      }
      if (typeof keys === "string") {
        return keys in storageState ? { [keys]: deepClone(storageState[keys]) } : {};
      }
      if (Array.isArray(keys)) {
        return keys.reduce((result, key) => {
          if (key in storageState) {
            result[key] = deepClone(storageState[key]);
          }
          return result;
        }, {});
      }
      return Object.entries(keys || {}).reduce((result, [key, fallback]) => {
        result[key] = key in storageState ? deepClone(storageState[key]) : fallback;
        return result;
      }, {});
    };

    globalThis.chrome = {
      i18n: {
        getUILanguage() {
          return payload.language || "en-US";
        },
        getMessage(key) {
          return key;
        }
      },
      storage: {
        local: {
          async get(keys) {
            return getFromStorage(keys);
          },
          async set(items) {
            Object.assign(storageState, deepClone(items || {}));
          },
          async remove(keys) {
            normalizeKeys(keys).forEach((key) => {
              delete storageState[key];
            });
          }
        }
      },
      permissions: {
        async contains(request = {}) {
          const origins = request.origins || [];
          return origins.some((origin) => grantedOrigins.has(origin));
        },
        async request(request = {}) {
          const origins = request.origins || [];
          origins.forEach((origin) => grantedOrigins.add(origin));
          return true;
        },
        onAdded: event(),
        onRemoved: event()
      },
      bookmarks: {
        async getTree() {
          return deepClone(treeState);
        },
        async getChildren(id) {
          return deepClone(findBookmarkNode(id)?.children || []);
        },
        async getSubTree(id) {
          const node = findBookmarkNode(id);
          return node ? [deepClone(node)] : [];
        },
        async get(id) {
          const node = findBookmarkNode(id);
          return node ? [deepClone(node)] : [];
        }
      },
      runtime: {
        async sendMessage(message) {
          switch (message?.type) {
            case "GET_BACKUP_RECORDS":
              return { ok: true, records: deepClone(payload.backups || []) };
            case "CHECK_LOCAL_MODEL_REQUIREMENT":
              return {
                ok: true,
                needsModel: payload.storage?.smartBookmarkConfig?.linkCheckMode !== "fast",
                requiresBroadHostAccess: payload.storage?.smartBookmarkConfig?.linkCheckMode === "complete",
                aiCandidateCount: 48,
                checkId: "layout-audit"
              };
            case "TEST_API_CONNECTION":
              return {
                ok: true,
                message: payload.apiTestMessage || "API OK",
                detail: payload.apiTestDetail || ""
              };
            default:
              return { ok: true };
          }
        },
        onMessage: event(),
        openOptionsPage() {},
        getURL(relativePath) {
          return relativePath;
        },
        async getPlatformInfo() {
          return { os: "mac", arch: "arm64", nacl_arch: "arm" };
        }
      },
      tabs: {
        async create() {
          return {};
        }
      }
    };
    globalThis.open = () => null;
    globalThis.alert = () => {};
    globalThis.confirm = () => true;
  })();`;
}

function createWebSocketFrame(text) {
  const payload = Buffer.from(text);
  const mask = crypto.randomBytes(4);
  let header;

  if (payload.length < 126) {
    header = Buffer.from([0x81, 0x80 | payload.length]);
  } else if (payload.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }

  const masked = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    masked[index] = payload[index] ^ mask[index % 4];
  }

  return Buffer.concat([header, mask, masked]);
}

function decodeFrames(state, onMessage) {
  while (state.buffer.length >= 2) {
    const firstByte = state.buffer[0];
    const secondByte = state.buffer[1];
    const opcode = firstByte & 0x0f;
    const masked = Boolean(secondByte & 0x80);
    let length = secondByte & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (state.buffer.length < offset + 2) {
        return;
      }
      length = state.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (state.buffer.length < offset + 8) {
        return;
      }
      length = Number(state.buffer.readBigUInt64BE(offset));
      offset += 8;
    }

    const maskLength = masked ? 4 : 0;
    if (state.buffer.length < offset + maskLength + length) {
      return;
    }

    const mask = masked ? state.buffer.subarray(offset, offset + 4) : null;
    offset += maskLength;
    const payload = Buffer.from(state.buffer.subarray(offset, offset + length));
    state.buffer = state.buffer.subarray(offset + length);

    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }

    if (opcode === 0x1) {
      onMessage(payload.toString("utf8"));
    } else if (opcode === 0x8) {
      return;
    }
  }
}

class CdpClient {
  constructor(webSocketDebuggerUrl) {
    const wsUrl = new URL(webSocketDebuggerUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.state = { buffer: Buffer.alloc(0) };
    this.socket = net.createConnection({
      host: wsUrl.hostname,
      port: Number(wsUrl.port || 80)
    });

    const key = crypto.randomBytes(16).toString("base64");
    this.ready = new Promise((resolve, reject) => {
      const onError = (error) => {
        reject(error);
      };

      this.socket.once("error", onError);
      this.socket.write(
        [
          `GET ${wsUrl.pathname}${wsUrl.search} HTTP/1.1`,
          `Host: ${wsUrl.host}`,
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Key: ${key}`,
          "Sec-WebSocket-Version: 13",
          "\r\n"
        ].join("\r\n")
      );

      this.socket.on("data", (chunk) => {
        this.state.buffer = Buffer.concat([this.state.buffer, chunk]);

        if (!this.state.connected) {
          const headerEnd = this.state.buffer.indexOf("\r\n\r\n");
          if (headerEnd < 0) {
            return;
          }

          const header = this.state.buffer.subarray(0, headerEnd).toString("utf8");
          this.state.buffer = this.state.buffer.subarray(headerEnd + 4);
          if (!/^HTTP\/1\.1 101\b/.test(header)) {
            reject(new Error(`WebSocket handshake failed: ${header.split("\r\n")[0]}`));
            return;
          }

          this.state.connected = true;
          this.socket.off("error", onError);
          resolve();
        }

        decodeFrames(this.state, (text) => this.handleMessage(text));
      });
    });

    this.socket.on("error", (error) => {
      for (const { reject } of this.pending.values()) {
        reject(error);
      }
      this.pending.clear();
    });
  }

  handleMessage(text) {
    const message = JSON.parse(text);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject, timeout } = this.pending.get(message.id);
      clearTimeout(timeout);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(JSON.stringify(message.error)));
      } else {
        resolve(message.result);
      }
      return;
    }

    if (message.method) {
      this.events.push(message);
    }
  }

  async send(method, params = {}, options = {}) {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
    this.socket.write(createWebSocketFrame(payload));
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : CDP_COMMAND_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP response to ${method} after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });
  }

  close() {
    this.socket.end();
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return response.json();
}

async function waitForCdp(port) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      return await fetchJson(`http://127.0.0.1:${port}/json/version`);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError || new Error("Timed out waiting for Chrome DevTools");
}

async function createTarget(port) {
  return fetchJson(`http://127.0.0.1:${port}/json/new?about%3Ablank`, { method: "PUT" });
}

function auditExpression() {
  return `(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const isFormValueControl = (el) => /^(input|textarea|select)$/i.test(el.tagName);
    const summarize = (el) => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      className: String(el.className || ""),
      text: (el.textContent || "").trim().slice(0, 90),
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth
    });
    const overflowElements = Array.from(document.querySelectorAll("body *"))
      .filter((el) => visible(el) && !isFormValueControl(el) && el.scrollWidth > el.clientWidth + 1)
      .slice(0, 12)
      .map(summarize);
    const scrollableControls = Array.from(document.querySelectorAll("input, textarea, select"))
      .filter((el) => visible(el) && el.scrollWidth > el.clientWidth + 1)
      .map(summarize);
    const clippedButtons = Array.from(document.querySelectorAll("button"))
      .filter((el) => visible(el) && el.scrollWidth > el.clientWidth + 1)
      .map(summarize);
    return {
      href: location.href,
      title: document.title,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      overflowElements,
      scrollableControls,
      clippedButtons,
      visibleButtons: Array.from(document.querySelectorAll("button"))
        .filter(visible)
        .map((button) => (button.textContent || "").trim())
        .slice(0, 12)
    };
  })()`;
}

async function auditPage(port, auditCase) {
  const target = await createTarget(port);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  const fileUrl = `${pathToFileURL(path.join(rootDir, auditCase.file)).href}${auditCase.hash || ""}`;

  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: auditCase.width,
      height: auditCase.height,
      deviceScaleFactor: 1,
      mobile: false
    });
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: buildMockInitSource(auditCase.data)
    });
    await client.send("Page.navigate", { url: fileUrl });
    await new Promise((resolve) => setTimeout(resolve, 900));

    const result = await client.send("Runtime.evaluate", {
      expression: auditExpression(),
      returnByValue: true,
      awaitPromise: true
    });

    if (result.exceptionDetails) {
      throw new Error(`Audit expression failed for ${auditCase.label}`);
    }

    const exceptions = client.events
      .filter((event) => event.method === "Runtime.exceptionThrown")
      .map((event) => event.params?.exceptionDetails?.exception?.description || "Runtime exception");
    const consoleErrors = client.events
      .filter((event) => event.method === "Runtime.consoleAPICalled" && event.params?.type === "error")
      .map((event) =>
        (event.params?.args || [])
          .map((arg) => arg.value || arg.description || "")
          .filter(Boolean)
          .join(" ")
      );

    return {
      label: auditCase.label,
      viewport: `${auditCase.width}x${auditCase.height}`,
      metrics: result.result.value,
      exceptions,
      consoleErrors
    };
  } finally {
    client.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`).catch(() => {});
  }
}

function isTransientCdpTimeout(error) {
  return /Timed out waiting for CDP response/i.test(String(error?.message || error || ""));
}

async function auditPageWithRetry(port, auditCase) {
  let lastError;
  for (let attempt = 1; attempt <= AUDIT_PAGE_ATTEMPTS; attempt += 1) {
    try {
      return await auditPage(port, auditCase);
    } catch (error) {
      lastError = error;
      if (attempt >= AUDIT_PAGE_ATTEMPTS || !isTransientCdpTimeout(error)) {
        throw error;
      }
      console.warn(`Retrying ${auditCase.label} after transient CDP timeout (${attempt}/${AUDIT_PAGE_ATTEMPTS}).`);
    }
  }

  throw lastError;
}

function formatFailure(result) {
  const failures = [];
  const metrics = result.metrics || {};

  if (metrics.scrollWidth > metrics.clientWidth + 1 || metrics.bodyScrollWidth > metrics.clientWidth + 1) {
    failures.push(
      `document overflow ${Math.max(metrics.scrollWidth, metrics.bodyScrollWidth)} > ${metrics.clientWidth}`
    );
  }
  if (metrics.overflowElements?.length) {
    failures.push(`overflow elements: ${JSON.stringify(metrics.overflowElements)}`);
  }
  if (metrics.clippedButtons?.length) {
    failures.push(`clipped buttons: ${JSON.stringify(metrics.clippedButtons)}`);
  }
  if (result.exceptions?.length) {
    failures.push(`runtime exceptions: ${result.exceptions.join(" | ")}`);
  }
  if (result.consoleErrors?.length) {
    failures.push(`console errors: ${result.consoleErrors.join(" | ")}`);
  }

  return failures;
}

async function main() {
  const executablePath = await resolveExecutablePath();
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "marko-layout-audit-"));
  const port = 9456 + Math.floor(Math.random() * 1000);
  const browserArgs = [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    ...(runHeadless ? ["--headless=new", "--disable-gpu"] : []),
    "about:blank"
  ];
  const browser = spawn(
    executablePath,
    browserArgs,
    { stdio: "ignore" }
  );

  try {
    await waitForCdp(port);
    const results = [];
    for (const auditCase of auditCases) {
      results.push(await auditPageWithRetry(port, auditCase));
    }

    const failures = results.flatMap((result) =>
      formatFailure(result).map((failure) => `${result.label}: ${failure}`)
    );

    for (const result of results) {
      const metrics = result.metrics;
      console.log(
        [
          "OK",
          result.label,
          result.viewport,
          `doc ${metrics.clientWidth}/${metrics.scrollWidth}/${metrics.bodyScrollWidth}`,
          `overflow ${metrics.overflowElements.length}`,
          `controls ${metrics.scrollableControls.length}`,
          `buttons ${metrics.clippedButtons.length}`
        ].join(" | ")
      );
    }

    if (failures.length) {
      console.error("\nUI layout audit failed:");
      failures.forEach((failure) => console.error(`- ${failure}`));
      process.exitCode = 1;
    }
  } finally {
    browser.kill();
    await waitForProcessExit(browser);
    await removeDirectoryWithRetry(profileDir);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
