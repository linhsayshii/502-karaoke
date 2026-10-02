// Drives a headless Chrome over the DevTools Protocol (no dependency: Node's
// own WebSocket and fetch). Usage: node drive.mjs <session> < script.js
// The script is an async function body with `p` (the page) in scope. Each
// session is its own browser context (own cookies/storage), kept between runs.
// State and screenshots go to DRIVE_DIR (default: a folder in the OS temp
// dir), never into the repository.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.DRIVE_PORT ?? 9333);
const DIR = process.env.DRIVE_DIR ?? path.join(os.tmpdir(), "kara502-verify");
const STATE = path.join(DIR, "sessions.json");
const SHOTS = path.join(DIR, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const listeners = [];
    ws.onopen = () =>
      resolve({
        send(method, params = {}, sessionId) {
          const msgId = ++id;
          ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
          return new Promise((res, rej) => pending.set(msgId, { res, rej, method }));
        },
        on(fn) {
          listeners.push(fn);
        },
        close() {
          ws.close();
        },
      });
    ws.onerror = (e) => reject(new Error(`ws error ${e.message ?? ""}`));
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej, method } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(`${method}: ${msg.error.message}`));
        else res(msg.result);
      } else for (const fn of listeners) fn(msg);
    };
  });
}

async function targetFor(name) {
  const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
  const live = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  if (state[name] && live.some((t) => t.id === state[name])) return state[name];
  const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const browser = await connect(version.webSocketDebuggerUrl);
  const { browserContextId } = await browser.send("Target.createBrowserContext", {});
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId });
  browser.close();
  state[name] = targetId;
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  return targetId;
}

const session = process.argv[2];
if (!session) throw new Error("usage: node drive.mjs <session> < script.js");
const body = fs.readFileSync(0, "utf8");
const targetId = await targetFor(session);
const cdp = await connect(`ws://127.0.0.1:${PORT}/devtools/page/${targetId}`);

