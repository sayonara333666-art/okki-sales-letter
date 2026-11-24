// Customer Letter Assistant - 配置加载器
// 所有路径都在本插件自己的文件夹内，不读写其他程序的数据
const fs = require("fs");
const path = require("path");
const os = require("os");

const APP_DIR = __dirname;
const CONFIG_FILE = path.join(APP_DIR, "config.json");
// 可选的本机覆盖文件（已在 .gitignore 中排除，用于放真实公司资料）
const LOCAL_CONFIG_FILE = path.join(APP_DIR, "config.local.json");
const DEFAULT_DATA_DIR_NAME = "Customer Letter Assistant Data";

const DEFAULTS = {
  dataDir: "",
  migrateLegacyData: true,
  customersFile: "客户页面.jsonl",
  workFile: "营销信填写.json",
  cacheFile: "营销信缓存.json",
  reportPrefix: "客户营销信_",
  analysisBatchSize: 8,
  skipTags: ["第一次发送营销信"],
  skipIfEdmSent: true,
  autoAnalyze: {
    enabled: true,
    quietSeconds: 5,
    analyzeOnStart: false,
    maxBatchesPerRun: 0,
    maxCompaniesPerRun: 0,
    timeoutMinutes: 20,
    openReport: true,
  },
  claude: {
    command: "claude",
    model: "",
    permissionMode: "acceptEdits",
    extraArgs: [],
  },
  catalogImage: "产品目录.png",
  // 公司资料：营销信和名片都从这里读取，换成你自己的信息即可
  profile: {
    companyName: "Your Company Name",
    companyNameLocal: "你的公司全称",
    brand: "Your Brand",
    location: "Your City, Your Country",
    shippingPort: "Your Port",
    products: "your main products",
    certifications: "",
    contactName: "[Your Name]",
    contactTitle: "Sales Manager",
    phone: "+00 000 000 0000",
    email: "sales@example.com",
    website: "",
    intro: "",
  },
};

function expandPath(p) {
  let s = String(p || "").trim();
  if (!s) return "";
  if (s === "~") s = os.homedir();
  else if (s.startsWith("~/") || s.startsWith("~\\")) s = path.join(os.homedir(), s.slice(2));
  s = s.replace(/%([^%]+)%/g, (m, k) => (process.env[k] != null ? process.env[k] : m));
  s = s.replace(/\$\{([^}]+)\}/g, (m, k) => (process.env[k] != null ? process.env[k] : m));
  return s;
}

function findDesktop() {
  const home = os.homedir();
  const candidates = [
    path.join(home, "Desktop"),
    path.join(home, "OneDrive", "Desktop"),
    path.join(home, "OneDrive", "桌面"),
    path.join(home, "桌面"),
  ];
  for (const p of candidates) {
    try {
      if (fs.statSync(p).isDirectory()) return p;
    } catch (e) {}
  }
  return home;
}

// 把旧版插件内部的 客户数据 复制到“当前用户桌面”新目录。
// .machine 标记防止把插件复制到另一台电脑后，把别人的客户数据一起迁过去。
function migrateLegacyData(dataDir) {
  const legacy = path.join(APP_DIR, "客户数据");
  if (path.resolve(legacy) === path.resolve(dataDir)) return;
  if (!fs.existsSync(legacy)) return;
  try {
    const marker = path.join(legacy, ".machine");
    const host = os.hostname();
    let legacyHost = "";
    try {
      legacyHost = fs.readFileSync(marker, "utf8").trim();
    } catch (e) {}
    if (legacyHost && legacyHost !== host) return;
    if (!legacyHost) {
      try { fs.writeFileSync(marker, host, "utf8"); } catch (e) {}
    }
    const doneMarker = path.join(legacy, ".migrated_to_desktop");
    const migrated = fs.existsSync(doneMarker);
    const files = fs.readdirSync(legacy).filter((f) => f !== ".machine" && f !== ".migrated_to_desktop");
    if (!files.length) return;
    fs.mkdirSync(dataDir, { recursive: true });
    for (const f of files) {
      const src = path.join(legacy, f);
      const dst = path.join(dataDir, f);
      try {
        if (migrated) {
          // 已迁移过：只补“旧目录里更新”的文件（例如迁移后、重启前又抓了一页）
          if (!fs.existsSync(dst)) continue;
          if (fs.statSync(src).mtimeMs > fs.statSync(dst).mtimeMs) fs.copyFileSync(src, dst);
        } else {
          if (!fs.existsSync(dst) || fs.statSync(src).mtimeMs > fs.statSync(dst).mtimeMs) {
            fs.copyFileSync(src, dst);
          }
        }
      } catch (e) {}
    }
    if (!migrated) {
      try { fs.writeFileSync(doneMarker, new Date().toISOString(), "utf8"); } catch (e) {}
    }
  } catch (e) {}
}

function readJsonFile(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
}

function loadConfig() {
  let raw = {};
  let local = {};
  let error = "";
  try {
    raw = readJsonFile(CONFIG_FILE);
  } catch (e) {
    error = "config.json 解析失败：" + e.message;
  }
  try {
    local = readJsonFile(LOCAL_CONFIG_FILE);
  } catch (e) {
    error = (error ? error + "；" : "") + "config.local.json 解析失败：" + e.message;
  }

  const cfg = {
    ...DEFAULTS,
    ...raw,
    ...local,
    claude: { ...DEFAULTS.claude, ...(raw.claude || {}), ...(local.claude || {}) },
    autoAnalyze: { ...DEFAULTS.autoAnalyze, ...(raw.autoAnalyze || {}), ...(local.autoAnalyze || {}) },
    profile: { ...DEFAULTS.profile, ...(raw.profile || {}), ...(local.profile || {}) },
  };

  let dataDir = expandPath(process.env.CMC_DATA_DIR || cfg.dataDir);
  let usingDesktopDefault = false;
  if (!dataDir) {
    dataDir = path.join(findDesktop(), DEFAULT_DATA_DIR_NAME);
    usingDesktopDefault = true;
  } else if (!path.isAbsolute(dataDir)) {
    dataDir = path.resolve(APP_DIR, dataDir);
  }
  if (usingDesktopDefault && cfg.migrateLegacyData !== false) migrateLegacyData(dataDir);

  const inData = (p) => {
    const s = expandPath(p) || "";
    return path.isAbsolute(s) ? s : path.join(dataDir, s);
  };

  const promptPath = (() => {
    const s = expandPath(cfg.promptFile || "marketing-prompt.md");
    return path.isAbsolute(s) ? s : path.join(APP_DIR, s);
  })();

  return {
    ...cfg,
    appDir: APP_DIR,
    configFile: CONFIG_FILE,
    configError: error,
    dataDir,
    customersPath: inData(cfg.customersFile),
    workPath: inData(cfg.workFile),
    cachePath: inData(cfg.cacheFile),
    reportPrefix: cfg.reportPrefix || DEFAULTS.reportPrefix,
    analysisBatchSize: Math.max(1, Number(cfg.analysisBatchSize) || DEFAULTS.analysisBatchSize),
    promptPath,
  };
}

module.exports = { loadConfig, expandPath, APP_DIR, CONFIG_FILE };
