// 把「营销信填写.json」合并进「营销信缓存.json」
// 只校验/合并，不生成网页
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("../config");
const { normalizeEmail } = require("../format");

const cfg = loadConfig();
try { fs.mkdirSync(cfg.dataDir, { recursive: true }); } catch (e) {}
const input = process.argv[2] ? path.resolve(process.argv[2]) : cfg.workPath;

function fail(msg) {
  console.error("[合并失败] " + msg);
  process.exit(1);
}
function normName(s) {
  return String(s || "").toUpperCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}
function keyOf(c) {
  return String(c.companyId || "").trim() || normName(c.name);
}

if (!fs.existsSync(input)) fail("找不到填写文件：" + input);

let work;
try {
  work = JSON.parse(fs.readFileSync(input, "utf8"));
} catch (e) {
  fail("填写文件不是合法 JSON：" + e.message);
}
if (!work || !Array.isArray(work.companies)) fail("填写文件缺少 companies 数组");

let cache = { version: 1, updatedAt: "", companies: {} };
if (fs.existsSync(cfg.cachePath)) {
  try {
    const j = JSON.parse(fs.readFileSync(cfg.cachePath, "utf8").replace(/^﻿/, ""));
    cache = {
      version: 1,
      updatedAt: j.updatedAt || "",
      companies: j.companies && typeof j.companies === "object" ? j.companies : {},
    };
  } catch (e) {
    fail("营销信缓存不是合法 JSON，请先修复：" + cfg.cachePath + "\n  " + e.message);
  }
}

const now = new Date();
let saved = 0;
let skippedSaved = 0;
let skipped = 0;
const errors = [];
const savedNames = [];
const skippedNames = [];

for (const [i, c] of work.companies.entries()) {
  const name = String((c && c.name) || "").trim();
  if (!name) {
    skipped++;
    errors.push(`第 ${i + 1} 条缺少 name`);
    continue;
  }

  const subject = String(c.subject || "").replace(/\s+/g, " ").trim().slice(0, 160);
  const rawBody = String(c.body || c.english || "").trim();
  const body = rawBody ? normalizeEmail(rawBody).slice(0, 6000) : "";
  const chinese = String(c.chinese || "").trim().slice(0, 6000);
  const language = String(c.language || "en").trim() || "en";
  const languageName = String(c.languageName || "").trim() || language;
  const mode = String(c.mode || (language === "en" ? "english" : "mixed")).trim();
  const englishSubject = String(c.english_subject || (language === "en" ? subject : "")).replace(/\s+/g, " ").trim().slice(0, 160);
  const rawEnglishBody = String(c.english_body || (language === "en" ? rawBody : "")).trim();
  const englishBody = rawEnglishBody ? normalizeEmail(rawEnglishBody).slice(0, 6000) : "";
  const sources = Array.isArray(c.sources)
    ? c.sources.filter((u) => /^https?:\/\//i.test(String(u))).slice(0, 6)
    : [];

  if (!subject && !body && !chinese) {
    skipped++;
    continue;
  }
  if (subject.toUpperCase() === "SKIP") {
    const key = keyOf(c);
    const reason = chinese || englishBody || body || "美国/美属或不适配，跳过";
    cache.companies[key] = {
      name,
      companyId: String(c.companyId || "").trim(),
      country: String(c.country || "").trim(),
      contact: String(c.contact || "").trim(),
      tags: String(c.tags || "").trim(),
      language,
      languageName,
      skipped: true,
      reason: reason.slice(0, 500),
      sources,
      batchId: String(work.batchId || ""),
      batchTitle: String(work.batchTitle || ""),
      updatedAt: now.toISOString(),
    };
    skippedSaved++;
    skippedNames.push(name);
    continue;
  }
  if (!subject || !rawBody || !chinese) {
    skipped++;
    errors.push(`${name}：subject / body / chinese 必须同时填写`);
    continue;
  }
  if (language !== "en" && (!englishSubject || !rawEnglishBody)) {
    skipped++;
    errors.push(`${name}：非英语客户必须提供 english_subject / english_body 留底`);
    continue;
  }

  const key = keyOf(c);
  cache.companies[key] = {
    name,
    companyId: String(c.companyId || "").trim(),
    country: String(c.country || "").trim(),
    contact: String(c.contact || "").trim(),
    tags: String(c.tags || "").trim(),
    language,
    languageName,
    mode,
    subject,
    body,
    english_subject: englishSubject || subject,
    english_body: englishBody || body,
    chinese,
    sources,
    batchId: String(work.batchId || ""),
    batchTitle: String(work.batchTitle || ""),
    updatedAt: now.toISOString(),
  };
  saved++;
  savedNames.push(name);
}

if (!saved && !skippedSaved) {
  console.log("没有已填写完整的营销信，缓存未改动。");
  if (errors.length) console.log("问题：\n- " + errors.join("\n- "));
  process.exit(0);
}

cache.version = 1;
cache.updatedAt = now.toISOString();
const tmp = cfg.cachePath + ".tmp";
fs.writeFileSync(tmp, JSON.stringify(cache, null, 2), "utf8");
fs.renameSync(tmp, cfg.cachePath);

if (saved) {
  console.log(`已合并 ${saved} 封营销信到缓存：${cfg.cachePath}`);
  console.log("公司：" + savedNames.join(" | "));
} else {
  console.log("本次没有营销信，只更新了跳过记录。");
}
if (skippedSaved) {
  console.log(`已标记跳过 ${skippedSaved} 家：${skippedNames.join(" | ")}`);
}
if (skipped) console.log(`跳过 ${skipped} 条未填写/不合法`);
if (errors.length) console.log("问题：\n- " + errors.join("\n- "));
console.log("下一步：node report.js");
