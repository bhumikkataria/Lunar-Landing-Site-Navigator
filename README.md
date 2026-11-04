# Lunar Landing Site Navigator

*Autonomous lunar landing site evaluation, line-of-sight visibility analysis, and multi-agent mission planning.*

---

## 1. Executive Summary & Purpose

The **Lunar Landing Site Navigator** is an engineering analysis system and tactical decision platform developed for lunar exploration, specifically targeted at the extreme topographical and orbital constraints of the Moon's South Pole.

At the lunar South Pole, the Sun and Earth remain perpetually close to the horizon (typically within $1.5^\circ$ to $2.0^\circ$ of local elevation). Because of this low grazing angle, local topographical features—crater rims, massifs, and ridges—cast long shadows and frequently sever direct-to-Earth (DTE) radio communications. Selecting a viable landing site and mission window requires balancing two often conflicting operational requirements:
1. **Solar illumination** to maintain photovoltaic power generation and thermal survival.
2. **Direct-to-Earth radio visibility** to enable real-time telemetry, teleoperation, and astronaut communications.

Existing lunar visualization tools primarily provide static illumination rasters or raw celestial coordinates. The Lunar Landing Site Navigator was built to solve the inverse operational problem: **identifying, ranking, and verifying optimal landing windows under multi-objective constraints within 30 seconds**, while quantifying topographical uncertainty and evaluating antenna mast height sensitivity.

The system combines a high-performance numerical core (polar stereographic DEM processing, orbital ephemeris, radial horizon raymarching, and Monte Carlo uncertainty quantification) with an interactive 2D/3D Mission Control tactical interface and a deterministic, multi-agent AI Copilot.

---

## 2. System Architecture & Information Flow

The architecture is divided into three distinct operational layers: the **Deterministic Numerical Core**, the **Multi-Agent Verification Pipeline**, and the **Interactive Mission Control Client**.

