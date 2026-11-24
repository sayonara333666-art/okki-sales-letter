// 生成营销信填写模板：只处理「最近一次抓取」的那一页客户
// 已生成过营销信的客户自动跳过；不读旧插件的任何文件
const fs = require("fs");
const { loadConfig } = require("../config");

const cfg = loadConfig();
try { fs.mkdirSync(cfg.dataDir, { recursive: true }); } catch (e) {}
const ALL = process.argv.slice(2).includes("--all");

function normName(s) {
  return String(s || "").toUpperCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}
function keyOf(row) {
  return String(row.companyId || "").trim() || normName(row.company);
}
function readRecords() {
  if (!fs.existsSync(cfg.customersPath)) return [];
  const lines = fs.readFileSync(cfg.customersPath, "utf8").split("\n").filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      const rec = JSON.parse(line);
      if (rec && Array.isArray(rec.rows) && rec.rows.length) out.push(rec);
    } catch (e) {}
  }
  return out;
}
function loadCache() {
  try {
    const j = JSON.parse(fs.readFileSync(cfg.cachePath, "utf8").replace(/^﻿/, ""));
    return j && typeof j.companies === "object" ? j : { version: 1, companies: {} };
  } catch (e) {
    return { version: 1, companies: {} };
  }
}
function isUS(country) {
  const c = String(country || "").trim();
  return /美国|USA|United States|波多黎各|关岛|美属萨摩亚|美属维尔京群岛|北马里亚纳群岛|美属/i.test(c);
}
function languageFor(country) {
  const c = String(country || "").trim();
  if (/巴西|Brazil|Brasil|葡萄牙|Portugal/i.test(c)) {
    return { language: "pt", languageName: "葡萄牙语", mode: "full" };
  }
  if (/西班牙|Spain|España/i.test(c)) {
    return { language: "es", languageName: "西班牙语", mode: "mixed" };
  }
  if (/秘鲁|Peru|智利|Chile|墨西哥|Mexico|México|阿根廷|Argentina|哥伦比亚|Colombia|哥斯达黎加|Costa Rica|巴拿马|Panama|巴拉圭|Paraguay|厄瓜多尔|Ecuador|委内瑞拉|Venezuela|玻利维亚|Bolivia|乌拉圭|Uruguay|危地马拉|Guatemala|洪都拉斯|Honduras|萨尔瓦多|El Salvador|尼加拉瓜|Nicaragua|多米尼加|Dominican|古巴|Cuba/i.test(c)) {
    return { language: "es", languageName: "西班牙语", mode: "full" };
  }
  if (/法国|France/i.test(c)) return { language: "fr", languageName: "法语", mode: "mixed" };
  if (/德国|Germany|Deutschland|奥地利|Austria|瑞士|Switzerland|Schweiz|列支敦士登/i.test(c)) return { language: "de", languageName: "德语", mode: "mixed" };
  if (/意大利|Italy|Italia/i.test(c)) return { language: "it", languageName: "意大利语", mode: "mixed" };
  if (/阿联酋|UAE|United Arab Emirates|沙特|Saudi|卡塔尔|Qatar|科威特|Kuwait|阿曼|Oman|巴林|Bahrain|约旦|Jordan|黎巴嫩|Lebanon|埃及|Egypt|摩洛哥|Morocco|阿尔及利亚|Algeria|突尼斯|Tunisia|伊拉克|Iraq/i.test(c)) {
    return { language: "ar", languageName: "阿拉伯语", mode: "mixed" };
  }
  if (/俄罗斯|Russia|白俄罗斯|Belarus|哈萨克斯坦|Kazakhstan/i.test(c)) return { language: "ru", languageName: "俄语", mode: "mixed" };
  if (/日本|Japan/i.test(c)) return { language: "ja", languageName: "日语", mode: "mixed" };
  if (/韩国|South Korea|Korea/i.test(c)) return { language: "ko", languageName: "韩语", mode: "mixed" };
  if (/越南|Vietnam/i.test(c)) return { language: "vi", languageName: "越南语", mode: "mixed" };
  if (/印尼|印度尼西亚|Indonesia/i.test(c)) return { language: "id", languageName: "印尼语", mode: "mixed" };
  if (/泰国|Thailand/i.test(c)) return { language: "th", languageName: "泰语", mode: "mixed" };
  if (/土耳其|Turkey|Türkiye/i.test(c)) return { language: "tr", languageName: "土耳其语", mode: "mixed" };
  if (/波兰|Poland/i.test(c)) return { language: "pl", languageName: "波兰语", mode: "mixed" };
  return { language: "en", languageName: "英语", mode: "english" };
}
function hasEmail(entry) {
  return !!(entry && (entry.skipped || (entry.subject && (entry.body || entry.english) && entry.chinese)));
}
function hasSkipTag(tags) {
  const list = Array.isArray(cfg.skipTags) ? cfg.skipTags.map((x) => String(x).trim()).filter(Boolean) : [];
  const t = String(tags || "");
  return list.some((x) => t.includes(x));
}
function fieldOf(r, label) {
  const f = r && r.fields && typeof r.fields === "object" ? r.fields : {};
  return String(f[label] || "").replace(/\s+/g, " ").trim();
}
function hasEdmSent(r) {
  if (cfg.skipIfEdmSent === false) return false;
  const v = fieldOf(r, "最近发EDM时间");
  return !!v && !/^(--|—|-|无|从未|空|1970|0000)/i.test(v);
}

