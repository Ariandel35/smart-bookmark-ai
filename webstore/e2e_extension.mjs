import crypto from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const REQUIRED_BACKGROUND_PATH = "background.js";
const screenshotDir = process.env.MARKO_EXTENSION_SCREENSHOT_DIR || "";
const BROWSER_HINT =
  "Install Chrome for Testing or Chromium, or set MARKO_EXTENSION_BROWSER to a browser executable that allows --load-extension.";
const browserCandidates = [
  process.env.MARKO_EXTENSION_BROWSER,
  process.env.CHROME_FOR_TESTING_EXECUTABLE,
  "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
].filter(Boolean);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function pathExists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
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
      await sleep(250);
    }
  }
}

function isKnownUnsupportedChrome(executablePath) {
  return /\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome$/.test(executablePath);
}

async function resolveExecutablePath() {
  for (const candidate of browserCandidates) {
    if (!(await pathExists(candidate))) {
      continue;
    }
    if (isKnownUnsupportedChrome(candidate)) {
      throw new Error(
        `Refusing to use regular Google Chrome because it ignores --load-extension in this environment. ${BROWSER_HINT}`
      );
    }
    return candidate;
  }

  throw new Error(`Unable to find a browser for real extension E2E. Checked: ${browserCandidates.join(", ")}. ${BROWSER_HINT}`);
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
      const onError = (error) => reject(error);

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

  async send(method, params = {}, sessionId = "") {
    await this.ready;
    const id = this.nextId;
    this.nextId += 1;
    this.socket.write(createWebSocketFrame(JSON.stringify({
      id,
      method,
      params,
      ...(sessionId ? { sessionId } : {})
    })));

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP response to ${method}`));
      }, 10000);
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

async function waitForCdp(port, browserStderr) {
  let lastError;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      return await fetchJson(`http://127.0.0.1:${port}/json/version`);
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw new Error(`Timed out waiting for Chrome DevTools. ${browserStderr() || lastError?.message || ""}`.trim());
}

async function createTarget(port, url = "about:blank") {
  return fetchJson(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
}

async function closeTarget(port, targetId) {
  await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`).catch(() => {});
}

async function readLoadedExtensionId(profileDir) {
  const preferencesPath = path.join(profileDir, "Default", "Preferences");
  try {
    const preferences = JSON.parse(await fs.readFile(preferencesPath, "utf8"));
    const settings = preferences.extensions?.settings || {};
    for (const [extensionId, setting] of Object.entries(settings)) {
      const extensionPath = setting?.path ? path.resolve(setting.path) : "";
      if (
        extensionPath === rootDir ||
        setting?.manifest?.name === "__MSG_extName__" ||
        setting?.manifest?.name === "Marko"
      ) {
        return extensionId;
      }
    }
  } catch {
    // Preferences may not exist until the browser finishes loading the unpacked extension.
  }
  return "";
}

function findBackgroundTarget(targetInfos, extensionId = "") {
  return (targetInfos || []).find((target) => {
    if (target.type !== "service_worker") {
      return false;
    }
    const match = String(target.url || "").match(/^chrome-extension:\/\/([^/]+)\/background\.js$/);
    return match && (!extensionId || match[1] === extensionId);
  });
}

async function waitForExtensionId(browserClient, profileDir) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const targetResult = await browserClient.send("Target.getTargets");
    const backgroundTarget = findBackgroundTarget(targetResult.targetInfos);
    if (backgroundTarget) {
      return backgroundTarget.url.match(/^chrome-extension:\/\/([^/]+)\//)[1];
    }

    const extensionId = await readLoadedExtensionId(profileDir);
    if (extensionId) {
      return extensionId;
    }
    await sleep(250);
  }

  throw new Error(
    `Marko was not registered as an unpacked extension. This usually means the browser ignored --load-extension. ${BROWSER_HINT}`
  );
}

async function waitForBackgroundTarget(browserClient, extensionId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const targetResult = await browserClient.send("Target.getTargets");
    const backgroundTarget = findBackgroundTarget(targetResult.targetInfos, extensionId);
    if (backgroundTarget) {
      return backgroundTarget;
    }
    await sleep(250);
  }

  throw new Error(`Marko service worker ${REQUIRED_BACKGROUND_PATH} was not visible through CDP.`);
}

function coreFlowExpression() {
  return `(async () => {
    if (!chrome?.runtime?.id || !chrome?.bookmarks || !chrome?.storage?.local) {
      throw new Error("Required extension APIs are not available in the extension page.");
    }

    const sendMessage = (message) => chrome.runtime.sendMessage(message);
    const deepClone = (value) => JSON.parse(JSON.stringify(value));
    const flattenBookmarks = async (node) => {
      if (node.url) {
        return [{ title: node.title, url: node.url }];
      }
      const children = await chrome.bookmarks.getChildren(node.id).catch(() => []);
      const nested = [];
      for (const child of children) {
        nested.push(...(await flattenBookmarks(child)));
      }
      return nested;
    };
    const tree = await chrome.bookmarks.getTree();
    const bar = tree[0].children.find((node) => node.id === "1") || tree[0].children.find((node) => !node.url);
    if (!bar) {
      throw new Error("Bookmarks bar was not found in the temporary profile.");
    }

    for (const child of await chrome.bookmarks.getChildren(bar.id)) {
      if (child.url) {
        await chrome.bookmarks.remove(child.id);
      } else {
        await chrome.bookmarks.removeTree(child.id);
      }
    }
    await chrome.storage.local.clear();
    await new Promise((resolve) => setTimeout(resolve, 250));

    await chrome.bookmarks.create({
      parentId: bar.id,
      title: "Marko Repo",
      url: "https://github.com/Ariandel35/marko"
    });
    await chrome.bookmarks.create({
      parentId: bar.id,
      title: "Marko Repo Duplicate",
      url: "https://github.com/Ariandel35/marko"
    });
    await chrome.bookmarks.create({
      parentId: bar.id,
      title: "OpenAI",
      url: "https://openai.com/"
    });
    await chrome.bookmarks.create({
      parentId: bar.id,
      title: "Needs Manual Review",
      url: "https://example.invalid/manual-review"
    });

    await chrome.storage.local.set({
      smartBookmarkConfig: {
        provider: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "",
        model: "gpt-4.1-mini",
        batchSize: 9,
        linkCheckMode: "fast",
        autoOrganizeEnabled: false,
        autoOrganizeIntervalHours: 24,
        whitelistDomains: "",
        protectedRootFolders: "",
        domainFolderRules: "github.com => Code\\nopenai.com => AI",
        customPrompt: "Keep this temporary E2E run local and compact."
      }
    });

    const manualBackup = await sendMessage({ type: "CREATE_MANUAL_BACKUP" });
    const requirement = await sendMessage({ type: "CHECK_LOCAL_MODEL_REQUIREMENT" });
    const preview = await sendMessage({
      type: "START_PREVIEW",
      localRequirementCheckId: requirement.checkId || ""
    });
    const afterPreview = await chrome.storage.local.get([
      "smartBookmarkJobStatus",
      "smartBookmarkPreviewPlan",
      "smartBookmarkBackupRecords"
    ]);
    const apply = await sendMessage({ type: "APPLY_PREVIEW_PLAN" });
    const afterApply = await chrome.storage.local.get([
      "smartBookmarkJobStatus",
      "smartBookmarkPreviewPlan",
      "smartBookmarkBackupRecords"
    ]);

    const applyChildren = await chrome.bookmarks.getChildren(bar.id);
    const applyBookmarks = [];
    for (const child of applyChildren) {
      applyBookmarks.push(...(await flattenBookmarks(child)));
    }
    const applyUrlCounts = applyBookmarks.reduce((counts, bookmark) => {
      counts[bookmark.url] = (counts[bookmark.url] || 0) + 1;
      return counts;
    }, {});
    const backupRecordsAfterApply = afterApply.smartBookmarkBackupRecords || [];
    const unprocessedEntry = (afterApply.smartBookmarkJobStatus?.warnings || [])[0] || null;
    const resolveUnprocessed = unprocessedEntry
      ? await sendMessage({
          type: "RESOLVE_UNPROCESSED_ENTRY",
          entryId: unprocessedEntry.id,
          action: "delete"
        })
      : { ok: false, error: "No unprocessed entry was available to delete." };
    const afterResolve = await chrome.storage.local.get([
      "smartBookmarkJobStatus",
      "smartBookmarkBackupRecords"
    ]);
    const resolvedChildren = await chrome.bookmarks.getChildren(bar.id);
    const resolvedBookmarks = [];
    for (const child of resolvedChildren) {
      resolvedBookmarks.push(...(await flattenBookmarks(child)));
    }
    const resolvedUrlCounts = resolvedBookmarks.reduce((counts, bookmark) => {
      counts[bookmark.url] = (counts[bookmark.url] || 0) + 1;
      return counts;
    }, {});
    const restoreSourceRecord = backupRecordsAfterApply.at(-1) || null;
    const restore = restoreSourceRecord
      ? await sendMessage({ type: "RESTORE_BACKUP_ENTRY", backupId: restoreSourceRecord.id })
      : { ok: false, error: "No backup record was available to restore." };
    const afterRestore = await chrome.storage.local.get([
      "smartBookmarkJobStatus",
      "smartBookmarkBackupRecords"
    ]);
    const restoredChildren = await chrome.bookmarks.getChildren(bar.id);
    const restoredBookmarks = [];
    for (const child of restoredChildren) {
      restoredBookmarks.push(...(await flattenBookmarks(child)));
    }
    const restoredUrlCounts = restoredBookmarks.reduce((counts, bookmark) => {
      counts[bookmark.url] = (counts[bookmark.url] || 0) + 1;
      return counts;
    }, {});
    const deleteBackup = restoreSourceRecord
      ? await sendMessage({ type: "DELETE_BACKUP_ENTRY", backupId: restoreSourceRecord.id })
      : { ok: false, error: "No backup record was available to delete." };
    const afterDelete = await chrome.storage.local.get([
      "smartBookmarkJobStatus",
      "smartBookmarkBackupRecords"
    ]);

    return {
      manualBackup,
      requirement,
      preview,
      previewStatus: deepClone(afterPreview.smartBookmarkJobStatus || {}),
      previewPlan: deepClone(afterPreview.smartBookmarkPreviewPlan || null),
      apply,
      finalStatus: deepClone(afterApply.smartBookmarkJobStatus || {}),
      previewPlanAfterApply: Boolean(afterApply.smartBookmarkPreviewPlan),
      backupRecordCount: backupRecordsAfterApply.length,
      normalRootTitles: applyChildren.map((child) => child.title),
      finalBookmarkCount: applyBookmarks.length,
      finalUrlCounts: applyUrlCounts,
      finalBookmarks: applyBookmarks,
      unprocessedEntryId: unprocessedEntry?.id || "",
      resolveUnprocessed,
      resolveStatus: deepClone(afterResolve.smartBookmarkJobStatus || {}),
      resolvedBookmarkCount: resolvedBookmarks.length,
      resolvedUrlCounts,
      resolvedBookmarks,
      restoreSourceId: restoreSourceRecord?.id || "",
      restore,
      restoreStatus: deepClone(afterRestore.smartBookmarkJobStatus || {}),
      backupRecordCountAfterRestore: (afterRestore.smartBookmarkBackupRecords || []).length,
      restoredBookmarkCount: restoredBookmarks.length,
      restoredUrlCounts,
      restoredBookmarks,
      deleteBackup,
      deleteStatus: deepClone(afterDelete.smartBookmarkJobStatus || {}),
      backupRecordCountAfterDelete: (afterDelete.smartBookmarkBackupRecords || []).length
    };
  })()`;
}

async function runCoreFlow(port, extensionId) {
  const target = await createTarget(port);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Page.navigate", { url: `chrome-extension://${extensionId}/popup.html` });
    await sleep(1500);
    return await evaluate(client, coreFlowExpression());
  } finally {
    client.close();
    await closeTarget(port, target.id);
  }
}

function formatCoreFlowFailures(result) {
  const failures = [];

  if (!result?.manualBackup?.ok || !result.manualBackup.created) {
    failures.push("manual backup did not create a real bookmark snapshot");
  }
  if (!result?.requirement?.ok || result.requirement.total !== 4 || result.requirement.needsModel) {
    failures.push(`unexpected local requirement result: ${JSON.stringify(result?.requirement || {})}`);
  }
  if (!result?.preview?.ok || result.previewStatus?.phase !== "preview" || !result.previewPlan) {
    failures.push("fast preview did not finish with a saved preview plan");
  }
  if (Number(result.previewPlan?.deleted || 0) < 1) {
    failures.push("preview did not detect the duplicate bookmark");
  }
  if (!result?.apply?.ok || result.finalStatus?.phase !== "completed") {
    failures.push("applying the saved preview did not complete");
  }
  if (result.previewPlanAfterApply) {
    failures.push("preview plan was not cleared after apply");
  }
  if (Number(result.backupRecordCount || 0) < 2) {
    failures.push("manual and pre-apply backup records were not both preserved");
  }
  if (Number(result.finalUrlCounts?.["https://github.com/Ariandel35/marko"] || 0) !== 1) {
    failures.push("duplicate GitHub bookmark was not reduced to one normal bookmark");
  }
  if (Number(result.finalUrlCounts?.["https://openai.com/"] || 0) !== 1) {
    failures.push("OpenAI bookmark was not preserved after apply");
  }
  if (Number(result.finalUrlCounts?.["https://example.invalid/manual-review"] || 0) !== 1) {
    failures.push("unmatched bookmark was not preserved for manual review");
  }
  if (Number(result.finalBookmarkCount || 0) !== 3) {
    failures.push(`expected 3 normal bookmarks after duplicate cleanup, got ${result.finalBookmarkCount}`);
  }
  if (!result.unprocessedEntryId || !result?.resolveUnprocessed?.ok || result.resolveStatus?.phase !== "completed") {
    failures.push("deleting the generated unprocessed entry did not complete");
  }
  if (Number(result.resolveStatus?.warningCount || 0) !== 0) {
    failures.push(`expected zero unprocessed warnings after delete, got ${result.resolveStatus?.warningCount}`);
  }
  if (Number(result.resolvedUrlCounts?.["https://example.invalid/manual-review"] || 0) !== 0) {
    failures.push("unprocessed delete did not remove the manual-review bookmark from the live bookmark tree");
  }
  if (Number(result.resolvedBookmarkCount || 0) !== 2) {
    failures.push(`expected 2 bookmarks after deleting the unprocessed item, got ${result.resolvedBookmarkCount}`);
  }
  if (!result?.restore?.ok || result.restoreStatus?.phase !== "completed") {
    failures.push("restoring the original manual backup did not complete");
  }
  if (Number(result.backupRecordCountAfterRestore || 0) < 3) {
    failures.push("restore did not create and preserve a pre-restore backup record");
  }
  if (Number(result.restoredBookmarkCount || 0) !== 4) {
    failures.push(`expected 4 bookmarks after restoring the original backup, got ${result.restoredBookmarkCount}`);
  }
  if (Number(result.restoredUrlCounts?.["https://github.com/Ariandel35/marko"] || 0) !== 2) {
    failures.push("restored backup did not bring back both original duplicate GitHub bookmarks");
  }
  if (Number(result.restoredUrlCounts?.["https://openai.com/"] || 0) !== 1) {
    failures.push("restored backup did not bring back the original OpenAI bookmark");
  }
  if (Number(result.restoredUrlCounts?.["https://example.invalid/manual-review"] || 0) !== 1) {
    failures.push("restored backup did not bring back the original manual-review bookmark");
  }
  if (!result?.deleteBackup?.ok) {
    failures.push("deleting the restored backup record did not complete");
  }
  if (Number(result.backupRecordCountAfterDelete || 0) !== Number(result.backupRecordCountAfterRestore || 0) - 1) {
    failures.push("backup delete did not remove exactly one backup record");
  }

  return failures;
}

function pageAuditExpression(pageKind) {
  return `(() => {
    const pageKind = ${JSON.stringify(pageKind)};
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const summarize = (el) => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      className: String(el.className || ""),
      text: (el.textContent || "").trim().slice(0, 90),
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth
    });
    return {
      pageKind,
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      bodyText: document.body.innerText.trim().slice(0, 240),
      chromeRuntimeAvailable: Boolean(globalThis.chrome?.runtime?.id),
      runtimeId: globalThis.chrome?.runtime?.id || "",
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      overflowElements: Array.from(document.querySelectorAll("body *"))
        .filter((el) => visible(el) && !/^(input|textarea|select)$/i.test(el.tagName) && el.scrollWidth > el.clientWidth + 1)
        .slice(0, 12)
        .map(summarize),
      clippedButtons: Array.from(document.querySelectorAll("button"))
        .filter((el) => visible(el) && el.scrollWidth > el.clientWidth + 1)
        .slice(0, 12)
        .map(summarize),
      visibleButtons: Array.from(document.querySelectorAll("button"))
        .filter(visible)
        .map((button) => (button.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 16),
      popupMode: pageKind === "popup" ? {
        fast: document.getElementById("speedModeFastButton")?.getAttribute("aria-checked") || "",
        balanced: document.getElementById("speedModeBalancedButton")?.getAttribute("aria-checked") || "",
        complete: document.getElementById("speedModeCompleteButton")?.getAttribute("aria-checked") || "",
        balancedDisabled: Boolean(document.getElementById("speedModeBalancedButton")?.disabled),
        phaseBadgeText: (document.getElementById("phaseBadge")?.textContent || "").trim(),
        progressSummary: (document.getElementById("progressSummary")?.textContent || "").trim(),
        deletedValue: (document.getElementById("deletedValue")?.textContent || "").trim(),
        warningValue: (document.getElementById("warningValue")?.textContent || "").trim()
      } : null,
      optionsState: pageKind === "options" ? {
        activeTab: document.querySelector('[role="tab"][aria-selected="true"]')?.id || "",
        activePanel: document.querySelector('[role="tabpanel"].is-active')?.id || "",
        providerOptions: document.querySelectorAll("#provider option").length,
        saveDisabled: Boolean(document.getElementById("saveButton")?.disabled)
      } : null
    };
  })()`;
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || "Runtime evaluation failed.");
  }
  return result.result.value;
}