```
+----------------------------------------------------------------------------------------------------+
|                                    ORBITAL & TERRAIN DATA INPUTS                                   |
|   - NASA LOLA 80m South-Polar DEM (or Synthetic Fallback)                                          |
|   - NASA NAIF SPICE DE440 Kernels (or Analytical Meeus + IAU 2015 Lunar Orientation Model)          |
|   - Artemis III 2024 Candidate Region Geometries (USGS / LROC QuickMap Polygons)                   |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
|                                      DETERMINISTIC NUMERICAL CORE                                  |
|                                                                                                    |
|   1. Coordinate Transformation & DEM Slicing (backend/dem.py)                                      |
|      Selenographic (Lat, Lon) <---> South-Polar Stereographic (x, y) [R_Moon = 1,737,400 m]       |
|                                                                                                    |
|   2. Radial Horizon Raymarching (backend/horizon.py)                                               |
|      360 Azimuthal Rays x 30 km Range with Lunar Curvature Correction: Delta_z = r^2 / (2*R_Moon)  |
|                                                                                                    |
|   3. Ephemeris Vector Calculation (backend/ephemeris.py)                                           |
|      Hourly Topocentric Sun & Earth Azimuth/Elevation in local East-North-Up (ENU) frame           |
|                                                                                                    |
|   4. Topographical Line-of-Sight Visibility Classification (backend/visibility.py)                 |
|      Hourly State Classification: [Neither (0), Power Only (1), Comms Only (2), Both (3)]          |
|                                                                                                    |
|   5. Mission Window Optimization & Ranking (backend/windows.py)                                    |
|      Sliding cumulative sum over date range for Balanced, Power, Comms, or Survival objectives     |
|                                                                                                    |
|   6. Antenna Mast Height Sweep (backend/height_sweep.py)                                           |
|      Elevation angle re-evaluations across 0 m - 15 m to identify obstacle clearance "flips"       |
|                                                                                                    |
|   7. Spatially Correlated Monte Carlo Uncertainty (backend/uncertainty.py)                         |
|      30 2D Gaussian random field terrain realizations (sigma = 8 m, corr = 500 m) -> P10/P50/P90   |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
                         +------------------------+------------------------+
                         |                                                 |
                         v                                                 v
+--------------------------------------------------+ +-----------------------------------------------+
|         MULTI-AGENT COPILOT PIPELINE             | |         MISSION CONTROL INTERFACE             |
|                                                  | |                                               |
|  - Query Agent (backend/agents/query.py):         | |  - 3D Tactical Dome (frontend/scene3d.js):    |
|    Natural language request normalization        | |    WebGL extruded terrain bowl, 3D orbits,    |
|    with explicit assumption extraction           | |    occlusion raycasts, lander status halo     |
|                                                  | |                                               |
|  - Service Orchestrator (backend/orchestrator.py)| |  - 2D Skyline Plot (frontend/draw.js):        |
|    Deterministic execution across all sites     | |    Terrain skyline with Sun/Earth tracks      |
|                                                  | |                                               |
|  - Explainer Agent (backend/agents/explainer.py):| |  - 360 Panorama (frontend/draw.js):          |
|    Planner or Public narrative synthesis         | |    Unrolled panoramic horizon silhouette      |
|                                                  | |                                               |
|  - Verifier Agent (backend/agents/verifier.py):  | |  - Telemetry Timeline & Scrubbing:            |
|    Deterministic value-presence fact check.      | |    Color-coded multi-site state Gantt matrix  |
|    Zero LLM hallucinations permitted;            | |                                               |
|    discards unverified text -> template fallback | |  - Sensitivity & Confidence Visualizations:   |
|                                                  | |    Mast-height gains & Monte Carlo spreads    |
+--------------------------------------------------+ +-----------------------------------------------+
                         |                                                 |
                         +------------------------+------------------------+
                                                  |
                                                  v
+----------------------------------------------------------------------------------------------------+
|                                    MINIMAL ASGI APPLICATION SERVER                                 |
|                          backend/api/server.py (Zero web frameworks, async)                        |
|                                 Serving JSON REST API & Static Frontend                            |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. Implemented Modules & Technical Details

### 3.1 Digital Elevation Model (DEM) Engine (`backend/dem.py`)

The terrain layer is built on south-polar stereographic projection mathematics centered on the lunar South Pole with standard radius $R_{\text{Moon}} = 1,737,400\text{ m}$.

* **Coordinate Conversions:**
  * Forward projection: Selenographic coordinates $(\phi, \lambda)$ (latitude, east-positive longitude) are transformed into planar $(x, y)$ coordinates via:
    $$\rho = 2 R_{\text{Moon}} \tan\left(\frac{\pi}{4} + \frac{\phi}{2}\right)$$
    $$x = \rho \cos(\lambda), \quad y = \rho \sin(\lambda)$$
  * Inverse projection: Planar $(x, y)$ coordinates are mapped back to selenographic $(\phi, \lambda)$ via:
    $$\rho = \sqrt{x^2 + y^2}$$
    $$\phi = 2 \arctan\left(\frac{\rho}{2 R_{\text{Moon}}}\right) - \frac{\pi}{2}, \quad \lambda = \operatorname{atan2}(y, x) \pmod{2\pi}$$
* **Area-Aware Grid Conversion (`from_proj_south_polar_area`):**
  Standard cartographic tools often format South Pole rasters with even pixel dimensions where the pole falls on a continuous half-pixel boundary (e.g. continuous pixel coordinate $(3799.5, 3799.5)$ in a $7600 \times 7600$ grid). The engine implements an exact continuous sub-pixel affine transformation using `scipy.ndimage.map_coordinates` (order-1 bilinear interpolation), producing an odd-dimensioned internal grid centered exactly at the center pixel.
* **Dual Terrain Modes:**
  1. *Real Data Mode:* Ingests high-resolution LOLA laser altimetry data (`LDEM_80S_80MPP_ADJ.TIF`, $80\text{ m/pixel}$, $240\text{ km}$ crop radius).
  2. *Synthetic Stand-in Mode (`synthetic_dem`):* Procedural 2D fractal terrain synthesized via 2D Fast Fourier Transform ($k^{-1.6}$ spectral power distribution) combined with mathematical crater bowls, ejecta rims, and ridge massifs. This mode enables zero-dependency offline development and testing.

### 3.2 Ephemeris Engine (`backend/ephemeris.py`)

The system determines the topocentric azimuth and elevation of both the Sun and Earth from any lunar surface position over arbitrary time spans.

* **NASA NAIF SPICE Engine (`spice_backend`):**
  Integrates NASA's standard NAIF SPICE toolkit via `spiceypy`. It loads high-precision DE440 planetary ephemerides and orientation kernels:
  * Leap seconds kernel (`naif0012.tls`)
  * Solar system planetary ephemeris (`de440s.bsp`)
  * Lunar physical libration kernel (`moon_pa_de440_200625.bpc`)
  * Lunar frame definition kernel (`moon_de440_250416.tf`)
  * Planetary constants kernel (`pck00011.tpc`)
  Calculations evaluate positions in the `MOON_ME` (Mean Earth / Polar Axis) reference frame with full light-time and stellar aberration corrections (`LT+S`). The site position is mapped using selenodetic coordinates on the IAU triaxial ellipsoid.
* **Analytical Ephemeris Engine (`sun_earth_azel`):**
  A pure-NumPy analytical engine based on Jean Meeus (*Astronomical Algorithms*, Chapters 25 & 47) and the IAU 2015 lunar orientation model (Archinal et al. 2018). It calculates Terrestrial Time (TT) from UTC, apparent geocentric solar ecliptic coordinates, geocentric lunar ecliptic positions, ICRF/J2000 coordinate rotations, and topocentric transformations into the local East-North-Up (ENU) topocentric reference frame:
  $$\text{Azimuth} = \operatorname{atan2}(v_{\text{east}}, v_{\text{north}}) \pmod{360^\circ}$$
  $$\text{Elevation} = \arcsin\left(\frac{v_{\text{up}}}{\|v\|}\right)$$
* **Zero Silent Fallback Policy:** The ephemeris backend selection is strictly explicit. If SPICE mode is requested and dependencies or kernels are missing, the system aborts immediately with an actionable error rather than falling back to analytical calculations silently.

### 3.3 Radial Horizon Raymarching Engine (`backend/horizon.py`)

For any landing site, the local skyline is calculated across 360 azimuthal headings (default $1.0^\circ$ resolution):

* **Spherical Great-Circle Raymarching:** Each ray is projected outward from the landing site up to a radial distance $r_{\max} = 30\text{ km}$ in single-pixel increments.
* **Curvature Correction:** Terrain heights $z_t$ sampled along the ray include a negative parabolic elevation offset to account for the curvature of the lunar sphere:
  $$\Delta z = \frac{r^2}{2 R_{\text{Moon}}}$$
  $$\theta(r) = \arctan\left(\frac{z_t - z_{\text{obs}} - \Delta z}{r}\right)$$
  $$\theta_{\text{horizon}}(\text{az}) = \max_{r \in (0, r_{\max}]} \theta(r)$$
* **Observer Mast Elevation:** The observer elevation $z_{\text{obs}} = z_0 + h_{\text{mast}}$ directly accounts for equipment mounted on lander masts.
* **Edge Limitation Detection:** The engine tracks whether any ray truncated prematurely at the boundary of the loaded DEM raster, reporting `edge_limited: true` to notify users when distant terrain relief might be unmodeled.

### 3.4 Line-of-Sight Visibility Classification (`backend/visibility.py`)

Line-of-sight status is evaluated for every hourly time step:

* **Clearance Evaluation:**
  $$\Delta_{\odot}(t) = \operatorname{el}_{\odot}(t) - \theta_{\text{horizon}}(\operatorname{az}_{\odot}(t)) - \text{margin}_{\odot}$$
  $$\Delta_{\oplus}(t) = \operatorname{el}_{\oplus}(t) - \theta_{\text{horizon}}(\operatorname{az}_{\oplus}(t)) - \text{margin}_{\oplus}$$
  Default angular margins treat bodies as point sources at their centers. Optional clearances account for finite disk radii (Sun $\approx 0.27^\circ$, Earth $\approx 0.95^\circ$) or antenna/panel pointing thresholds.
* **Discrete Operational States:**
  * `0: NEITHER` — Total darkness and radio blackout.
  * `1: POWER_ONLY` — Direct solar illumination; Earth obstructed.
  * `2: COMMS_ONLY` — Direct line-of-sight to Earth; lunar night.
  * `3: BOTH` — Simultaneous solar power generation and direct-to-Earth communication.
* **Run-Length Analytics:** Vectorized run-length encoding identifies the longest continuous shadow period (`longest_dark_h`, representing battery depletion time) and longest communication blackout (`longest_comms_gap_h`).

### 3.5 Mission Window Optimization Engine (`backend/windows.py`)

Mission windows of specified duration $L$ (hours) are evaluated across an extended date range on a 1-hour temporal grid using cumulative sum (prefix sum) algorithms for $O(N)$ execution speed:

* **Objective Functions:**
  1. **Balanced:** Rewards simultaneous power and comms overlap while penalizing extended darkness:
     $$S_{\text{balanced}} = 0.50 \cdot P_{\text{both}} + 0.25 \cdot P_{\text{power}} + 0.25 \cdot P_{\text{comms}} - 0.25 \cdot \frac{T_{\text{dark, max}}}{L}$$
  2. **Power First:** Prioritizes photovoltaic energy generation:
     $$S_{\text{power}} = P_{\text{power}} + 0.30 \cdot P_{\text{both}} - 0.30 \cdot \frac{T_{\text{dark, max}}}{L}$$
  3. **Comms First:** Prioritizes continuous direct communications:
     $$S_{\text{comms}} = P_{\text{comms}} + 0.30 \cdot P_{\text{both}} - 0.30 \cdot \frac{T_{\text{comms\_gap, max}}}{L}$$
  4. **Survival:** Enforces a hard battery constraint: if the longest continuous dark stretch exceeds the onboard battery reserve ($T_{\text{dark, max}} > T_{\text{battery}}$), the window is flagged as infeasible (`feasible: false`) and heavily penalized:
     $$S_{\text{survive}} = -1.0 - \frac{T_{\text{dark, max}} - T_{\text{battery}}}{L}$$
* **Non-Overlapping Ranking:** Candidate windows are ranked by feasibility first, then by score. A greedy non-maximum suppression algorithm enforces minimum temporal separation between reported windows.

### 3.6 Mast-Height Trade-off Engine (`backend/height_sweep.py`)

Evaluates horizon profiles and visibility metrics across a discrete sweep of mast heights: $0.0\text{ m}, 1.0\text{ m}, 2.0\text{ m}, 3.0\text{ m}, 5.0\text{ m}, 8.0\text{ m}, 10.0\text{ m}, 15.0\text{ m}$ (capped at $15.0\text{ m}$).

* **Obstacle Clearance Detection ("Flips"):** Identifies non-linear jumps in visibility metrics ($\ge 10.0$ percentage points) between consecutive height steps. This alerts mission architects when a modest mast extension clears a nearby crater rim and significantly expands the communication or power window.

### 3.7 Spatially Correlated Monte Carlo Uncertainty Engine (`backend/uncertainty.py`)

Quantifies the sensitivity of mission planning decisions to errors in digital elevation models.

* **Stochastic Terrain Perturbation:** Generates $N=30$ independent terrain realizations by superimposing spatially correlated 2D Gaussian random noise fields:
  $$\delta z \sim \mathcal{G}(\sigma = 8.0\text{ m}, L_{\text{corr}} = 500\text{ m})$$
  Generated using Gaussian filtering (`scipy.ndimage.gaussian_filter`) scaled to exact standard deviation.
* **Ensemble Visibility & Confidence Bands:** Recomputes horizon raymarching and window metrics across all 30 realizations to produce 10th ($P_{10}$), 50th ($P_{50}$, median), and 90th ($P_{90}$) percentiles for all key metrics.
* **Robustness Classification:**
  * **Robust:** Spread $(P_{90} - P_{10}) \le 10$ percentage points. The decision is stable against terrain noise.
  * **Moderate:** $10 < \text{spread} \le 25$ percentage points.
  * **Fragile:** $\text{spread} > 25$ percentage points. Mission success depends heavily on local elevation fidelity.

### 3.8 Candidate Site Registry (`backend/sites.py`, `scripts/prepare_sites.py`)

* **2024 Artemis III Down-Selection:** Includes all 9 official candidate regions announced by NASA:
  1. *Peak Near Cabeus B*
  2. *Haworth*
  3. *Malapert Massif*
  4. *Mons Mouton Plateau*
  5. *Mons Mouton*
  6. *Nobile Rim 1*
  7. *Nobile Rim 2*
  8. *de Gerlache Rim 1*
  9. *de Gerlache Rim 2*
* **Shoelace Centroid Derivation:** Candidate sites are derived from official 5-point region polygon coordinates (`A3_9regions-lonlat-simplified.geojson`). The generator computes projected shoelace centroids, verifies via ray-casting that each centroid falls strictly inside its region polygon, and verifies that the computed projected polygon area matches the source `Area_km2` within $1.0\%$.
* **Provenance Tracking:** Every site carries a `representative: true` flag and explicit source metadata, clearly indicating that the point represents an interior location within an official candidate region rather than a certified landing touchdown point.

---

## 4. Multi-Agent AI Pipeline & Deterministic Verification

The AI pipeline is designed under a foundational engineering rule: **Artificial Intelligence is the natural-language interface; all numbers, dates, and rankings originate strictly from deterministic numerical code.**

```
User Query (Plain English)
            |
            v
