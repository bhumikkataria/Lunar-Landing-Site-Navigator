/* Canvas drawing (no DOM access). All sizes are CSS pixels; the caller scales the context for DPR. */
(function (root) {
  "use strict";
  const L = root.Lib || (typeof require !== "undefined" ? require("./lib.js") : null);

  const SUN = "#f0b93a", EARTH = "#6ea2e8";
  const INK = "#1d2024", MUTED = "#5d6169", PAPER = "#f3f1ec", RULE = "#cfcbc3";
  const LIGHT_LINES = { both: "#1f9d6b", power: "#b8821a", comms: "#2d5f96" };
  const FONT = "12px system-ui, -apple-system, 'Segoe UI', sans-serif";

  const maxOf = (a) => { let m = -Infinity; for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; };
  const minOf = (a) => { let m = Infinity; for (let i = 0; i < a.length; i++) if (a[i] < m) m = a[i]; return m; };

  function drawEmpty(ctx, W, H, msg, dark) {
    ctx.fillStyle = dark ? "#0f1218" : PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = dark ? "#9aa3b2" : MUTED;
    ctx.font = FONT;
    ctx.textAlign = "center";
    ctx.fillText(msg, W / 2, H / 2);
    ctx.textAlign = "left";
  }

  function skyGradient(ctx, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#07090d");
    g.addColorStop(1, "#141a26");
    return g;
  }

  /* ---------------------------------------------------------------- horizon plot */
  function drawHorizon(ctx, W, H, site, tIdx) {
    const pad = { l: 46, r: 14, t: 14, b: 28 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const hor = site.horizon_el, azs = site.horizon_az;
    let hi = Math.max(8, maxOf(hor), maxOf(site.sun_el), maxOf(site.earth_el));
    let lo = Math.min(-3, minOf(hor), minOf(site.sun_el), minOf(site.earth_el));
    hi = Math.min(40, Math.ceil(hi / 2) * 2);
    lo = Math.max(-20, Math.floor(lo / 2) * 2);
    const x = (az) => pad.l + (az / 360) * pw;
    const y = (el) => pad.t + ((hi - el) / (hi - lo)) * ph;
    const pxPerDeg = ph / (hi - lo);

    ctx.fillStyle = skyGradient(ctx, H);
    ctx.fillRect(0, 0, W, H);

    ctx.font = FONT;
    ctx.lineWidth = 1;
    const stepEl = hi - lo > 24 ? 5 : 2;
    for (let e = Math.ceil(lo / stepEl) * stepEl; e <= hi; e += stepEl) {
      ctx.strokeStyle = e === 0 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.08)";
      ctx.setLineDash(e === 0 ? [5, 4] : []);
      ctx.beginPath(); ctx.moveTo(pad.l, y(e)); ctx.lineTo(W - pad.r, y(e)); ctx.stroke();
      ctx.fillStyle = "#9aa3b2";
      ctx.textAlign = "right";
      ctx.fillText(e + "°", pad.l - 6, y(e) + 4);
    }
    ctx.setLineDash([]);
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"];
    ctx.textAlign = "center";
    for (let k = 0; k <= 8; k++) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath(); ctx.moveTo(x(k * 45), pad.t); ctx.lineTo(x(k * 45), pad.t + ph); ctx.stroke();
      ctx.fillStyle = "#9aa3b2";
      ctx.fillText(dirs[k], x(k * 45), H - 9);
    }

    // Sun and Earth tracks over the chosen dates
    const n = site.times.length;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = "rgba(240,185,58,0.32)";
      ctx.fillRect(x(site.sun_az[i]) - 1, y(site.sun_el[i]) - 1, 2, 2);
      ctx.fillStyle = "rgba(110,162,232,0.32)";
      ctx.fillRect(x(site.earth_az[i]) - 1, y(site.earth_el[i]) - 1, 2, 2);
    }

    // current positions (drawn before terrain so terrain hides a body that is blocked)
    const marks = [
      { az: site.sun_az[tIdx], el: site.sun_el[tIdx], c: SUN, r: Math.max(5, 0.27 * pxPerDeg), name: "Sun" },
      { az: site.earth_az[tIdx], el: site.earth_el[tIdx], c: EARTH, r: Math.max(7, 0.95 * pxPerDeg), name: "Earth" },
    ];

    // terrain silhouette
    ctx.beginPath();
    ctx.moveTo(x(0), y(hor[0]));
    for (let i = 1; i < azs.length; i++) ctx.lineTo(x(azs[i]), y(hor[i]));
    ctx.lineTo(x(360), y(hor[0]));
    ctx.lineTo(x(360), pad.t + ph);
    ctx.lineTo(x(0), pad.t + ph);
    ctx.closePath();
    const tg = ctx.createLinearGradient(0, y(maxOf(hor)), 0, pad.t + ph);
    tg.addColorStop(0, "#6d6b66");
    tg.addColorStop(1, "#2a2b2e");
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.strokeStyle = "#cfcac0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x(0), y(hor[0]));
    for (let i = 1; i < azs.length; i++) ctx.lineTo(x(azs[i]), y(hor[i]));
    ctx.lineTo(x(360), y(hor[0]));
    ctx.stroke();

    // markers on top, with a note when the terrain blocks them
    for (const m of marks) {
      const blocked = m.el <= L.horizonAt(azs, hor, m.az);
      ctx.lineWidth = 2;
      ctx.strokeStyle = m.c;
      ctx.fillStyle = blocked ? "rgba(0,0,0,0)" : m.c;
      ctx.setLineDash(blocked ? [3, 3] : []);
      ctx.beginPath();
      ctx.arc(x(m.az), y(m.el), m.r, 0, Math.PI * 2);
      if (!blocked) ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#e8eaee";
      ctx.textAlign = "left";
      const lx = Math.min(x(m.az) + m.r + 4, W - 130);
      ctx.fillText(m.name + (blocked ? " (behind terrain)" : ""), lx, y(m.el) - m.r - 3);
    }
    ctx.textAlign = "left";
  }

    const Draw = { drawEmpty, drawHorizon };
  if (typeof module !== "undefined" && module.exports) module.exports = Draw; else root.Draw = Draw;
})(typeof window !== "undefined" ? window : globalThis);
