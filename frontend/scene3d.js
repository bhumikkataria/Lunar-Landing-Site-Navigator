/* 3D WebGL Mission Control Dome: scaffold.
 *
 * This first pass establishes the renderer, camera, orbit controls, starfield,
 * and a simple ground ring. Terrain extrusion, sightlines, and the celestial
 * bodies are layered on in the next commits.
 */
(function (root) {
  "use strict";

  if (typeof window === "undefined" || typeof THREE === "undefined") {
    root.Scene3D = { init: () => false, update: () => {}, setSite: () => {}, setCamera: () => {} };
    return;
  }

  let scene, camera, renderer, controls;
  let starField, ground, sunMarker, earthMarker;
  let dirLight, ambientLight;
  let currentSite = null;
  let animFrameId = 0;
  let wrapEl, canvasEl;

  const R_GROUND = 60.0;
  const R_SUN = 100.0;
  const R_EARTH = 85.0;

  function degToRad(deg) { return (deg * Math.PI) / 180.0; }

  function azElToVector3(azDeg, elDeg, radius) {
    const az = degToRad(azDeg), el = degToRad(elDeg);
    const horiz = radius * Math.cos(el);
    return new THREE.Vector3(
      horiz * Math.sin(az),
      radius * Math.sin(el),
      -horiz * Math.cos(az)
    );
  }

  function init(containerId) {
    wrapEl = document.getElementById(containerId);
    if (!wrapEl) return false;
    canvasEl = wrapEl.querySelector("canvas");
    if (!canvasEl) return false;

    try {
      const W = wrapEl.clientWidth || 800;
      const H = wrapEl.clientHeight || 400;

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x070a10);
      scene.fog = new THREE.FogExp2(0x070a10, 0.003);

      camera = new THREE.PerspectiveCamera(48, W / H, 0.5, 2500);
      camera.position.set(55, 40, 65);

      renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false });
      renderer.setSize(W, H);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      if (typeof THREE.OrbitControls !== "undefined") {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 8;
        controls.maxDistance = 220;
        controls.target.set(0, 0, 0);
      }

      ambientLight = new THREE.AmbientLight(0x111624, 0.55);
      scene.add(ambientLight);
      dirLight = new THREE.DirectionalLight(0xfff5d6, 1.6);
      dirLight.position.set(40, 80, 20);
      scene.add(dirLight);

      // Deterministic starfield.
      const positions = [];
      let seed = 20261103;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      for (let i = 0; i < 1200; i++) {
        const r = 400 + rnd() * 900;
        const theta = rnd() * Math.PI * 2;
        const phi = Math.acos(2 * rnd() - 1);
        positions.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      starField = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false }));
      scene.add(starField);

      ground = new THREE.Mesh(
        new THREE.CircleGeometry(R_GROUND, 96),
        new THREE.MeshStandardMaterial({ color: 0x161a22, roughness: 0.95, metalness: 0.05 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.02;
      scene.add(ground);

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(R_GROUND - 0.4, R_GROUND + 0.4, 96),
        new THREE.MeshBasicMaterial({ color: 0x2e3f56, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      scene.add(ring);

      sunMarker = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0xf0b93a })
      );
      scene.add(sunMarker);
      earthMarker = new THREE.Mesh(
        new THREE.SphereGeometry(1.8, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0x5eaee8 })
      );
      scene.add(earthMarker);

      onWindowResize();
      window.addEventListener("resize", onWindowResize);
      animate();
      return true;
    } catch (e) {
      console.warn("3D dome unavailable:", e);
      return false;
    }
  }

  function setSite(siteData) {
    currentSite = siteData;
    const el = document.getElementById("hudSite");
    if (el && siteData && siteData.site) {
      el.textContent = siteData.site.name;
    }
  }

  function update(siteData, tIdx) {
    if (!siteData || !siteData.times || !siteData.times.length) return;
    const i = Math.max(0, Math.min(tIdx, siteData.times.length - 1));
    if (sunMarker) sunMarker.position.copy(azElToVector3(siteData.sun_az[i], siteData.sun_el[i], R_SUN));
    if (earthMarker) earthMarker.position.copy(azElToVector3(siteData.earth_az[i], siteData.earth_el[i], R_EARTH));
    const timeEl = document.getElementById("hudTime");
    if (timeEl) timeEl.textContent = String(siteData.times[i]).replace("T", " ") + " UTC";
    const status = document.getElementById("hudStatus");
    if (status) {
      const code = siteData.code[i];
      const labels = ["BATTERY DRAIN (NO POWER / NO DTE)", "SOLAR POWER ONLY (NO DTE LINK)",
                      "EARTH COMMS ONLY (LUNAR NIGHT)", "NOMINAL: POWER + DTE COMMS"];
      const classes = ["none", "power", "comms", "both"];
      status.className = "hud-status " + classes[code];
      status.textContent = labels[code];
    }
  }

  function setCamera(mode) {
    if (!camera || !controls) return;
    if (mode === "pov") {
      camera.position.set(0, 3.2, 0);
      controls.target.set(0, 2.0, -30);
    } else if (mode === "polar") {
      camera.position.set(0, 130, 0.1);
      controls.target.set(0, 0, 0);
    } else {
      camera.position.set(55, 40, 65);
      controls.target.set(0, 0, 0);
    }
    controls.update();
  }

  function onWindowResize() {
    if (!wrapEl || !renderer || !camera) return;
    const W = wrapEl.clientWidth || 800;
    const H = wrapEl.clientHeight || 400;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H);
  }

  function animate() {
    animFrameId = requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  root.Scene3D = {
    init,
    update,
    setSite,
    setCamera,
    dispose() {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      window.removeEventListener("resize", onWindowResize);
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