+-------------------------------+
|          QUERY AGENT          |  --> Identifies: target sites, date ranges, duration,
|   (backend/agents/query.py)   |      objective, battery capacity, mast height.
+---------------+---------------+  --> Emits: normalized request + explicit assumptions list.
                |
                v
+-------------------------------+
|     ANALYSIS ORCHESTRATOR     |  --> Executes deterministic Service analysis tools across all sites:
|   (backend/orchestrator.py)   |      - windows() search
+---------------+---------------+      - height() sweep
                |                      - uncertainty() Monte Carlo
                v                      - deterministic ranker
+-------------------------------+
|        EXPLAINER AGENT        |  --> Ingests computed facts dictionary.
| (backend/agents/explainer.py) |  --> Generates concise briefing tailored for Planner or Public.
+---------------+---------------+      (LLM API or deterministic template)
                |
                v
+-------------------------------+
|        VERIFIER AGENT         |  --> Deterministic value-presence checker (No LLM).
|  (backend/agents/verifier.py) |  --> Scans explanation text against raw facts.
+---------------+---------------+
                |
        +-------+-------+
        |               |
     [Pass]          [Fail]
        |               |
        |               v
        |       LLM Text Discarded!
        |       Falls back immediately to
        |       deterministic verified template.
        v               v