const net = [];
const requests = new Map();
const errors = [];
let loaded = null;
cdp.on((msg) => {
  if (msg.method === "Network.requestWillBeSent") {
    requests.set(msg.params.requestId, { method: msg.params.request.method, url: msg.params.request.url });
  } else if (msg.method === "Network.responseReceived") {
    const req = requests.get(msg.params.requestId);
    if (req && req.url.includes("/api/")) {
      net.push({ method: req.method, url: req.url.replace(/^https?:\/\/[^/]+/, ""), status: msg.params.response.status, id: msg.params.requestId });
    }
  } else if (msg.method === "Runtime.exceptionThrown") {
    errors.push(`exception: ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
  } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    errors.push(`console.error: ${msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400)}`);
  } else if (msg.method === "Page.javascriptDialogOpening") {
    // A native confirm (beforeunload): note it and let the navigation go on.
    errors.push(`native dialog (${msg.params.type}): ${msg.params.message}`);
    cdp.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
  } else if (msg.method === "Page.loadEventFired" && loaded) {
    loaded();
    loaded = null;
  }
});
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Network.enable");
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

async function evaluate(expression) {
  const res = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) {
    throw new Error(`page eval: ${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`);
  }
  return res.result.value;
}

// The visible element a user would aim at: `css=…` or its text.
const LOCATE = `(target, nth, within) => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const root = within ? document.querySelector(within) : document;
  if (!root) return { error: "no container " + within };
  let found;
  if (target.startsWith("css=")) {
    found = [...root.querySelectorAll(target.slice(4))].filter(visible);
  } else {
    const norm = (s) => (s ?? "").replace(/\\s+/g, " ").trim();
    const nodes = [...root.querySelectorAll('button, a, [role=button], [role=tab], [role=menuitem], [role=option], [role=checkbox], [role=radio], [role=combobox], label, summary, tr, li, input[type=submit], [data-slot=sidebar-menu-button]')].filter(visible);
    const label = (el) => norm(el.innerText || el.value || el.getAttribute("aria-label"));
    found = nodes.filter((el) => label(el) === target || norm(el.getAttribute("aria-label")) === target);
    if (!found.length) found = nodes.filter((el) => label(el).includes(target));
    // The innermost matches: a row containing a matching button is not the target.
    found = found.filter((el) => !found.some((other) => other !== el && el.contains(other)));
  }
  const el = found[nth ?? 0];
  if (!el) return { error: "not found: " + target + " (" + found.length + " matches)" };
  el.scrollIntoView({ block: "center", inline: "center" });
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, count: found.length, tag: el.tagName, disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true", text: (el.innerText || el.value || "").replace(/\\s+/g, " ").trim().slice(0, 80) };
}`;

async function locate(target, opts = {}) {
  const deadline = Date.now() + (opts.timeout ?? 8000);
  for (;;) {
    const hit = await evaluate(`(${LOCATE})(${JSON.stringify(target)}, ${opts.nth ?? 0}, ${JSON.stringify(opts.within ?? null)})`);
    if (!hit.error) return hit;
    if (Date.now() > deadline) throw new Error(hit.error);
    await sleep(200);
  }
}

const KEYS = {
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
};

const p = {
  sleep,
  eval: evaluate,
  async goto(url) {
    const done = new Promise((r) => (loaded = r));
    await cdp.send("Page.navigate", { url });
    await Promise.race([done, sleep(15000)]);
    await sleep(800);
  },
  url: () => evaluate("location.href"),
  text: (selector) =>
    evaluate(selector ? `document.querySelector(${JSON.stringify(selector)})?.innerText ?? null` : "document.body.innerText"),
  async waitText(text, timeout = 12000) {
    const deadline = Date.now() + timeout;
    for (;;) {
      if (await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`)) return true;
      if (Date.now() > deadline) throw new Error(`text never appeared: ${text}`);
      await sleep(200);
    }
  },
  async waitGone(text, timeout = 12000) {
    const deadline = Date.now() + timeout;
    for (;;) {
      if (!(await evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`))) return true;
      if (Date.now() > deadline) throw new Error(`text never went away: ${text}`);
      await sleep(200);
    }
  },
  has: (text) => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`),
  locate,
  async click(target, opts = {}) {
    const hit = await locate(target, opts);
    if (hit.disabled && !opts.force) throw new Error(`disabled: ${target}`);
    await sleep(120);
    const at = await locate(target, { ...opts, timeout: 1000 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1 });
    await sleep(opts.settle ?? 500);
    return at;
  },
  async fill(target, value, opts = {}) {
    await p.click(target, { ...opts, settle: 150 });
    await evaluate("document.activeElement && document.activeElement.select && document.activeElement.select()");
    if (value === "") {
      await p.press("Backspace");
    } else {
      await cdp.send("Input.insertText", { text: value });
    }
    await sleep(200);
  },
  async press(name) {
    const key = KEYS[name];
    if (!key) throw new Error(`unknown key ${name}`);
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", ...key });
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
    await sleep(300);
  },
  async shot(name, opts = {}) {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!opts.full });
    const file = path.join(SHOTS, `${name}.png`);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  },
  // The /api calls the page made during this run: "POST /api/… → 201".
  net: (filter) =>
    net.filter((n) => !filter || n.url.includes(filter)).map((n) => `${n.method} ${n.url} → ${n.status}`),
  async body(filter) {
    const hit = [...net].reverse().find((n) => n.url.includes(filter));
    if (!hit) return null;
    try {
      const res = await cdp.send("Network.getResponseBody", { requestId: hit.id });
      return res.body;
    } catch {
      return null;
    }
  },
  errors: () => errors,
  // Files the page offers go to `dir` (headless Chrome drops them otherwise).
  async allowDownloads(dir) {
    fs.mkdirSync(dir, { recursive: true });
    const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    const browser = await connect(version.webSocketDebuggerUrl);
    const { targetInfos } = await browser.send("Target.getTargets");
    const mine = targetInfos.find((t) => t.targetId === targetId);
    await browser.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      browserContextId: mine.browserContextId,
      downloadPath: dir,
    });
    browser.close();
  },
  async viewport(width, height, mobile = false) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    await sleep(600);
  },
};

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
try {
  await new AsyncFunction("p", body)(p);
} catch (error) {
  console.log(`!! ${error.message}`);
  try {
    console.log(`   at ${await p.url()}`);
    console.log(`   shot: ${await p.shot(`error-${Date.now()}`)}`);
  } catch {}
  process.exitCode = 1;
}
cdp.close();
