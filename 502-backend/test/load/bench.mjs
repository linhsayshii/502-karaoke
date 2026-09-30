// Load test against a backend running on data from generate.sql (see
// docs/resource-rules.md §6): 10 cashiers (2 per branch) open rooms, order and
// check out while N people download every report the way the Tải báo cáo page
// does (`concurrency` reports at a time; half one branch, half the chain).
//   node bench.mjs single <from> <to>        each report alone, one after another
//   node bench.mjs load <from> <to> [downloaders=10] [concurrency=2]
// SOCKETS=1: also holds 20 WebSockets (10 cashiers, 5 branch managers, 5 chain-manager screens).
// Env: BASE (default http://localhost:14100/api; point it at the frontend's /api
// to go through the Next.js proxy as in production), DISTINCT=1 (no two
// downloads alike), DURATION (seconds the cashiers work when downloaders=0),
// STAFF=n floor-staff phones (log in within LOGIN_SPREAD seconds, default 3, then refresh the
// room map every 30 s and the room they serve every 15 s, like the app);
// DURATION also keeps everyone working that long after the downloads end.
// Approvals flows (needs the sales_approvals migration): 1 session in 5 asks for
// a 5% discount as the cashier and the branch manager approves it; every
// session locks the time before checkout; 5 manager screens (one per branch)
// poll GET /discount-requests/pending-count every 15 s.
const BASE = process.env.BASE ?? 'http://localhost:14100/api';
const [mode, from, to, nDl = '10', conc = '2'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// SOCKETS=1: cashiers and manager screens hold a WebSocket for the whole run,
// as the app does; events received and unexpected closes are counted.
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';
const wsStats = { opened: 0, ready: 0, events: 0, closes: 0 };
function holdSocket(token, stop) {
  if (!process.env.SOCKETS) return Promise.resolve();
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    wsStats.opened++;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
    ws.onmessage = (e) => (JSON.parse(e.data).type === 'ready' ? wsStats.ready++ : wsStats.events++);
    ws.onclose = () => { if (!stop.done) wsStats.closes++; resolve(); };
    ws.onerror = () => {};
    const check = setInterval(() => { if (stop.done) { clearInterval(check); ws.close(1000); } }, 500);
  });
}

async function call(token, method, url, body) {
  const t = performance.now();
  const res = await fetch(BASE + url, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, ms: performance.now() - t };
}
async function login(username) {
  const res = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: '12345678' }),
  });
  return (await res.json()).access_token;
}

function reportUrls(branch, groupBy = 'month', shift = 0) {
  // DISTINCT=1: each chain download starts `shift` days later, so no two are identical
  const f = new Date(new Date(from + 'T00:00:00Z').getTime() + shift * 86400000).toISOString().slice(0, 10);
  const r = new URLSearchParams({ ...(branch ? { branch } : {}), from: f, to }).toString();
  const urls = [
    `/reports/revenue?${r}&groupBy=${groupBy}`,
    ...['cskh', 'server', 'cashier'].map((role) => `/reports/staff?${r}&role=${role}`),
    `/reports/rooms?${r}&by=room`, `/reports/rooms?${r}&by=type`,
    `/reports/products?${r}&by=product`, `/reports/products?${r}&by=category`,
    `/reports/hours?${r}`, `/reports/profit?${r}&groupBy=${groupBy}`, `/reports/inventory?${r}`,
  ];
  // Sổ quỹ and Hóa đơn: branch-only lists of Tải báo cáo (the sales pool).
  if (branch) urls.push(`/funds/summary?${r}`, `/funds?${r}`, `/orders?${r}`);
  else urls.push(`/reports/branches?from=${from}&to=${to}&groupBy=${groupBy}`);
  return urls;
}

const stats = {};
const record = (name, r) => {
  const s = (stats[name] ??= { ms: [], errors: {} });
  s.ms.push(r.ms);
  if (r.status >= 400) s.errors[r.status] = (s.errors[r.status] ?? 0) + 1;
};
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
function report() {
  for (const [name, s] of Object.entries(stats)) {
    const e = Object.keys(s.errors).length ? ' errors ' + JSON.stringify(s.errors) : '';
    console.log(`${name.padEnd(22)} n=${String(s.ms.length).padStart(4)} p50=${pct(s.ms, .5).toFixed(0).padStart(6)}ms p95=${pct(s.ms, .95).toFixed(0).padStart(6)}ms max=${Math.max(...s.ms).toFixed(0).padStart(6)}ms${e}`);
  }
  if (process.env.SOCKETS) console.log('ws', wsStats);
}

async function download(token, branch, shift = 0) {
  const urls = reportUrls(branch, 'month', shift);
  const t = performance.now();
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      const r = await call(token, 'GET', url);
      record('report ' + url.split('?')[0].replace('/reports/', ''), r);
    }
  };
  await Promise.all(Array.from({ length: Number(conc) }, worker));
  return performance.now() - t;
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];