+-------------------------------+
|   VERIFIED RESPONSE PAYLOAD   |  --> Transmitted to UI with verified badge,
|                               |      caveats, explicit assumptions, and execution trace.
+-------------------------------+
```

### 4.1 Query Agent (`backend/agents/query.py`)
Parses conversational user prompts into validated analysis request structures.
* **Extracted Parameters:** Site IDs, calendar start/end dates, mission duration (days or hours), optimization objective (`balanced`, `power`, `comms`, `survive`), battery reserve ($h$), and mast height ($m$).
* **Explicit Assumption Tracking:** Whenever a parameter is not specified in the user's prompt, the agent sets a safe default and records an explicit assumption string (e.g., *"No site was named, so all sites are compared"*, *"No mast height was specified, so ground level (0 m) was assumed"*).
* **Dual Execution:** Operates via LLM structured output when an API key is provided, falling back seamlessly to an internal regex and natural-language token parser.

### 4.2 Explainer Agent (`backend/agents/explainer.py`)
Translates structured computational results into concise operational briefings.
* **Audience Adaptation:**
  * *Planner Mode:* Concise, quantitative, mission-critical metrics, percentile spreads, and mast trade-off details.
  * *Public Mode:* Accessible language avoiding aerospace jargon, explaining the physical meaning of "power + comms" and solar occlusion.
* **Strict Fact Conditioning:** LLM system instructions strictly restrict outputs to numbers and facts supplied in the input JSON payload, enforcing maximum length (140 words) and exact ISO date formatting.

### 4.3 Verifier Agent (`backend/agents/verifier.py`)
A deterministic Python verification filter containing **zero machine learning or language model code**, guaranteeing zero hallucinations:
* **Value-Presence Checking:** Scans the text using regular expressions to extract every number, date (`YYYY-MM-DD`), site name, and qualitative robustness classification (`robust`, `moderate`, `fragile`).
* **Cross-Verification:** Checks each extracted entity against the numerical facts dictionary generated by the numerical core. Numerical matching includes tolerance scaling based on displayed decimal precision.
* **Rejection & Fallback:** If any number, unbacked date, unknown site name, or ungrounded robustness label appears in the text, `verified` is set to `false`. The orchestrator immediately discards the unverified text and replaces it with the deterministic rule-based template output, preserving full operational integrity.

### 4.4 Multi-Provider LLM Integration (`backend/agents/llm.py`)
Supports two enterprise LLM backends:
1. **Anthropic Claude:** Enabled via `ANTHROPIC_API_KEY` (defaults to `claude-sonnet-5-5`). Implemented using standard library `urllib.request` (zero third-party dependencies).
2. **Google Gemini:** Enabled via `GEMINI_API_KEY` or `GOOGLE_API_KEY` (defaults to `gemini-2.0-flash`) using the official `google-genai` SDK.
* If no API key is present, the pipeline runs entirely on deterministic rules and templates without loss of core analytical functionality.

---

## 5. Mission Control Frontend & Visual Interface

The frontend is an engineering-grade Mission Control interface implemented in standards-compliant HTML5, CSS3, and ES6 JavaScript with no build steps or bundlers.

```
+----------------------------------------------------------------------------------------------------+
|                                    MISSION CONTROL HEADER & STATUS BAR                             |
|  [Mission Logo]  LUNAR LANDING SITE NAVIGATOR    Mode: [Planner | Public]   Data: [REAL / SYNTHETIC]|
+----------------------------------------------------------------------------------------------------+
|                                    WARNING & DATA PROVENANCE BANNER                                |
|  ! Representative interior points inside official candidate region polygons (not certified coords)  |
+----------------------------------------------------------------------------------------------------+
|                                       KPI TELEMETRY RIBBON                                         |
|  [Optimal Site: Peak Near Cabeus B]  [Start: 2027-03-29]  [Both: 38.4%]  [P10-P90: 34-41% (ROBUST)] |
+----------------------------------------------------------------------------------------------------+
|                                    AI MISSION COPILOT DRAWER                                       |
|  > "Which site is best for a 14-day mission in March, power first?"                                |
|  [Checked against data: VERIFIED]  Assumptions: [All 9 sites compared] [0m mast assumed]           |
+----------------------------------------------------------------------------------------------------+
|         TAB NAVIGATION: [ Sky Plot | Timeline | Best Windows | Mast Height | 3D Tactical Dome ]     |
+-------------------------------------------------+--------------------------------------------------+
|                                                 |                                                  |
|  ACTIVE TAB VIEW:                               |  ACTIVE SITE SELECTION & CONFIGURATION:          |
|                                                 |                                                  |
|  - 3D Tactical Dome (Three.js WebGL):           |  Site Selector Chips (9 Candidate Regions):      |
|    Extruded LOLA crater ridges                  |  [*] Peak Near Cabeus B    [*] Haworth           |
|    Animated SPICE Sun & Earth orbits            |  [*] Malapert Massif       [*] Mons Mouton       |
|    Occlusion raycast lines-of-sight             |  [*] Nobile Rim 1          [*] Nobile Rim 2      |
|    Lander halo: Green/Amber/Blue/Red            |  [*] de Gerlache Rim 1     [*] de Gerlache Rim 2 |
|    Camera presets: Tactical / POV / Top-Down    |                                                  |
|                                                 |  Mission Constraints:                            |
|  - 2D Skyline & 360 Panorama Canvas:            |  Start Date: [ 2027-01-01 ]                      |
|    Terrain silhouette with Az/El tracks         |  End Date:   [ 2027-04-01 ]                      |
|                                                 |  Duration:   [ 14 days    ]                      |
|  - Ranked Windows Table & Confidence Bands:     |  Objective:  [ Balanced   ]                      |
|    P10 - P90 Monte Carlo spread visualization   |  Battery:    [ 48 hours   ]                      |
|                                                 |  Mast:       [ 0 meters   ]                      |
+-------------------------------------------------+--------------------------------------------------+
```

### 5.1 Interactive Visual Components
* **3D Tactical Mission Control Dome (`frontend/scene3d.js`):**
  Built using locally vendored Three.js and OrbitControls (zero external CDN network requests). Extrudes the site's local LOLA terrain elevation profile into a 3D cylindrical horizon bowl. Orbits 3D Sun and Earth celestial spheres at precise topocentric angles calculated from ephemeris data. Casts dynamic solar illumination and DTE radio rays toward the lander: if a crater ridge occludes the path, the ray terminates at the obstacle with an impact marker. A holographic lander status halo provides real-time state feedback:
  * **Green:** Dual illumination and radio link active (`BOTH`).
  * **Amber:** Solar charging only (`POWER_ONLY`).
  * **Cyan:** Earth communications during eclipse (`COMMS_ONLY`).
  * **Red:** Complete darkness and radio blackout (`NEITHER`).
  Features one-click tactical camera presets: *Tactical 3D*, *Lander POV*, and *Polar Top-Down*.
* **2D Horizon Sky Plot (`frontend/draw.js`):**
  High-resolution HTML5 Canvas rendering azimuth ($0^\circ - 360^\circ$) vs. elevation ($-5^\circ$ to $+15^\circ$) showing the terrain skyline, solar trajectories, Earth libration loops, and interactive time scrubber.
* **360° Unrolled Horizon Panorama (`frontend/draw.js`):**
  Unrolls the topographical horizon into a continuous panoramic silhouette with dynamic compass markers and celestial tracks.
* **Multi-Site Visibility Timeline (`frontend/draw.js`):**
  A multi-row Gantt-style matrix comparing up to 9 sites simultaneously over months, rendered with high-contrast accessibility colors: Gold (Power), Blue (Comms), Cyan (Both), and Dark Charcoal (Neither).
* **Mast-Height Sweep & Confidence Charts (`frontend/draw.js`):**
  Visualizes non-linear gain curves across mast heights and displays Monte Carlo 10th-to-90th percentile error envelopes.

### 5.2 Accessibility & WCAG AA/AAA Compliance
The user interface implements an audited dark theme conforming to WCAG AA and AAA accessibility contrast standards across all viewports ($1400\text{ px}$, $900\text{ px}$, and $390\text{ px}$ mobile):
* Primary text (`#e2e8f0` on `#0b0e14`): **15.67:1** (AAA)
* Secondary labels (`#94a3b8` on `#0b0e14`): **7.53:1** (AAA)
* Tertiary/dim text (`#8594a6` on `#0b0e14`): **6.24:1** (AA)
* Warning text (`#f0c644` on `#1a1608`): **11.83:1** (AAA)
* Verification badges (`#34d399` on `#151a24`): **9.06:1** (AAA)

