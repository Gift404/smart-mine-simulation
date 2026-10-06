/**
 * True WebGL 3D mine map (Three.js + React Three Fiber).
 * Mine coords map 1:1: X east, Y elevation, Z north (Three.js Y-up).
 */
import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { Alert, Gateway, Geofence, MineEdge, MineGraph, MineNode, PositionEstimate, Telemetry, Vehicle, Worker } from "../types";
import { STATUS_COLOR, workerDisplayStatus } from "../services/status";
import { HaulVehicleMesh, MiningFaceProps, ShaftCageStructure, WorkshopGear } from "./MineEquipment3D";

interface Props {
  mine: MineGraph | null;
  workers: Record<string, Worker>;
  vehicles: Record<string, Vehicle>;
  gateways: Record<string, Gateway>;
  alerts: Record<string, Alert>;
  geofences?: Geofence[];
  telemetryByTag: Record<string, Telemetry>;
  positionByTag: Record<string, PositionEstimate>;
  selectedWorkerId: string | null;
  trackingId: string | null;
  focusGatewayId?: string | null;
  onSelectWorker: (id: string | null) => void;
  onStartTracking: (id: string) => void;
  onStopTracking: () => void;
}

export type LevelFilter = "ALL" | "SURFACE" | "L750" | "L850" | "L950" | "L1050";
/** How many floating Html labels appear in the 3D scene */
export type LabelMode = "full" | "minimal" | "off";

const LEVEL_COLORS: Record<string, string> = {
  SURFACE: "#64748b",
  L750: "#7dd3fc",
  L850: "#6ee7b7",
  L950: "#fcd34d",
  L1050: "#f9a8d4",
};

/** Soft glass tints for tunnel meshes (muted vs UI accents). */
const TUNNEL_GLASS: Record<string, string> = {
  SURFACE: "#94a3b8",
  L750: "#94b8c9",
  L850: "#8fb8a8",
  L950: "#c4b896",
  L1050: "#c4a8b4",
};

const SHAFT_COLORS: Record<string, string> = {
  S1_SHAFT: "#6b8cae",
  S2_SHAFT: "#38bdf8",
  S3_SHAFT: "#eab308",
  S4_SHAFT: "#6b9e7a",
  S5_SHAFT: "#6b9e7a",
  MAIN_SHAFT: "#6b8cae",
  VENT_SHAFT: "#6b9e7a",
  ESCAPE_SHAFT: "#b07a7a",
  ACCESS_RAMP: "#a78bfa",
  PROD_RAMP: "#c084fc",
  ORE_PASS: "#b45309",
  DECLINE_RAMP: "#b8956e",
};

function vec(n: { x: number; y: number; z?: number }): [number, number, number] {
  return [n.x, n.y, n.z ?? 0];
}

function edgeLevelId(e: MineEdge, nodes: Record<string, MineNode>): string {
  if (e.level_id) return e.level_id;
  if (e.kind && e.kind !== "tunnel") return e.zone_id;
  return nodes[e.start]?.level_id ?? "UNKNOWN";
}

function opacityFor(levelId: string, filter: LevelFilter, isShaft = false): number {
  if (filter === "ALL") return 1;
  if (levelId === filter || levelId.startsWith(filter)) return 1;
  if (isShaft) return 0.35;
  return 0.07;
}

const TUNNEL_RADIUS = 7.5;
const MAIN_SHAFT_RADIUS = 8.5;
const SIDE_SHAFT_RADIUS = 6.5;

function segmentRadius(e: MineEdge): number {
  if (!e.kind || e.kind === "tunnel") return TUNNEL_RADIUS;
  if (e.kind === "ramp") return 6.2; // truck decline — wide roadway
  if (e.kind === "ore_pass") return 4.0;
  return e.zone_id === "S3_SHAFT" || e.zone_id === "MAIN_SHAFT" ? MAIN_SHAFT_RADIUS : SIDE_SHAFT_RADIUS;
}

