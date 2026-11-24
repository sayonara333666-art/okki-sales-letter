// Customer Letter Assistant - 自动分析 watcher
// 监听 数据目录/客户页面.jsonl → 静默 → 分批调用无窗口 Claude 填营销信 → 合并 → 生成一个 HTML
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const { loadConfig, APP_DIR } = require("./config");

const cfg = loadConfig();
const A = cfg.autoAnalyze;
const QUIET_MS = Math.max(1, Number(process.env.CMC_QUIET_SECONDS) || Number(A.quietSeconds) || 5) * 1000;
const DISABLED = process.env.CMC_AUTO_DISABLE === "1" || !A.enabled;
const MAX_BATCHES = Number(process.env.CMC_MAX_BATCHES ?? A.maxBatchesPerRun) || 0;
const MAX_COMPANIES = Number(process.env.CMC_MAX_COMPANIES ?? A.maxCompaniesPerRun) || 0;
const TIMEOUT_MS = Math.max(1, Number(A.timeoutMinutes) || 20) * 60 * 1000;
const ALLOWED_TOOLS = "Read Edit Write WebSearch WebFetch";
const OPEN_REPORT = process.env.CMC_OPEN_REPORT === "0" ? false : !!A.openReport;
const CLAUDE_CMD = process.env.CMC_CLAUDE_COMMAND || cfg.claude.command || "claude";