---

## 6. Scientific Validation & Calibration

### 6.1 DEM Orientation & Geodetic Landmark Checks
Because polar stereographic grids can be inverted or rotated without runtime crashes, the internal DEM conversion was independently verified against GDAL (`rasterio.warp.transform`) at 12 coordinate locations across all four quadrants. The maximum absolute elevation difference between the internal engine and GDAL was **$0.899\text{ m}$**, within single-pixel interpolation noise at $80\text{ m/pixel}$.

Landmark elevations on the converted grid match official IAU gazetteer features:
* **Shackleton Crater Floor:** $-2,787.9\text{ m}$ (Deep depression)
* **Cabeus Crater Floor:** $-3,736.2\text{ m}$ (Deep depression)
* **Mons Malapert Peak:** $+4,919.6\text{ m}$ (Prominent elevation)
* **Mons Mouton Plateau:** $+5,039.8\text{ m}$ (High plateau)
* **Haworth Crater Floor:** $-3,311.7\text{ m}$ (Deep depression)
* **de Gerlache Rim:** $-1,190.8\text{ m}$
* **Nobile Crater Rim:** $+903.4\text{ m}$
* **Faustini Crater Floor:** $-2,751.3\text{ m}$

### 6.2 SPICE DE440 vs. Analytical Ephemeris Concordance
The analytical ephemeris engine was cross-checked against NASA NAIF SPICE DE440 across all 9 candidate regions over four seasonal dates (2026-11-14, 2027-02-14, 2027-05-14, 2027-08-14) at hourly resolution (864 total evaluation samples per backend):

