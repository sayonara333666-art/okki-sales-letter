// Customer Letter Assistant - 本地数据服务（8788）
// 只写本插件自己的数据目录，不碰旧插件 8787 / customers.jsonl
const http = require("http");
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./config");
const { printBanner } = require("./banner");

const PORT = Number(process.env.CMC_PORT) || 8788;
const CFG = loadConfig();
const DATA_DIR = CFG.dataDir;
const FILE = CFG.customersPath;

let VERSION = "1.3.1030";
try {
  VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, "manifest.json"), "utf8")).version || VERSION;
} catch (e) {}

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
  console.error("[启动失败] 无法创建数据目录：" + DATA_DIR + "\n  " + e.message);
  process.exit(1);
}

let seq = 0;
function nextId() {
  seq += 1;
  return Date.now().toString(36) + "-" + seq;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, code, obj) {
  cors(res);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function countLines() {
  try {
    return fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).length;
  } catch (e) {
    return 0;
  }
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => {
      const fields = {};
      if (r && r.fields && typeof r.fields === "object") {
        for (const [k, v] of Object.entries(r.fields).slice(0, 30)) {
          const key = String(k).slice(0, 40);
          const val = String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, 500);
          if (val && val !== "--" && val !== "-") fields[key] = val;
        }
      }
      return {
        company: String((r && r.company) || "").replace(/\s+/g, " ").trim(),
        companyId: String((r && r.companyId) || "").trim(),
        country: String((r && r.country) || "").replace(/\s+/g, " ").trim(),
        contact: String((r && r.contact) || "").replace(/\s+/g, " ").trim(),
        tags: String((r && r.tags) || "").replace(/\s+/g, " ").trim(),
        fields,
      };
    })
    .filter((r) => r.company && r.company !== "--");
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, "http://127.0.0.1:" + PORT);

  if (req.method === "GET" && url.pathname === "/api/ping") {
    return json(res, 200, { ok: true, count: countLines() });
  }

  if (req.method === "GET" && url.pathname === "/api/stats") {
    return json(res, 200, { ok: true, count: countLines(), file: FILE });
  }

  if (req.method === "POST" && url.pathname === "/api/customers") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (e) {
        return json(res, 400, { ok: false, error: "JSON 解析失败" });
      }

      const rows = normalizeRows(payload && payload.rows);
      if (!rows.length) {
        return json(res, 400, { ok: false, error: "缺少有效的客户行" });
      }
      if (rows.length > 500) {
        return json(res, 400, { ok: false, error: "单次最多 500 家" });
      }

      const record = {
        id: nextId(),
        receivedAt: new Date().toISOString(),
        source: String((payload && payload.source) || "Customer Letter Assistant"),
        url: String((payload && payload.url) || ""),
        title: String((payload && payload.title) || ""),
        capturedAt: String((payload && payload.capturedAt) || ""),
        rows,
      };

      try {
        fs.appendFileSync(FILE, JSON.stringify(record) + "\n", "utf8");
        const count = countLines();
        console.log(
          `[${new Date().toLocaleTimeString()}] 收到 ${rows.length} 家客户  ← ${record.title || record.url} (累计 ${count} 次抓取)`
        );
        return json(res, 200, { ok: true, id: record.id, count });
      } catch (e) {
        console.error("写入失败:", e.message);
        return json(res, 500, { ok: false, error: "写入失败：" + e.message });
      }
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/debug") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        const file = path.join(CFG.appDir, "debug.json");
        fs.writeFileSync(file, body, "utf8");
        console.log(`[诊断] 已保存 → ${file}`);
        return json(res, 200, { ok: true, file });
      } catch (e) {
        return json(res, 500, { ok: false, error: e.message });
      }
    });
    return;
  }

  if ((req.method === "POST" || req.method === "GET") && url.pathname === "/api/shutdown") {
    json(res, 200, { ok: true });
    console.log("收到关闭指令，服务将在 0.3 秒后退出…");
    setTimeout(() => process.exit(0), 300);
    return;
  }

  json(res, 404, { ok: false, error: "not found" });
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`[启动失败] 端口 ${PORT} 已被占用。请先关闭旧的营销信服务，或修改端口。`);
  } else {
    console.error("[启动失败] " + e.message);
  }
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  printBanner({ version: VERSION, port: PORT, dataFile: FILE });
  console.log("  Tip         :浏览器抓取完成后上传,验证,返回结果需用时约 8min/20个处理样本,请耐心等待");
  console.log("  软件需要监听本机地址 127.0.0.1 与 8788端口,若启动失败请检查端口占用");
  console.log("  等待浏览器插件发送客户数据...…");
  console.log("");
});
