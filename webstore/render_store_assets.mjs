import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const screenshotDir = path.join(rootDir, "docs", "screenshots");
const outputDir = path.join(__dirname, "assets");

const palette = {
  bg: "#f7f7f2",
  paper: "#ffffff",
  line: "#dde2d7",
  text: "#171b17",
  muted: "#697168",
  accent: "#1d5f49",
  accentSoft: "#e9f3ee",
  shadow: "0 22px 56px rgba(23, 27, 23, 0.08)"
};

const sampleData = {
  language: "zh-CN",
  apiTestMessage: "API 可用",
  apiTestDetail: "deepseek / deepseek-chat 当前可正常响应",
  storage: {
    smartBookmarkConfig: {
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-marko-demo",
      model: "deepseek-chat",
      batchSize: 24,
      autoOrganizeEnabled: true,
      autoOrganizeIntervalHours: 24,
      whitelistDomains: "mail.google.com\ngithub.com\nyoutube.com",
      protectedRootFolders: "工作\n个人",
      domainFolderRules: "github.com => AI/技术\nmail.google.com => 常用与首页",
      customPrompt:
        "尽量减少文件夹数量；“常用与首页”直接放在根目录最前面；其他内容限制为不超过两级目录；不确定的内容放入“待手动分类”。"
    },
    smartBookmarkJobStatus: {
      phase: "preview",
      total: 216,
      processed: 216,
      moved: 182,
      deleted: 24,
      warningCount: 10,
      currentBatch: 5,
      totalBatches: 5,
      batchSize: 24,
      updatedAt: "2026-04-19T08:40:00.000Z",
      provider: "deepseek",
      model: "deepseek-chat",
      message: "已生成整理预览。",
      detail: "将先清理确认失效或重复的书签，再按新的根目录结构一次性重建。",
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
            { id: "11", title: "GitHub", url: "https://github.com/" },
            { id: "12", title: "YouTube", url: "https://www.youtube.com/" },
            { id: "13", title: "Figma", url: "https://www.figma.com/" },
            { id: "14", title: "Notion", url: "https://www.notion.so/" },
            { id: "15", title: "Gmail", url: "https://mail.google.com/" },
            {
              id: "20",
              title: "学习",
              children: [
                { id: "21", title: "MDN", url: "https://developer.mozilla.org/" },
                { id: "22", title: "Coursera", url: "https://www.coursera.org/" },
                { id: "23", title: "bilibili 教程", url: "https://www.bilibili.com/" }
              ]
            },
            {
              id: "30",
              title: "工具",
              children: [
                { id: "31", title: "Linear", url: "https://linear.app/" },
                { id: "32", title: "Slack", url: "https://slack.com/" },
                { id: "33", title: "Raycast", url: "https://www.raycast.com/" }
              ]
            },
            {
              id: "40",
              title: "生活",
              children: [
                { id: "41", title: "美团", url: "https://www.meituan.com/" },
                { id: "42", title: "12306", url: "https://www.12306.cn/" },
                { id: "43", title: "豆瓣", url: "https://www.douban.com/" }
              ]
            }
          ]
        },
        {
          id: "2",
          title: "其他书签",
          children: [
            { id: "50", title: "Chrome Web Store", url: "https://chromewebstore.google.com/" }
          ]
        }
      ]
    }
  ]
};

const chromeCandidates = [
  process.env.CHROME_EXECUTABLE,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
].filter(Boolean);

async function resolveExecutablePath() {
  for (const candidate of chromeCandidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue to the next candidate.
    }
  }

  throw new Error(
    `Unable to find a Chrome executable. Checked: ${chromeCandidates.join(", ")}`
  );
}