async function auditExtensionPage(port, page) {
  const target = await createTarget(port);
  const client = new CdpClient(target.webSocketDebuggerUrl);
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: page.width,
      height: page.height,
      deviceScaleFactor: 1,
      mobile: false
    });
    await client.send("Page.navigate", { url: page.url });
    await sleep(1500);

    if (page.kind === "popup" && page.action === "switch-balanced") {
      await evaluate(
        client,
        `(() => {
          const button = document.getElementById("speedModeBalancedButton");
          if (!button || button.disabled) {
            throw new Error("Balanced mode button is not available.");
          }
          button.click();
        })()`
      );
      await sleep(500);
    } else if (page.kind === "options") {
      await evaluate(
        client,
        `(() => {
          const button = document.getElementById("settings-tab-backup");
          if (!button) {
            throw new Error("Backup tab is not available.");
          }
          button.click();
        })()`
      );
      await sleep(500);
    }

    const metrics = await evaluate(client, pageAuditExpression(page.kind));
    let screenshotPath = "";
    if (screenshotDir) {
      await fs.mkdir(screenshotDir, { recursive: true });
      const screenshot = await client.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false
      });
      screenshotPath = path.join(screenshotDir, `${page.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`);
      await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
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
      label: page.label,
      viewport: `${page.width}x${page.height}`,
      metrics,
      screenshotPath,
      exceptions,
      consoleErrors
    };
  } finally {
    client.close();
    await closeTarget(port, target.id);
  }
}

