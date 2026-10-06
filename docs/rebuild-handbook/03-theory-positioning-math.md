# Chapter 03 — Theory: Path Loss, Multilateration, Map Matching

## 3.1 Log-distance path-loss model

Received signal strength (RSSI) decreases with distance. A common empirical model:

\[
\text{RSSI}(d) = \text{RSSI}_{1\text{m}} - 10\,n\,\log_{10}(d) + \mathcal{N}(0,\sigma^2)
\]

Where:

- \(\text{RSSI}_{1\text{m}}\) = reference at 1 metre (`reference_rssi_at_1m`, e.g. −40 dBm)
- \(n\) = path-loss exponent (`path_loss_exponent`, e.g. 2.8; free space ≈ 2, tunnels/rock higher)
- \(\sigma\) = noise std (`noise_std_db`, e.g. 4 dB)
- \(d\) = 3D distance in metres

**Implementation:** `backend/app/simulator/radio.py`.

### Invert for ranging

Solve for distance given observed RSSI:

\[
d = 10^{\,(\text{RSSI}_{1\text{m}} - \text{RSSI})/(10 n)}
\]

**Implementation:** `rssi_to_distance` in `positioning/multilateration.py`.

Caveats: multipath, body shadowing, and antenna orientation make \(d\) noisy. That is why map matching and multiple gateways exist.

## 3.2 From ranges to position (multilateration)

Each gateway \(i\) at known \((x_i,y_i,z_i)\) yields range estimate \(r_i\). Ideal equations:

\[
(x-x_i)^2 + (y-y_i)^2 + (z-z_i)^2 = r_i^2
\]

Subtracting gateway 1’s equation linearizes to a least-squares system \(A\mathbf{p}=\mathbf{b}\) in unknowns \((x,y,z)\).

### This repo’s rules

| # observations | Solver |
|----------------|--------|
| &lt; 3 | No estimate (`None`) |
| 3 | Solve **XZ**, hold **Y** at strongest gateway’s elevation |
| ≥ 4 | Full **3D** least squares (use top 5 by RSSI) |

Code: `_lstsq_3d`, `_lstsq_xz_fixed_y`.

### Worked micro-example (2D intuition)

Gateways at (0,0) and (100,0) with ranges 60 and 60 intersect at roughly (50, ±√(60²−50²)). Third gateway disambiguates the side. Noise moves the intersection; LS finds a compromise.

## 3.3 Map matching / snap-to-graph

After raw \((x,y,z)\):

1. Enumerate mine edges (tunnels, shafts, ramps).  
2. Find closest point on any edge segment in 3D.  
3. Report snapped coordinates + `edge_id` + along-edge distance + residual error.  
4. Score confidence from: number of gateways, average RSSI, snap residual.

**Implementation:** `positioning/map_matching.py` (`snap_to_graph`, `confidence_score`).

Guarantee: displayed radio fix lies on traversable geometry (within numerical tolerance).

## 3.4 IMU / dead-reckoning fusion

Radio fixes arrive only on transmit intervals. Between fixes, fuse last snapped pose with simulated displacement (proxy for IMU) so the UI moves smoothly. Confidence decays until the next real fix.

**Implementation:** `positioning/imu_fusion.py`.  
**Limitation (documented):** heading after a fix often assumes forward along the snapped edge.

## 3.5 Continuous track vs radio fix (critical distinction)

| Method | Source | Purpose |
|--------|--------|---------|
| `CONTINUOUS_TRACK` (name may vary in payload) | Simulator true pose each tick | Smooth markers for operators |
| `RSSI_MULTILATERATION` | RSSI-only pipeline | Honest RTLS estimate |

When teaching or auditing, **never** confuse the smooth track with “what LoRa knows.” Hardware migration keeps the RSSI path; continuous track would disappear or become vehicle odometry.

## 3.6 Dilution of precision (conceptual)

If all hearing gateways lie on a line (long straight drive), depth across the tunnel is poorly observed. Remedies: place gateways on branches, loops, and at elevations (shafts). The mesh generator intentionally hits junctions and rooms.

## 3.7 Confidence labels

Typical mapping (see code for exact formula):

- **HIGH** — many gateways, strong RSSI, small snap error  
- **MEDIUM** — mixed  
- **LOW** — few gateways or large snap residual  

UI can dim or annotate low-confidence tracks.

## 3.8 Exercises

1. Given RSSI_1m = −40, n = 2.8, RSSI = −80, compute \(d\).  
2. Why does 3-gateway mode freeze Y instead of solving full 3D?  
3. Sketch why snap residual rising suddenly might mean a bad radio geometry or wrong level.

## 3.9 Checkpoint

You can derive RSSI→distance→LS position→snap. Next: **system architecture boxes and buses**.
