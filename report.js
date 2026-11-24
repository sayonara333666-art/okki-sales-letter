// 读取最近一次抓取的客户页面 + 营销信缓存 → 生成只含营销信内容的本地网页
const fs = require("fs");
const path = require("path");
const { loadConfig, expandPath } = require("./config");
const { normalizeEmail } = require("./format");

const cfg = loadConfig();
try { fs.mkdirSync(cfg.dataDir, { recursive: true }); } catch (e) {}

const catalogImagePath = path.resolve(__dirname, expandPath(cfg.catalogImage || "产品目录.png"));
let catalogDataUri = "";
try {
  catalogDataUri = "data:image/png;base64," + fs.readFileSync(catalogImagePath).toString("base64");
} catch (e) {}
const hasCatalog = !!catalogDataUri;

function normName(s) {
  return String(s || "").toUpperCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}
function keyOf(row) {
  return String(row.companyId || "").trim() || normName(row.company);
}
function isUS(country) {
  const c = String(country || "").trim();
  return /美国|USA|United States|波多黎各|关岛|美属萨摩亚|美属维尔京群岛|北马里亚纳群岛|美属/i.test(c);
}
function hasSkipTag(tags) {
  const list = Array.isArray(cfg.skipTags) ? cfg.skipTags.map((x) => String(x).trim()).filter(Boolean) : [];
  const t = String(tags || "");
  return list.some((x) => t.includes(x));
}
function fieldOf(row, label) {
  const f = row && row.fields && typeof row.fields === "object" ? row.fields : {};
  return String(f[label] || "").replace(/\s+/g, " ").trim();
}
function hasEdmSent(row) {
  if (cfg.skipIfEdmSent === false) return false;
  const v = fieldOf(row, "最近发EDM时间");
  return !!v && !/^(--|—|-|无|从未|空|1970|0000)/i.test(v);
}
function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function copyBlock(content, label = "复制") {
  return `<div class="copy-block"><div class="copy-text">${content}</div><button class="copy" type="button" onclick="copyBlock(this)">${label}</button></div>`;
}

function readLatest() {
  if (!fs.existsSync(cfg.customersPath)) return null;
  const lines = fs.readFileSync(cfg.customersPath, "utf8").split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const rec = JSON.parse(lines[i]);
      if (rec && Array.isArray(rec.rows) && rec.rows.length) return rec;
    } catch (e) {}
  }
  return null;
}
function readCache() {
  try {
    const j = JSON.parse(fs.readFileSync(cfg.cachePath, "utf8").replace(/^﻿/, ""));
    return j && typeof j.companies === "object" ? j.companies : {};
  } catch (e) {
    return {};
  }
}

const latest = readLatest();
const cache = readCache();
const items = [];
const skippedItems = [];
let missing = 0;

if (latest) {
  const seen = new Set();
  for (const row of latest.rows) {
    const company = String(row.company || "").replace(/\s+/g, " ").trim();
    if (!company || company === "--") continue;
    const key = keyOf(row);
    if (seen.has(key)) continue;
    seen.add(key);

    if (isUS(row.country)) {
      skippedItems.push({
        company,
        country: String(row.country || "美国/美属"),
        reason: "美国/美属，按规则跳过，不分析",
      });
      continue;
    }

    if (hasSkipTag(row.tags)) {
      skippedItems.push({
        company,
        country: String(row.country || ""),
        reason: "已发送营销信（标签跳过）",
      });
      continue;
    }

    if (hasEdmSent(row)) {
      skippedItems.push({
        company,
        country: String(row.country || ""),
        reason: "已发送过 EDM（最近发EDM时间：" + fieldOf(row, "最近发EDM时间") + "）",
      });
      continue;
    }

    const c = cache[key];
    if (c && c.skipped) {
      skippedItems.push({
        company,
        country: String(row.country || c.country || ""),
        reason: c.reason || "美国/美属或不适配，跳过",
      });
      continue;
    }
    if (c && c.subject && (c.body || c.english) && c.chinese) {
      const language = c.language || "en";
      items.push({
        company,
        country: String(row.country || c.country || ""),
        language,
        languageName: c.languageName || (language === "en" ? "英语" : language.toUpperCase()),
        mode: c.mode || (language === "en" ? "english" : "mixed"),
        subject: c.subject,
        body: normalizeEmail(c.body || c.english),
        englishSubject: c.english_subject || c.subject,
        englishBody: normalizeEmail(c.english_body || c.english || c.body || ""),
        chinese: c.chinese,
      });
    } else {
      missing++;
    }
  }
}

