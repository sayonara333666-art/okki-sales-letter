// Customer Letter Assistant - 一键启动本地服务 + 自动分析 watcher
const path = require("path");
const { spawn } = require("child_process");
const { startWatcher } = require("./watcher");

const server = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  cwd: __dirname,
  stdio: "inherit",
});

const watcher = startWatcher();
let closing = false;

function shutdown(code) {
  if (closing) return;
  closing = true;
  try { watcher.stop(); } catch (e) {}
  try { server.kill(); } catch (e) {}
  setTimeout(() => process.exit(code || 0), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

server.on("exit", (code) => {
  if (closing) return;
  closing = true;
  try { watcher.stop(); } catch (e) {}
  process.exit(code || 0);
});

server.on("error", (e) => {
  console.error("[服务] 启动本地服务失败：" + e.message);
  try { watcher.stop(); } catch (e2) {}
  process.exit(1);
});