const records = readRecords();
if (!records.length) {
  const empty = {
    generatedAt: new Date().toISOString(),
    batchId: "",
    batchTitle: "",
    total: 0,
    skipped: 0,
    pending: 0,
    selected: 0,
    remaining: 0,
    companies: [],
  };
  fs.writeFileSync(cfg.workPath, JSON.stringify(empty, null, 2), "utf8");
  console.log("客户页面.jsonl 还没有数据。");
  process.exit(0);
}

const latest = ALL ? records[records.length - 1] : records[records.length - 1];
const rows = [];
const seen = new Set();
for (const r of latest.rows) {
  const company = String(r.company || "").replace(/\s+/g, " ").trim();
  if (!company || company === "--") continue;
  const key = keyOf(r);
  if (seen.has(key)) continue;
  seen.add(key);
  const country = String(r.country || "").trim();
  const lang = languageFor(country);
  rows.push({
    key,
    company,
    companyId: String(r.companyId || "").trim(),
    country,
    contact: String(r.contact || "").trim(),
    tags: String(r.tags || "").trim(),
    fields: r.fields && typeof r.fields === "object" ? r.fields : {},
    website: fieldOf(r, "公司网址"),
    edmAt: fieldOf(r, "最近发EDM时间"),
    lastEmailAt: fieldOf(r, "最近发件时间"),
    customerType: fieldOf(r, "客户类型"),
    purchaseIntent: fieldOf(r, "采购意向"),
    productGroup: fieldOf(r, "产品分组"),
    annualPurchase: fieldOf(r, "年采购额"),
    shortName: fieldOf(r, "简称"),
    owner: fieldOf(r, "跟进人"),
    createdAt: fieldOf(r, "创建时间"),
    customerNo: fieldOf(r, "客户编号"),
    language: lang.language,
    languageName: lang.languageName,
    mode: lang.mode,
  });
}

const cache = loadCache();
const usRows = rows.filter((r) => isUS(r.country));
const tagSkipRows = rows.filter((r) => !isUS(r.country) && hasSkipTag(r.tags));
const edmSkipRows = rows.filter((r) => !isUS(r.country) && !hasSkipTag(r.tags) && hasEdmSent(r));
const workRows = rows.filter((r) => !isUS(r.country) && !hasSkipTag(r.tags) && !hasEdmSent(r));
const pending = workRows.filter((r) => !hasEmail(cache.companies[r.key]));
const limit = ALL ? 0 : cfg.analysisBatchSize;
const selected = limit > 0 ? pending.slice(0, limit) : pending;

const template = {
  generatedAt: new Date().toISOString(),
  batchId: latest.id || "",
  batchTitle: latest.title || "",
  capturedAt: latest.capturedAt || "",
  total: rows.length,
  skipped: usRows.length + tagSkipRows.length + edmSkipRows.length,
  pending: pending.length,
  selected: selected.length,
  remaining: pending.length - selected.length,
  companies: selected.map((r) => ({
    key: r.key,
    name: r.company,
    companyId: r.companyId,
    country: r.country,
    contact: r.contact,
    tags: r.tags,
    website: r.website,
    edmAt: r.edmAt,
    lastEmailAt: r.lastEmailAt,
    customerType: r.customerType,
    purchaseIntent: r.purchaseIntent,
    productGroup: r.productGroup,
    annualPurchase: r.annualPurchase,
    shortName: r.shortName,
    owner: r.owner,
    createdAt: r.createdAt,
    customerNo: r.customerNo,
    language: r.language,
    languageName: r.languageName,
    mode: r.mode,
    subject: "",
    body: "",
    english_subject: "",
    english_body: "",
    chinese: "",
    sources: [],
  })),
};

fs.writeFileSync(cfg.workPath, JSON.stringify(template, null, 2), "utf8");

console.log("填写文件：" + cfg.workPath);
console.log(
  `本次页面 ${rows.length} 家；美国/美属跳过 ${usRows.length} 家；已发标签跳过 ${tagSkipRows.length} 家；已发EDM跳过 ${edmSkipRows.length} 家；待生成 ${pending.length} 家；本批 ${selected.length} 家；剩余 ${pending.length - selected.length} 家`
);
if (!selected.length) {
  console.log("没有待生成营销信的新客户，直接运行 node report.js 即可。");
} else {
  console.log("本批公司：" + selected.map((c) => c.company).join(" | "));
}
if (usRows.length) {
  console.log("美国/美属跳过：" + usRows.map((c) => c.company).join(" | "));
}
if (tagSkipRows.length) {
  console.log("已发标签跳过：" + tagSkipRows.map((c) => c.company).join(" | "));
}
if (edmSkipRows.length) {
  console.log("已发EDM跳过：" + edmSkipRows.map((c) => c.company).join(" | "));
}
