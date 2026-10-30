
  // ---------- Panel ----------
  const evLink = (ev) => {
    const label = `${esc(ev.file)}${ev.line ? ':' + ev.line : ''}`;
    const href = BLOB && ev.file && !ev.file.startsWith('.repomind') ? `${BLOB}/${ev.file}${ev.line ? '#L' + ev.line : ''}` : null;
    return `<div class="ev">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${label}</a>` : label}${ev.note ? ` <em>· ${esc(ev.note)}</em>` : ''}</div>`;
  };
  const findingHtml = (f) =>
    `<div class="finding" style="border-left-color:var(--s-${f.severity})" data-node="${esc(f.node || '')}"><div class="t"><span class="sev" style="color:var(--s-${f.severity})">${f.severity}</span>${esc(f.title)}${newFindings.has(f.id) ? ' <span class="status" style="background:var(--c-added)">NEW</span>' : ''}</div><div class="f">${esc(f.file || '')}${f.line ? ':' + f.line : ''}</div>${f.fix ? `<div class="fix">↳ ${esc(f.fix)}</div>` : ''}</div>`;
  const statusPill = (c) => `<span class="status" style="background:var(--c-${c})">${c === 'added' ? 'NEW' : c.toUpperCase()}</span>`;

  function panelSummary() {
    const P = $('#panel');
    const count = (l) => G.nodes.filter((n) => n.layer === l).length;
    const sevCount = Object.fromEntries(SEV.map((s) => [s, G.findings.filter((f) => f.severity === s).length]));
    const total = G.findings.length || 1;
    const rank = { high: 0, medium: 1, low: 2 };
    const paid = G.nodes
      .filter((n) => n.cost && n.cost.tier !== 'free' && ['external', 'cloud', 'data'].includes(n.layer))
      .sort((a, b) => rank[a.cost.tier] - rank[b.cost.tier] || a.label.localeCompare(b.label));
    const v = VIEWS[state.view];
    let h = `<div class="chips"><span class="chip">${esc(v.name)} view</span></div><p>${esc(v.blurb)}</p>`;

    if (state.view === 'changes' && DIFF) {
      const comps0 = (ids) => ids.map((id) => allNodes.get(id)).filter((n) => n && n.kind !== 'module');
      const nNew = G.findings.filter((f) => newFindings.has(f.id)).length;
      // Flow 4 · Compare versions: title + dated range chips (dates come from the live timeline when served).
      const vDate = (sha) => (window.__rmVersions || []).find((v) => v.sha === sha);
      const dateOf = (sha) => { const v = vDate(sha); return v ? ' · ' + new Date(v.committedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''; };
      h += `<h2 style="margin:4px 0 0">What changed</h2>`;
      if (DIFF.baseCommit) h += `<div class="range"><span>${esc(DIFF.baseCommit)}${esc(dateOf(DIFF.baseCommit))}</span>→<span class="to">${esc(DIFF.headCommit || 'now')}${esc(dateOf(DIFF.headCommit))}</span></div>`;
      h += `<div class="deltas"><div class="delta add"><b>+${comps0(DIFF.added).length}</b><span>added</span></div><div class="delta rem"><b>−${comps0(DIFF.removed).length}</b><span>removed</span></div><div class="delta risk"><b>${nNew}</b><span>new risks</span></div></div>`;
      const list = (ids, c) =>
        ids.map((id) => allNodes.get(id)).filter((n) => n && n.kind !== 'module')
          .map((n) => `<div class="rel" data-go="${esc(n.id)}">${statusPill(c)}<span class="n">${esc(n.label)}</span><span class="tt">${esc(n.tech || '')}</span></div>`).join('');
      const comps = list(DIFF.added, 'added') + list(DIFF.changed.map((c) => c.id), 'changed') + list(DIFF.removed, 'removed');
      h += `<h3>Components</h3>${comps || '<p>No component changes.</p>'}`;
      const nf = G.findings.filter((f) => newFindings.has(f.id));
      h += `<h3>New risks · ${nf.length}</h3>${nf.map(findingHtml).join('') || '<p>None.</p>'}`;
      if (DIFF.resolvedFindings.length) h += `<h3>Fixed risks</h3><ul class="plain">${DIFF.resolvedFindings.map((f) => `<li><s>${esc(f.title)}</s> <span class="mono muted">${esc(f.file || '')}</span></li>`).join('')}</ul>`;
      const paidOf = (ids) => comps0(ids).filter((n) => n.cost && n.cost.tier !== 'free');
      const cost = [...paidOf(DIFF.added).map((n) => `↑ ${esc(n.label)} · ${TIER[n.cost.tier]} ${esc(n.cost.model)}`), ...paidOf(DIFF.removed).map((n) => `↓ ${esc(n.label)} · ${TIER[n.cost.tier]} ${esc(n.cost.model)}`)];
      if (cost.length) h += `<h3>Cost</h3><p>${cost.join('<br>')}</p>`;
      P.innerHTML = h;
      return wirePanel();
    }

    h += `<h3>At a glance</h3><div class="stats">
      <div class="stat"><b>${count('app')}</b><span>apps & services</span></div>
      <div class="stat"><b>${count('module')}</b><span>modules</span></div>
      <div class="stat"><b>${count('data')}</b><span>data stores</span></div>
      <div class="stat"><b>${count('cloud')}</b><span>cloud resources</span></div>
      <div class="stat"><b>${count('external')}</b><span>external services</span></div>
      <div class="stat"><b>${count('cicd')}</b><span>pipelines</span></div></div>`;
    h += `<h3>Open risks · ${G.findings.length}</h3><div class="sevbar">${SEV.map((s) => `<div style="width:${(sevCount[s] / total) * 100}%;background:var(--s-${s})"></div>`).join('')}</div>
      <div class="chips">${SEV.map((s) => `<span class="chip">${sevCount[s]} ${s}</span>`).join('')}</div>`;
    const shown = state.view === 'risks' ? G.findings : G.findings.slice(0, 3);
    h += shown.map(findingHtml).join('');
    if (state.view !== 'risks' && G.findings.length > 3) h += `<button class="back" data-view="risks">See all ${G.findings.length} risks →</button>`;
    if (state.view !== 'risks') {
      h += `<h3>Paid services · ${paid.length}</h3>${paid.map((n) => `<div class="rel" data-go="${esc(n.id)}"><span class="k">${TIER[n.cost.tier]}</span><span class="n">${esc(n.label)}</span><span class="tt">${esc(n.cost.model)}</span></div>`).join('') || '<p>None detected.</p>'}`;
    }
    h += `<h3>Scan</h3><p class="mono">${esc(G.meta.repo)}${G.meta.commit ? ' @ ' + esc(G.meta.commit) : ''}<br>${G.meta.stats.files} files · ${G.meta.stats.ms} ms<br>${esc(new Date(G.meta.scannedAt).toLocaleString())}</p>`;
    h += `<h3>Shortcuts</h3><p class="mono">/ search · 1–6 views · F fit · P present · T theme</p>`;
    P.innerHTML = h;
    wirePanel();
  }

  function panelNode(id) {
    const n = allNodes.get(id);
    if (!n) return panelSummary();
    const P = $('#panel');
    const ch = changeOf(id);
    let h = `<button class="back" id="backBtn">← ${esc(VIEWS[state.view].name)}</button>
      <h2>${esc(n.label)}</h2>
      <div class="chips"><span class="chip" style="color:var(--l-${n.layer})">${esc(LAYER_NAME[n.layer] || n.layer)}</span>${n.tech ? `<span class="chip">${esc(n.tech)}</span>` : ''}${n.cost ? `<span class="chip">${TIER[n.cost.tier]} · ${esc(n.cost.model)}</span>` : ''}${n.manual ? '<span class="chip">added by hand</span>' : ''}${ch ? statusPill(ch) : ''}</div>`;
    if (n.description) h += `<p>${esc(n.description)}</p>`;
    if (ch === 'changed') h += `<p><b>Changed:</b> ${esc(DIFF.changed.find((x) => x.id === id).fields.join(', '))}</p>`;
    const fs = findingsByNode.get(id) || [];
    if (fs.length) h += `<h3>Risks · ${fs.length}</h3>${fs.map(findingHtml).join('')}`;
    const out = allEdges.filter((e) => e.from === id && e.kind !== 'contains');
    const inc = allEdges.filter((e) => e.to === id && e.kind !== 'contains');
    const kids = allEdges.filter((e) => e.from === id && e.kind === 'contains');
    const rel = (e, other) => {
      const o = allNodes.get(other);
      return o ? `<div class="rel" data-go="${esc(o.id)}"><span class="k">${esc(e.label || e.kind)}</span><span class="n">${esc(o.label)}</span><span class="tt">${esc(o.tech || '')}</span></div>` : '';
    };
    if (out.length) h += `<h3>Uses · ${out.length}</h3>${out.map((e) => rel(e, e.to)).join('')}`;
    if (inc.length) h += `<h3>Used by · ${inc.length}</h3>${inc.map((e) => rel(e, e.from)).join('')}`;
    if (kids.length) h += `<h3>Modules · ${kids.length}</h3>${kids.map((e) => rel(e, e.to)).join('')}`;
    const m = n.meta || {};
    if (m.routes?.length) h += `<h3>API routes · ${m.routeCount}</h3><ul class="plain mono">${m.routes.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`;
    else if (m.routeCount) h += `<h3>API routes</h3><p>${m.routeCount} routes across its modules.</p>`;
    if (m.models?.length) h += `<h3>Data models · ${m.models.length}</h3><div class="chips">${m.models.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>`;
    if (m.container) h += `<h3>Container</h3><p class="mono">base ${esc(m.container.base || '?')}<br>ports ${esc((m.container.ports || []).join(', ') || '–')}<br>user ${esc(m.container.user)}</p>`;
    if (m.triggers?.length) h += `<h3>Triggered by</h3><div class="chips">${m.triggers.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>`;
    if (n.evidence?.length) h += `<h3>Evidence</h3>${n.evidence.map(evLink).join('')}`;
    h += `<h3>Id</h3><p class="mono">${esc(n.id)}</p>`;
    P.innerHTML = h;
    $('#backBtn').onclick = () => select(null);
    wirePanel();
  }

  function wirePanel() {
    document.querySelectorAll('#panel [data-go]').forEach((x) => (x.onclick = () => goTo(x.dataset.go)));
    document.querySelectorAll('#panel .finding').forEach((x) => (x.onclick = () => x.dataset.node && goTo(x.dataset.node)));
    document.querySelectorAll('#panel [data-view]').forEach((x) => (x.onclick = () => setView(x.dataset.view)));
  }

  function select(id) {
    state.selected = id;
    applyHighlight();
    id ? panelNode(id) : panelSummary();
  }

  function goTo(id) {
    if (!state.L.place.has(id)) {
      const n = allNodes.get(id);
      setView(n?.kind === 'module' ? 'code' : 'overview');
    }
    select(id);
    const p = state.L.place.get(id);
    if (p) zoomTo({ x: p.x - 200, y: p.y - 160, w: CARD_W + 400, h: CARD_H + 320 }, 1);
  }

  // ---------- Pan / zoom ----------
  const view = { x: 0, y: 0, k: 1 };
  const wrap = $('#svg-wrap');
  const stage = $('#stage');
  function applyView(anim) {
    stage.classList.toggle('no-anim', !anim);
    wrap.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`;
  }
  const contentBox = () => ({ x: -20, y: -20, w: state.L.width + 40, h: state.L.laneH + 40 });
  function zoomTo(box, minK) {
    const r = stage.getBoundingClientRect();
    const padB = document.body.classList.contains('presenting') ? 170 : document.body.classList.contains('embed') ? 40 : 70;
    let k = Math.min(r.width / box.w, (r.height - padB) / box.h);
    if (minK) k = Math.max(k, Math.min(minK, 1.4));
    k = Math.max(0.12, Math.min(k, 1.4));
    view.k = k;
    view.x = r.width / 2 - (box.x + box.w / 2) * k;
    view.y = (r.height - padB) / 2 + 8 - (box.y + box.h / 2) * k;
    applyView(true);
  }
  const fit = () => zoomTo(contentBox());
  stage.addEventListener('wheel', (ev) => {
    // Embedded previews: let a plain wheel scroll the host page; only pinch / ctrl+wheel zooms the map.
    if (DATA.embed && !ev.ctrlKey) return;
    ev.preventDefault();
    const r = stage.getBoundingClientRect();
    const mx = ev.clientX - r.left, my = ev.clientY - r.top;
    if (!ev.ctrlKey && Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
      view.x -= ev.deltaX;
      return applyView(false);
    }
    const f = Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0018));
    const k = Math.max(0.12, Math.min(3, view.k * f));
    view.x = mx - ((mx - view.x) * k) / view.k;
    view.y = my - ((my - view.y) * k) / view.k;
    view.k = k;
    applyView(false);
  }, { passive: false });
  let drag = null;
  stage.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.card, .legend, .zoom, #caption') || ev.button !== 0) return;
    drag = { x: ev.clientX, y: ev.clientY, vx: view.x, vy: view.y, moved: false };
    stage.classList.add('dragging');
  });
  window.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    view.x = drag.vx + dx;
    view.y = drag.vy + dy;
    applyView(false);
  });
  window.addEventListener('pointerup', () => {
    if (drag && !drag.moved) {
      if (document.body.classList.contains('presenting')) showStep(stepIdx + 1);
      else select(null);
    }
    drag = null;
    stage.classList.remove('dragging');
  });
  function zoomBy(f) {
    const r = stage.getBoundingClientRect();
    const mx = r.width / 2, my = r.height / 2;
    const k = Math.max(0.12, Math.min(3, view.k * f));
    view.x = mx - ((mx - view.x) * k) / view.k;
    view.y = my - ((my - view.y) * k) / view.k;
    view.k = k;
    applyView(true);
  }
  $('#zin').onclick = () => zoomBy(1.25);
  $('#zout').onclick = () => zoomBy(0.8);
  $('#zfit').onclick = fit;

  // ---------- Tabs / search ----------
  function renderTabs() {
    const tabs = $('#tabs');
    tabs.innerHTML = '';
    Object.entries(VIEWS).forEach(([k, v], i) => {
      const b = document.createElement('button');
      b.className = 'tab' + (state.view === k ? ' on' : '');
      b.title = `${v.blurb} (${i + 1})`;
      b.textContent = v.name;
      if (k === 'risks' && G.findings.length) b.innerHTML += `<span class="count">${G.findings.length}</span>`;
      if (k === 'changes' && DIFF) b.innerHTML += `<span class="count ok">${DIFF.added.length + DIFF.removed.length + DIFF.changed.length}</span>`;
      b.onclick = () => setView(k);
      tabs.appendChild(b);
    });
  }
  function setView(k) {
    state.view = k;
    document.body.classList.toggle('view-changes', k === 'changes');
    state.selected = null;
    hoverId = null;
    renderTabs();
    render();
    panelSummary();
    requestAnimationFrame(fit);
    try { history.replaceState(null, '', '#' + k); } catch (e) {}
  }
  $('#q').addEventListener('input', (ev) => {
    state.query = ev.target.value.trim();
    applyHighlight();
  });
  $('#q').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      const q = state.query.toLowerCase();
      const hit = [...state.L.nodes, ...allNodes.values()].find((n) => matches(n, q));
      if (hit) goTo(hit.id);
    }
    if (ev.key === 'Escape') {
      ev.target.value = '';
      state.query = '';
      applyHighlight();
      ev.target.blur();
    }
  });

  // ---------- Theme ----------
  // The logo is an <img>, so it can't see the .dark class: swap to its dark drawing.
  const syncLogo = () => document.querySelectorAll('img.logo').forEach((i) => (i.src = i.dataset[document.documentElement.classList.contains('dark') ? 'dark' : 'light']));
  const setTheme = (dark) => {
    document.documentElement.classList.toggle('dark', dark);
    syncLogo();
    try { localStorage.setItem('repomind-theme', dark ? 'dark' : 'light'); } catch (e) {}
  };
  let savedTheme = null;
  try { savedTheme = localStorage.getItem('repomind-theme'); } catch (e) {}
  setTheme(savedTheme ? savedTheme === 'dark' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches));
  // Another RepoMind tab/frame changed the theme: follow it.
  window.addEventListener('storage', (e) => { if (e.key === 'repomind-theme' && e.newValue) setTheme(e.newValue === 'dark'); });
  $('#themeBtn').onclick = () => setTheme(!document.documentElement.classList.contains('dark'));

  // ---------- Export ----------
  $('#exportBtn').onclick = (ev) => {
    ev.stopPropagation();
    $('#exportMenu').classList.toggle('open');
  };
  document.addEventListener('click', () => $('#exportMenu').classList.remove('open'));
  $('#exportMenu').addEventListener('click', (ev) => {
    const x = ev.target.dataset.x;
    if (x === 'svg') download(new Blob([exportSvg()], { type: 'image/svg+xml' }), `${fileBase()}.svg`);
    if (x === 'json') download(new Blob([JSON.stringify(G, null, 2)], { type: 'application/json' }), `${fileBase()}.graph.json`);
    if (x === 'png') exportPng();
  });
  function exportAs(x) {
    if (x === 'svg') download(new Blob([exportSvg()], { type: 'image/svg+xml' }), `${fileBase()}.svg`);
    if (x === 'json') download(new Blob([JSON.stringify(G, null, 2)], { type: 'application/json' }), `${fileBase()}.graph.json`);
    if (x === 'png') exportPng();
  }
  const fileBase = () => `${String(G.meta.repo).replace(/[^\w-]+/g, '-')}-${state.view}`;
  function exportSvg() {
    const src = $('#canvas');
    const clone = src.cloneNode(true);
    const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-size', 'font-weight', 'font-family', 'font-style', 'letter-spacing', 'fill-opacity', 'stroke-opacity'];
    const a = src.querySelectorAll('*'), b = clone.querySelectorAll('*');
    a.forEach((node, i) => {
      const cs = getComputedStyle(node);
      for (const p of props) {
        const val = cs.getPropertyValue(p);
        if (val) b[i].setAttribute(p, val);
      }
      b[i].removeAttribute('class');
    });
    clone.querySelectorAll('path').forEach((p) => p.getAttribute('stroke') === 'rgba(0, 0, 0, 0)' && p.remove());
    const w = clone.querySelector('#svg-wrap');
    w.removeAttribute('style');
    const box = contentBox();
    const titleH = 64;
    clone.setAttribute('viewBox', `${box.x} ${box.y - titleH} ${box.w} ${box.h + titleH}`);
    clone.setAttribute('width', box.w);
    clone.setAttribute('height', box.h + titleH);
    const bg = document.createElementNS(NS, 'rect');
    Object.entries({ x: box.x, y: box.y - titleH, width: box.w, height: box.h + titleH, fill: cssVar('--bg') }).forEach(([k, v]) => bg.setAttribute(k, v));
    clone.insertBefore(bg, clone.firstChild);
    const t = document.createElementNS(NS, 'text');
    Object.entries({ x: box.x + 24, y: box.y - titleH + 40, fill: cssVar('--text'), 'font-size': 22, 'font-weight': 700, 'font-family': 'system-ui, -apple-system, Segoe UI, sans-serif' }).forEach(([k, v]) => t.setAttribute(k, v));
    t.textContent = `${G.meta.repo} — ${VIEWS[state.view].name}`;
    clone.insertBefore(t, bg.nextSibling);
    return new XMLSerializer().serializeToString(clone);
  }
  function exportPng() {
    const svg = exportSvg();
    const box = contentBox();
    const img = new Image();
    const scale = 2;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = box.w * scale;
      c.height = (box.h + 64) * scale;
      const ctx = c.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      c.toBlob((blob) => download(blob, `${fileBase()}.png`));
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- Presentation ----------
  let steps = [], stepIdx = 0;
  function buildSteps() {
    const s = [];
    const L = layout('overview');
    const n = (l) => G.nodes.filter((x) => x.layer === l);
    const names = (arr, max = 6) => arr.slice(0, max).map((x) => x.label).join(', ') + (arr.length > max ? ` and ${arr.length - max} more` : '');
    s.push({ view: 'overview', title: `${G.meta.repo} at a glance`, body: `${n('app').length} apps and services, ${n('data').length} data stores, ${n('cloud').length} cloud resources and ${n('external').length} external services${G.findings.length ? ` — ${G.findings.length} open risks` : ''}.` });
    const lines = {
      client: (a) => `Who uses it: ${names(a)}.`,
      app: (a) => `What we build: ${a.slice(0, 6).map((x) => `${x.label} (${x.tech || 'package'})`).join(', ')}.`,
      data: (a) => `Where data lives: ${names(a)}.`,
      cloud: (a) => `Where it runs: ${names(a, 8)}.`,
      external: (a) => `Services we depend on: ${names(a, 8)}. ${a.filter((x) => x.cost && x.cost.tier !== 'free').length} of them are paid.`,
      cicd: (a) => `How it ships: ${names(a)}.`,
    };
    L.lanes.forEach((k, i) => s.push({ view: 'overview', lane: i, title: LAYER_NAME[k], body: (lines[k] || ((a) => names(a)))(L.cols[i]) }));
    if (G.nodes.some((x) => x.kind === 'module')) s.push({ view: 'code', title: 'Inside the code', body: `${n('module').length} feature modules, and the data and services each one touches.` });
    s.push({ view: 'infra', title: 'Infrastructure', body: 'How each app is built, deployed and hosted, and what protects the data.' });
    if (G.findings.length) s.push({ view: 'risks', title: `${G.findings.length} open risks`, body: G.findings.slice(0, 3).map((f) => `${f.severity}: ${f.title}`).join(' · ') });
    if (DIFF) s.push({ view: 'changes', title: 'What changed', body: `${DIFF.added.length} added, ${DIFF.changed.length} changed, ${DIFF.removed.length} removed, ${DIFF.newFindings.length} new risks.` });
    return s;
  }
  function showStep(i) {
    stepIdx = Math.max(0, Math.min(steps.length - 1, i));
    const st = steps[stepIdx];
    if (state.view !== st.view) {
      state.view = st.view;
      document.body.classList.toggle('view-changes', st.view === 'changes');
      state.selected = null;
      renderTabs();
      render();
    }
    const L = state.L;
    if (st.lane != null) {
      const x = st.lane * (LANE_W + LANE_GAP);
      zoomTo({ x: x - 90, y: -10, w: LANE_W + 180, h: L.laneH + 20 }, 0.55);
      document.querySelectorAll('.card').forEach((c) => c.classList.toggle('dim', L.place.get(c.dataset.id)?.col !== st.lane));
      document.querySelectorAll('.edge').forEach((g) => {
        const on = L.place.get(g.dataset.from)?.col === st.lane || L.place.get(g.dataset.to)?.col === st.lane;
        g.classList.toggle('dim', !on);
        g.classList.toggle('hot', on);
      });
    } else {
      applyHighlight();
      setTimeout(fit, 30);
    }
    $('#caption').innerHTML = `<div class="step">${stepIdx + 1} / ${steps.length}</div><div class="title">${esc(st.title)}</div><div class="body">${esc(st.body)}</div><div class="nav">← → or click to move · Esc to exit</div>`;
  }
  function startPresent() {
    steps = buildSteps();
    document.body.classList.add('presenting');
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    setTimeout(() => showStep(0), 80);
  }
  function stopPresent() {
    document.body.classList.remove('presenting');
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
    setView(state.view);
  }
  $('#presentBtn').onclick = startPresent;

  document.addEventListener('keydown', (ev) => {
    if (ev.target.tagName === 'INPUT') return;
    if (document.body.classList.contains('presenting')) {
      if (['ArrowRight', ' ', 'PageDown', 'Enter'].includes(ev.key)) { ev.preventDefault(); showStep(stepIdx + 1); }
      if (['ArrowLeft', 'PageUp', 'Backspace'].includes(ev.key)) { ev.preventDefault(); showStep(stepIdx - 1); }
      if (ev.key === 'Escape') stopPresent();
      return;
    }
    if (ev.key === '/') { ev.preventDefault(); $('#q').focus(); }
    if (ev.key === 'f' || ev.key === 'F') fit();
    if (ev.key === 'p' || ev.key === 'P') startPresent();
    if (ev.key === 't' || ev.key === 'T') $('#themeBtn').click();
    if (ev.key === 's' || ev.key === 'S') setStyle(!document.body.classList.contains('sketch'));
    if (ev.key === 'Escape') select(null);
    const keys = Object.keys(VIEWS);
    if (/^[1-9]$/.test(ev.key) && keys[+ev.key - 1]) setView(keys[+ev.key - 1]);
  });
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('presenting')) stopPresent();
  });
  window.addEventListener('hashchange', () => {
    const k = (location.hash || '').slice(1);
    if (VIEWS[k] && k !== state.view) setView(k);
  });
  window.addEventListener('resize', () => { if (!document.body.classList.contains('presenting')) fit(); });
  // Embedded frames often start tiny (lazy iframes): refit whenever the stage changes size, until the user moves the map.
  let userMoved = false;
  stage.addEventListener('wheel', (ev) => { if (!DATA.embed || ev.ctrlKey) userMoved = true; }, { passive: true });
  stage.addEventListener('pointerdown', () => (userMoved = true));
  if (window.ResizeObserver) new ResizeObserver(() => { if (!userMoved && !document.body.classList.contains('presenting')) fit(); }).observe(stage);
  // Late layout (lazy iframe sizing, web fonts): fit again once things settle.
  const settle = () => { if (!userMoved && !document.body.classList.contains('presenting')) fit(); };
  window.addEventListener('load', () => { settle(); setTimeout(settle, 300); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(settle, 50));

  // ---------- Sketch / Clean (PRD v2, R3) ----------
  function setStyle(sketch) {
    document.body.classList.toggle('sketch', sketch);
    document.querySelectorAll('#styleSeg button').forEach((b) => b.classList.toggle('on', (b.dataset.s === 'sketch') === sketch));
    try { localStorage.setItem('repomind-style', sketch ? 'sketch' : 'clean'); } catch (e) {}
    if (state.L) render();
  }
  document.querySelectorAll('#styleSeg button').forEach((b) => (b.onclick = () => setStyle(b.dataset.s === 'sketch')));
  let savedStyle = null;
  try { savedStyle = localStorage.getItem('repomind-style'); } catch (e) {}
  setStyle(savedStyle ? savedStyle === 'sketch' : typeof rough !== 'undefined');
  // Theme changes the ink colour baked into rough.js strokes, so redraw.
  new MutationObserver(() => state.L && render()).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  // Hand fonts change text widths; redraw once they arrive.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => state.L && render());

  // ---------- Embedded preview (landing page iframe) ----------
  if (DATA.embed) {
    document.body.classList.add('embed');
    if (DATA.embed === 'showcase') document.body.classList.add('showcase');
    // Follow the landing page's theme toggle (same origin only).
    window.addEventListener('message', (ev) => {
      if (ev.origin !== location.origin || !ev.data || !ev.data.repomindTheme) return;
      setTheme(ev.data.repomindTheme === 'dark');
    });
  }

  // ---------- Boot ----------
  function header() {
    // Served maps always title as owner/repo; reloading a version (e.g. compare) must not swap in the scan's stored name.
    $('#repoName').textContent = LIVE ? `${LIVE.owner}/${LIVE.repo}` : G.meta.repo;
    $('#repoSub').textContent = `RepoMind map${G.meta.commit ? ' · ' + G.meta.commit : ''} · ${G.nodes.filter((n) => n.kind !== 'module').length} components · ${G.edges.length} links`;
  }
  header();
  markers();
  const initial = (location.hash || '').slice(1);
  // Live pages always have a previous version to diff against, so open on Overview unless a compare was asked for.
  setView(VIEWS[initial] ? initial : DIFF && (!LIVE || LIVE.base) ? 'changes' : 'overview');

  // ---------- Live mode (served by `repomind serve`, PRD v2) ----------
  if (LIVE) {
    document.body.classList.add('live');
    $('#crumb').innerHTML = '<a href="/app">Workspace</a> / <a href="/app#repos">Repositories</a> /';
    $('#repoName').textContent = `${LIVE.owner}/${LIVE.repo}`;
    const api = (p, opts) => fetch(p, opts).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.statusText);
      return j;
    });
    const repoPath = `${encodeURIComponent(LIVE.owner)}/${encodeURIComponent(LIVE.repo)}`;
    const live = { versions: [], sha: G.meta.commit, base: null, pinned: !!LIVE.pinned, info: LIVE.info || {} };
    const ago = (t) => {
      const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
      if (s < 60) return 'just now';
      if (s < 3600) return `${Math.round(s / 60)} min ago`;
      if (s < 86400) return `${Math.round(s / 3600)} h ago`;
      return `${Math.round(s / 86400)} days ago`;
    };
    const shortDate = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    function badge() {
      const on = !!live.info.connected;
      const latest = live.versions[0];
      $('#liveBadge').classList.toggle('on', on);
      $('#liveText').textContent = on ? `Live · ${live.info.branch || ''} · updated ${latest ? ago(latest.scannedAt) : ''}` : `Snapshot${latest ? ' · ' + ago(latest.scannedAt) : ''}`;
    }

    function timeline() {
      const T = $('#timeline');
      const vs = [...live.versions].reverse();
      const changed = vs.filter((v) => v.changes > 0).length;
      T.innerHTML = `<div class="tl-head"><span class="tl-title">Versions</span><span class="tl-sub">${vs.length} commit${vs.length === 1 ? '' : 's'} · big dots changed the map · shift-click a second dot to compare</span>${live.base ? '<button class="back tl-clear" id="tlClear">Clear compare</button>' : ''}</div><div class="tl-track" id="tlTrack"></div>`;
      const track = $('#tlTrack');
      vs.forEach((v, i) => {
        const b = document.createElement('button');
        const big = v.changes > 0 || i === 0;
        const color = v.newRisks > 0 || (v.removed > 0 && !v.added) ? 'var(--f-risk)' : v.changed > 0 && !v.added ? 'var(--f-external)' : 'var(--f-live)';
        b.className = `tl-v${big ? ' big' : ''}${v.sha === live.sha ? ' cur' : ''}${v.sha === live.base ? ' base' : ''}`;
        b.title = `${v.sha} · ${v.message || ''}${v.author ? ' · ' + v.author : ''}\n${v.changes ? `${v.added} added, ${v.removed} removed, ${v.changed} changed, ${v.newRisks} new risks` : 'no map change'}`;
        b.setAttribute('aria-label', `Version ${v.sha}, ${shortDate(v.committedAt || v.scannedAt)}`);
        b.innerHTML = `<span class="dot" style="${big && v.sha !== live.sha && i > 0 ? `background:${color}` : ''}"></span><span class="sha">${esc(v.sha)}</span><span class="when">${i === vs.length - 1 ? 'latest' : esc(shortDate(v.committedAt || v.scannedAt))}</span>`;
        b.onclick = (ev) => {
          if (ev.shiftKey && v.sha !== live.sha) return load(live.sha, v.sha, true);
          load(v.sha, null, true);
        };
        track.appendChild(b);
      });
      track.scrollLeft = track.scrollWidth;
      const c = $('#tlClear');
      if (c) c.onclick = () => load(live.sha, null, true);
    }

    async function refreshVersions() {
      const r = await api(`/api/repos/${repoPath}/versions`);
      const prevTop = live.versions[0]?.sha;
      live.versions = r.versions;
      window.__rmVersions = r.versions;
      live.info = r.repo;
      badge();
      timeline();
      return prevTop;
    }

    // Swap the graph in place: keeps zoom, selection and view (PRD v2, R5).
    async function load(sha, base, explicit) {
      const q = new URLSearchParams();
      if (sha) q.set('sha', sha);
      if (base) q.set('base', base);
      const d = await api(`/api/repos/${repoPath}/graph?${q}`);
      const keepSel = state.selected, keepView = state.view, keepXf = { ...view };
      setData(d);
      live.sha = d.graph.meta.commit;
      live.base = base || null;
      if (explicit) live.pinned = live.versions[0]?.sha !== live.sha || !!base;
      header();
      renderTabs();
      state.view = VIEWS[keepView] ? keepView : 'overview';
      if (base && VIEWS.changes) state.view = 'changes';
      document.body.classList.toggle('view-changes', state.view === 'changes');
      render();
      Object.assign(view, keepXf);
      applyView(false);
      if (keepSel && allNodes.has(keepSel)) select(keepSel);
      else panelSummary();
      renderTabs();
      timeline();
      const u = new URL(location.href);
      live.pinned ? u.searchParams.set('sha', live.sha) : u.searchParams.delete('sha');
      base ? u.searchParams.set('base', base) : u.searchParams.delete('base');
      try { history.replaceState(null, '', u.pathname + u.search + '#' + state.view); } catch (e) {}
      if (explicit && state.view !== keepView) requestAnimationFrame(fit);
    }

    let toastTimer = null;
    function toast(html) {
      const t = $('#toast');
      t.innerHTML = `<span class="pulse"></span><span>${html}</span>`;
      t.classList.add('show');
      const a = t.querySelector('[data-changes]');
      if (a) a.onclick = () => { setView('changes'); t.classList.remove('show'); };
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), 9000);
    }

    async function poll() {
      try {
        const prevTop = await refreshVersions();
        const top = live.versions[0];
        if (top && prevTop && top.sha !== prevTop) {
          const parts = [];
          if (top.added) parts.push(`+${top.added} added`);
          if (top.removed) parts.push(`−${top.removed} removed`);
          if (top.newRisks) parts.push(`${top.newRisks} new risk${top.newRisks > 1 ? 's' : ''}`);
          if (!live.pinned) await load(top.sha, null, false);
          toast(`<b>New commit ${esc(top.sha)}</b> — ${parts.length ? 'map updated: ' + esc(parts.join(', ')) : 'no map change'}${top.changes && !live.pinned ? ' · <a data-changes>See changes</a>' : ''}`);
        }
      } catch (e) {}
    }
    setInterval(poll, (LIVE.pollSeconds || 30) * 1000);
    setInterval(badge, 30000);

    $('#refreshBtn').onclick = async () => {
      $('#refreshBtn').disabled = true;
      try {
        const r = await api(`/api/repos/${repoPath}/refresh`, { method: 'POST' });
        if (r.job) await waitJob(r.job);
        await poll();
        if (!r.job) toast('Up to date — no new commit on ' + esc(live.info.branch || 'the branch'));
      } catch (e) { toast(esc(e.message)); }
      $('#refreshBtn').disabled = false;
    };
    async function waitJob(id) {
      for (let i = 0; i < 240; i++) {
        const j = await api(`/api/jobs/${id}`);
        if (j.status !== 'running') return j;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // ---------- Share & download dialog (design: Share) ----------
    const modal = $('#modal');
    const closeModal = () => modal.classList.remove('open');
    modal.addEventListener('click', (ev) => { if (ev.target === modal) closeModal(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && modal.classList.contains('open')) closeModal(); });
    const copy = (text, btn) => {
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
        () => { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = o), 1400); },
        () => {},
      );
    };
    function openShare(secret) {
      const origin = location.origin;
      const link = `${origin}/r/${repoPath}`;
      const on = !!live.info.connected;
      const fields = [
        ['Payload URL', `${origin}/api/webhook/github`],
        ['Content type', 'application/json · events: push'],
        ['Secret', secret || (on ? '•••••••• (shown once when you connected)' : 'generated when you connect')],
      ];
      $('#modalBox').innerHTML = `
        <div class="mhead"><h1 id="share-title">Take it with you</h1><span class="mono muted">${esc(G.meta.repo)} @ ${esc(live.sha || '')}</span><button class="btn close" id="mClose" aria-label="Close">×</button></div>
        <div class="cols">
          <div class="col">
            <h2>Download</h2>
            <div class="formats">
              <button class="fmt" data-f="png" style="background-image:repeating-linear-gradient(-41deg,var(--f-client) 0 2px,transparent 2px 9px)"><b>PNG</b><span>for slides · 2× sharp</span></button>
              <button class="fmt" data-f="svg" style="background-image:repeating-linear-gradient(-41deg,var(--f-app) 0 2px,transparent 2px 9px)"><b>SVG</b><span>scales to any size</span></button>
              <button class="fmt" data-f="html" style="background-image:repeating-linear-gradient(-41deg,var(--f-data) 0 2px,transparent 2px 9px)"><b>HTML map</b><span>interactive, works offline</span></button>
              <button class="fmt" data-f="json" style="background-image:repeating-linear-gradient(-41deg,var(--f-external) 0 2px,transparent 2px 9px)"><b>Graph JSON</b><span>for scripts and CI</span></button>
            </div>
            <span class="hint">PNG and SVG export the current view (${esc(VIEWS[state.view].name)}).</span>
            <h2>Share a link</h2>
            <div class="field"><input readonly id="shareLink" value="${esc(link)}" aria-label="Share link"><button class="btn primary" id="copyLink">Copy link</button></div>
            <span class="hint">Always opens the latest version. Add <span class="mono">?sha=${esc(live.sha || '')}</span> to pin this one.</span>
          </div>
          <div class="col live-box">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><h2 style="margin:0">Keep it live</h2><span class="pill ${on ? '' : 'off'}"><span class="pulse" style="width:8px;height:8px;border-radius:50%;background:currentColor"></span>${on ? `Polling every ${Math.round((live.info.pollMinutes || 5))} min` : 'Not connected'}</span></div>
            <p style="margin:0">For instant updates on every push, add this webhook in GitHub → Settings → Webhooks.</p>
            ${fields.map(([k, v], i) => `<div><label class="k">${k}</label><div class="field"><code>${esc(v)}</code><button class="btn" data-copy="${i}">Copy</button></div></div>`).join('')}
            ${on ? '' : `<label style="display:flex;align-items:center;gap:10px"><input type="checkbox" id="backfill" checked style="width:20px;height:20px;accent-color:var(--brand)">Scan the last 10 commits for history</label><button class="btn primary" id="doConnect" style="align-self:flex-start">Connect for live updates</button>`}
          </div>
        </div>`;
      modal.classList.add('open');
      $('#mClose').onclick = closeModal;
      $('#copyLink').onclick = (ev) => copy(link, ev.target);
      document.querySelectorAll('#modalBox [data-copy]').forEach((b) => (b.onclick = () => copy(fields[+b.dataset.copy][1], b)));
      document.querySelectorAll('#modalBox .fmt').forEach((b) => (b.onclick = () => {
        const f = b.dataset.f;
        if (f === 'html') location.href = `/r/${repoPath}/download.html?sha=${encodeURIComponent(live.sha)}`;
        else exportAs(f);
      }));
      const c = $('#doConnect');
      if (c) c.onclick = async () => {
        c.disabled = true;
        try {
          const r = await api(`/api/repos/${repoPath}/connect`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ backfill: $('#backfill').checked }) });
          live.info = r.repo;
          badge();
          openShare(r.secret);
          toast('Connected — backfilling history; new dots will appear on the timeline.');
          setTimeout(poll, 4000);
        } catch (e) { toast(esc(e.message)); c.disabled = false; }
      };
    }
    $('#downloadBtn').onclick = () => openShare();

    refreshVersions().then(() => {
      if (LIVE.base) load(live.sha, LIVE.base, true);
    }).catch(() => {});
  }
})();
</script>
</body>
</html>