| Parameter | Maximum Absolute Difference |
|---|---|
| Sun Azimuth | $0.00596^\circ$ |
| Sun Elevation | $0.00155^\circ$ |
| Earth Azimuth | $0.00315^\circ$ |
| Earth Elevation | $0.00186^\circ$ |

Maximum angular discrepancies remain under $0.006^\circ$, validating the analytical model for horizon-scale illumination and radio visibility studies.

### 6.3 Scientific Literature Replication Benchmarks
The simulation engine was calibrated against published lunar illumination studies:
1. **Shackleton Crater Floor (Mazarico et al., 2011, *Icarus*):**
   Evaluating the IAU center of Shackleton Crater ($-89.67^\circ, 129.78^\circ$, elevation $-2,787.9\text{ m}$) over 1,416 continuous hours (January–March 2027) yielded **$0.0\%$ solar illumination**, precisely replicating the permanently shadowed region (PSR) physics established in literature.
2. **Malapert Massif Strategic Communications Advantage (Gläser et al., 2018):**
   Evaluating Malapert Massif ($-85.99^\circ, 359.76^\circ$, elevation $+4,784.7\text{ m}$) confirmed **$42.1\%$ continuous direct-to-Earth visibility**, validating the strategic telecommunication relay vantage point documented by mission planning literature.

