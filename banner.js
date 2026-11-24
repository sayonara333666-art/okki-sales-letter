// Customer Letter Assistant 启动横幅
const fs = require("fs");
const path = require("path");

const C = {
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};

const FALLBACK_LOGO = [
  " ██████╗ ██╗      █████╗ ",
  "██╔════╝ ██║     ██╔══██╗",
  "██║      ██║     ███████║",
  "██║      ██║     ██╔══██║",
  "╚██████╗ ███████╗██║  ██║",
  " ╚═════╝ ╚══════╝╚═╝  ╚═╝",
].join("\n");

function readLogo() {
  try {
    return fs
      .readFileSync(path.join(__dirname, "logo.txt"), "utf8")
      .replace(/^﻿/, "")
      .replace(/\r/g, "")
      .replace(/\n+$/, "");
  } catch (e) {
    return FALLBACK_LOGO;
  }
}

function printBanner({ version = "1.3.1030", port = 8788, dataFile = "" } = {}) {
  const useColor = !!process.stdout.isTTY && !process.env.NO_COLOR;
  const paint = (code, text) => (useColor ? code + text + C.reset : text);

  console.log("");
  readLogo()
    .split("\n")
    .forEach((line) => console.log(paint(C.green, line)));
  console.log("");
  console.log(
    paint(C.green, "  :: ") +
      paint(C.cyan + C.bold, "Customer Letter Assistant") +
      paint(C.green, " ::") +
      paint(C.gray, `  (v${version})`)
  );
  console.log(paint(C.gray, "     Customer Page  ·  Letter Drafting  ·  Local Report"));
  console.log(paint(C.gray, `     Port ${port}  ·  Data: ${dataFile}`));
  console.log(paint(C.green, "  " + "=".repeat(64)));
  console.log("");
}

module.exports = { printBanner };

if (require.main === module) {
  printBanner({
    version: "1.3.1030",
    port: 8788,
    dataFile: "Desktop\\Customer Letter Assistant Data\\客户页面.jsonl",
  });
}