async function fileToDataUrl(filePath) {
  const buffer = await fs.readFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function shellHtml({ width, height, body }) {
  return `
    <!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            width: ${width}px;
            height: ${height}px;
            overflow: hidden;
            background: ${palette.bg};
            color: ${palette.text};
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Segoe UI", sans-serif;
          }
          body {
            background:
              radial-gradient(circle at 10% 14%, rgba(29,95,73,0.09), transparent 24%),
              radial-gradient(circle at 88% 12%, rgba(29,95,73,0.05), transparent 18%),
              radial-gradient(circle at 74% 88%, rgba(29,95,73,0.06), transparent 22%),
              ${palette.bg};
          }
          .frame {
            position: relative;
            width: 100%;
            height: 100%;
            overflow: hidden;
          }
          .surface {
            position: absolute;
            overflow: hidden;
            border-radius: 24px;
            border: 1px solid ${palette.line};
            background: ${palette.paper};
            box-shadow: ${palette.shadow};
          }
          .surface img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: top center;
            background: ${palette.paper};
          }
          .surface--contain img {
            object-fit: contain;
          }
          .badge-row {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
          }
          .badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-height: 34px;
            padding: 0 14px;
            border-radius: 999px;
            border: 1px solid ${palette.line};
            background: rgba(255,255,255,0.9);
            color: ${palette.text};
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 0.01em;
            white-space: nowrap;
          }
          .badge--accent {
            border-color: rgba(29,95,73,0.18);
            background: ${palette.accent};
            color: #ffffff;
          }
          .badge--soft {
            border-color: rgba(29,95,73,0.14);
            background: ${palette.accentSoft};
            color: ${palette.accent};
          }
          .brand {
            position: absolute;
            z-index: 3;
            display: grid;
            gap: 18px;
          }
          .brand__eyebrow {
            color: ${palette.accent};
            font-size: 14px;
            font-weight: 800;
            letter-spacing: 0.08em;
          }
          .brand__title {
            margin: 0;
            max-width: 100%;
            color: ${palette.text};
            font-weight: 900;
            line-height: 0.96;
            letter-spacing: -0.045em;
          }
          .brand__sub {
            margin: 0;
            max-width: 100%;
            color: ${palette.muted};
            font-size: 16px;
            line-height: 1.45;
          }
          .caption {
            position: absolute;
            z-index: 3;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            min-height: 38px;
            padding: 0 14px;
            border-radius: 999px;
            border: 1px solid ${palette.line};
            background: rgba(255,255,255,0.9);
            color: ${palette.muted};
            font-size: 13px;
            font-weight: 700;
            white-space: nowrap;
          }
          .dot {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            background: currentColor;
          }
          .line {
            position: absolute;
            height: 2px;
            border-radius: 999px;
            background: rgba(29,95,73,0.14);
            z-index: 1;
          }
        </style>
      </head>
      <body>
        <div class="frame">${body}</div>
      </body>
    </html>
  `;
}

function screenshotVariant({ popupSrc, optionsConnectionSrc }) {
  return shellHtml({
    width: 1280,
    height: 800,
    body: `
      <div class="brand" style="left: 48px; top: 54px; width: 310px;">
        <div class="badge-row">
          <div class="badge badge--accent">SMART BOOKMARK AI</div>
        </div>
        <h1 class="brand__title" style="font-size: 48px;">先预览，<br />再整理</h1>
        <p class="brand__sub">先清理失效与重复，再一次性重建根目录。</p>
        <div class="badge-row">
          <div class="badge badge--soft">根目录优先</div>
          <div class="badge">最多两级目录</div>
          <div class="badge">本地备份恢复</div>
        </div>
      </div>

      <div class="surface surface--contain" style="right: 44px; top: 42px; width: 858px; height: 714px;">
        <img src="${optionsConnectionSrc}" alt="Settings center" />
      </div>

      <div class="surface surface--contain" style="left: 58px; top: 246px; width: 332px; height: 486px; z-index: 4;">
        <img src="${popupSrc}" alt="Popup panel" />
      </div>

      <div class="line" style="left: 352px; top: 388px; width: 112px;"></div>
      <div class="line" style="left: 352px; top: 420px; width: 88px;"></div>

      <div class="caption" style="left: 48px; bottom: 42px;">
        <span class="dot" style="color: ${palette.accent};"></span>
        整理、备份、恢复、白名单，都在一个极简流程里
      </div>
    `
  });
}

function smallPromoVariant({ popupSrc }) {
  return shellHtml({
    width: 440,
    height: 280,
    body: `
      <div class="brand" style="left: 22px; top: 24px; width: 186px; gap: 14px;">
        <div class="brand__eyebrow">SMART BOOKMARK AI</div>
        <h1 class="brand__title" style="font-size: 30px;">更少<br />文件夹</h1>
        <div class="badge-row">
          <div class="badge badge--soft" style="font-size: 12px;">预览后执行</div>
          <div class="badge" style="font-size: 12px;">自动备份</div>
        </div>
      </div>

      <div class="surface surface--contain" style="right: 20px; top: 28px; width: 182px; height: 232px;">
        <img src="${popupSrc}" alt="Popup panel" />
      </div>

      <div class="caption" style="left: 22px; bottom: 24px; font-size: 12px;">
        根目录更清爽
      </div>
    `
  });
}

function marqueeVariant({ popupSrc, optionsBackupSrc }) {
  return shellHtml({
    width: 1400,
    height: 560,
    body: `
      <div class="brand" style="left: 52px; top: 58px; width: 388px;">
        <div class="brand__eyebrow">SMART BOOKMARK AI</div>
        <h1 class="brand__title" style="font-size: 56px;">书签整理，<br />不该更乱</h1>
        <p class="brand__sub">先预览，再重建。备份和恢复都留在设置里。</p>
        <div class="badge-row">
          <div class="badge badge--soft">失效链接清理</div>
          <div class="badge">重复删除</div>
          <div class="badge">手动备份</div>
        </div>
      </div>

      <div class="surface surface--contain" style="right: 44px; top: 42px; width: 820px; height: 478px;">
        <img src="${optionsBackupSrc}" alt="Backup management" />
      </div>

      <div class="surface surface--contain" style="left: 452px; top: 126px; width: 252px; height: 372px; z-index: 4;">
        <img src="${popupSrc}" alt="Popup panel" />
      </div>

      <div class="line" style="left: 676px; top: 238px; width: 92px;"></div>
      <div class="line" style="left: 676px; top: 268px; width: 68px;"></div>
    `
  });
}

function createChromeMockInitScript(data) {
  return (payload) => {
    const deepClone = (value) => JSON.parse(JSON.stringify(value));
    const storageState = deepClone(payload.storage || {});
    const treeState = deepClone(payload.bookmarkTree || []);

    const normalizeKeys = (keys) => {
      if (typeof keys === "string") {
        return [keys];
      }
      if (Array.isArray(keys)) {
        return keys;
      }
      if (keys && typeof keys === "object") {
        return Object.keys(keys);
      }
      return [];
    };

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

      if (typeof keys === "object") {
        return Object.entries(keys).reduce((result, [key, fallback]) => {
          result[key] = key in storageState ? deepClone(storageState[key]) : fallback;
          return result;
        }, {});
      }

      return {};
    };

    const createEvent = () => {
      const listeners = [];
      return {
        addListener(listener) {
          if (typeof listener === "function" && !listeners.includes(listener)) {
            listeners.push(listener);
          }
        },
        removeListener(listener) {
          const index = listeners.indexOf(listener);
          if (index >= 0) {
            listeners.splice(index, 1);
          }
        },
        hasListener(listener) {
          return listeners.includes(listener);
        },
        async dispatch(...args) {
          for (const listener of [...listeners]) {
            await listener(...args);
          }
        }
      };
    };

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

    const runtimeMessageEvent = createEvent();
    const permissionsAddedEvent = createEvent();
    const permissionsRemovedEvent = createEvent();

    globalThis.chrome = {
      i18n: {
        getUILanguage() {
          return payload.language || "en";
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
        async contains() {
          return true;
        },
        async request() {
          return true;
        },
        onAdded: permissionsAddedEvent,
        onRemoved: permissionsRemovedEvent
      },
      bookmarks: {
        async getTree() {
          return deepClone(treeState);
        },
        async getChildren(id) {
          const node = findBookmarkNode(id);
          return deepClone(node?.children || []);
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
            case "TEST_API_CONNECTION":
              return {
                ok: true,
                message: payload.apiTestMessage || "API OK",
                detail: payload.apiTestDetail || "Model responded successfully"
              };
            case "START_ORGANIZE":
            case "START_PREVIEW":
            case "CREATE_MANUAL_BACKUP":
            case "RESTORE_BACKUP_ENTRY":
            case "DELETE_BACKUP_ENTRY":
            case "CANCEL_JOB":
              return { ok: true };
            default:
              return { ok: true };
          }
        },
        onMessage: runtimeMessageEvent,
        openOptionsPage() {},
        getURL(relativePath) {
          return relativePath;
        },
        async getPlatformInfo() {
          return { os: "mac", arch: "arm64", nacl_arch: "arm" };
        }
      }
    };

    globalThis.alert = () => {};
    globalThis.confirm = () => true;
    globalThis.open = () => null;
  };
}