async function cashier(token, branch, rooms, products, staff, stop, managerToken) {
  let sessions = 0;
  while (!stop.done) {
    const room = rooms[Math.floor(Math.random() * rooms.length)];
    record('GET /rooms', await call(token, 'GET', `/rooms?branch=${branch}`));
    const cskh = staff.filter((s) => s.position === 'CSKH');
    const servers = staff.filter((s) => s.position === 'SERVER');
    const open = await call(token, 'POST', '/orders', {
      roomId: room,
      cskhId: cskh.length ? pick(cskh).id : undefined,
      serverId: servers.length ? pick(servers).id : undefined,
    });
    record('open room', open);
    if (open.status >= 400) { await sleep(300); continue; }
    const id = open.data.id;
    for (let k = 1; k <= 2; k++) {
      const items = products.slice(0, 2 + k).map((p) => ({ productId: p, quantity: k }));
      record('order items', await call(token, 'PATCH', `/orders/${id}`, { items }));
      await sleep(500);
    }
    record('GET order', await call(token, 'GET', `/orders/${id}`));
    record('preview', await call(token, 'GET', `/orders/${id}/preview`));
    // 1 session in 5: a 5% discount the cashier requests and the manager approves
    if (++sessions % 5 === 0) {
      const adj = await call(token, 'POST', `/orders/${id}/adjustments`, { discountPercent: 5, note: 'bench' });
      record('discount request', adj);
      const requestId = adj.data?.discountRequests?.[0]?.id;
      if (requestId) record('discount approve', await call(managerToken, 'POST', `/discount-requests/${requestId}/approve`, {}));
    }
    record('lock-time', await call(token, 'POST', `/orders/${id}/lock-time`));
    record('checkout', await call(token, 'POST', `/orders/${id}/checkout`, { paymentMethod: 'CASH' }));
    await sleep(500);
  }
}

// A floor-staff phone: the room map every 30 s, the room served every 15 s.
async function staffPhone(username, branch, stop) {
  // everyone opens the app at the start of the shift, within LOGIN_SPREAD seconds
  await sleep(Math.random() * Number(process.env.LOGIN_SPREAD ?? 3) * 1000);
  const t = performance.now();
  const res = await fetch(BASE + '/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: '12345678' }),
  });
  record('staff login', { ms: performance.now() - t, status: res.status });
  if (!res.ok) return;
  const token = (await res.json()).access_token;
  record('staff GET /auth/me', await call(token, 'GET', '/auth/me'));
  await sleep(Math.random() * 15000);
  let tick = 0;
  while (!stop.done) {
    if (tick % 2 === 0) {
      const rooms = await call(token, 'GET', `/rooms?branch=${branch}`);
      record('staff GET /rooms', rooms);
      const served = Array.isArray(rooms.data) ? rooms.data.find((r) => r.activeOrderId) : null;
      if (served) record('staff GET order', await call(token, 'GET', `/orders/${served.activeOrderId}`));
    }
    tick++;
    await sleep(15000);
  }
}

// A manager's screen: the sidebar badge polls the pending count every 15 s.
async function managerScreen(token, stop) {
  await sleep(Math.random() * 15000);
  while (!stop.done) {
    record('pending-count', await call(token, 'GET', '/discount-requests/pending-count'));
    for (let waited = 0; waited < 15000 && !stop.done; waited += 500) await sleep(500);
  }
}

if (mode === 'single') {
  const admin = await login('admin');
  for (const [label, branch] of [['cs1', 'cs1'], ['chain', null]]) {
    for (const url of reportUrls(branch)) {
      const r = await call(admin, 'GET', url);
      console.log(label.padEnd(6), url.split('?')[0].padEnd(20), r.status, r.ms.toFixed(0) + 'ms', url.includes('role=') || url.includes('by=') ? url.split('&').pop() : '');
    }
  }
} else {
  const admin = await login('admin');
  const stop = { done: false };
  const cashiers = [];
  const screens = [];
  for (let b = 1; b <= 5; b++) {
    const branch = 'cs' + b;
    const rooms = (await call(admin, 'GET', `/rooms?branch=${branch}`)).data.filter((r) => r.status === 'AVAILABLE').map((r) => r.id);
    const products = (await call(admin, 'GET', `/products?branch=${branch}`)).data.map((p) => p.id);
    const staff = (await call(admin, 'GET', `/users/floor-staff?branch=${branch}`)).data;
    // the branch manager approves discounts (the chain manager if the branch has none)
    const manager = (await login(`load_ql_cs${b}`).catch(() => null)) ?? admin;
    screens.push(managerScreen(manager, stop));
    screens.push(holdSocket(manager, stop));
    for (let k = 1; k <= 2; k++) {
      const token = await login(`load_tn${k}_cs${b}`);
      cashiers.push(holdSocket(token, stop));
      cashiers.push(cashier(token, branch, rooms.slice((k - 1) * 20, k * 20), products, staff, stop, manager));
    }
  }
  // 5 chain-manager screens: one user, under the 5-sockets-per-user cap
  for (let i = 0; i < 5; i++) screens.push(holdSocket(admin, stop));
  // STAFF phones spread over the 5 branches (accounts load_nv1..40_csN; more
  // phones than accounts reuse them, as one person with two devices would).
  const phones = [];
  for (let i = 0; i < Number(process.env.STAFF ?? 0); i++) {
    const b = 1 + (i % 5);
    const k = 1 + (Math.floor(i / 5) % 40);
    phones.push(staffPhone(`load_nv${k}_cs${b}`, `cs${b}`, stop));
  }
  await sleep(2000);
  const tDl = performance.now();
  const downloads = [];
  for (let i = 0; i < Number(nDl); i++) {
    // half branch managers on their branch, half the whole chain
    const chain = i % 2 === 1;
    const token = chain ? admin : await login(`load_ql_cs${1 + (i / 2 % 5 | 0)}`);
    downloads.push(download(token, chain ? null : `cs${1 + (i / 2 % 5 | 0)}`, process.env.DISTINCT ? i : 0).then((ms) => record('== whole download', { ms, status: 200 })));
  }
  await Promise.all(downloads);
  await sleep(Number(process.env.DURATION ?? (Number(nDl) === 0 ? 30 : 0)) * 1000);
  console.log(`all downloads done in ${((performance.now() - tDl) / 1000).toFixed(1)}s`);
  stop.done = true;
  await Promise.all([...cashiers, ...phones, ...screens]);
  report();
}