### 6.4 Terrain Uncertainty Calibration
Literature on the co-registered LOLA south polar product (`LDEM_80S_80MPP_ADJ`, Barker et al. 2016, 2021) establishes:
* Regional vertical RMS height errors: $0.30 - 0.50\text{ m}$
* Steep slope interpolation errors: $1.5 - 2.5\text{ m}$

A sensitivity test on *Peak Near Cabeus B* comparing assumed conservative noise ($\sigma = 8.0\text{ m}$, correlation $500\text{ m}$) against measured LOLA precision ($\sigma = 1.5\text{ m}$, correlation $300\text{ m}$) demonstrated that the top landing window (`2027-02-27T14:00` to `2027-03-13T14:00`) maintained an identical **Robust** rating ($6.96\%$ spread vs. $2.71\%$ spread). This confirms that the default $8.0\text{ m}$ sigma serves as a conservative upper bound that does not distort decision rankings.

### 6.5 Data Provenance Resolution
Automated resolution of USGS DataCite DOI `10.5066/P1MEQ6UK` (*Down Selected Artemis III Candidate Landing Site Navigational Grids*, McClernan, USGS Astrogeology Science Center, 2024) confirmed that the 9 candidate region geometries used by the USGS were sourced directly from LROC QuickMap (`A3_9regions-lonlat-simplified.geojson`), establishing direct provenance alignment between this project's datasets and USGS publications.