const d = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp =
  d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "_" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
const htmlFile = path.join(cfg.dataDir, `${cfg.reportPrefix}${stamp}.html`);

const rowsHtml = items.map((x, i) => `
  <tr>
    <td class="num">${i + 1}</td>
    <td class="company">${copyBlock(esc(x.company))}</td>
    <td class="subject"><span class="lang">${esc(x.languageName)}</span>${copyBlock(`<div dir="auto">${esc(x.subject)}</div>`)}</td>
    <td class="body">
      ${copyBlock(`<div dir="auto">${esc(x.body)}</div>`)}
      ${x.language !== "en" ? `<details class="backup"><summary>English backup</summary>${copyBlock(`<div class="en" dir="ltr"><b>${esc(x.englishSubject)}</b><br>${esc(x.englishBody)}</div>`, "复制英文")}</details>` : ""}
    </td>
    <td class="body cn">${copyBlock(`<div dir="auto">${esc(x.chinese)}</div>`)}</td>
  </tr>`).join("");

const skippedHtml = skippedItems.map((x, i) => `
  <tr>
    <td class="num">${i + 1}</td>
    <td class="company">${esc(x.company)}</td>
    <td class="skip-country">${esc(x.country)}</td>
    <td class="skip-reason">${esc(x.reason)}</td>
  </tr>`).join("");

const empty = !latest
  ? "还没有抓取数据。请先在 OKKI 客户页面用插件抓取当前页。"
  : !items.length
  ? `本次抓取 ${latest.rows.length} 家，${
      skippedItems.length
        ? `已跳过 ${skippedItems.length} 家，暂无营销信。`
        : "暂无已生成的营销信。可能还在分析中，或分析失败。"
    }`
  : "";