function Segment({
  a, b, color, radius, opacity, trimStart = 0, trimEnd = 0,
}: {
  a: [number, number, number];
  b: [number, number, number];
  color: string;
  radius: number;
  opacity: number;
  /** Pull tube back from start/end so it stops at a room doorway */
  trimStart?: number;
  trimEnd?: number;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...a);
    const end = new THREE.Vector3(...b);
    const dir = new THREE.Vector3().subVectors(end, start);
    const n = dir.lengthSq() < 1e-8 ? new THREE.Vector3(0, 1, 0) : dir.clone().normalize();
    // Overlap into junction spheres; facility rooms trim so the tube ends at the door
    const a2 = start.clone().addScaledVector(n, trimStart > 0 ? trimStart : -radius * 0.45);
    const b2 = end.clone().addScaledVector(n, trimEnd > 0 ? -trimEnd : radius * 0.45);
    // Keep a tiny stub if trim would invert the segment
    if (a2.distanceToSquared(b2) < 0.01) {
      a2.copy(start);
      b2.copy(end);
    }
    const length = Math.max(a2.distanceTo(b2), 0.01);
    const mid = new THREE.Vector3().addVectors(a2, b2).multiplyScalar(0.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      n,
    );
    return { position: mid.toArray() as [number, number, number], quaternion, length };
  }, [a, b, radius, trimStart, trimEnd]);

  return (
    <mesh position={position} quaternion={quaternion} raycast={() => null}>
      {/* openEnded hides flat caps; spheres at nodes blend corners */}
      <cylinderGeometry args={[radius, radius, length, 20, 1, true]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        metalness={0.05}
        roughness={0.18}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function JunctionSphere({
  position, radius, color, opacity,
}: {
  position: [number, number, number];
  radius: number;
  color: string;
  opacity: number;
}) {
  if (opacity < 0.05) return null;
  return (
    <mesh position={position} raycast={() => null}>
      <sphereGeometry args={[radius * 1.02, 18, 18]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        metalness={0.05}
        roughness={0.18}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function LevelPlane({
  depth, color, label, opacity, size = 480, showLabel = true,
}: {
  depth: number;
  color: string;
  label: string;
  opacity: number;
  size?: number;
  showLabel?: boolean;
}) {
  if (opacity < 0.05) return null;
  return (
    <group position={[0, depth, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[size * 2, size * 2]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.07 * opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} raycast={() => null}>
        <ringGeometry args={[size * 0.98, size, 4]} />
        <meshBasicMaterial color={color} transparent opacity={0.25 * opacity} side={THREE.DoubleSide} />
      </mesh>
      {showLabel && (
        <Html position={[-size - 8, 2, 0]} center style={{ pointerEvents: "none" }}>
          <div
            style={{
              color,
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: "nowrap",
              textShadow: "0 0 6px #000",
              opacity,
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

type RoomSpec = {
  color: string;
  label: string;
  w: number; // width across tunnel
  h: number; // height
  d: number; // depth along tunnel (entrance → back)
};

const ROOM_SPECS: Record<string, RoomSpec> = {
  refuge: { color: "#4ade80", label: "Refuge chamber", w: 26, h: 14, d: 24 },
  emergency: { color: "#f87171", label: "Services / dam / emulsion", w: 24, h: 14, d: 22 },
  restricted: { color: "#fb7185", label: "RESTRICTED — authorized only", w: 26, h: 14, d: 24 },
  workshop: { color: "#fb923c", label: "Workshop", w: 28, h: 15, d: 26 },
  work_zone: { color: "#a8a29e", label: "Production stope", w: 48, h: 20, d: 46 },
  lift_station: { color: "#facc15", label: "Shaft station", w: 24, h: 20, d: 24 },
  tip: { color: "#d97706", label: "Truck tip → Shaft 3", w: 22, h: 14, d: 20 },
  crusher: { color: "#78716c", label: "Crushing station", w: 30, h: 18, d: 28 },
  conveyor: { color: "#57534e", label: "Conveyor to Shaft 3", w: 18, h: 10, d: 36 },
  ore_pass: { color: "#92400e", label: "Ore-pass collar", w: 16, h: 14, d: 16 },
  surface: { color: "#94a3b8", label: "Surface collar", w: 20, h: 8, d: 20 },
};

function isFacilityRoom(type: string | undefined): boolean {
  return !!type && type in ROOM_SPECS;
}

/** Pick horizontal feed direction so the room sits on the tunnel that enters it. */
function roomFeedDirection(
  node: MineNode,
  nodeById: Record<string, MineNode>,
  edges: MineEdge[],
): THREE.Vector3 {
  const linked: THREE.Vector3[] = [];
  for (const e of edges) {
    if (e.start !== node.id && e.end !== node.id) continue;
    const otherId = e.start === node.id ? e.end : e.start;
    const other = nodeById[otherId];
    if (!other) continue;
    const dx = node.x - other.x;
    const dy = node.y - other.y;
    const dz = (node.z ?? 0) - (other.z ?? 0);
    // Prefer level tunnels over vertical shafts for horizontal rooms
    const isVertical = Math.abs(dy) > Math.abs(dx) + Math.abs(dz);
    if (node.type === "lift_station") {
      if (!isVertical && (e.kind === "tunnel" || !e.kind)) {
        linked.push(new THREE.Vector3(dx, 0, dz));
      }
    } else if (!isVertical) {
      linked.push(new THREE.Vector3(dx, 0, dz));
    }
  }
  if (linked.length === 0) {
    // Fallback: any neighbor
    for (const e of edges) {
      if (e.start !== node.id && e.end !== node.id) continue;
      const other = nodeById[e.start === node.id ? e.end : e.start];
      if (!other) continue;
      return new THREE.Vector3(node.x - other.x, 0, (node.z ?? 0) - (other.z ?? 0)).normalize();
    }
    return new THREE.Vector3(0, 0, 1);
  }
  const sum = linked.reduce((a, v) => a.add(v), new THREE.Vector3());
  if (sum.lengthSq() < 1e-6) return linked[0].clone().normalize();
  return sum.normalize();
}

/**
 * Chamber aligned with its feeding tunnel like a real passageway:
 * floor sits on the tunnel invert, full tube meets an open doorway at tunnel centreline.
 */
function FacilityRoom({
  node, opacity, nodeById, edges, showLabel = true,
}: {
  node: MineNode;
  opacity: number;
  nodeById: Record<string, MineNode>;
  edges: MineEdge[];
  showLabel?: boolean;
}) {
  const spec = ROOM_SPECS[node.type];
  if (!spec || opacity < 0.12) return null;
  const { w, d, color, label } = spec;
  const R = TUNNEL_RADIUS;
  // Tall enough that the whole circular passage fits through the doorway
  const h = Math.max(spec.h, R * 2.2);
  const wallOp = Math.min(0.28, 0.22 * opacity + 0.08);
  const floorOp = Math.min(0.45, 0.35 * opacity + 0.1);

  const feed = roomFeedDirection(node, nodeById, edges);
  const yaw = Math.atan2(feed.x, feed.z);
  // Entrance plane at the node so the tube ends flush with the doorway
  const centerOffset = d / 2;
  const cx = node.x + feed.x * centerOffset;
  const cy = node.y;
  const cz = (node.z ?? 0) + feed.z * centerOffset;

  // Lift stations stay centered on the shaft column (shaft feeds vertically through)
  const isLift = node.type === "lift_station";
  const pos: [number, number, number] = isLift ? vec(node) : [cx, cy, cz];
  const rotY = isLift ? 0 : yaw;

  // Tunnel axis is local Y=0; invert (floor) at -R so the full tube sits above the floor
  const floorTop = -R;
  const floorTh = 0.9;
  const floorCenterY = floorTop - floorTh / 2;
  const wallCenterY = floorTop + h / 2;
  const roofY = floorTop + h + 0.2;
  const doorW = R * 2.05;
  const doorH = R * 2.05;

  return (
    <group position={pos} rotation={[0, rotY, 0]} raycast={() => null}>
      {/* Floor on tunnel invert — passageway walks straight in */}
      <mesh position={[0, floorCenterY, 0]} raycast={() => null}>
        <boxGeometry args={[w, floorTh, d]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={floorOp}
          metalness={0.1}
          roughness={0.55}
          emissive={color}
          emissiveIntensity={0.08}
        />
      </mesh>
      {/* Three walls + open entrance on -Z (full tunnel feeds in at Y=0) */}
      <mesh position={[0, wallCenterY, d / 2 - 0.4]} raycast={() => null}>
        <boxGeometry args={[w, h, 0.8]} />
        <meshStandardMaterial color={color} transparent opacity={wallOp + 0.08} roughness={0.25} depthWrite={false} emissive={color} emissiveIntensity={0.05} />
      </mesh>
      <mesh position={[-w / 2 + 0.4, wallCenterY, 0]} raycast={() => null}>
        <boxGeometry args={[0.8, h, d]} />
        <meshStandardMaterial color={color} transparent opacity={wallOp} roughness={0.25} depthWrite={false} side={THREE.DoubleSide} emissive={color} emissiveIntensity={0.05} />
      </mesh>
      <mesh position={[w / 2 - 0.4, wallCenterY, 0]} raycast={() => null}>
        <boxGeometry args={[0.8, h, d]} />
        <meshStandardMaterial color={color} transparent opacity={wallOp} roughness={0.25} depthWrite={false} side={THREE.DoubleSide} emissive={color} emissiveIntensity={0.05} />
      </mesh>
      <mesh position={[0, roofY, 0]} raycast={() => null}>
        <boxGeometry args={[w * 1.02, 0.35, d * 1.02]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={Math.min(0.55, floorOp + 0.1)}
          emissive={color}
          emissiveIntensity={0.12}
        />
      </mesh>
      <mesh position={[0, wallCenterY, 0]} raycast={() => null}>
        <boxGeometry args={[w * 0.96, h * 0.92, d * 0.96]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={wallOp * 0.45}
          metalness={0.05}
          roughness={0.15}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Doorway lintel above the full-height tunnel opening (centred on tube axis) */}
      <mesh position={[0, doorH / 2 + 0.35, -d / 2]} raycast={() => null}>
        <boxGeometry args={[Math.min(w * 0.85, doorW + 2), 0.55, 0.55]} />
        <meshStandardMaterial color={color} transparent opacity={0.55} emissive={color} emissiveIntensity={0.2} />
      </mesh>
      {/* Side jambs framing the circular passage */}
      <mesh position={[-doorW / 2 - 0.35, 0, -d / 2]} raycast={() => null}>
        <boxGeometry args={[0.5, doorH, 0.5]} />
        <meshStandardMaterial color={color} transparent opacity={0.4} emissive={color} emissiveIntensity={0.12} />
      </mesh>
      <mesh position={[doorW / 2 + 0.35, 0, -d / 2]} raycast={() => null}>
        <boxGeometry args={[0.5, doorH, 0.5]} />
        <meshStandardMaterial color={color} transparent opacity={0.4} emissive={color} emissiveIntensity={0.12} />
      </mesh>
      {showLabel && (
        <Html position={[0, roofY + 3.5, 0]} center style={{ pointerEvents: "none" }}>
          <div
            style={{
              color,
              fontSize: 10,
              fontWeight: 700,
              whiteSpace: "nowrap",
              textShadow: "0 0 6px #000",
              opacity: Math.min(1, opacity + 0.2),
              background: "rgba(15,23,42,0.55)",
              padding: "2px 6px",
              borderRadius: 4,
              border: `1px solid ${color}55`,
            }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Pulsing sky beacon so the tracked miner is unmistakable. */
function TrackingBeacon() {
  const ringRef = useRef<THREE.Mesh>(null);
  const beamRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 0.55 + 0.45 * Math.sin(t * 4.2);
    if (ringRef.current) {
      const s = 1.15 + 0.35 * Math.sin(t * 3.5);
      ringRef.current.scale.set(s, s, s);
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.35 + 0.45 * pulse;
    }
    if (outerRef.current) {
      const s = 1.6 + 0.55 * Math.sin(t * 2.8 + 1);
      outerRef.current.scale.set(s, 1, s);
      const mat = outerRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.15 + 0.25 * pulse;
    }
    if (beamRef.current) {
      const mat = beamRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.25 + 0.35 * pulse;
    }
  });

  return (
    <group>
      {/* Ground ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]} raycast={() => null}>
        <ringGeometry args={[4.5, 7.5, 32]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={outerRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]} raycast={() => null}>
        <ringGeometry args={[8, 11, 32]} />
        <meshBasicMaterial color="#7dd3fc" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Vertical spotlight column */}
      <mesh ref={beamRef} position={[0, 28, 0]} raycast={() => null}>
        <cylinderGeometry args={[1.2, 3.5, 56, 12, 1, true]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* Diamond pointer above */}
      <mesh position={[0, 14, 0]} rotation={[0, 0, Math.PI / 4]} raycast={() => null}>
        <boxGeometry args={[3.2, 3.2, 3.2]} />
        <meshStandardMaterial color="#7dd3fc" emissive="#0ea5e9" emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

/** Keep orbit target (and camera offset) locked onto the tracked miner. */
function TrackingCamera({
  trackingId,
  workers,
  controlsRef,
}: {
  trackingId: string | null;
  workers: Record<string, Worker>;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) {
  useFrame((_, dt) => {
    const controls = controlsRef.current;
    if (!controls || !trackingId) return;
    const w = workers[trackingId];
    if (!w) return;
    const desired = new THREE.Vector3(w.x, w.y, w.z ?? 0);
    const t = 1 - Math.exp(-5 * dt);
    const cam = controls.object;
    const offset = new THREE.Vector3().subVectors(cam.position, controls.target);
    controls.target.lerp(desired, t);
    cam.position.copy(controls.target).add(offset);
    controls.update();
  });
  return null;
}

/** Smoothly fly the orbit camera to a level when the level filter changes. */
function LevelFocusCamera({
  levelFilter,
  mine,
  trackingId,
  controlsRef,
}: {
  levelFilter: LevelFilter;
  mine: MineGraph;
  trackingId: string | null;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) {
  const goalRef = useRef<{
    target: THREE.Vector3;
    position: THREE.Vector3;
    active: boolean;
  } | null>(null);
  const prevFilter = useRef<LevelFilter | null>(null);

  useEffect(() => {
    if (trackingId) return;
    // Skip the initial mount so the Canvas camera seed stays put until the user picks a level
    if (prevFilter.current === null) {
      prevFilter.current = levelFilter;
      return;
    }
    if (prevFilter.current === levelFilter) return;
    prevFilter.current = levelFilter;

    let tx = 80;
    let ty = -900;
    let tz = 40;
    let dist = 1100;

    if (levelFilter === "ALL") {
      ty = -900;
      dist = 1400;
    } else if (levelFilter === "SURFACE") {
      ty = 0;
      dist = 900;
    } else {
      const nodes = mine.nodes.filter((n) => n.level_id === levelFilter);
      if (nodes.length) {
        tx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
        ty = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
        tz = nodes.reduce((s, n) => s + (n.z ?? 0), 0) / nodes.length;
      } else {
        const lv = mine.levels?.find((l) => l.id === levelFilter);
        ty = lv?.depth_m ?? ty;
      }
      // Close enough to read the haulage/stopes on that single level
      dist = 420;
    }

    const target = new THREE.Vector3(tx, ty, tz);
    // Elevated SE viewpoint so the level reads as a plan with depth cues
    const position = new THREE.Vector3(tx + dist * 0.72, ty + dist * 0.38, tz + dist * 0.72);
    goalRef.current = { target, position, active: true };
  }, [levelFilter, mine, trackingId]);

  useFrame((_, dt) => {
    const goal = goalRef.current;
    const controls = controlsRef.current;
    if (!goal?.active || !controls || trackingId) return;

    const t = 1 - Math.exp(-3.2 * dt);
    controls.target.lerp(goal.target, t);
    controls.object.position.lerp(goal.position, t);
    controls.update();

    if (
      controls.target.distanceTo(goal.target) < 2 &&
      controls.object.position.distanceTo(goal.position) < 4
    ) {
      goal.active = false;
    }
  });

  return null;
}

/** Keep fog from eating the deep levels when the camera is close. */
function AdaptiveFog() {
  const { camera } = useThree();
  const fogRef = useRef<THREE.Fog>(null);
  useFrame(() => {
    const fog = fogRef.current;
    if (!fog) return;
    // Deeper / closer views: push fog out so L1050 stays crisp
    const depth = Math.abs(camera.position.y);
    const near = Math.max(400, 700 + depth * 0.15);
    fog.near = near;
    fog.far = near + 4800;
  });
  return <fog ref={fogRef} attach="fog" args={["#070b14", 900, 5600]} />;
}

/** Mount pose: flat panel on tunnel wall, facing inward along the drive. */
function gatewayMount(
  g: Gateway,
  nodeById: Record<string, MineNode>,
  edges: MineEdge[],
): { pos: [number, number, number]; yaw: number } {
  const gx = g.x;
  const gy = g.y;
  const gz = g.z ?? 0;
  let bestDist = Infinity;
  let along = new THREE.Vector3(1, 0, 0);
  let onSeg = new THREE.Vector3(gx, gy, gz);

  for (const e of edges) {
    if (e.kind && e.kind !== "tunnel") continue;
    const a = nodeById[e.start];
    const b = nodeById[e.end];
    if (!a || !b) continue;
    const ax = a.x, ay = a.y, az = a.z ?? 0;
    const bx = b.x, by = b.y, bz = b.z ?? 0;
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const lenSq = abx * abx + aby * aby + abz * abz;
    if (lenSq < 1e-6) continue;
    let t = ((gx - ax) * abx + (gy - ay) * aby + (gz - az) * abz) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = ax + abx * t, py = ay + aby * t, pz = az + abz * t;
    const dx = gx - px, dy = gy - py, dz = gz - pz;
    const dist = dx * dx + dy * dy + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      onSeg.set(px, py, pz);
      along.set(abx, 0, abz);
      if (along.lengthSq() < 1e-6) along.set(1, 0, 0);
      else along.normalize();
    }
  }

  // Wall normal (horizontal) — pick side closest to the gateway's raw offset
  let wall = new THREE.Vector3(-along.z, 0, along.x);
  const raw = new THREE.Vector3(gx - onSeg.x, 0, gz - onSeg.z);
  if (raw.lengthSq() > 1e-4 && raw.dot(wall) < 0) wall.negate();
  if (wall.lengthSq() < 1e-6) wall.set(1, 0, 0);
  else wall.normalize();

  const mountR = TUNNEL_RADIUS - 0.9;
  const pos: [number, number, number] = [
    onSeg.x + wall.x * mountR,
    onSeg.y,
    onSeg.z + wall.z * mountR,
  ];
  // Panel local +Z faces into the tunnel (toward centreline)
  const inward = wall.clone().negate();
  const yaw = Math.atan2(inward.x, inward.z);
  return { pos, yaw };
}

/** Quiet wall-mounted radio unit — not a glowing sphere in the drive. */
function GatewayMarker({
  gateway: g, opacity, focused, nodeById, edges, showLabel = true,
}: {
  gateway: Gateway;
  opacity: number;
  focused: boolean;
  nodeById: Record<string, MineNode>;
  edges: MineEdge[];
  showLabel?: boolean;
}) {
  const { pos, yaw } = useMemo(
    () => gatewayMount(g, nodeById, edges),
    [g, nodeById, edges],
  );
  const online = g.status === "ONLINE" || g.backhaul_primary === "ONLINE";
  const body = focused ? "#7dd3fc" : online ? "#64748b" : "#475569";
  const accent = focused ? "#38bdf8" : online ? "#22d3ee" : "#f87171";
  const op = focused ? Math.min(0.95, opacity) : Math.min(0.55, opacity * 0.7);

  return (
    <group position={pos} rotation={[0, yaw, 0]} raycast={() => null}>
      {/* Flat chassis flush to wall */}
      <mesh position={[0, 0, 0]} raycast={() => null}>
        <boxGeometry args={[2.4, 1.6, 0.35]} />
        <meshStandardMaterial
          color={body}
          transparent
          opacity={op}
          metalness={0.35}
          roughness={0.45}
          depthWrite={false}
        />
      </mesh>
      {/* Thin face plate */}
      <mesh position={[0, 0, 0.22]} raycast={() => null}>
        <boxGeometry args={[2.0, 1.2, 0.08]} />
        <meshStandardMaterial
          color="#0f172a"
          transparent
          opacity={op * 0.9}
          depthWrite={false}
        />
      </mesh>
      {/* Small status LED — only bright accent */}
      <mesh position={[0.7, 0.35, 0.28]} raycast={() => null}>
        <boxGeometry args={[0.28, 0.28, 0.08]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={focused ? 0.55 : 0.18}
          transparent
          opacity={op}
          depthWrite={false}
        />
      </mesh>
      {/* Slim stub antenna along the wall */}
      <mesh position={[-0.95, 1.15, 0]} raycast={() => null}>
        <boxGeometry args={[0.12, 0.9, 0.12]} />
        <meshStandardMaterial color={body} transparent opacity={op * 0.85} depthWrite={false} />
      </mesh>
      {focused && showLabel && (
        <Html position={[0, 1.8, 0]} center style={{ pointerEvents: "none" }}>
          <div
            style={{
              color: "#7dd3fc",
              fontSize: 10,
              fontWeight: 700,
              whiteSpace: "nowrap",
              textShadow: "0 0 4px #000",
              background: "rgba(15,23,42,0.65)",
              padding: "2px 6px",
              borderRadius: 3,
              border: "1px solid #38bdf855",
            }}
          >
            {g.gateway_id}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Translucent restricted-zone cylinder at each geofenced node. */
function GeofenceVolume({
  x, y, z, radius, severity, opacity, label, showLabel,
}: {
  x: number; y: number; z: number; radius: number;
  severity: string; opacity: number; label: string; showLabel: boolean;
}) {
  const color = severity === "CRITICAL" ? "#fb7185" : "#fbbf24";
  if (opacity < 0.08) return null;
  return (
    <group position={[x, y, z]} raycast={() => null}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.3, 0]} raycast={() => null}>
        <ringGeometry args={[radius * 0.92, radius, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.45 * opacity} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, 6, 0]} raycast={() => null}>
        <cylinderGeometry args={[radius, radius, 12, 32, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.08 * opacity} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {showLabel && (
        <Html position={[0, 14, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{
            color, fontSize: 10, fontWeight: 800, whiteSpace: "nowrap",
            textShadow: "0 0 6px #000", opacity: 0.9 * opacity,
          }}>
            RESTRICTED · {label}
          </div>
        </Html>
      )}
    </group>
  );
}

/** Pulsing ring while the wearable is vibrating. */
function WatchVibrateRing() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.getElapsedTime();
    const s = 1.2 + Math.sin(t * 14) * 0.35;
    m.scale.setScalar(s);
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.35 + 0.35 * Math.abs(Math.sin(t * 14));
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.4, 0]} raycast={() => null}>
      <ringGeometry args={[3.2, 4.4, 24]} />
      <meshBasicMaterial color="#fb7185" transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function MineScene({
  mine, workers, vehicles, gateways, alerts, geofences, levelFilter, labelMode,
  selectedWorkerId, trackingId, focusGatewayId,
  onSelectWorker, onStartTracking,
}: {
  mine: MineGraph;
  workers: Record<string, Worker>;
  vehicles: Record<string, Vehicle>;
  gateways: Record<string, Gateway>;
  alerts: Record<string, Alert>;
  geofences: Geofence[];
  levelFilter: LevelFilter;
  labelMode: LabelMode;
  selectedWorkerId: string | null;
  trackingId: string | null;
  focusGatewayId: string | null;
  onSelectWorker: (id: string | null) => void;
  onStartTracking: (id: string) => void;
}) {
  const nodeById = useMemo(() => {
    const m: Record<string, MineNode> = {};
    for (const n of mine.nodes) m[n.id] = n;
    return m;
  }, [mine.nodes]);

  // Max tube radius + blend color at each node for smooth corners
  const junctions = useMemo(() => {
    const map = new Map<string, { radius: number; color: string; isShaft: boolean; levelId: string }>();
    for (const e of mine.edges) {
      const isShaft = !!(e.kind && e.kind !== "tunnel");
      const lv = edgeLevelId(e, nodeById);
      const radius = segmentRadius(e);
      const color = isShaft
        ? (SHAFT_COLORS[e.zone_id] ?? "#94a3b8")
        : (TUNNEL_GLASS[lv] ?? "#94a3b8");
      for (const nid of [e.start, e.end]) {
        const prev = map.get(nid);
        if (!prev || radius >= prev.radius) {
          map.set(nid, { radius, color, isShaft, levelId: lv });
        }
      }
    }
    return map;
  }, [mine.edges, nodeById]);

  const levels = mine.levels ?? [];

  return (
    <>
      <color attach="background" args={["#070b14"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[280, 120, 140]} intensity={1.1} />
      <directionalLight position={[-180, 60, -220]} intensity={0.35} />
      <hemisphereLight args={["#94a3b8", "#0f172a", 0.4]} />
      <AdaptiveFog />

      {levels.map((lv) => (
        <LevelPlane
          key={lv.id}
          depth={lv.depth_m}
          color={LEVEL_COLORS[lv.id] ?? "#64748b"}
          label={lv.label}
          opacity={opacityFor(lv.id, levelFilter)}
          showLabel={labelMode === "full" || (labelMode === "minimal" && levelFilter === lv.id)}
        />
      ))}

      {mine.edges.map((e) => {
        const a = nodeById[e.start];
        const b = nodeById[e.end];
        if (!a || !b) return null;
        const isShaft = !!(e.kind && e.kind !== "tunnel" && e.kind !== "ramp");
        const isRamp = e.kind === "ramp";
        const lv = edgeLevelId(e, nodeById);
        const op = opacityFor(lv, levelFilter, isShaft || isRamp);
        if (op < 0.08) return null;
        const color = isRamp
          ? (SHAFT_COLORS[e.zone_id] ?? "#a78bfa")
          : isShaft
          ? (SHAFT_COLORS[e.zone_id] ?? "#94a3b8")
          : (TUNNEL_GLASS[lv] ?? "#94a3b8");
        const baseOpacity = isRamp ? 0.32 : isShaft ? 0.22 : 0.18;
        const r = segmentRadius(e);
        // Horizontal tunnels stop at the room doorway (not buried under/through the chamber)
        const trimStart = !isShaft && !isRamp && isFacilityRoom(a.type) ? r * 0.15 : 0;
        const trimEnd = !isShaft && !isRamp && isFacilityRoom(b.type) ? r * 0.15 : 0;
        return (
          <Segment
            key={e.id}
            a={vec(a)}
            b={vec(b)}
            color={color}
            radius={r}
            opacity={op * baseOpacity}
            trimStart={trimStart}
            trimEnd={trimEnd}
          />
        );
      })}

      {/* Spherical joints hide cylinder end-caps at direction changes (not at room doorways) */}
      {mine.nodes.map((n) => {
        if (isFacilityRoom(n.type) && n.type !== "lift_station") return null;
        const j = junctions.get(n.id);
        if (!j) return null;
        const op = opacityFor(j.levelId, levelFilter, j.isShaft);
        const baseOpacity = j.isShaft ? 0.22 : 0.18;
        return (
          <JunctionSphere
            key={`joint-${n.id}`}
            position={vec(n)}
            radius={j.radius}
            color={j.color}
            opacity={op * baseOpacity}
          />
        );
      })}

      {mine.nodes.map((n) => (
        <FacilityRoom
          key={n.id}
          node={n}
          nodeById={nodeById}
          edges={mine.edges}
          opacity={opacityFor(n.level_id ?? "UNKNOWN", levelFilter)}
          showLabel={labelMode === "full"}
        />
      ))}

      {mine.nodes.map((n) => {
        const op = opacityFor(n.level_id ?? "UNKNOWN", levelFilter);
        return (
          <group key={`equip-${n.id}`}>
            <MiningFaceProps node={n} opacity={op} />
            <ShaftCageStructure node={n} opacity={op} />
            <WorkshopGear node={n} opacity={op} />
          </group>
        );
      })}

      {Object.values(vehicles).map((v) => (
        <HaulVehicleMesh
          key={v.vehicle_id}
          vehicle={v}
          opacity={opacityFor(v.level ?? "UNKNOWN", levelFilter)}
          showLabel={labelMode === "full"}
        />
      ))}

      {Object.values(gateways).map((g) => {
        const op = opacityFor(g.level_id ?? "UNKNOWN", levelFilter);
        if (op < 0.15) return null;
        return (
          <GatewayMarker
            key={g.gateway_id}
            gateway={g}
            opacity={op}
            focused={focusGatewayId === g.gateway_id}
            nodeById={nodeById}
            edges={mine.edges}
            showLabel={labelMode !== "off"}
          />
        );
      })}

      {geofences.flatMap((f) =>
        f.nodes.map((n) => (
          <GeofenceVolume
            key={`${f.fence_id}-${n.id}`}
            x={n.x}
            y={n.y}
            z={n.z ?? 0}
            radius={f.radius_m}
            severity={f.severity}
            opacity={opacityFor(n.level_id ?? "UNKNOWN", levelFilter)}
            label={f.name}
            showLabel={labelMode === "full" || (labelMode === "minimal" && levelFilter === (n.level_id as LevelFilter))}
          />
        )),
      )}

      {Object.values(workers).map((w) => {
        const op = opacityFor(w.level ?? "UNKNOWN", levelFilter);
        if (op < 0.12) return null;
        // Drivers are shown in the vehicle cab — keep roster sphere hidden while driving
        if (w.assigned_vehicle_id) return null;
        const status = workerDisplayStatus(w, alerts);
        const tracking = w.worker_id === trackingId;
        const selected = w.worker_id === selectedWorkerId || tracking;
        const working = !!(w.activity && w.activity !== "Transit");
        const vibrating = !!w.watch_vibrating;
        return (
          <group key={w.worker_id} position={[w.x, w.y, w.z ?? 0]}>
            <mesh
              onPointerDown={(ev) => {
                ev.stopPropagation();
                onSelectWorker(w.worker_id);
                onStartTracking(w.worker_id);
              }}
            >
              <sphereGeometry args={[7, 12, 12]} />
              <meshBasicMaterial transparent opacity={0.01} depthWrite={false} />
            </mesh>
            <mesh raycast={() => null}>
              <sphereGeometry args={[tracking ? 3.4 : selected ? 2.8 : 2.2, 14, 14]} />
              <meshStandardMaterial
                color={vibrating ? "#fb7185" : tracking ? "#38bdf8" : STATUS_COLOR[status]}
                emissive={vibrating ? "#fb7185" : tracking ? "#38bdf8" : STATUS_COLOR[status]}
                emissiveIntensity={vibrating ? 1.4 : tracking ? 1.1 : selected ? 0.55 : working ? 0.35 : 0.2}
                transparent
                opacity={Math.min(1, op + 0.15)}
                depthWrite
              />
            </mesh>
            {vibrating && <WatchVibrateRing />}
            {tracking && <TrackingBeacon />}
            {(labelMode === "full" || (labelMode === "minimal" && (selected || tracking || vibrating))) && (
              <Html distanceFactor={tracking ? 90 : 120} style={{ pointerEvents: "none" }}>
                <div style={{
                  color: vibrating ? "#fda4af" : tracking ? "#7dd3fc" : "#e2e8f0",
                  fontSize: tracking ? 13 : 11,
                  fontWeight: 800,
                  textShadow: tracking ? "0 0 8px #0ea5e9, 0 0 4px #000" : "0 0 4px #000",
                  transform: "translate(10px, -10px)",
                  whiteSpace: "nowrap",
                }}>
                  {vibrating ? `${w.worker_id} · WATCH ALARM` : tracking ? `▶ ${w.worker_id} TRACKING` : w.worker_id}
                  {labelMode === "full" && working && (
                    <div style={{ color: "#fcd34d", fontSize: 9, fontWeight: 600 }}>{w.activity}</div>
                  )}
                  {vibrating && w.geofence_name && (
                    <div style={{ color: "#fb7185", fontSize: 9, fontWeight: 700 }}>{w.geofence_name}</div>
                  )}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </>
  );
}

export default function MineMap3D(props: Props) {
  const {
    mine, workers, vehicles, gateways, alerts, geofences = [], telemetryByTag, positionByTag,
    selectedWorkerId, trackingId, focusGatewayId = null,
    onSelectWorker, onStartTracking, onStopTracking,
  } = props;
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("ALL");
  const [labelMode, setLabelMode] = useState<LabelMode>("minimal");
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  if (!mine) {
    return <div className="flex h-full items-center justify-center text-slate-500">Loading 3D mine…</div>;
  }

  const levels = mine.levels ?? [];
  const focusId = selectedWorkerId ?? trackingId;
  const focusWorker = focusId ? workers[focusId] : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-1">
        <span className="mr-1 text-[10px] uppercase tracking-wider text-slate-500">Level</span>
        <button
          type="button"
          onClick={() => setLevelFilter("ALL")}
          className={`rounded px-2 py-1 text-[10px] font-semibold ${
            levelFilter === "ALL" ? "bg-slate-600 text-white" : "bg-panel text-slate-400 hover:text-slate-200"
          }`}
        >
          All Levels
        </button>
        {levels.map((lv) => (
          <button
            key={lv.id}
            type="button"
            onClick={() => setLevelFilter(lv.id as LevelFilter)}
            className={`rounded px-2 py-1 text-[10px] font-semibold ${
              levelFilter === lv.id ? "bg-slate-600 text-white" : "bg-panel text-slate-400 hover:text-slate-200"
            }`}
            style={{ borderLeft: `3px solid ${LEVEL_COLORS[lv.id] ?? "#64748b"}` }}
          >
            {lv.label}
          </button>
        ))}
        <span className="ml-2 mr-1 text-[10px] uppercase tracking-wider text-slate-500">Labels</span>
        {([
          ["minimal", "Minimal"],
          ["full", "Full"],
          ["off", "Off"],
        ] as const).map(([mode, text]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setLabelMode(mode)}
            className={`rounded px-2 py-1 text-[10px] font-semibold ${
              labelMode === mode ? "bg-slate-600 text-white" : "bg-panel text-slate-400 hover:text-slate-200"
            }`}
            title={
              mode === "full"
                ? "All facility, miner, and vehicle labels"
                : mode === "minimal"
                  ? "Only selected/tracked miners and the active level name"
                  : "No floating labels in the 3D view"
            }
          >
            {text}
          </button>
        ))}
        {trackingId && workers[trackingId] && (
          <button
            type="button"
            onClick={onStopTracking}
            className="ml-auto rounded bg-sky-500/20 px-2 py-1 text-[10px] font-semibold text-sky-300"
          >
            Tracking {workers[trackingId].worker_id} · {workers[trackingId].level} · stop
          </button>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded border border-border/60 bg-[#070b14]">
        <Canvas
          camera={{ position: [980, -420, 980], fov: 40, near: 0.5, far: 14000 }}
          dpr={[1, 1.75]}
          onPointerMissed={() => {
            /* keep selection; only clear via card close */
          }}
        >
          <Suspense fallback={null}>
            <MineScene
              mine={mine}
              workers={workers}
              vehicles={vehicles}
              gateways={gateways}
              alerts={alerts}
              geofences={geofences}
              levelFilter={levelFilter}
              labelMode={labelMode}
              selectedWorkerId={selectedWorkerId}
              trackingId={trackingId}
              focusGatewayId={focusGatewayId}
              onSelectWorker={onSelectWorker}
              onStartTracking={onStartTracking}
            />
            <TrackingCamera trackingId={trackingId} workers={workers} controlsRef={controlsRef} />
            <LevelFocusCamera
              levelFilter={levelFilter}
              mine={mine}
              trackingId={trackingId}
              controlsRef={controlsRef}
            />
            <OrbitControls
              ref={controlsRef}
              makeDefault
              target={[80, -900, 40]}
              enableDamping
              dampingFactor={0.08}
              minDistance={12}
              maxDistance={7000}
              zoomSpeed={1.85}
              panSpeed={1.35}
              rotateSpeed={0.85}
              minPolarAngle={0.05}
              maxPolarAngle={Math.PI - 0.05}
            />
          </Suspense>
        </Canvas>

        {focusWorker && (
          <WorkerStatusCard
            worker={focusWorker}
            telemetry={telemetryByTag[focusWorker.wearable_id]}
            position={positionByTag[focusWorker.wearable_id]}
            alerts={alerts}
            tracking={trackingId === focusWorker.worker_id}
            onClose={() => onSelectWorker(null)}
            onTrack={() => onStartTracking(focusWorker.worker_id)}
            onStopTrack={onStopTracking}
          />
        )}

        {labelMode !== "off" && (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded-md border border-border/50 bg-black/60 px-2.5 py-2 text-[10px] text-slate-300">
            <div className="mb-1 font-semibold text-slate-200">Platreef · Mokopane (inspired)</div>
            <div>Drag orbit · scroll zoom · pan to dive · click a level to fly there</div>
            {labelMode === "full" && (
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#6b8cae]" />Shaft 1 access</span>
                <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#eab308]" />Shaft 3 hoist</span>
                <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#38bdf8]" />Shaft 2 P&amp;M</span>
                <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#6b9e7a]" />Vent shafts</span>
                <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#d97706]" />Truck tips</span>
                <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#78716c]" />Crusher / conveyor</span>
                <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#a78bfa]" />Spiral truck ramps</span>
                <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#b45309]" />Ore passes</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkerStatusCard({
  worker, telemetry, position, alerts, tracking,
  onClose, onTrack, onStopTrack,
}: {
  worker: Worker;
  telemetry?: Telemetry;
  position?: PositionEstimate;
  alerts: Record<string, Alert>;
  tracking: boolean;
  onClose: () => void;
  onTrack: () => void;
  onStopTrack: () => void;
}) {
  const status = workerDisplayStatus(worker, alerts);
  return (
    <div
      className="absolute right-2 top-2 z-20 w-60 rounded-lg border border-border bg-[#121820]/95 p-3 shadow-xl backdrop-blur-sm"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-mono text-sm font-bold text-slate-100">
            {worker.worker_id} — {worker.name}
          </div>
          <div className="text-[11px] text-slate-400">{worker.role}</div>
          {worker.activity && (
            <div className="mt-0.5 text-[11px] font-medium text-amber-300/90">{worker.activity}</div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: STATUS_COLOR[status] + "33", color: STATUS_COLOR[status] }}
          >
            {status}
          </span>
          <button type="button" onClick={onClose} className="rounded px-1 text-xs text-slate-400 hover:text-slate-200">
            ×
          </button>
        </div>
      </div>
      <div className="mb-2 space-y-0.5 text-[11px] text-slate-400">
        <div>
          {worker.level ?? "—"} · depth {Math.round(worker.depth_m ?? worker.y)} m
        </div>
        <div className="font-mono text-slate-300">
          tunnel {worker.current_tunnel ?? worker.current_edge_id}
          {worker.nearest_gateway ? ` · ${worker.nearest_gateway}` : ""}
        </div>
        {position?.zone_id && (
          <div>Zone <span className="font-mono text-slate-200">{position.zone_id}</span></div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <DetailStat label="Heart Rate" value={telemetry ? `${telemetry.hr} bpm` : "—"} />
        <DetailStat label="Blood Pressure" value={telemetry ? `${telemetry.bp_sys}/${telemetry.bp_dia}` : "—"} />
        <DetailStat label="SpO₂" value={telemetry ? `${telemetry.spo2} %` : "—"} />
        <DetailStat label="Ambient O₂" value={telemetry ? `${telemetry.o2_ambient} %` : "—"} />
        <DetailStat label="Methane" value={telemetry ? `${telemetry.ch4_lel} LEL` : "—"} />
        <DetailStat label="Battery" value={telemetry ? `${telemetry.battery_pct} %` : "—"} />
      </div>
      <button
        type="button"
        onClick={tracking ? onStopTrack : onTrack}
        className={`mt-2.5 w-full rounded px-2 py-1.5 text-xs font-semibold uppercase tracking-wider ${
          tracking
            ? "bg-sky-500/25 text-sky-200 hover:bg-sky-500/40"
            : "bg-slate-600/80 text-slate-100 hover:bg-slate-500"
        }`}
      >
        {tracking ? "Stop tracking" : "Track on map"}
      </button>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/50 bg-panel/80 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-xs font-semibold text-slate-100">{value}</div>
    </div>
  );
}
