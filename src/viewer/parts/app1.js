<script>
const DATA = /*__REPOMIND_DATA__*/null;

(function () {
  'use strict';
  // Model state is `let` so live mode can swap in another version without a reload (see setData).
  let G, DIFF, BASE;
  const BLOB = DATA.blobBase;
  const LIVE = DATA.live || null;
  const $ = (s) => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---------- Model ----------
  const LAYERS = [
    ['client', 'Users'],
    ['app', 'Apps & services'],
    ['module', 'Modules'],
    ['data', 'Data'],
    ['cloud', 'Cloud'],
    ['external', 'External services'],
    ['cicd', 'CI / CD'],
  ];
  const LAYER_NAME = Object.fromEntries(LAYERS);
  const SEV = ['critical', 'high', 'medium', 'low'];
  const TIER = { free: 'free', low: '$', medium: '$$', high: '$$$' };
  const ICON = {
    client: 'USR', app: 'APP', service: 'API', library: 'LIB', module: 'MOD', database: 'DB', cache: 'KV', queue: 'Q',
    bucket: 'OBJ', cloud: 'CLD', network: 'NET', secret: 'KEY', external: 'EXT', pipeline: 'CI',
  };
  const TECH_ICON = { 'Cloud Run': 'RUN', 'Cloud SQL': 'SQL', 'Next.js': 'NXT', 'Expo / React Native': 'RN', Express: 'API', 'GitHub Actions': 'GHA', Hosting: 'WEB', 'Cloud Build': 'GCB' };
  const EDGE_GROUP = { reads: 'data', writes: 'data', sends: 'integration', calls: 'call', uses: 'call', deploys: 'deploy', 'runs-on': 'deploy', depends: 'structure', contains: 'structure', protects: 'security' };
  const EDGE_GROUP_NAME = { data: 'Data access', integration: 'Messages out', call: 'Calls / uses', deploy: 'Deploy / hosting', structure: 'Code structure', security: 'Protection' };

  const ekey = (e) => `${e.from}|${e.kind}|${e.to}`;
  let nodesById, baseOnly, allNodes, removedEdges, addedEdges, allEdges, findingsByNode, newFindings;
  function setData(d) {
    G = d.graph;
    DIFF = d.diff;
    BASE = d.base;
    nodesById = new Map(G.nodes.map((n) => [n.id, n]));
    baseOnly = new Map();
    if (BASE && DIFF) for (const n of BASE.nodes) if (!nodesById.has(n.id)) baseOnly.set(n.id, { ...n, _removed: true });
    allNodes = new Map([...nodesById, ...baseOnly]);
    removedEdges = new Set(DIFF ? DIFF.removedEdges : []);
    addedEdges = new Set(DIFF ? DIFF.addedEdges : []);
    allEdges = [...G.edges];
    if (BASE && DIFF) for (const e of BASE.edges) if (removedEdges.has(ekey(e))) allEdges.push({ ...e, _removed: true });
    findingsByNode = new Map();
    for (const f of G.findings) {
      if (!f.node) continue;
      if (!findingsByNode.has(f.node)) findingsByNode.set(f.node, []);
      findingsByNode.get(f.node).push(f);
    }
    newFindings = new Set(DIFF ? DIFF.newFindings : []);
    if (DIFF) VIEWS.changes = changesView();
    else delete VIEWS.changes;
  }
  const worstSev = (id) => {
    const fs = findingsByNode.get(id);
    return fs ? SEV.find((s) => fs.some((f) => f.severity === s)) : null;
  };
  const changeOf = (id) => {
    if (!DIFF) return null;
    if (baseOnly.has(id)) return 'removed';
    if (DIFF.added.includes(id)) return 'added';
    if (DIFF.changed.some((c) => c.id === id)) return 'changed';
    return null;
  };

  // ---------- Views ----------
  const isModuleEdge = (e) => allNodes.get(e.from)?.kind === 'module' || allNodes.get(e.to)?.kind === 'module';
  const VIEWS = {
    overview: {
      name: 'Overview',
      blurb: 'Everything the repo builds, uses and runs on. Cloud-internal wiring is in Infrastructure.',
      nodes: (n) => n.kind !== 'module' && !n._removed,
      edges: (e) => !isModuleEdge(e) && e.kind !== 'contains' && !e._removed && !(allNodes.get(e.from)?.layer === 'cloud' && allNodes.get(e.to)?.layer === 'cloud'),
    },
    code: {
      name: 'Code',
      blurb: 'Apps, their feature modules, and what each module touches.',
      nodes: (n, touched) => !n._removed && (n.layer === 'app' || n.kind === 'module' || touched.has(n.id)),
      edges: (e) => !e._removed && (isModuleEdge(e) || (e.kind === 'depends' && allNodes.get(e.from)?.layer === 'app' && allNodes.get(e.to)?.layer === 'app')),
      touched: () => {
        const s = new Set();
        for (const e of G.edges) if (allNodes.get(e.from)?.kind === 'module') s.add(e.to);
        return s;
      },
    },
    infra: {
      name: 'Infrastructure',
      blurb: 'Where each app runs, where data is stored, how it is deployed and what protects it.',
      nodes: (n, touched) => !n._removed && n.kind !== 'module' && (['data', 'cloud', 'cicd'].includes(n.layer) || (n.layer === 'app' && n.kind !== 'library') || touched.has(n.id)),
      edges: (e) => !e._removed && !isModuleEdge(e) && ['deploys', 'runs-on', 'uses', 'protects', 'reads', 'writes', 'sends'].includes(e.kind) && allNodes.get(e.to)?.layer !== 'external',
      touched: () => {
        const s = new Set();
        for (const e of G.edges) if (e.kind === 'deploys' || e.kind === 'runs-on') { s.add(e.from); s.add(e.to); }
        return s;
      },
    },
    integrations: {
      name: 'Integrations',
      blurb: 'Third-party and cloud services the code talks to, and who calls them.',
      nodes: (n, touched) => !n._removed && n.kind !== 'module' && n.layer !== 'cicd' && (n.layer === 'external' || (n.layer === 'app' && n.kind !== 'library') || touched.has(n.id)),
      edges: (e) => !e._removed && !isModuleEdge(e) && ['calls', 'sends', 'reads', 'writes', 'uses'].includes(e.kind) && allNodes.get(e.from)?.layer === 'app',
      touched: () => {
        const s = new Set();
        for (const e of G.edges) {
          const f = allNodes.get(e.from), t = allNodes.get(e.to);
          if (f?.layer === 'app' && t && (t.layer === 'cloud' || t.layer === 'data') && !String(t.id).startsWith('tf:') && e.kind !== 'runs-on') s.add(t.id);
        }
        return s;
      },
    },
    risks: {
      name: 'Risks',
      blurb: 'Security findings placed on the components they affect.',
      nodes: (n) => n.kind !== 'module' && !n._removed,
      edges: (e) => !isModuleEdge(e) && e.kind !== 'contains' && !e._removed,
      focus: (id) => findingsByNode.has(id),
    },
  };
  function changesView() {
    return {
      name: 'Changes',
      blurb: `What this change adds, removes and modifies${DIFF.baseCommit ? ` (${DIFF.baseCommit} → ${DIFF.headCommit})` : ''}.`,
      nodes: (n) => n.kind !== 'module',
      edges: (e) => !isModuleEdge(e) && e.kind !== 'contains',
      focus: (id) => !!changeOf(id) || (findingsByNode.get(id) || []).some((f) => newFindings.has(f.id)) || allEdges.some((e) => (e.from === id || e.to === id) && (addedEdges.has(ekey(e)) || e._removed)),
    };
  }
  setData(DATA);

  // ---------- Layout ----------
  const CARD_W = 214, CARD_H = 62, GAP_Y = 14, LANE_PAD = 18, LANE_GAP = 84, HEAD = 46;
  const LANE_W = CARD_W + LANE_PAD * 2;
  const kindRank = (n) => ['client', 'app', 'service', 'library', 'module', 'database', 'cache', 'queue', 'cloud', 'bucket', 'secret', 'network', 'external', 'pipeline'].indexOf(n.kind);

  function layout(viewKey) {
    const v = VIEWS[viewKey];
    const touched = v.touched ? v.touched() : new Set();
    const nodes = [...allNodes.values()].filter((n) => v.nodes(n, touched));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = allEdges.filter((e) => ids.has(e.from) && ids.has(e.to) && v.edges(e));
    const lanes = LAYERS.map(([k]) => k).filter((k) => nodes.some((n) => n.layer === k));
    const laneOf = new Map(nodes.map((n) => [n.id, lanes.indexOf(n.layer)]));
    const cols = lanes.map((k) =>
      nodes.filter((n) => n.layer === k).sort((a, b) => (a.parent || '').localeCompare(b.parent || '') || kindRank(a) - kindRank(b) || a.label.localeCompare(b.label)),
    );
    // Barycenter ordering: put each card near the cards it connects to.
    const nbrs = new Map(nodes.map((n) => [n.id, []]));
    for (const e of edges) {
      nbrs.get(e.from).push(e.to);
      nbrs.get(e.to).push(e.from);
    }
    const pos = new Map();
    cols.forEach((c) => c.forEach((n, i) => pos.set(n.id, (i + 0.5) / c.length)));
    for (let iter = 0; iter < 8; iter++) {
      const order = iter % 2 ? [...cols.keys()].reverse() : [...cols.keys()];
      for (const ci of order) {
        const c = cols[ci];
        const bc = new Map(
          c.map((n) => {
            const ns = nbrs.get(n.id).filter((x) => laneOf.get(x) !== ci);
            return [n.id, ns.length ? ns.reduce((s, x) => s + pos.get(x), 0) / ns.length : pos.get(n.id)];
          }),
        );
        c.sort((a, b) => bc.get(a.id) - bc.get(b.id) || a.label.localeCompare(b.label));
        c.forEach((n, i) => pos.set(n.id, (i + 0.5) / c.length));
      }
    }
    const maxRows = Math.max(1, ...cols.map((c) => c.length));
    const inner = maxRows * (CARD_H + GAP_Y) - GAP_Y;
    const laneH = HEAD + inner + LANE_PAD + 4;
    const place = new Map();
    cols.forEach((c, ci) => {
      const x = ci * (LANE_W + LANE_GAP) + LANE_PAD;
      const colH = c.length * (CARD_H + GAP_Y) - GAP_Y;
      const y0 = HEAD + (inner - colH) / 2;
      c.forEach((n, i) => place.set(n.id, { x, y: y0 + i * (CARD_H + GAP_Y), col: ci }));
    });
    return { nodes, edges, lanes, cols, place, laneH, width: Math.max(LANE_W, lanes.length * (LANE_W + LANE_GAP) - LANE_GAP) };
  }

  // ---------- Render ----------
  const state = { view: 'overview', selected: null, query: '', L: null };
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const truncate = (s, max) => {
    s = String(s ?? '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  };

  function markers() {
    const defs = $('#defs');
    defs.innerHTML = '';
    for (const g of Object.keys(EDGE_GROUP_NAME).concat(['added', 'removed'])) {
      const m = el('marker', { id: `arr-${g}`, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, defs);
      const color = g === 'added' ? 'var(--c-added)' : g === 'removed' ? 'var(--c-removed)' : `var(--e-${g})`;
      el('path', { d: 'M0 0L10 5L0 10z', fill: color }, m);
    }
    const f = el('filter', { id: 'shadow', x: '-10%', y: '-10%', width: '120%', height: '140%' }, defs);
    el('feDropShadow', { dx: '0', dy: '1', stdDeviation: '1.5', 'flood-color': '#0f172a', 'flood-opacity': '0.08' }, f);
  }

  // ---------- Sketch (rough.js) ----------
  const sketchOn = () => document.body.classList.contains('sketch') && typeof rough !== 'undefined';
  // Stable seed per id, so the same commit always gives the same wobble (PRD v2, R2).
  const seedOf = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0) % 2147483646 + 1;
  };
  let rc = null;
  const SEVERE = new Set(['critical', 'high']);
  function sketchFill(n) {
    const ch = changeOf(n.id);
    if (state.view === 'changes' && ch) return { added: '--f-data', changed: '--f-external', removed: '--f-risk' }[ch];
    if (state.view === 'risks' && (findingsByNode.get(n.id) || []).some((f) => SEVERE.has(f.severity))) return '--f-risk';
    return `--f-${n.layer}`;
  }

  function render() {
    const L = layout(state.view);
    state.L = L;
    const lanesG = $('#lanes'), edgesG = $('#edges'), cardsG = $('#cards');
    lanesG.innerHTML = edgesG.innerHTML = cardsG.innerHTML = '';

    const sk = sketchOn();
    rc = sk ? rough.svg($('#canvas')) : null;
    // GitHub dark: outlines in GitHub's muted grey, not chalk white, so the sketch sits quietly on the canvas.
    const dark = document.documentElement.classList.contains('dark');
    const ink = dark ? '#8b949e' : cssVar('--ink'), pencil = dark ? '#30363d' : cssVar('--pencil');

    L.lanes.forEach((k, i) => {
      const x = i * (LANE_W + LANE_GAP);
      if (sk) {
        lanesG.appendChild(rc.rectangle(x, 0, LANE_W, L.laneH, { seed: seedOf('lane:' + k), stroke: pencil, strokeWidth: 1.3, roughness: 1.4, strokeLineDash: [8, 7] }));
        el('text', { x: x + LANE_PAD, y: 32, class: 'lane-title' }, lanesG).textContent = LAYER_NAME[k];
        el('text', { x: x + LANE_W - LANE_PAD, y: 32, class: 'lane-count', 'text-anchor': 'end' }, lanesG).textContent = L.cols[i].length;
        return;
      }
      el('rect', { x, y: 0, width: LANE_W, height: L.laneH, rx: 16, class: 'lane-bg' }, lanesG);
      el('rect', { x: x + LANE_PAD, y: 17, width: 4, height: 14, rx: 2, fill: `var(--l-${k})` }, lanesG);
      el('text', { x: x + LANE_PAD + 12, y: 28.5, class: 'lane-title' }, lanesG).textContent = LAYER_NAME[k].toUpperCase();
      el('text', { x: x + LANE_W - LANE_PAD, y: 28.5, class: 'lane-count', 'text-anchor': 'end' }, lanesG).textContent = L.cols[i].length;
    });

    // Ports: spread edge ends along each card side, ordered by where the other end sits.
    const sides = [];
    const portLists = new Map();
    for (const e of L.edges) {
      const a = L.place.get(e.from), b = L.place.get(e.to);
      const sa = a.col <= b.col ? 'r' : 'l';
      const sb = a.col < b.col ? 'l' : 'r';
      const item = { e, sa, sb };
      sides.push(item);
      for (const [id, side, other, role] of [[e.from, sa, b, 'a'], [e.to, sb, a, 'b']]) {
        const k = `${id}|${side}`;
        if (!portLists.has(k)) portLists.set(k, []);
        portLists.get(k).push({ item, role, oy: other.y });
      }
    }
    for (const [k, list] of portLists) {
      const id = k.split('|')[0];
      const p = L.place.get(id);
      list.sort((u, w) => u.oy - w.oy);
      const n = list.length;
      const span = Math.min(CARD_H - 18, (n - 1) * 8);
      list.forEach((entry, i) => {
        entry.item[entry.role === 'a' ? 'y1' : 'y2'] = p.y + CARD_H / 2 - span / 2 + (n === 1 ? 0 : (i * span) / (n - 1));
      });
    }

    for (const it of sides) {
      const { e, sa, sb, y1, y2 } = it;
      const a = L.place.get(e.from), b = L.place.get(e.to);
      const x1 = sa === 'r' ? a.x + CARD_W : a.x;
      const x2 = sb === 'r' ? b.x + CARD_W : b.x;
      let d;
      if (sa === 'r' && sb === 'r') {
        const bulge = 30 + Math.min(44, Math.abs(y2 - y1) / 5);
        d = `M${x1} ${y1} C${x1 + bulge} ${y1}, ${x2 + bulge} ${y2}, ${x2 + 2} ${y2}`;
      } else {
        const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
        const s = sa === 'r' ? 1 : -1;
        d = `M${x1} ${y1} C${x1 + s * dx} ${y1}, ${x2 - s * dx} ${y2}, ${x2 - s * 2} ${y2}`;
      }
      const grp = EDGE_GROUP[e.kind] || 'call';
      const isAdded = DIFF && addedEdges.has(ekey(e)) && state.view === 'changes';
      const tone = e._removed ? 'removed' : isAdded ? 'added' : grp;
      const gEl = el('g', { class: `edge${e._removed ? ' removed' : ''}`, 'data-from': e.from, 'data-to': e.to }, edgesG);
      const stroke = tone === 'added' ? 'var(--c-added)' : tone === 'removed' ? 'var(--c-removed)' : `var(--e-${grp})`;
      if (sk) {
        const color = cssVar(stroke.slice(4, -1));
        const r = rc.path(d, { seed: seedOf(ekey(e)), stroke: color, strokeWidth: 1.6, roughness: 0.9, bowing: 1.2, strokeLineDash: e._removed ? [6, 5] : undefined });
        r.setAttribute('class', 'sk');
        const paths = r.querySelectorAll('path');
        if (paths.length) paths[paths.length - 1].setAttribute('marker-end', `url(#arr-${tone})`);
        gEl.appendChild(r);
      } else el('path', { d, class: 'line', stroke, 'marker-end': `url(#arr-${tone})` }, gEl);
      const hit = el('path', { d, class: 'hit' }, gEl);
      hit.addEventListener('mousemove', (ev) => showTip(ev, edgeTip(e)));
      hit.addEventListener('mouseleave', hideTip);
    }

    for (const n of L.nodes) {
      const p = L.place.get(n.id);
      const g = el('g', { class: 'card', transform: `translate(${p.x},${p.y})`, 'data-id': n.id }, cardsG);
      const ch = changeOf(n.id);
      if (sk) {
        // Opaque paper underneath so the hatching never shows lines through it; ring is the selection outline.
        el('rect', { class: 'body', width: CARD_W, height: CARD_H, rx: 6 }, g);
        const seed = seedOf(n.id);
        // Chalkboard mode: same fills at lower strength (PRD v2 style rules).
        const fill = cssVar(sketchFill(n)) + (document.documentElement.classList.contains('dark') ? '59' : '');
        g.appendChild(rc.rectangle(1, 1, CARD_W - 2, CARD_H - 2, { seed, fill, fillStyle: 'hachure', hachureGap: 6, fillWeight: 1.1, hachureAngle: -41, stroke: ink, strokeWidth: 1.8, roughness: 1.1, strokeLineDash: ch === 'removed' ? [7, 5] : undefined }));
        el('rect', { class: 'ring', x: -5, y: -5, width: CARD_W + 10, height: CARD_H + 10, rx: 10 }, g);
        g.appendChild(rc.circle(27, 31, 32, { seed: seed + 1, fill: cssVar(`--k-${n.layer}`), fillStyle: 'solid', stroke: ink, strokeWidth: 1.4, roughness: 0.9 }));
      } else {
        el('rect', { class: 'body', width: CARD_W, height: CARD_H, rx: 10, filter: 'url(#shadow)', 'stroke-dasharray': ch === 'removed' ? '5 4' : null }, g);
        if (ch) el('rect', { x: 0, y: 10, width: 4, height: CARD_H - 20, rx: 2, fill: `var(--c-${ch})` }, g);
        el('rect', { x: 12, y: 16, width: 30, height: 30, rx: 8, fill: `var(--l-${n.layer})` }, g);
      }
      el('text', { x: 27, y: 34.5, class: 'icon-text', 'text-anchor': 'middle' }, g).textContent = TECH_ICON[n.tech] || ICON[n.kind] || 'NOD';
      el('text', { x: 52, y: 28, class: 'label' }, g).textContent = truncate(n.label, 21);
      const parent = n.parent ? allNodes.get(n.parent)?.label : null;
      el('text', { x: 52, y: 45, class: 'tech' }, g).textContent = truncate(parent ? `${parent} · ${n.tech || ''}` : n.tech || LAYER_NAME[n.layer], n.cost && n.cost.tier !== 'free' ? 21 : 26);
      if (n.cost && n.cost.tier !== 'free') el('text', { x: CARD_W - 10, y: 45, class: 'cost', 'text-anchor': 'end' }, g).textContent = TIER[n.cost.tier];
      const sev = worstSev(n.id);
      if (sev) {
        el('circle', { cx: CARD_W - 4, cy: 4, r: 10, fill: `var(--s-${sev})`, stroke: 'var(--bg)', 'stroke-width': 2 }, g);
        el('text', { x: CARD_W - 4, y: 8, 'text-anchor': 'middle', fill: '#fff', 'font-size': '10.5', 'font-weight': '800' }, g).textContent = findingsByNode.get(n.id).length;
      }
      if (ch) {
        const w = ch === 'added' ? 38 : 64;
        el('rect', { x: CARD_W - w - 20, y: -8, width: w, height: 16, rx: 8, fill: `var(--c-${ch})` }, g);
        el('text', { x: CARD_W - w / 2 - 20, y: 3.5, 'text-anchor': 'middle', fill: '#fff', class: 'tag' }, g).textContent = ch === 'added' ? 'NEW' : ch.toUpperCase();
      }
      if (n.manual) el('text', { x: CARD_W - 10, y: 26, class: 'manual', 'text-anchor': 'end' }, g).textContent = 'manual';
      g.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!document.body.classList.contains('presenting')) select(n.id);
      });
      g.addEventListener('mouseenter', () => hover(n.id));
      g.addEventListener('mouseleave', () => hover(null));
    }
    applyHighlight();
    renderLegend();
  }

  function edgeTip(e) {
    const a = allNodes.get(e.from), b = allNodes.get(e.to);
    const ev = e.evidence?.[0];
    return `<b>${esc(a?.label)}</b> → <b>${esc(b?.label)}</b> · ${esc(e.label || e.kind)}${e._removed ? ' <i>(removed)</i>' : ''}${ev ? `<br><span style="opacity:.75">${esc(ev.file)}${ev.line ? ':' + ev.line : ''}${ev.note ? ' · ' + esc(ev.note) : ''}</span>` : ''}`;
  }
  function showTip(ev, html) {
    const t = $('#tooltip');
    t.innerHTML = html;
    t.style.display = 'block';
    const r = $('#stage').getBoundingClientRect();
    t.style.left = Math.max(8, Math.min(ev.clientX - r.left + 14, r.width - 370)) + 'px';
    t.style.top = ev.clientY - r.top + 14 + 'px';
  }
  function hideTip() {
    $('#tooltip').style.display = 'none';
  }

  let hoverId = null;
  function hover(id) {
    if (document.body.classList.contains('presenting')) return;
    hoverId = id;
    applyHighlight();
  }
  const matches = (n, q) => !!n && [n.label, n.tech, n.id, n.category, n.description].some((s) => String(s ?? '').toLowerCase().includes(q));

  function applyHighlight() {
    const focusId = hoverId || state.selected;
    const v = VIEWS[state.view];
    const q = state.query.toLowerCase();
    let near = null;
    if (focusId && state.L.place.has(focusId)) {
      near = new Set([focusId]);
      for (const e of state.L.edges) {
        if (e.from === focusId) near.add(e.to);
        if (e.to === focusId) near.add(e.from);
      }
    }
    document.querySelectorAll('.card').forEach((c) => {
      const id = c.dataset.id;
      const n = allNodes.get(id);
      let dim = false;
      if (near) dim = !near.has(id);
      else if (q) dim = !matches(n, q);
      else if (v.focus) dim = !v.focus(id);
      c.classList.toggle('dim', dim);
      c.classList.toggle('sel', id === state.selected);
      c.classList.toggle('match', !!q && matches(n, q));
    });
    document.querySelectorAll('.edge').forEach((g) => {
      const f = g.dataset.from, t = g.dataset.to;
      let hot = false, dim = false;
      if (near) {
        hot = f === focusId || t === focusId;
        dim = !hot;
      } else if (q) dim = true;
      else if (v.focus) dim = !(v.focus(f) && v.focus(t)) && !g.classList.contains('removed');
      g.classList.toggle('hot', hot);
      g.classList.toggle('dim', dim);
    });
  }

  function renderLegend() {
    const groups = new Set(state.L.edges.map((e) => EDGE_GROUP[e.kind] || 'call'));
    let h = [...groups].map((g) => `<span><i style="border-color:var(--e-${g})"></i>${EDGE_GROUP_NAME[g]}</span>`).join('');
    if (G.findings.length) h += SEV.map((s) => `<span><span class="dot" style="background:var(--s-${s})"></span>${s}</span>`).join('');
    if (state.view === 'changes') h += ['added', 'changed', 'removed'].map((s) => `<span><span class="dot" style="background:var(--c-${s})"></span>${s}</span>`).join('');
    h += `<span>$ · $$ · $$$ cost tier</span>`;
    $('#legend').innerHTML = h;
  }