// 名片内容来自 config.json 的 profile，换成你自己的资料即可
const prof = cfg.profile || {};
const profVal = (k) => String(prof[k] || "").trim();
const cardHtml = `
  <div style="font-family: Arial, Helvetica, sans-serif; color:#1f2937; line-height:1.45; padding:2px 0;">
    <div style="font-size:20px; font-weight:700; color:#111827; letter-spacing:.2px;">${esc(profVal("contactName") || "[Your Name]")}</div>
    ${profVal("contactTitle") ? `<div style="font-size:11.5px; color:#6b7280; margin-top:2px;">${esc(profVal("contactTitle"))}</div>` : ""}
    ${profVal("brand") ? `<div style="font-size:13px; font-weight:700; color:#7c3aed; margin-top:10px;">${esc(profVal("brand"))}</div>` : ""}
    ${profVal("companyName") ? `<div style="font-size:11.5px; color:#374151;">${esc(profVal("companyName"))}</div>` : ""}
    ${profVal("phone") ? `<div style="font-size:13px; color:#111827; margin-top:8px;">${esc(profVal("phone"))}</div>` : ""}
    ${profVal("email") ? `<div style="font-size:13px; color:#111827; margin-top:2px;"><a href="mailto:${esc(profVal("email"))}" style="color:#111827; text-decoration:none;">${esc(profVal("email"))}</a></div>` : ""}
    ${profVal("website") ? `<div style="font-size:12px; color:#374151; margin-top:2px;">${esc(profVal("website"))}</div>` : ""}
  </div>`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Customer Letter Assistant 1.3.1030Beta ${stamp}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f5f7fb; color: #1f2937;
    font-family: -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
    font-size: 14px; line-height: 1.6;
  }
  .page-shell { display: flex; align-items: stretch; min-height: 100vh; }
  .page-content { flex: 1; min-width: 0; padding: 22px; }
  .card-rail {
    flex: 0 0 1cm; width: 1cm; align-self: stretch;
    border: 0; padding: 0; cursor: pointer; color: #fff;
    background: linear-gradient(180deg, #7c3aed 0%, #6d28d9 55%, #4c1d95 100%);
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 12px; padding-top: 30px;
    box-shadow: inset -4px 0 8px rgba(0,0,0,.18), inset 4px 0 8px rgba(255,255,255,.10), 4px 0 14px rgba(76,29,149,.18);
    transform: perspective(900px) rotateY(3deg); transform-origin: left center;
    transition: transform .12s ease, box-shadow .12s ease, filter .12s ease;
    z-index: 5;
  }
  .card-rail:hover {
    transform: perspective(900px) rotateY(0deg) translateX(3px) scaleX(1.02);
    background: linear-gradient(180deg, #a78bfa 0%, #8b5cf6 55%, #6d28d9 100%);
    box-shadow: inset -4px 0 8px rgba(0,0,0,.12), inset 4px 0 10px rgba(255,255,255,.28), 0 0 0 2px rgba(167,139,250,.55), 8px 0 24px rgba(109,40,217,.45);
    filter: none;
  }
  .card-rail:hover .card-rail-label { text-shadow: 0 1px 2px rgba(0,0,0,.35); }
  .card-rail:hover .card-rail-icon { color: #fff; transform: scale(1.2); }
  .card-rail:active,
  .card-rail.pressed {
    transform: perspective(900px) rotateY(0deg) translateX(2px) scaleX(.96);
    box-shadow: inset 6px 0 14px rgba(0,0,0,.35), inset -2px 0 6px rgba(255,255,255,.08);
    filter: brightness(.92);
  }
  .card-rail:focus-visible { outline: 2px solid #c4b5fd; outline-offset: -2px; }
  .card-rail.done { background: linear-gradient(180deg, #16a34a, #15803d); color: #fff; }
  .image-rail {
    background: linear-gradient(180deg, #fef9c3 0%, #fde68a 55%, #f59e0b 100%);
    color: #78350f;
    box-shadow: inset -4px 0 8px rgba(120,53,15,.12), inset 4px 0 8px rgba(255,255,255,.35), 4px 0 14px rgba(245,158,11,.18);
  }
  .image-rail:hover {
    background: linear-gradient(180deg, #fde68a 0%, #fbbf24 55%, #d97706 100%);
    color: #451a03;
    box-shadow: inset -4px 0 8px rgba(120,53,15,.15), inset 4px 0 10px rgba(255,255,255,.45), 0 0 0 2px rgba(245,158,11,.55), 8px 0 24px rgba(245,158,11,.45);
    filter: none;
  }
  .image-rail:hover .card-rail-label { color: #451a03; text-shadow: 0 1px 1px rgba(255,255,255,.4); }
  .image-rail:hover .card-rail-icon { color: #451a03; transform: scale(1.2); }
  .image-rail:active,
  .image-rail.pressed {
    box-shadow: inset 6px 0 14px rgba(120,53,15,.25), inset -2px 0 6px rgba(255,255,255,.25);
  }
  .image-rail.done,
  .image-rail.done:hover {
    background: linear-gradient(180deg, #16a34a, #15803d);
    color: #fff;
  }
  .card-rail-icon { font-size: 16px; opacity: .9; transition: transform .12s ease, color .12s ease; }
  .card-rail-label { writing-mode: vertical-rl; text-orientation: upright; letter-spacing: 4px; font-size: 12.5px; font-weight: 700; transition: color .12s ease, text-shadow .12s ease; }
  .card-toast {
    position: fixed; left: calc(2cm + 16px); top: 16px;
    background: #111827; color: #fff; border-radius: 8px;
    padding: 8px 12px; font-size: 12px; display: none; z-index: 60;
    box-shadow: 0 8px 20px rgba(0,0,0,.18);
  }
  .card-toast.show { display: block; }
  .card-source { position: fixed; left: -9999px; top: 0; width: 320px; opacity: 0; pointer-events: none; }
  .catalog-source { position: fixed; left: -9999px; top: 0; width: 200px; opacity: 0; pointer-events: none; }
  h1 { margin: 0 0 4px; color: #6d28d9; font-size: 22px; }
  .meta { color: #64748b; font-size: 13px; margin-bottom: 16px; }
  .note {
    background: #fff8e6; border: 1px solid #f0d9a6; color: #7a5b12;
    border-radius: 9px; padding: 9px 13px; font-size: 12.5px; margin-bottom: 14px;
  }
  .table-wrap { overflow: auto; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; box-shadow: 0 2px 10px rgba(15,23,42,.05); }
  table { width: 100%; border-collapse: collapse; min-width: 1100px; }
  th, td { padding: 10px 10px; border-bottom: 1px solid #eef2f7; vertical-align: top; text-align: left; position: relative; }
  th { position: sticky; top: 0; background: #f5f3ff; color: #6d28d9; font-size: 12.5px; white-space: nowrap; z-index: 1; }
  tr:hover td { background: #fafaff; }
  .num { width: 42px; color: #94a3b8; text-align: right; font-variant-numeric: tabular-nums; }
  .company { width: 170px; font-weight: 700; }
  .subject { width: 210px; font-weight: 600; color: #3b0764; }
  .lang { display: inline-block; margin-bottom: 3px; font-size: 10.5px; font-weight: 600; color: #7c3aed; background: #f5f3ff; border-radius: 4px; padding: 1px 6px; }
  .body { width: 36%; white-space: pre-wrap; font-size: 13px; }
  .cn { width: 30%; color: #475569; background: #fcfcff; }
  .backup { margin-top: 8px; font-size: 11.5px; color: #64748b; }
  .backup summary { cursor: pointer; color: #7c3aed; }
  .backup .en { margin-top: 5px; padding: 6px 8px; background: #f8fafc; border-left: 2px solid #c4b5fd; white-space: pre-wrap; }
  .copy-block { padding-right: 46px; }
  .copy {
    position: absolute; top: 8px; right: 8px;
    border: 1px solid #ddd6fe; background: #f5f3ff; color: #7c3aed;
    border-radius: 5px; padding: 1px 6px; font-size: 10.5px;
    cursor: pointer; line-height: 1.5;
  }
  .copy:hover { background: #ede9fe; }
  .copy.done { color: #15803d; background: #f0fdf4; border-color: #bbf7d0; }
  .backup .copy-block { position: relative; padding-right: 58px; }
  .backup .copy { top: 0; right: 0; }
  h2 { color: #6d28d9; font-size: 17px; margin: 22px 0 10px; }
  .skip-table { min-width: 620px; }
  .skip-table .company { width: 240px; }
  .skip-country { width: 130px; color: #64748b; }
  .skip-reason { color: #7a5b12; }
  .empty { color: #64748b; padding: 26px 18px; text-align: center; }
  .foot { color: #94a3b8; font-size: 12px; margin-top: 12px; }
  @media (max-width: 760px) {
    .page-content { padding: 14px; }
    .card-rail-label { font-size: 11px; letter-spacing: 2px; }
    .card-toast { left: calc(2cm + 10px); }
  }
  @media print {
    body { background: #fff; }
    .page-shell { display: block; }
    .page-content { padding: 0; }
    .card-rail, .card-toast, .card-source { display: none !important; }
    .note { display: none; }
    .table-wrap { box-shadow: none; }
  }
</style>
</head>
<body>
<div class="page-shell">
  ${hasCatalog ? `<button class="card-rail image-rail" id="copyCatalog" type="button" title="复制产品目录图片" aria-label="复制产品目录图片">
    <span class="card-rail-icon">▦</span>
    <span class="card-rail-label">产品目录</span>
  </button>` : ""}
  <button class="card-rail" id="copyCard" type="button" title="复制名片" aria-label="复制名片">
    <span class="card-rail-icon">▤</span>
    <span class="card-rail-label">复制名片</span>
  </button>
  <main class="page-content">
  <h1>客户营销信</h1>
  <div class="meta">
    ${latest ? `本次抓取：${esc(latest.title || latest.url || "")} · ${esc(latest.capturedAt || latest.receivedAt || "")}` : "暂无抓取记录"}
    · 已生成 ${items.length} 封${skippedItems.length ? ` · 已跳过 ${skippedItems.length} 家` : ""}${missing ? ` · 待生成/失败 ${missing} 家` : ""}
    · 生成时间 ${esc(d.toLocaleString("zh-CN"))}
  </div>
  <div class="note">客户语言主题 / 客户语言正文 / 中文对照；非英语客户可在正文下方展开 English backup。发送前请核对公司信息，不要编造认证或承诺。</div>
  ${empty ? `<div class="empty">${esc(empty)}</div>` : ""}
  ${items.length ? `
  <div class="table-wrap">
    <table>
      <thead><tr><th>#</th><th>公司名</th><th>客户语言主题</th><th>客户语言正文</th><th>中文对照</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>` : ""}
  ${skippedItems.length ? `
  <h2>已跳过（${skippedItems.length} 家）</h2>
  <div class="table-wrap">
    <table class="skip-table">
      <thead><tr><th>#</th><th>公司名</th><th>国家/地区</th><th>跳过原因</th></tr></thead>
      <tbody>${skippedHtml}</tbody>
    </table>
  </div>` : ""}
  <div class="foot">由「Customer Letter Assistant」本地生成 · 不自动发邮件 · 数据只保存在本机</div>
  </main>
</div>
<div id="cardToast" class="card-toast"></div>
<div id="cardSource" class="card-source" contenteditable="true" aria-hidden="true">${cardHtml}</div>
${hasCatalog ? `<img id="catalogImage" class="catalog-source" src="${catalogDataUri}" alt="产品目录">` : ""}
  <script>
    function copyBlock(btn) {
      var block = btn.closest(".copy-block");
      var target = block ? block.querySelector(".copy-text") : null;
      var text = target ? target.innerText.trim() : "";
      if (!text) return;
      var old = btn.textContent;
      var done = function () {
        btn.textContent = "已复制";
        btn.classList.add("done");
        setTimeout(function () {
          btn.textContent = old;
          btn.classList.remove("done");
        }, 1500);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done).catch(function () {
          fallbackCopy(text, done);
        });
      } else {
        fallbackCopy(text, done);
      }
    }
    function fallbackCopy(text, done) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand("copy");
        done();
      } catch (e) {
        alert("复制失败，请手动选择文字");
      }
      ta.remove();
    }

    function copyBusinessCard() {
      var src = document.getElementById("cardSource");
      var rail = document.getElementById("copyCard");
      var label = rail.querySelector(".card-rail-label");
      var toast = document.getElementById("cardToast");
      var oldLabel = label.textContent;

      rail.classList.add("pressed");
      setTimeout(function () { rail.classList.remove("pressed"); }, 180);

      var done = function () {
        rail.classList.add("done");
        label.textContent = "已复制";
        toast.textContent = "名片已复制（保留加粗和字号）";
        toast.classList.add("show");
        setTimeout(function () {
          rail.classList.remove("done");
          label.textContent = oldLabel;
          toast.classList.remove("show");
        }, 1800);
      };

      var fallback = function () {
        var range = document.createRange();
        range.selectNodeContents(src);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        try {
          document.execCommand("copy");
          done();
        } catch (e) {
          alert("复制失败，请手动选择名片文字");
        }
        sel.removeAllRanges();
      };

      var html = src.innerHTML;
      var text = src.innerText || "";
      if (navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
        try {
          var item = new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" })
          });
          navigator.clipboard.write([item]).then(done).catch(fallback);
          return;
        } catch (e) {}
      }
      fallback();
    }

    document.getElementById("copyCard").addEventListener("click", copyBusinessCard);

    var catalogImg = document.getElementById("catalogImage");
    window.__catalogPngBlob = null;
    function prepareCatalogBlob() {
      if (!catalogImg || !catalogImg.naturalWidth) return;
      var canvas = document.createElement("canvas");
      canvas.width = catalogImg.naturalWidth;
      canvas.height = catalogImg.naturalHeight;
      canvas.getContext("2d").drawImage(catalogImg, 0, 0);
      canvas.toBlob(function (blob) {
        window.__catalogPngBlob = blob;
      }, "image/png");
    }
    if (catalogImg) {
      if (catalogImg.complete) prepareCatalogBlob();
      else catalogImg.addEventListener("load", prepareCatalogBlob);
    }

    function copyCatalogImage() {
      var rail = document.getElementById("copyCatalog");
      var label = rail.querySelector(".card-rail-label");
      var toast = document.getElementById("cardToast");
      var oldLabel = label.textContent;

      rail.classList.add("pressed");
      setTimeout(function () { rail.classList.remove("pressed"); }, 180);

      var done = function () {
        rail.classList.add("done");
        label.textContent = "已复制";
        toast.textContent = "产品目录图片已复制";
        toast.classList.add("show");
        setTimeout(function () {
          rail.classList.remove("done");
          label.textContent = oldLabel;
          toast.classList.remove("show");
        }, 1800);
      };

      var fallback = function () {
        try {
          var wrap = document.createElement("div");
          wrap.contentEditable = "true";
          wrap.style.cssText = "position:fixed;left:-9999px;top:0;";
          var img = document.createElement("img");
          img.src = catalogImg.src;
          img.style.width = "800px";
          wrap.appendChild(img);
          document.body.appendChild(wrap);
          var range = document.createRange();
          range.selectNode(img);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand("copy");
          sel.removeAllRanges();
          wrap.remove();
          done();
        } catch (e) {
          alert("复制图片失败，请右键保存产品目录图片");
        }
      };

      var blob = window.__catalogPngBlob;
      if (navigator.clipboard && window.ClipboardItem && blob && window.isSecureContext) {
        try {
          navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).then(done).catch(fallback);
          return;
        } catch (e) {}
      }
      fallback();
    }

    var copyCatalogBtn = document.getElementById("copyCatalog");
    if (copyCatalogBtn) copyCatalogBtn.addEventListener("click", copyCatalogImage);
  </script>
</body>
</html>`;

fs.writeFileSync(htmlFile, html, "utf8");
console.log("报告已生成: " + htmlFile);
console.log(`本次展示 ${items.length} 封；跳过 ${skippedItems.length} 家；待生成/失败 ${missing} 家。`);