async function capturePageScreenshot(browser, {
  filePath,
  outputPath,
  viewport,
  hash = "",
  prepare
}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2
  });
  const page = await context.newPage();
  await page.addInitScript(createChromeMockInitScript(sampleData), sampleData);

  const url = `${pathToFileURL(filePath).href}${hash}`;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(500);

  if (prepare) {
    await prepare(page);
  }

  await page.addStyleTag({
    content: `
      html, body {
        background: #ffffff !important;
      }
      ::-webkit-scrollbar {
        width: 0;
        height: 0;
      }
    `
  });

  await page.locator("body").screenshot({
    path: outputPath,
    type: "png"
  });

  await context.close();
}

async function renderSourceScreenshots(browser) {
  await fs.mkdir(screenshotDir, { recursive: true });

  const popupPath = path.join(screenshotDir, "popup-store.png");
  const optionsConnectionPath = path.join(screenshotDir, "options-connection-store.png");
  const optionsBackupPath = path.join(screenshotDir, "options-backup-store.png");

  await capturePageScreenshot(browser, {
    filePath: path.join(rootDir, "popup.html"),
    outputPath: popupPath,
    viewport: { width: 400, height: 720 },
    prepare: async (page) => {
      await page.waitForSelector(".result-table tbody tr");
    }
  });

  await capturePageScreenshot(browser, {
    filePath: path.join(rootDir, "options.html"),
    outputPath: optionsConnectionPath,
    viewport: { width: 1280, height: 860 },
    hash: "#connection",
    prepare: async (page) => {
      await page.waitForSelector("#provider");
      await page.evaluate((message) => {
        const status = document.getElementById("apiTestStatus");
        if (status) {
          status.hidden = false;
          status.textContent = message;
        }
      }, `${sampleData.apiTestMessage}，${sampleData.apiTestDetail}`);
    }
  });

  await capturePageScreenshot(browser, {
    filePath: path.join(rootDir, "options.html"),
    outputPath: optionsBackupPath,
    viewport: { width: 1280, height: 860 },
    hash: "#backup",
    prepare: async (page) => {
      await page.waitForSelector(".backup-row");
    }
  });

  return {
    popupPath,
    optionsConnectionPath,
    optionsBackupPath
  };
}

