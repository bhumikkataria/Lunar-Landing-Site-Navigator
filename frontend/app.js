/* Lunar Landing Site Navigator: early page logic (skyline, timeline, panorama). */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const L = window.Lib, D = window.Draw;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "checked") el.checked = true;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const S = { meta: null, data: {}, order: [], focus: null, n: 0, tIdx: 0,
              timer: null, heading: 0, tab: "windows" };

  async function api(path, body) {
    const init = body === undefined ? {} : {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    };
    let res;
    try { res = await fetch(path, init); }
    catch (e) { throw new Error("Could not reach the analysis server. Check that it is running and try again."); }
    const data = await res.json().catch(() => ({ error: "The server sent an unreadable response." }));
    if (!res.ok) throw new Error(data.error || "The request failed (" + res.status + ").");
    return data;
  }

  function toast(msg) {
    const t = $("#toast");
    if (!msg) { t.hidden = true; return; }
    t.textContent = msg; t.hidden = false;
  }

  function busy(on) {
    const b = $("#go");
    b.disabled = on;
    b.textContent = on ? "Working..." : "Compare sites";
  }

  function sizedCtx(canvas, cssH) {
    const dpr = window.devicePixelRatio || 1;
    const W = Math.floor(canvas.clientWidth);
    if (W < 40) return null;
    const H = cssH || Math.floor(canvas.clientHeight);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, W, H };
  }

  const focusSite = () => S.data[S.focus];
  const selectedIds = () => $$("#siteChips input:checked").map((i) => i.value);

  function renderHorizon() {
    const c = $("#horizon"), s = focusSite();
    const z = sizedCtx(c);
    if (!z) return;
    if (!s) { D.drawEmpty(z.ctx, z.W, z.H, "Choose sites and press Compare sites", true); return; }
    D.drawHorizon(z.ctx, z.W, z.H, s, S.tIdx);
    c.setAttribute("aria-label", "Horizon plot for " + s.site.name + ". " + L.describeSite(s));
  }

  function renderTimeline() {
    if (typeof D.drawTimeline !== "function") return;
    const c = $("#timeline");
    const sites = S.order.map((id) => S.data[id]).filter(Boolean);
    const cssH = D.timelineHeight(Math.max(1, sites.length));
    c.style.height = cssH + "px";
    const z = sizedCtx(c, cssH);
    if (!z) return;
    if (!sites.length) { D.drawEmpty(z.ctx, z.W, z.H, "No data yet", false); return; }
    D.drawTimeline(z.ctx, z.W, z.H, sites, S.tIdx, null);
    c.setAttribute("aria-label", "Timeline per site. " + sites.map(L.describeSite).join(". "));
  }

  function renderPano() {
    if (S.tab !== "moon" || typeof D.drawPano !== "function") return;
    const c = $("#pano"), s = focusSite();
    const z = sizedCtx(c);
    if (!z) return;
    if (!s) { D.drawEmpty(z.ctx, z.W, z.H, "Choose sites and press Compare sites", true); return; }
    D.drawPano(z.ctx, z.W, z.H, s, S.tIdx, {
      heading: S.heading, fov: Number($("#fov").value), stretch: Number($("#stretch").value),
      enlarge: $("#enlarge").checked,
    });
  }

  function renderReadout() {
    const s = focusSite(), el = $("#readout");
    if (!s) { el.textContent = ""; return; }
    const i = S.tIdx;
    const hz = (az) => L.horizonAt(s.horizon_az, s.horizon_el, az);
    const sunUp = s.sun_el[i] > hz(s.sun_az[i]);
    const earthUp = s.earth_el[i] > hz(s.earth_az[i]);
    el.textContent = "Sun: " + (sunUp ? "above" : "below") + " the skyline. Earth: " +
      (earthUp ? "above" : "below") + " the skyline. " + L.fmtTime(s.times[i]);
  }

  function renderFocusOptions() {
    $("#focus").replaceChildren(...S.order.map((id) =>
      h("option", { value: id, text: S.data[id].site.name })));
    if (S.focus) $("#focus").value = S.focus;
  }

  function renderAll() {
    renderHorizon(); renderTimeline(); renderPano(); renderReadout();
  }

  function redrawLive() {
    renderHorizon(); renderTimeline(); renderPano(); renderReadout();
    const s = focusSite();
    if (s) {
      const scrub = $("#scrub");
      scrub.max = String(Math.max(0, S.n - 1));
      scrub.value = String(S.tIdx);
    }
  }

  function stopPlay() {
    if (S.timer) clearInterval(S.timer);
    S.timer = null;
    $("#play").textContent = "Play time-lapse";
  }

  function showTab(name) {
    S.tab = name;
    for (const b of $$("[role=tab]")) {
      const on = b.dataset.tab === name;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      $("#tab-" + b.dataset.tab).hidden = !on;
    }
    renderPano();
  }

  async function refresh() {
    const ids = selectedIds();
    if (!ids.length) { toast("Pick at least one site."); return; }
    busy(true); toast("");
    try {
      const r = await api("/api/series", {
        site_ids: ids, start: $("#start").value, end: $("#end").value,
        step_h: 1, height_m: Number($("#mast").value),
      });
      S.data = r.sites;
      S.order = ids.filter((id) => r.sites[id]);
      S.focus = S.order[0] || null;
      S.n = S.focus ? S.data[S.focus].times.length : 0;
      S.tIdx = 0;
      $("#scrub").max = String(Math.max(0, S.n - 1));
      $("#scrub").value = "0";
      renderFocusOptions();
      renderAll();
    } catch (e) {
      toast(e.message);
    } finally {
      busy(false);
    }
  }

  function wire() {
    $("#controls").addEventListener("submit", (e) => { e.preventDefault(); refresh(); });
    $("#objective").addEventListener("change", (e) => { $("#batteryRow").hidden = e.target.value !== "survive"; });
    $("#mast").addEventListener("input", (e) => { $("#mastOut").textContent = e.target.value + " m"; });
    $("#focus").addEventListener("change", (e) => { S.focus = e.target.value; renderAll(); });
    $("#scrub").addEventListener("input", (e) => { S.tIdx = Number(e.target.value); redrawLive(); });
    $("#play").addEventListener("click", () => {
      if (S.timer) { stopPlay(); return; }
      if (!S.n) return;
      $("#play").textContent = "Pause";
      S.timer = setInterval(() => { S.tIdx = (S.tIdx + 1) % S.n; redrawLive(); }, 120);
    });
    for (const r of $$("input[name=mode]")) r.addEventListener("change", (e) => {
      document.body.dataset.mode = e.target.value;
      renderAll();
    });
    for (const b of $$("[role=tab]")) b.addEventListener("click", () => showTab(b.dataset.tab));

    const tl = $("#timeline");
    const scrubTo = (e) => {
      if (!S.n || typeof D.timelineIndexFromX !== "function") return;
      const rect = tl.getBoundingClientRect();
      S.tIdx = D.timelineIndexFromX(e.clientX - rect.left, rect.width, S.n);
      redrawLive();
    };
    tl.addEventListener("pointerdown", (e) => { tl.setPointerCapture(e.pointerId); scrubTo(e); });
    tl.addEventListener("pointermove", (e) => { if (tl.hasPointerCapture(e.pointerId)) scrubTo(e); });

    const pano = $("#pano");
    let drag = null;
    pano.addEventListener("pointerdown", (e) => { pano.setPointerCapture(e.pointerId); drag = e.clientX; });
    pano.addEventListener("pointermove", (e) => {
      if (drag == null) return;
      const rect = pano.getBoundingClientRect();
      S.heading = ((S.heading - ((e.clientX - drag) / rect.width) * Number($("#fov").value)) % 360 + 360) % 360;
      drag = e.clientX; renderPano();
    });
    const endDrag = () => { drag = null; };
    pano.addEventListener("pointerup", endDrag);
    pano.addEventListener("pointercancel", endDrag);
    for (const id of ["#fov", "#stretch", "#enlarge"]) $(id).addEventListener("input", renderPano);
  }

  async function init() {
    wire();
    try {
      S.meta = await api("/api/meta");
    } catch (e) { toast(e.message); return; }
    const banner = $("#banner");
    S.meta.warnings.forEach((w, i) => banner.append(
      h("p", { class: i === 0 && S.meta.synthetic ? "strong" : "", text: w })));
    $("#siteChips").append(...S.meta.sites.map((s) =>
      h("label", {}, h("input", { type: "checkbox", value: s.id, checked: true }), s.name)));
    const today = new Date(), end = new Date(today.getTime() + 120 * 864e5);
    const iso = (d) => d.toISOString().slice(0, 10);
    $("#start").value = iso(today); $("#end").value = iso(end);
    await refresh();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