function formatPageFailures(result, extensionId) {
  const failures = [];
  const metrics = result.metrics || {};

  if (!String(metrics.href || "").startsWith(`chrome-extension://${extensionId}/`)) {
    failures.push(`wrong extension URL: ${metrics.href}`);
  }
  if (!metrics.chromeRuntimeAvailable || metrics.runtimeId !== extensionId) {
    failures.push(`chrome.runtime.id mismatch: ${metrics.runtimeId || "(missing)"}`);
  }
  if (!metrics.bodyText || !/Marko|Settings|设置/.test(metrics.bodyText)) {
    failures.push("page rendered blank or without Marko content");
  }
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
  if (metrics.pageKind === "popup" && !/^(Completed|已完成)$/.test(metrics.popupMode?.phaseBadgeText || "")) {
    failures.push(`popup did not render the completed core-flow status: ${metrics.popupMode?.phaseBadgeText || "(missing)"}`);
  }
  if (metrics.pageKind === "popup" && pageActionWasBalanced(result) && metrics.popupMode?.balanced !== "true") {
    failures.push("popup Balanced interaction did not update aria-checked");
  }
  if (metrics.pageKind === "options" && metrics.optionsState?.activeTab !== "settings-tab-backup") {
    failures.push("options Backup tab interaction did not activate the backup tab");
  }
  if (metrics.pageKind === "options" && Number(metrics.optionsState?.providerOptions || 0) < 3) {
    failures.push("options provider list did not render provider choices");
  }

  return failures;
}