async function renderVariant(page, { width, height, html, output }) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.screenshot({
    path: output,
    type: "png",
    omitBackground: false
  });
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });

  const executablePath = await resolveExecutablePath();
  const browser = await chromium.launch({
    executablePath,
    channel: undefined,
    headless: true
  });

  const { popupPath, optionsConnectionPath, optionsBackupPath } = await renderSourceScreenshots(browser);

  const popupSrc = await fileToDataUrl(popupPath);
  const optionsConnectionSrc = await fileToDataUrl(optionsConnectionPath);
  const optionsBackupSrc = await fileToDataUrl(optionsBackupPath);

  const page = await browser.newPage();
  const variants = [
    {
      width: 1280,
      height: 800,
      html: screenshotVariant({ popupSrc, optionsConnectionSrc }),
      output: path.join(outputDir, "chrome-web-store-screenshot-1280x800.png")
    },
    {
      width: 440,
      height: 280,
      html: smallPromoVariant({ popupSrc }),
      output: path.join(outputDir, "chrome-web-store-small-promo-440x280.png")
    },
    {
      width: 1400,
      height: 560,
      html: marqueeVariant({ popupSrc, optionsBackupSrc }),
      output: path.join(outputDir, "chrome-web-store-marquee-1400x560.png")
    }
  ];

  for (const item of variants) {
    await renderVariant(page, item);
    console.log(`Rendered ${path.basename(item.output)}`);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
