/* Lunar Landing Site Navigator: page shell. */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);

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

  async function init() {
    try {
      const meta = await api("/api/meta");
      const banner = $("#banner");
      meta.warnings.forEach((w, i) => banner.append(
        h("p", { class: i === 0 && meta.synthetic ? "strong" : "", text: w })));
      $("#siteChips").append(...meta.sites.map((s) =>
        h("label", {}, h("input", { type: "checkbox", value: s.id, checked: true }), s.name)));
      const today = new Date(), end = new Date(today.getTime() + 120 * 864e5);
      const iso = (d) => d.toISOString().slice(0, 10);
      $("#start").value = iso(today);
      $("#end").value = iso(end);
      $("#controls").addEventListener("submit", (e) => {
        e.preventDefault();
        toast("The analysis views are wired in the next commits.");
      });
    } catch (e) {
      toast(e.message);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