let analyzing = false;
let stopped = false;
let timer = null;
let lastDataAt = 0;
let lastSig = "";
let currentChild = null;

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] [营销信] ${msg}`);
}

function fileSig() {
  try {
    const st = fs.statSync(cfg.customersPath);
    return `${st.mtimeMs}:${st.size}`;
  } catch (e) {
    return "missing";
  }
}

function psQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function killTree(pid) {
  if (!pid) return;
  try {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } catch (e) {}
}

function runNode(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(APP_DIR, script), ...args], {
    cwd: APP_DIR,
    encoding: "utf8",
    timeout: 120000,
    windowsHide: true,
  });
  const stdout = (r.stdout || "").trim();
  const stderr = (r.stderr || "").trim();
  if (r.status !== 0) {
    log(`node ${script} 失败（退出码 ${r.status}）`);
    if (stderr) console.log(stderr.slice(0, 1200));
  }
  return { status: r.status, stdout, stderr };
}

function readWork() {
  try {
    return JSON.parse(fs.readFileSync(cfg.workPath, "utf8"));
  } catch (e) {
    return null;
  }
}

function runClaudeHeadless({ prompt, allowedTools = "", addDir = "", timeoutMs = TIMEOUT_MS, logName = "cmc-claude.log" }) {
  const logFile = path.join(os.tmpdir(), logName);
  const cmd = CLAUDE_CMD;
  const parts = ["-p", psQuote(prompt)];
  if (cfg.claude.permissionMode) parts.push("--permission-mode", psQuote(cfg.claude.permissionMode));
  if (allowedTools) parts.push("--allowedTools", psQuote(allowedTools));
  if (addDir) parts.push("--add-dir", psQuote(addDir));
  if (cfg.claude.model) parts.push("--model", psQuote(cfg.claude.model));
  if (Array.isArray(cfg.claude.extraArgs)) {
    for (const a of cfg.claude.extraArgs) parts.push(psQuote(a));
  }

  try {
    fs.unlinkSync(logFile);
  } catch (e) {}

  const psScript = [
    "$ProgressPreference = 'SilentlyContinue'",
    "$ErrorActionPreference = 'Continue'",
    `Set-Location ${psQuote(APP_DIR)}`,
    `$out = & ${psQuote(cmd)} ${parts.join(" ")} 2>&1 | Out-String`,
    "$code = $LASTEXITCODE",
    "if ($null -eq $code) { $code = 1 }",
    `$out | Out-File -FilePath ${psQuote(logFile)} -Encoding utf8`,
    "exit $code",
  ].join("\r\n");
  const encoded = Buffer.from(psScript, "utf16le").toString("base64");

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn("powershell.exe", ["-NoProfile", "-EncodedCommand", encoded], {
        cwd: APP_DIR,
        windowsHide: true,
        env: process.env,
      });
    } catch (e) {
      resolve({ status: 1, output: "", stderr: String(e), error: e });
      return;
    }

    currentChild = child;
    let stderr = "";
    let timedOut = false;
    if (child.stderr) child.stderr.on("data", (d) => (stderr += d.toString()));
    if (child.stdout) child.stdout.resume();

    const t = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);

    child.on("error", (e) => {
      clearTimeout(t);
      currentChild = null;
      resolve({ status: 1, output: "", stderr: String(e), error: e });
    });
    child.on("close", (code) => {
      clearTimeout(t);
      currentChild = null;
      let output = "";
      try {
        output = fs.readFileSync(logFile, "utf8").replace(/^﻿/, "");
      } catch (e) {}
      resolve({
        status: code == null ? 1 : code,
        output,
        stderr: stderr.trim(),
        error: timedOut ? new Error("超时") : null,
      });
    });
  });
}

function callClaude() {
  // 插件/数据目录可能带空格，Claude 的 -p 路径会被截断。
  // 先复制到无空格、无中文的临时文件，Claude 只改临时文件，改完再复制回来。
  const tmpWork = path.join(os.tmpdir(), `cla-work-${Date.now()}-${process.pid}.json`);
  let original;
  try {
    original = fs.readFileSync(cfg.workPath);
    fs.copyFileSync(cfg.workPath, tmpWork);
  } catch (e) {
    return Promise.resolve({ status: 1, output: "", stderr: "无法创建工作副本：" + e.message, error: e });
  }

  const prompt =
    `Read marketing-prompt.md and ${JSON.stringify(tmpWork)}. ` +
    `Fill ONLY the subject, body, english_subject, english_body, chinese and sources fields ` +
    `for every company in ${JSON.stringify(tmpWork)}, following marketing-prompt.md. ` +
    `Sender company profile (authoritative): ${JSON.stringify(cfg.profile)}. ` +
    `Do not change name/country/contact/tags/language/languageName/mode/key/companyId. ` +
    `Do not run any commands. Do not create or edit HTML/JS. When done, reply FILLED <number>.`;

  return runClaudeHeadless({
    prompt,
    allowedTools: ALLOWED_TOOLS,
    addDir: path.dirname(tmpWork),
    timeoutMs: TIMEOUT_MS,
  }).then((r) => {
    try {
      const now = fs.readFileSync(tmpWork);
      if (r.status === 0 && !now.equals(original)) fs.copyFileSync(tmpWork, cfg.workPath);
    } catch (e) {}
    try {
      fs.unlinkSync(tmpWork);
    } catch (e) {}
    return r;
  });
}

function openReport(reportPath) {
  if (!reportPath || !fs.existsSync(reportPath)) return;
  try {
    const child = spawn("cmd.exe", ["/c", "start", "", reportPath], {
      windowsHide: true,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    log("已自动打开报告");
  } catch (e) {
    log("自动打开失败，请手动打开：" + reportPath);
  }
}

function runReport() {
  const r = runNode("report.js");
  if (r.stdout) {
    const lines = r.stdout.split(/\r?\n/).filter(Boolean);
    lines.forEach((l) => console.log(l));
    const m = r.stdout.match(/报告已生成:\s*(.+)/);
    if (m && OPEN_REPORT) openReport(m[1].trim());
  }
}

async function analyzeLoop(reason) {
  if (analyzing || stopped) return;
  analyzing = true;
  const sigAtStart = fileSig();
  const runStart = Date.now();
  let batches = 0;
  let total = 0;
  let totalSkipped = 0;
  let failed = false;

  log(`开始（${reason}）`);
  try {
    while (!stopped) {
      if (MAX_BATCHES && batches >= MAX_BATCHES) {
        log(`达到最大批次 ${MAX_BATCHES}，本轮停止`);
        break;
      }

      const w = runNode("tools/worklist.js");
      if (w.status !== 0) {
        failed = true;
        log("worklist 失败，本轮停止");
        break;
      }
      const work = readWork();
      if (!work || !Array.isArray(work.companies)) {
        failed = true;
        log("读取 营销信填写.json 失败，本轮停止");
        break;
      }

      const pendingBefore = Number(work.pending) || 0;
      if (!work.companies.length) {
        log(pendingBefore ? "本轮没有可分析的公司" : "当前页面已全部生成，直接出报告");
        break;
      }

      batches++;
      log(`第 ${batches} 批：${work.companies.length} 家（本页待生成 ${pendingBefore}）`);
      const batchStart = Date.now();
      const beforeMtime = fs.statSync(cfg.workPath).mtimeMs;

      const r = await callClaude();
      const noise =
        /no stdin data received|explicitly:|<\/dev\/null|wait longer|CategoryInfo|FullyQualifiedErrorId|RemoteException|^\+|^所在位置|^claude\.exe :/i;
      const lines = (r.output || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !noise.test(l));
      const tail = lines.slice(-6).join("\n");
      if (tail) console.log(tail);

      if (r.status !== 0) {
        failed = true;
        if (r.stderr) console.log(r.stderr.slice(0, 1200));
        log(`Claude 批次失败（${r.error ? r.error.message : "退出码 " + r.status}），本轮停止`);
        break;
      }

      let afterMtime = 0;
      try {
        afterMtime = fs.statSync(cfg.workPath).mtimeMs;
      } catch (e) {}
      if (afterMtime <= beforeMtime) {
        failed = true;
        log("Claude 没有修改模板，本轮停止");
        break;
      }

      const s = runNode("tools/save.js");
      const savedMatch = (s.stdout || "").match(/已合并\s*(\d+)\s*封/);
      const saved = savedMatch ? Number(savedMatch[1]) : 0;
      const skippedMatch = (s.stdout || "").match(/已标记跳过\s*(\d+)\s*家/);
      const skippedSaved = skippedMatch ? Number(skippedMatch[1]) : 0;
      if (!saved && !skippedSaved) {
        failed = true;
        log("本批没有有效营销信/跳过记录，本轮停止");
        break;
      }
      total += saved;
      totalSkipped += skippedSaved;

      if (MAX_COMPANIES && total >= MAX_COMPANIES) {
        log(`达到单次公司上限 ${MAX_COMPANIES}，本轮停止`);
        break;
      }

      const w2 = runNode("tools/worklist.js");
      if (w2.status !== 0) {
        failed = true;
        log("复查 worklist 失败，本轮停止");
        break;
      }
      const work2 = readWork();
      const pendingAfter = work2 ? Number(work2.pending) || 0 : 0;
      log(
        `第 ${batches} 批完成：生成 ${saved} 封，跳过 ${skippedSaved} 家，剩余 ${pendingAfter} 家，本批用时 ${Math.round(
          (Date.now() - batchStart) / 1000
        )} 秒`
      );

      if (pendingAfter === 0) {
        log("本页全部完成");
        break;
      }
      if (pendingAfter >= pendingBefore) {
        failed = true;
        log("待生成数量没有下降，停止以免死循环");
        break;
      }
    }
  } catch (e) {
    failed = true;
    log("异常：" + (e && e.message ? e.message : e));
  } finally {
    analyzing = false;
    lastDataAt = 0;
    const sigNow = fileSig();
    lastSig = sigNow;
    if (sigNow !== sigAtStart) {
      lastDataAt = Date.now();
      log("分析期间检测到新抓取，稍后会再检查");
    }
    runReport();
    log(
      (failed ? "本轮结束（有失败）" : "本轮结束") +
        `，生成 ${total} 封，跳过 ${totalSkipped} 家，总用时 ${Math.round((Date.now() - runStart) / 1000)} 秒`
    );
  }
}

function tick() {
  if (stopped || DISABLED) return;
  const sig = fileSig();
  if (sig !== lastSig) {
    lastSig = sig;
    lastDataAt = Date.now();
    log("检测到新的客户页面数据");
  }
  if (!analyzing && lastDataAt && Date.now() - lastDataAt >= QUIET_MS) {
    lastDataAt = 0;
    analyzeLoop("静默结束").catch((e) => log("启动分析失败：" + (e && e.message ? e.message : e)));
  }
}

function startWatcher() {
  if (DISABLED) {
    log("自动分析已关闭（config.autoAnalyze.enabled=false 或 CMC_AUTO_DISABLE=1）");
    return { stop() {} };
  }
  if (!fs.existsSync(cfg.promptPath)) {
    log("找不到 marketing-prompt.md：" + cfg.promptPath + "，自动分析不启动");
    return { stop() {} };
  }

  lastSig = fileSig();
  try {
    fs.mkdirSync(cfg.dataDir, { recursive: true });
  } catch (e) {}

  timer = setInterval(tick, 2000);
  tick();

  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (currentChild) killTree(currentChild.pid);
    },
  };
}

module.exports = { startWatcher };

if (require.main === module) {
  startWatcher();
}