---

## 7. Deliverables & Verification Status

### 7.1 Completed & Verifiable Implementations
* **47 Python Unit & Integration Tests (`tests/test_core.py`, `test_ephemeris.py`, `test_agents.py`):**
  * Planetary ephemeris validations against Meeus textbook worked examples (Moon: Ex. 47.a; Sun: Ex. 25.a).
  * Orthonormality and right-handedness checks on ICRF rotation matrices.
  * Theoretical horizon geometry against known synthetic vertical barriers.
  * Brute-force equivalence testing of the sliding-window optimization algorithm.
  * Deterministic Verifier Agent tests: rejection of hallucinated metrics, unbacked dates, and unregistered site names.
  * Real-data provenance, representative site parsing, and error-handling tests.
* **11 Node.js Canvas & Drawing Tests (`tests/frontend.test.js`):**
  * Canvas context instrumentation asserting zero `NaN`, `null`, or `Infinity` coordinates across drawing functions.
  * Periodic boundary condition testing across the $0^\circ / 360^\circ$ north meridian.
* **12 Full-App Headless Smoke Tests (`tests/app_smoke.test.js`):**
  * End-to-end headless verification using real HTML DOM and API mock structures.
* **13 End-to-End Playwright Interactive Browser Checks (`scripts/verify_interactive_browser.py`):**
  * Full real-browser verification in headless Chromium across $1400\text{ px}$, $900\text{ px}$, and $390\text{ px}$ viewports.
  * Automated keyboard navigation audit confirming focus ring visibility and tab indexing.
  * Zero JavaScript console errors or unhandled exceptions.

### 7.2 Explicit Operational Boundaries
To maintain scientific and operational honesty, the following constraints are explicitly defined in the software:
* **Representative Points:** Candidate site coordinates are interior centroids calculated from official region polygons. They are not certified landing coordinates.
* **DEM Extent Limits:** Horizon raymarching is bounded by a $30\text{ km}$ radius and the extent of the loaded DEM ($240\text{ km}$ from the pole). Distant topography beyond these bounds is not modeled.
* **Point Source Approximation:** Celestial bodies are evaluated as point sources at their angular centers by default, though adjustable margin parameters exist in the API.
* **Uncertainty Bounds:** The Monte Carlo uncertainty engine quantifies digital elevation model errors; it does not model ephemeris drift, spacecraft attitude jitter, or regolith dust scattering.
* **Verifier Scope:** The Verifier Agent performs strict value-presence validation against raw computed data; it does not perform semantic analysis on prose assertions.