function pageActionWasBalanced(result) {
  return result?.metrics?.pageKind === "popup" && result?.action === "switch-balanced";
}

async function main() {
  const executablePath = await resolveExecutablePath();
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "marko-extension-e2e-"));
  const port = 10456 + Math.floor(Math.random() * 1000);
  let stderrBuffer = "";
  const browser = spawn(
    executablePath,
    [
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${port}`,
      `--disable-extensions-except=${rootDir}`,
      `--load-extension=${rootDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "about:blank"
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );

  browser.stderr.on("data", (chunk) => {
    stderrBuffer = `${stderrBuffer}${chunk.toString("utf8")}`.slice(-4000);
  });
  const browserStderr = () => stderrBuffer.trim().split(/\r?\n/).slice(-6).join("\n");

  try {
    const version = await waitForCdp(port, browserStderr);
    const browserClient = new CdpClient(version.webSocketDebuggerUrl);
    try {
      await browserClient.send("Target.setDiscoverTargets", { discover: true });
      const extensionId = await waitForExtensionId(browserClient, profileDir);
      const backgroundTarget = await waitForBackgroundTarget(browserClient, extensionId);
      const coreFlow = await runCoreFlow(port, extensionId);
      const pages = [
        {
          kind: "popup",
          label: "popup completed flow 400",
          url: `chrome-extension://${extensionId}/popup.html`,
          width: 400,
          height: 760
        },
        {
          kind: "options",
          label: "options real extension 1280",
          url: `chrome-extension://${extensionId}/options.html#connection`,
          width: 1280,
          height: 900
        }
      ];
      const results = [];
      for (const page of pages) {
        const result = await auditExtensionPage(port, page);
        result.action = page.action || "";
        results.push(result);
      }
      const failures = [
        ...formatCoreFlowFailures(coreFlow).map((failure) => `core flow: ${failure}`),
        ...results.flatMap((result) =>
          formatPageFailures(result, extensionId).map((failure) => `${result.label}: ${failure}`)
        )
      ];

      console.log(`OK extension id ${extensionId}`);
      console.log(`OK service worker ${backgroundTarget.url}`);
      console.log(
        [
          "OK core flow",
          `manualBackup=${Boolean(coreFlow.manualBackup?.created)}`,
          `preview=${coreFlow.previewStatus?.phase || ""}`,
          `apply=${coreFlow.finalStatus?.phase || ""}`,
          `resolve=${coreFlow.resolveStatus?.phase || ""}`,
          `restore=${coreFlow.restoreStatus?.phase || ""}`,
          `normalBookmarks=${coreFlow.finalBookmarkCount}`,
          `resolvedBookmarks=${coreFlow.resolvedBookmarkCount}`,
          `restoredBookmarks=${coreFlow.restoredBookmarkCount}`,
          `backupRecords=${coreFlow.backupRecordCount}`,
          `backupRecordsAfterDelete=${coreFlow.backupRecordCountAfterDelete}`,
          `duplicateGithub=${coreFlow.finalUrlCounts?.["https://github.com/Ariandel35/marko"] || 0}`
        ].join(" | ")
      );
      for (const result of results) {
        const metrics = result.metrics;
        console.log(
          [
            "OK",
            result.label,
            result.viewport,
            metrics.title,
            `doc ${metrics.clientWidth}/${metrics.scrollWidth}/${metrics.bodyScrollWidth}`,
            `overflow ${metrics.overflowElements.length}`,
            `buttons ${metrics.clippedButtons.length}`
          ].join(" | ")
        );
        if (result.screenshotPath) {
          console.log(`OK screenshot ${result.screenshotPath}`);
        }
      }

      if (failures.length) {
        console.error("\nReal extension E2E failed:");
        failures.forEach((failure) => console.error(`- ${failure}`));
        process.exitCode = 1;
      }
    } finally {
      browserClient.close();
    }
  } finally {
    browser.kill();
    await waitForProcessExit(browser);
    await removeDirectoryWithRetry(profileDir);
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
