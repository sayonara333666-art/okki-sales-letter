// Customer Letter Assistant - 只抓 OKKI 客户管理列表页「当前这一页」的客户
// 不点客户详情、不翻页、不改旧插件、不读写 customers.jsonl
(() => {
  const HOST_ID = "__cmc_marketing_panel_host";
  if (document.getElementById(HOST_ID)) return;
  if (!/crm\.xiaoman\.cn$/i.test(location.hostname)) return;
  if (!/\/crm\/customer\//i.test(location.pathname)) return;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (s) => String(s == null ? "" : s).replace(/ /g, " ").replace(/\s+/g, " ").trim();

  const COUNTRY_RE =
    /(美国|英国|德国|法国|意大利|西班牙|葡萄牙|荷兰|比利时|瑞士|瑞典|丹麦|挪威|芬兰|波兰|捷克|奥地利|爱尔兰|希腊|俄罗斯|乌克兰|土耳其|加拿大|墨西哥|巴西|智利|阿根廷|秘鲁|哥伦比亚|厄瓜多尔|委内瑞拉|澳大利亚|新西兰|日本|韩国|印度|巴基斯坦|孟加拉|斯里兰卡|尼泊尔|不丹|中国|越南|泰国|马来西亚|新加坡|印度尼西亚|印尼|菲律宾|柬埔寨|缅甸|阿联酋|沙特|卡塔尔|科威特|阿曼|巴林|以色列|约旦|黎巴嫩|埃及|南非|尼日利亚|肯尼亚|摩洛哥|哈萨克斯坦|乌兹别克斯坦|美国本土|USA|United States)/;

  function rowElements() {
    return [...document.querySelectorAll(".vue-recycle-scroller .row-item, .row-item")];
  }

  // 优先按表头文字找列，防止 OKKI 调整列顺序；找不到再用默认索引
  function columnIndex(label, fallback) {
    const cells = [...document.querySelectorAll('.cell[data-cri="-1"], th')];
    const hit = cells.find((c) => clean(c.innerText).includes(label));
    const v = hit && hit.getAttribute("data-cci");
    return v != null && v !== "" ? Number(v) : fallback;
  }
  const COL = {
    tags: columnIndex("客户标签", 3),
    contact: columnIndex("主要联系人", 4),
    country: columnIndex("国家地区", 7),
  };

  const KEEP_FIELDS = new Set([
    "客户编号", "客户标签", "主要联系人", "国家地区", "创建时间",
    "公司网址", "最近发EDM时间", "最近发件时间", "客户类型", "采购意向",
    "产品分组", "年采购额", "简称", "跟进人", "规模", "客户来源",
  ]);
  let HEADER_MAP = {};
  function refreshHeaderMap() {
    const map = {};
    const cells = [...document.querySelectorAll('.cell[data-cri="-1"], th')];
    for (const cell of cells) {
      const cci = cell.getAttribute("data-cci");
      const titleEl = cell.querySelector("[title]");
      const label = clean(titleEl ? titleEl.getAttribute("title") : cell.innerText);
      if (cci != null && KEEP_FIELDS.has(label)) map[cci] = label;
    }
    HEADER_MAP = map;
  }

  function cellByIndex(row, idx) {
    const byAttr = row.querySelector(`.cell[data-cci="${idx}"]`);
    if (byAttr) return byAttr;
    const cells = row.querySelectorAll(".cell");
    return cells[idx] || null;
  }

  function cellText(row, idx) {
    const cell = cellByIndex(row, idx);
    return cell ? clean(cell.innerText) : "";
  }

  function parseRow(row) {
    const link = row.querySelector('a[href*="company_id="]');
    if (!link) return null;
    const company = clean(link.getAttribute("title") || link.innerText);
    if (!company || company === "--") return null;

    let companyId = "";
    try {
      companyId = new URL(link.getAttribute("href"), location.href).searchParams.get("company_id") || "";
    } catch (e) {}

    const fields = {};
    for (const cell of row.querySelectorAll(".cell[data-cci]")) {
      const cci = cell.getAttribute("data-cci");
      const label = HEADER_MAP[cci];
      if (!label) continue;
      const val = clean(cell.innerText);
      if (!val || val === "--" || val === "-") continue;
      fields[label] = val;
    }

    let tags = fields["客户标签"] || cellText(row, COL.tags);
    if (tags === "--" || tags === "-") tags = "";

    let contact = fields["主要联系人"] || cellText(row, COL.contact);
    contact = contact.replace(/\s*\+\d+\s*$/, "").trim();
    if (contact === "--" || contact === "-") contact = "";

    let country = fields["国家地区"] || cellText(row, COL.country);
    if (!country || country === "--" || country === "-") {
      const m = clean(row.innerText).match(COUNTRY_RE);
      country = m ? m[1] : "";
    }
    const cm = country.match(COUNTRY_RE);
    if (cm) country = cm[1];

    if (!companyId && fields["客户编号"]) companyId = clean(fields["客户编号"]);

    return { company, companyId, country, contact, tags, fields };
  }

  function collectVisible(map) {
    for (const row of rowElements()) {
      const item = parseRow(row);
      if (!item) continue;
      const key = item.companyId || item.company.toUpperCase();
      if (!map.has(key)) map.set(key, item);
    }
  }

  function findScroller() {
    const row = document.querySelector(".row-item");
    if (!row) return null;
    const vue = row.closest(".vue-recycle-scroller");
    if (vue) return vue;
    let el = row.parentElement;
    while (el && el !== document.body) {
      const st = getComputedStyle(el);
      if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 20) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  async function collectCurrentPage(onProgress) {
    refreshHeaderMap();
    const scroller = findScroller();
    const map = new Map();
    const originalTop = scroller ? scroller.scrollTop : 0;
    collectVisible(map);

    if (scroller) {
      const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const step = Math.max(180, Math.floor(scroller.clientHeight * 0.8));
      let top = 0;
      let guard = 0;
      while (top <= max + 10 && guard++ < 100) {
        scroller.scrollTop = Math.min(top, max);
        await sleep(220);
        collectVisible(map);
        if (onProgress) onProgress(map.size);
        if (top >= max) break;
        top += step;
      }
      scroller.scrollTop = max;
      await sleep(450);
      collectVisible(map);
      scroller.scrollTop = originalTop;
      await sleep(150);
    }

    return [...map.values()];
  }

  // ---------- 面板 ----------
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "position:fixed;z-index:2147483647;left:18px;bottom:18px;";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
  <style>
    :host { all: initial; }
    .wrap {
      width: 300px;
      background: #fff;
      border: 1px solid #d8dee9;
      border-radius: 13px;
      box-shadow: 0 10px 30px rgba(15,23,42,.18);
      overflow: hidden;
      color: #1f2937;
      font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      font-size: 13px;
      user-select: none;
    }
    .hd {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px;
      background: linear-gradient(135deg, #6d28d9, #7c3aed 60%, #a855f7);
      color: #fff; font-weight: 700; letter-spacing: .3px;
      cursor: move;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #cbd5e1; }
    .dot.on { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,.75); }
    .sp { flex: 1; }
    .bd { padding: 11px 12px 12px; display: flex; flex-direction: column; gap: 9px; }
    .row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #64748b; }
    button.main {
      border: 0; border-radius: 9px; padding: 10px 12px; cursor: pointer;
      background: #7c3aed; color: #fff; font-size: 14px; font-weight: 700;
      transition: background .15s;
    }
    button.main:hover { background: #6d28d9; }
    button.main:disabled { background: #cbd5e1; cursor: default; }
    .mini { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .mini button {
      border: 1px solid #e2e8f0; background: #fff; border-radius: 7px;
      padding: 6px 0; cursor: pointer; font-size: 12px; color: #475569;
    }
    .mini button:hover { border-color: #7c3aed; color: #7c3aed; }
    .toast {
      display: none; font-size: 12px; padding: 7px 9px; border-radius: 8px;
      background: #f5f3ff; color: #6d28d9; line-height: 1.5;
      max-height: 190px; overflow: auto; white-space: pre-wrap;
    }
    .toast.err { background: #fef2f2; color: #b91c1c; }
    .toast.ok { background: #f0fdf4; color: #15803d; }
    button.save {
      border: 1px solid #c4b5fd; background: #f5f3ff; color: #6d28d9;
      border-radius: 8px; padding: 7px 10px; cursor: pointer; font-size: 12px;
    }
    button.save:hover { background: #ede9fe; }
    .hint { font-size: 11px; color: #94a3b8; line-height: 1.5; }
  </style>
  <div class="wrap">
    <div class="hd"><span class="dot" id="dot"></span><span>Customer Letter Assistant</span><span class="sp"></span><span style="font-size:10px;opacity:.8">v1.3.1030</span></div>
    <div class="bd">
      <div class="row"><span id="svc">服务：检测中…</span><span class="sp"></span><span id="cnt"></span></div>
      <button class="main" id="btnCap">抓取当前页客户</button>
      <button class="save" id="btnSave" style="display:none">下载本次抓取结果</button>
      <div class="mini">
        <button id="btnCheck">检测服务</button>
        <button id="btnDiag">诊断</button>
      </div>
      <div class="toast" id="toast"></div>
      <div class="hint">抓取后后台生成营销信每20条需耗时8min左右,请耐心等待</div>
    </div>
  </div>`;

  const $ = (id) => root.getElementById(id);
  const dot = $("dot");
  const svc = $("svc");
  const cnt = $("cnt");
  const toastEl = $("toast");
  const btnCap = $("btnCap");
  const btnSave = $("btnSave");
  let lastCapture = null;
  let lastBgPing = null;
  let lastDirectPing = null;

  // 拖动面板，避免挡住 OKKI 右下角按钮
  const hd = root.querySelector(".hd");
  let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
  hd.addEventListener("mousedown", (e) => {
    dragging = true;
    const r = host.getBoundingClientRect();
    sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
    host.style.left = r.left + "px";
    host.style.top = r.top + "px";
    host.style.right = "auto";
    host.style.bottom = "auto";
    e.preventDefault();
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const nx = ox + e.clientX - sx;
    const ny = oy + e.clientY - sy;
    host.style.left = Math.max(0, Math.min(window.innerWidth - 60, nx)) + "px";
    host.style.top = Math.max(0, Math.min(window.innerHeight - 40, ny)) + "px";
  });
  window.addEventListener("mouseup", () => (dragging = false));

  let toastTimer = null;
  function toast(text, cls) {
    toastEl.textContent = text;
    toastEl.className = "toast " + (cls || "");
    toastEl.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.style.display = "none"), 12000);
  }

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "_" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  function downloadJson(obj, filename) {
    try {
      const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    } catch (e) {
      toast("下载诊断文件失败：" + (e.message || e), "err");
      return false;
    }
  }

  function showSaveButton(show) {
    btnSave.style.display = show ? "block" : "none";
  }

  function downloadLastCapture() {
    if (!lastCapture || !lastCapture.rows || !lastCapture.rows.length) {
      toast("还没有抓到客户行。", "err");
      return;
    }
    const ok = downloadJson(
      {
        source: "Customer Letter Assistant",
        version: "1.3.1030",
        url: location.href,
        title: document.title,
        capturedAt: lastCapture.capturedAt,
        error: lastCapture.error || "",
        rows: lastCapture.rows,
      },
      `客户营销信_本次抓取_${stamp()}.json`
    );
    if (ok) toast("已下载本次抓取结果。", "ok");
  }

  function buildDiagnostic(error) {
    const sampleRows = rowElements().slice(0, 5).map((row) => ({
      text: clean(row.innerText).slice(0, 500),
      html: row.outerHTML.slice(0, 6000),
      cells: [...row.querySelectorAll(".cell")].map((c) => ({
        cci: c.getAttribute("data-cci"),
        text: clean(c.innerText).slice(0, 200),
      })),
    }));
    return {
      source: "Customer Letter Assistant",
      version: "1.3.1030",
      url: location.href,
      title: document.title,
      time: new Date().toISOString(),
      error: error || "",
      rowCount: rowElements().length,
      companyLinks: document.querySelectorAll('a[href*="company_id="]').length,
      lastBgPing,
      lastDirectPing,
      lastCapture: lastCapture
        ? { count: lastCapture.rows.length, rows: lastCapture.rows.slice(0, 30), error: lastCapture.error || "" }
        : null,
      sampleRows,
      bodyText: clean(document.body ? document.body.innerText : "").slice(0, 15000),
    };
  }

  async function pingDirect() {
    try {
      const r = await fetch("http://127.0.0.1:8788/api/ping", { cache: "no-store" });
      lastDirectPing = { ok: r.ok, status: r.status };
      return r.ok;
    } catch (e) {
      lastDirectPing = { ok: false, error: e && e.message ? e.message : String(e) };
      return false;
    }
  }

  async function checkSvc() {
    let bgOk = false;
    let bgErr = "";
    try {
      const res = await chrome.runtime.sendMessage({ type: "ping" });
      lastBgPing = { ok: !!(res && res.ok), response: res || null };
      bgOk = !!(res && res.ok);
      if (!bgOk) bgErr = (res && res.error) || "后台没有返回 ok";
    } catch (e) {
      lastBgPing = { ok: false, error: e && e.message ? e.message : String(e) };
      bgErr = e && e.message ? e.message : String(e);
    }

    if (bgOk) {
      dot.className = "dot on";
      svc.textContent = "服务：已连接";
      return true;
    }

    const directOk = await pingDirect();
    if (directOk) {
      dot.className = "dot on";
      svc.textContent = "服务：已连接（直连）";
      return true;
    }

    dot.className = "dot";
    svc.textContent = "服务：未启动";
    if (bgErr) lastBgPing = { ok: false, error: bgErr };
    return false;
  }

  async function sendCapture(rows) {
    const payload = {
      source: "Customer Letter Assistant",
      url: location.href,
      title: document.title,
      capturedAt: new Date().toISOString(),
      rows,
    };
    lastCapture = { rows, payload, capturedAt: payload.capturedAt, error: "" };
    showSaveButton(true);

    let bgError = "";
    try {
      const res = await chrome.runtime.sendMessage({ type: "capture", payload });
      if (res && res.ok) {
        toast(`已保存 ${rows.length} 家客户，后台正在生成营销信…`, "ok");
        return true;
      }
      if (res && res.queued) {
        toast("本地服务没启动，数据已暂存。启动后点【检测服务】即可补发；也可以先下载本次抓取结果。", "err");
        return false;
      }
      bgError = res && res.error ? res.error : "后台没有返回结果";
    } catch (e) {
      bgError = e && e.message ? e.message : String(e);
    }

    // 后台消息不通时，尝试从页面直接 POST 到本地服务（服务端已允许 CORS）
    try {
      const r = await fetch("http://127.0.0.1:8788/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      await r.json();
      toast(`已保存 ${rows.length} 家客户（直连本地服务），后台正在生成营销信…`, "ok");
      return true;
    } catch (e2) {
      const msg = `${bgError || "后台无响应"}；直连本地服务：${e2 && e2.message ? e2.message : String(e2)}`;
      lastCapture.error = msg;
      const ok = downloadJson(buildDiagnostic(msg), `客户营销信_抓取失败诊断_${stamp()}.json`);
      toast(
        "发送失败：" + msg + (ok ? "\n已自动下载诊断文件，请发给开发者。" : "\n可点【下载本次抓取结果】手动保存。"),
        "err"
      );
      return false;
    }
  }

  async function capture() {
    btnCap.disabled = true;
    btnCap.textContent = "抓取中…";
    lastCapture = null;
    showSaveButton(false);
    cnt.textContent = "";
    try {
      const rows = await collectCurrentPage((n) => {
        cnt.textContent = `已识别 ${n} 家`;
      });
      if (!rows.length) {
        toast("没识别到客户行。请确认当前在「客户管理」列表页，并且列表已加载。", "err");
        return;
      }
      lastCapture = { rows, payload: null, capturedAt: new Date().toISOString(), error: "" };
      showSaveButton(true);
      cnt.textContent = `本页 ${rows.length} 家`;
      btnCap.textContent = "发送中…";
      await sendCapture(rows);
    } catch (e) {
      const msg = e && e.stack ? e.stack : String(e);
      console.error("[CMH] capture failed", e);
      if (lastCapture) lastCapture.error = msg;
      const ok = downloadJson(buildDiagnostic(msg), `客户营销信_抓取失败诊断_${stamp()}.json`);
      toast(
        "抓取失败：" + (e && e.message ? e.message : e) + (ok ? "\n已自动下载诊断文件。" : ""),
        "err"
      );
    } finally {
      btnCap.disabled = false;
      btnCap.textContent = "抓取当前页客户";
      checkSvc();
    }
  }

  async function diagnostic() {
    const diag = buildDiagnostic(lastCapture ? lastCapture.error : "");
    const ok = downloadJson(diag, `客户营销信诊断_${stamp()}.json`);
    try {
      const res = await chrome.runtime.sendMessage({ type: "debug", payload: diag });
      if (res && res.ok) toast("诊断文件已下载，同时也保存到了后台 debug.json。", "ok");
      else toast("诊断文件已下载（后台未连接：" + (res && res.error ? res.error : "无响应") + "）。", "err");
    } catch (e) {
      toast("诊断文件已下载（后台消息失败：" + (e.message || e) + "）。", "err");
    }
  }

  btnCap.addEventListener("click", capture);
  btnSave.addEventListener("click", downloadLastCapture);
  $("btnCheck").addEventListener("click", async () => {
    const ok = await checkSvc();
    if (!ok) {
      toast("服务未启动。请确认双击的是新插件里的「启动Customer Letter Assistant.bat」，端口 8788；如果已启动，点【诊断】下载诊断文件。", "err");
      return;
    }
    try {
      const res = await chrome.runtime.sendMessage({ type: "flush" });
      if (res && typeof res.sent === "number") {
        toast(res.sent ? `补发 ${res.sent} 条，剩余 ${res.left}` : "服务正常，没有待补发数据", "ok");
      } else {
        toast("服务可用（直连），但插件后台消息未响应；抓取时会尝试直连发送。", "err");
      }
    } catch (e) {
      toast("服务可用（直连），但插件后台消息失败：" + (e.message || e), "err");
    }
  });
  $("btnDiag").addEventListener("click", diagnostic);

  checkSvc();
  setInterval(checkSvc, 15000);
})();
