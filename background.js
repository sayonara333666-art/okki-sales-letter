// Customer Letter Assistant - 后台转发与离线队列
// 只连接本插件自己的本地服务 8788，不碰旧插件 8787 / customers.jsonl
const SERVER = "http://127.0.0.1:8788";

async function pingServer() {
  try {
    const r = await fetch(SERVER + "/api/ping", { cache: "no-store" });
    return r.ok;
  } catch (e) {
    return false;
  }
}

async function bumpBadge() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const store = await chrome.storage.local.get(["day", "count"]);
    let count = store.count || 0;
    if (store.day !== today) count = 0;
    count += 1;
    await chrome.storage.local.set({ day: today, count });
    if (chrome.action) {
      chrome.action.setBadgeText({ text: String(count) });
      chrome.action.setBadgeBackgroundColor({ color: "#7c3aed" });
    }
  } catch (e) {}
}

async function sendPayload(payload) {
  try {
    const r = await fetch(SERVER + "/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    await bumpBadge();
    return { ok: true, id: j.id, total: j.count };
  } catch (e) {
    const q = await chrome.storage.local.get(["queue"]);
    const queue = q.queue || [];
    queue.push(payload);
    await chrome.storage.local.set({ queue });
    return { ok: false, queued: true, queueLen: queue.length, error: String(e) };
  }
}

async function flushQueue() {
  const q = await chrome.storage.local.get(["queue"]);
  const queue = q.queue || [];
  if (!queue.length) return { ok: true, sent: 0, left: 0 };
  const left = [];
  let sent = 0;
  for (const payload of queue) {
    try {
      const r = await fetch(SERVER + "/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      sent++;
      await bumpBadge();
    } catch (e) {
      left.push(payload);
    }
  }
  await chrome.storage.local.set({ queue: left });
  return { ok: true, sent, left: left.length };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "ping") {
    pingServer().then((ok) => sendResponse({ ok }));
    return true;
  }
  if (msg.type === "capture") {
    sendPayload(msg.payload).then(sendResponse);
    return true;
  }
  if (msg.type === "flush") {
    flushQueue().then(sendResponse);
    return true;
  }
  if (msg.type === "debug") {
    (async () => {
      try {
        const r = await fetch(SERVER + "/api/debug", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(msg.payload),
        });
        const j = await r.json();
        sendResponse(j);
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
  if (msg.type === "shutdown") {
    (async () => {
      try {
        const r = await fetch(SERVER + "/api/shutdown", { method: "POST" });
        sendResponse({ ok: r.ok });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
});

chrome.runtime.onStartup.addListener(() => flushQueue());
chrome.runtime.onInstalled.addListener(() => flushQueue());
