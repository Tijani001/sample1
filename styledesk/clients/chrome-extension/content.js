// Style Desk content script: watches the text box you're typing in, checks it against your
// trained voice, underlines what doesn't sound like you, and offers fixes and rewrites.
(() => {
  if (window.__styleDesk) return;
  window.__styleDesk = true;

  const MIN_CHARS = 20;
  const MAX_CHARS = 100000;
  const DEBOUNCE_MS = 800;
  const SEV_COLOR = { error: "#d92d20", warning: "#c98a00", suggestion: "#1f6f8b" };
  const SEV_RANK = { error: 3, warning: 2, suggestion: 1 };

  let config = null;
  let active = null; // { el, kind: "textarea" | "rich", issues, text, ignored:Set }
  let timer = null;
  let seq = 0;
  let panelOpen = false;
  let deepResult = null;

  // ---------- UI host (shadow DOM keeps page CSS out) ----------
  const host = document.createElement("style-desk-ui");
  host.style.cssText = "all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483646;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      .badge, .panel, .panel * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
      .mirror * { font: inherit; letter-spacing: inherit; }
      .mirror { position: fixed; overflow: hidden; pointer-events: none; color: transparent; white-space: pre-wrap;
        overflow-wrap: break-word; border-style: solid; border-color: transparent; background: transparent; margin: 0; }
      .mirror span { text-decoration-line: underline; text-decoration-style: wavy; text-decoration-thickness: 1.5px;
        text-underline-offset: 3px; text-decoration-skip-ink: none; }
      .badge { position: fixed; width: 26px; height: 26px; border-radius: 13px; border: 2px solid #fff; color: #fff;
        font-size: 12px; font-weight: 700; display: none; align-items: center; justify-content: center; cursor: pointer;
        box-shadow: 0 1px 4px rgba(0,0,0,.3); pointer-events: auto; background: #1a7f37; padding: 0; }
      .badge.busy { background: #6b6a65; }
      .panel { position: fixed; width: 340px; max-width: calc(100vw - 16px); max-height: 60vh; overflow: auto; background: #fff;
        color: #1d1d1b; border: 1px solid #e2e0d8; border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.18);
        display: none; pointer-events: auto; font-size: 13px; }
      .head { position: sticky; top: 0; background: #fff; padding: 10px 12px; border-bottom: 1px solid #e2e0d8;
        display: flex; align-items: center; gap: 8px; }
      .head b { flex: 1; font-size: 14px; }
      .head .nr { color: #6b6a65; font-weight: normal; font-size: 12px; display: block; }
      button { font: inherit; cursor: pointer; border-radius: 6px; border: 1px solid #e2e0d8; background: #fff; color: #1d1d1b; padding: 3px 8px; }
      button.primary { background: #1f4e79; border-color: #1f4e79; color: #fff; }
      .x { border: none; font-size: 16px; line-height: 1; padding: 2px 6px; color: #6b6a65; }
      ul { list-style: none; margin: 0; padding: 0; }
      li { padding: 10px 12px; border-bottom: 1px solid #f0eee8; }
      li.focus { background: #f3f7fb; }
      .cat { font-weight: 600; display: flex; align-items: center; gap: 6px; }
      .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
      .src { color: #6b6a65; font-weight: normal; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
      .src.ai { color: #6941c6; }
      .ex { color: #6b6a65; font-family: Georgia, serif; margin: 3px 0; }
      .fix { margin-top: 6px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .fix .to { color: #1a7f37; font-weight: 600; }
      .foot { padding: 10px 12px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      .score { font: 700 18px Georgia, serif; color: #1d1d1b; }
      .score small { font-size: 11px; color: #6b6a65; font-weight: normal; }
      .verdict { margin: 10px 12px 0; padding: 8px 10px; border-left: 3px solid #6941c6; background: #f7f6f2; }
      .msg { padding: 14px 12px; color: #6b6a65; }
      @media (prefers-color-scheme: dark) {
        .panel, .head { background: #1f1f1c; color: #ecebe6; border-color: #34332e; }
        li { border-color: #2a2a26; } li.focus { background: #23303b; }
        button { background: #1f1f1c; color: #ecebe6; border-color: #34332e; }
        .verdict { background: #161614; }
      }
    </style>
    <div class="mirror"></div>
    <button class="badge" title="Style Desk"></button>
    <div class="panel" role="dialog" aria-label="Style Desk suggestions"></div>`;
  const mirror = root.querySelector(".mirror");
  const badge = root.querySelector(".badge");
  const panel = root.querySelector(".panel");

  const hlStyle = document.createElement("style");
  hlStyle.textContent = Object.entries(SEV_COLOR).map(([s, c]) =>
    `::highlight(sd-${s}){text-decoration:underline wavy ${c};text-decoration-thickness:1.5px;text-underline-offset:3px;text-decoration-skip-ink:none;}`).join("");

  function mount() {
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
    if (!hlStyle.isConnected) (document.head || document.documentElement).appendChild(hlStyle);
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function send(msg) {
    try { return await chrome.runtime.sendMessage(msg); } catch { return { error: "reloaded" }; }
  }

  // ---------- which elements we check ----------
  function editableRoot(el) {
    if (!el || el === host) return null;
    if (el.tagName === "TEXTAREA" && !el.readOnly && !el.disabled) return { el, kind: "textarea" };
    if (el.isContentEditable) {
      let r = el;
      while (r.parentElement && r.parentElement.isContentEditable) r = r.parentElement;
      return { el: r, kind: "rich" };
    }
    return null;
  }

  // ---------- text extraction with offset mapping (rich editors) ----------
  const BLOCK = /^(P|DIV|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE|SECTION|ARTICLE|TR|TABLE|FIGURE|FIGCAPTION)$/;
  function extractRich(rootEl) {
    let text = "";
    const segs = [];
    const breakPara = () => { if (text && !text.endsWith("\n\n")) text += text.endsWith("\n") ? "\n" : "\n\n"; };
    (function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        segs.push({ node, start: text.length, len: node.data.length });
        text += node.data;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(node.tagName)) return;
      if (node.tagName === "BR") { text += "\n"; return; }
      const block = BLOCK.test(node.tagName);
      if (block) breakPara();
      for (const c of node.childNodes) walk(c);
      if (block) breakPara();
    })(rootEl);
    return { text, segs };
  }

  function pointAt(segs, off, preferEnd) {
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (off >= s.start && off <= s.start + s.len) {
        if (!preferEnd && off === s.start + s.len && segs[i + 1] && segs[i + 1].start === off) continue;
        return { node: s.node, offset: off - s.start };
      }
    }
    return null;
  }

  function rangeFor(segs, start, end) {
    const a = pointAt(segs, start, false), b = pointAt(segs, end, true);
    if (!a || !b) return null;
    const r = document.createRange();
    try { r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset); } catch { return null; }
    return r;
  }

  function currentText(a) {
    return a.kind === "textarea" ? { text: a.el.value } : extractRich(a.el);
  }

  // ---------- checking ----------
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(runCheck, DEBOUNCE_MS);
  }

  async function runCheck(useAi = false) {
    if (!active || !config?.enabled) return;
    const { text } = currentText(active);
    if (text.trim().length < MIN_CHARS || text.length > MAX_CHARS) {
      active.issues = [];
      active.text = text;
      render();
      return;
    }
    const my = ++seq;
    badge.classList.add("busy");
    const r = await send({ type: "check", text, useAi });
    if (my !== seq || !active) return;
    badge.classList.remove("busy");
    if (r?.error) {
      active.issues = [];
      active.error = r.error === "signed_out" ? "Sign in to Style Desk from the toolbar button to check this text."
        : r.error === "no_voice" ? "Choose a voice from the Style Desk toolbar button."
        : r.error === "reloaded" ? "Style Desk was updated. Reload this page." : (r.message || "Check failed.");
      render();
      return;
    }
    active.error = null;
    active.text = text;
    active.issues = r.data.issues.filter((i) => !active.ignored.has(key(i)));
    active.score = { value: r.data.match_score, source: r.data.match_source };
    if (useAi) deepResult = r.data.ai ? { summary: r.data.ai.summary } : (r.data.ai_error ? { summary: r.data.ai_error } : null);
    render();
  }

  const key = (i) => `${i.category}|${i.excerpt}|${i.start}`;

  // ---------- rendering ----------
  function render() {
    mount();
    drawUnderlines();
    position();
    const issues = active?.issues || [];
    const worst = issues.reduce((m, i) => Math.max(m, SEV_RANK[i.severity] || 0), 0);
    badge.style.display = active && config?.enabled ? "flex" : "none";
    badge.textContent = active?.error ? "!" : issues.length ? String(issues.length) : "✓";
    badge.style.background = active?.error ? "#6b6a65" : worst ? SEV_COLOR[Object.keys(SEV_RANK).find((k) => SEV_RANK[k] === worst)] : "#1a7f37";
    badge.title = active?.error || (issues.length ? `${issues.length} things don't sound like you` : "Sounds like you");
    if (panelOpen) renderPanel();
  }

  function drawUnderlines() {
    if (CSS.highlights) for (const s of Object.keys(SEV_COLOR)) CSS.highlights.delete(`sd-${s}`);
    mirror.style.display = "none";
    if (!active || !active.issues?.length) return;
    const spans = pickSpans(active.issues);
    if (active.kind === "rich") {
      if (!CSS.highlights) return;
      const { segs, text } = extractRich(active.el);
      if (text !== active.text) return; // text changed since the check; wait for the next one
      const groups = { error: [], warning: [], suggestion: [] };
      for (const it of spans) { const r = rangeFor(segs, it.start, it.end); if (r) groups[it.severity]?.push(r); }
      for (const [s, rs] of Object.entries(groups)) if (rs.length) CSS.highlights.set(`sd-${s}`, new Highlight(...rs));
    } else {
      const text = active.el.value;
      if (text !== active.text) return;
      let html = "", pos = 0;
      for (const it of spans) {
        html += esc(text.slice(pos, it.start));
        html += `<span style="text-decoration-color:${SEV_COLOR[it.severity]}">${esc(text.slice(it.start, it.end))}</span>`;
        pos = it.end;
      }
      mirror.innerHTML = html + esc(text.slice(pos)) + "\n";
      mirror.style.display = "block";
    }
  }

  // Short, specific spans first; sentence/paragraph notes only where nothing else overlaps.
  function pickSpans(issues) {
    const chosen = [];
    for (const it of issues.filter((i) => i.start != null).sort((a, b) => (a.end - a.start) - (b.end - b.start))) {
      if ((it.end - it.start) > 120) continue;
      if (chosen.every((c) => it.end <= c.start || it.start >= c.end)) chosen.push(it);
    }
    return chosen.sort((a, b) => a.start - b.start);
  }

  function position() {
    if (!active) return;
    const r = active.el.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    badge.style.left = `${Math.min(r.right, innerWidth) - 32}px`;
    badge.style.top = `${Math.min(r.bottom, innerHeight) - 32}px`;
    if (!visible) badge.style.display = "none";
    if (active.kind === "textarea" && mirror.style.display !== "none") {
      const cs = getComputedStyle(active.el);
      const props = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight", "textTransform",
        "wordSpacing", "textIndent", "textAlign", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
        "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "boxSizing", "direction"];
      for (const p of props) mirror.style[p] = cs[p];
      const scrollbar = active.el.offsetWidth - active.el.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
      mirror.style.paddingRight = `${parseFloat(cs.paddingRight) + Math.max(0, scrollbar)}px`;
      Object.assign(mirror.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, boxSizing: "border-box" });
      mirror.scrollTop = active.el.scrollTop;
      mirror.scrollLeft = active.el.scrollLeft;
    }
    if (panelOpen) {
      // Prefer: right of the field, then below it, then above it; overlap the field only as a last resort.
      const pw = Math.min(340, innerWidth - 16);
      const ph = Math.min(panel.scrollHeight || 300, innerHeight * 0.6);
      let left, top;
      if (r.right + 12 + pw <= innerWidth - 8) { left = r.right + 12; top = Math.max(8, Math.min(r.top, innerHeight - ph - 8)); }
      else if (r.bottom + 8 + ph <= innerHeight - 8) { left = Math.min(r.right - pw, innerWidth - pw - 8); top = r.bottom + 8; }
      else if (r.top - 8 - ph >= 8) { left = Math.min(r.right - pw, innerWidth - pw - 8); top = r.top - 8 - ph; }
      else { left = innerWidth - pw - 8; top = Math.max(8, innerHeight - ph - 8); }
      panel.style.left = `${Math.max(8, left)}px`;
      panel.style.top = `${top}px`;
    }
  }

  function renderPanel(focusId) {
    const issues = active?.issues || [];
    panel.innerHTML = `
      <div class="head"><b>Style Desk<span class="nr">Voice: ${esc(config?.voiceName || "none chosen")}</span></b>
        ${active?.score && !active.error ? `<span class="score" title="${active.score.source === "ai" ? "Scored by AI" : "Estimate"}">${active.score.value}<small>/100</small></span>` : ""}
        <button class="x" data-act="close" aria-label="Close">×</button></div>
      ${deepResult ? `<div class="verdict">${esc(deepResult.summary)}</div>` : ""}
      ${active?.error ? `<div class="msg">${esc(active.error)}</div>` : !issues.length ? `<div class="msg">Nothing flagged. This sounds like you.</div>` : ""}
      <ul>${issues.map((it, idx) => `
        <li data-idx="${idx}" class="${it.id === focusId ? "focus" : ""}">
          <div class="cat"><span class="dot" style="background:${SEV_COLOR[it.severity]}"></span>${esc(it.category)}
            <span class="src ${it.source === "ai" ? "ai" : ""}">${it.source === "ai" ? "AI" : esc(it.source)}</span></div>
          ${it.excerpt ? `<div class="ex">“${esc(it.excerpt.length > 100 ? it.excerpt.slice(0, 100) + "…" : it.excerpt)}”</div>` : ""}
          <div>${esc(it.message)}</div>
          <div class="fix">
            ${it.replacement != null && it.start != null ? `<span class="to">→ ${esc(it.replacement || "(remove)")}</span><button class="primary" data-act="apply" data-idx="${idx}">Apply</button>` : ""}
            ${config?.aiEnabled && it.rewritable ? `<button data-act="rewrite" data-idx="${idx}">Rewrite in my voice</button>` : ""}
            <button data-act="ignore" data-idx="${idx}">Ignore</button>
          </div>
        </li>`).join("")}</ul>
      <div class="foot">
        ${config?.aiEnabled && issues.some((i) => i.rewritable) ? `<button class="primary" data-act="rewrite-all">Rewrite all flagged in my voice</button>` : ""}
        ${config?.aiEnabled ? `<button data-act="deep">Deep check with AI</button>` : ""}
        <button data-act="site">Turn off on this site</button>
      </div>`;
    panel.style.display = "block";
    position();
    if (focusId != null) panel.querySelector("li.focus")?.scrollIntoView({ block: "nearest" });
  }

  // ---------- applying fixes ----------
  function replaceRange(a, it) {
    const { text, segs } = currentText(a);
    if (text.slice(it.start, it.end) !== it.excerpt) return false;
    if (a.kind === "textarea") {
      a.el.focus();
      a.el.setSelectionRange(it.start, it.end);
      // insertText keeps the page's undo history and notifies frameworks like React.
      if (!document.execCommand("insertText", false, it.replacement)) {
        a.el.setRangeText(it.replacement, it.start, it.end, "end");
        a.el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: it.replacement }));
      }
      return true;
    }
    const r = rangeFor(segs, it.start, it.end);
    if (!r) return false;
    a.el.focus();
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    if (!document.execCommand("insertText", false, it.replacement)) {
      r.deleteContents();
      r.insertNode(document.createTextNode(it.replacement));
      a.el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
    return true;
  }

  panel.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the text box
  panel.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b || !active) return;
    const it = active.issues[+b.dataset.idx];
    if (b.dataset.act === "close") { panelOpen = false; panel.style.display = "none"; }
    if (b.dataset.act === "apply" && it) {
      if (!replaceRange(active, it)) { runCheck(); return; }
      const delta = it.replacement.length - (it.end - it.start);
      active.issues = active.issues.filter((x) => x !== it && !(x.start != null && x.start < it.end && x.end > it.start))
        .map((x) => (x.start != null && x.start >= it.end ? { ...x, start: x.start + delta, end: x.end + delta } : x));
      active.text = currentText(active).text;
      render();
      schedule();
    }
    if ((b.dataset.act === "rewrite" && it) || b.dataset.act === "rewrite-all") {
      const targets = b.dataset.act === "rewrite" ? [it] : active.issues.filter((x) => x.rewritable);
      const { text } = currentText(active);
      if (text !== active.text) { runCheck(); return; }
      b.disabled = true; b.textContent = "Rewriting\u2026";
      const r = await send({ type: "rewrite", text, spans: targets.map((x) => ({ start: x.start, end: x.end, reason: `${x.category}: ${x.message}` })) });
      if (r?.error) { b.disabled = false; b.textContent = "Try again"; deepResult = { summary: r.message || "Rewrite failed." }; renderPanel(); return; }
      // Apply from the end so earlier offsets stay valid; each edit stays in the page's undo history.
      for (const ch of [...r.data.changes].sort((x, y) => y.original_start - x.original_start)) {
        replaceRange(active, { start: ch.original_start, end: ch.original_end, excerpt: ch.original, replacement: ch.rewrite });
      }
      deepResult = { summary: `Rewrote ${r.data.changes.length} part${r.data.changes.length === 1 ? "" : "s"} in your voice. Press Ctrl+Z (\u2318Z) to undo.` };
      await runCheck();
      return;
    }
    if (b.dataset.act === "ignore" && it) {
      active.ignored.add(key(it));
      active.issues = active.issues.filter((x) => x !== it);
      render();
    }
    if (b.dataset.act === "deep") {
      b.disabled = true; b.textContent = "Checking…";
      await runCheck(true);
    }
    if (b.dataset.act === "site") {
      const { disabledSites = [] } = await chrome.storage.local.get("disabledSites");
      await chrome.storage.local.set({ disabledSites: [...new Set([...disabledSites, location.hostname])] });
    }
  });

  badge.addEventListener("mousedown", (e) => e.preventDefault());
  badge.addEventListener("click", () => {
    panelOpen = !panelOpen;
    if (panelOpen) renderPanel(); else panel.style.display = "none";
  });

  // Clicking on an underlined word opens its suggestion.
  function caretOffset(a) {
    if (a.kind === "textarea") return a.el.selectionStart;
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    const { segs } = extractRich(a.el);
    const seg = segs.find((s) => s.node === sel.anchorNode);
    return seg ? seg.start + sel.anchorOffset : null;
  }

  // ---------- focus tracking ----------
  async function activate(target) {
    const ed = editableRoot(target);
    if (!ed) return;
    if (active?.el === ed.el) return;
    config = await send({ type: "config" });
    if (!config || config.error || !config.enabled) return;
    if (active) teardown();
    active = { ...ed, issues: [], text: "", ignored: new Set(), error: config.signedIn ? null : "Sign in to Style Desk from the toolbar button to check this text." };
    deepResult = null;
    active.el.addEventListener("input", schedule);
    active.el.addEventListener("scroll", position);
    render();
    if (config.signedIn) runCheck();
  }

  function teardown() {
    if (!active) return;
    active.el.removeEventListener("input", schedule);
    active.el.removeEventListener("scroll", position);
    active = null;
    panelOpen = false;
    panel.style.display = "none";
    render();
  }

  document.addEventListener("focusin", (e) => activate(e.composedPath()[0] || e.target), true);
  document.addEventListener("click", (e) => {
    if (!active || e.composedPath().includes(host)) return;
    if (!active.el.contains(e.target) && active.el !== e.target) return;
    const off = caretOffset(active);
    const hit = off == null ? null : active.issues.find((i) => i.start != null && off >= i.start && off <= i.end && i.end - i.start <= 120);
    if (hit) { panelOpen = true; renderPanel(hit.id); }
  }, true);
  addEventListener("scroll", () => requestAnimationFrame(position), true);
  addEventListener("resize", () => requestAnimationFrame(position));
  new ResizeObserver(() => requestAnimationFrame(position)).observe(document.documentElement);

  chrome.storage.onChanged.addListener(async () => {
    const el = active?.el;
    config = await send({ type: "config" });
    if (!config?.enabled) teardown();
    else if (el) { teardown(); activate(el); }
  });

  if (document.activeElement) activate(document.activeElement);
})();
