/**
 * Static + mobile mining equipment for the 3D map.
 * Inspired by shaft/cage/galloway structure and underground haulage.
 */
import { Html } from "@react-three/drei";
import type { MineNode, Vehicle } from "../types";

function headingToYaw(headingDeg: number): number {
  // Mine heading: 0 = +Z (north); Three.js Y rotation from +Z
  return (headingDeg * Math.PI) / 180;
}

/** Small seated driver figure in the cab (not the roster sphere). */
function DriverFigure({ tint = "#fbbf24" }: { tint?: string }) {
  return (
    <group position={[0, 2.2, 0.4]}>
      <mesh position={[0, 1.1, 0]} castShadow={false}>
        <sphereGeometry args={[0.55, 10, 10]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.9, 1.1, 0.7]} />
        <meshStandardMaterial color={tint} />
      </mesh>
    </group>
  );
}

export function HaulVehicleMesh({
  vehicle,
  opacity,
}: {
  vehicle: Vehicle;
  opacity: number;
}) {
  if (opacity < 0.12) return null;
  const yaw = headingToYaw(vehicle.heading_deg ?? 0);
  const isLhd = vehicle.kind === "lhd";
  const bodyColor = isLhd ? "#ca8a04" : "#a16207";
  const bedColor = "#78350f";
  const cargoH = 0.4 + (vehicle.cargo_fill ?? 0) * (isLhd ? 2.2 : 2.8);

  return (
    <group position={[vehicle.x, vehicle.y, vehicle.z ?? 0]} rotation={[0, yaw, 0]}>
      {/* Chassis */}
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={isLhd ? [4.2, 1.6, 7.5] : [3.6, 1.4, 9.5]} />
        <meshStandardMaterial color={bodyColor} metalness={0.35} roughness={0.45} />
      </mesh>
      {/* Cabin */}
      <mesh position={[0, 2.6, isLhd ? 2.2 : 3.2]}>
        <boxGeometry args={[3.2, 2.0, 2.4]} />
        <meshStandardMaterial color="#334155" metalness={0.2} roughness={0.5} transparent opacity={0.95} />
      </mesh>
      {/* Wheels */}
      {([-2.2, 2.2] as const).map((x) =>
        (isLhd ? [-2.4, 2.4] : [-3.2, 0, 3.2]).map((z) => (
          <mesh key={`${x}-${z}`} position={[x, 0.7, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.85, 0.85, 0.55, 12]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
        )),
      )}
      {/* Ore bed / bucket */}
      <mesh position={[0, 1.6 + cargoH / 2, isLhd ? -1.6 : -1.2]}>
        <boxGeometry args={isLhd ? [3.8, cargoH, 3.5] : [3.2, cargoH, 5.5]} />
        <meshStandardMaterial
          color={(vehicle.cargo_fill ?? 0) > 0.15 ? "#92400e" : bedColor}
          metalness={0.15}
          roughness={0.7}
        />
      </mesh>
      {vehicle.driver_worker_id && <DriverFigure tint={isLhd ? "#f59e0b" : "#38bdf8"} />}
      <Html distanceFactor={140} style={{ pointerEvents: "none" }}>
        <div
          style={{
            color: "#fde68a",
            fontSize: 10,
            fontWeight: 700,
            textShadow: "0 0 4px #000",
            transform: "translate(12px, -18px)",
            whiteSpace: "nowrap",
          }}
        >
          {vehicle.vehicle_id}
          {vehicle.driver_name ? ` · ${vehicle.driver_name}` : ""}
          <div style={{ color: "#94a3b8", fontWeight: 600, fontSize: 9 }}>
            {vehicle.activity ?? vehicle.phase}
            {(vehicle.cargo_fill ?? 0) > 0.05 ? ` · ${Math.round((vehicle.cargo_fill ?? 0) * 100)}%` : ""}
          </div>
        </div>
      </Html>
    </group>
  );
}

/** Ore stockpile + drill jumbo at a mining face. */
export function MiningFaceProps({
  node,
  opacity,
}: {
  node: MineNode;
  opacity: number;
}) {
  if (opacity < 0.12 || node.type !== "work_zone") return null;
  const seed = node.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const ox = ((seed % 7) - 3) * 2.5;
  const oz = (((seed >> 3) % 7) - 3) * 2.5;

  return (
    <group position={[node.x + ox, node.y, (node.z ?? 0) + oz]}>
      {/* Ore pile */}
      <mesh position={[6, 1.2, -4]} scale={[1, 0.7, 1]}>
        <sphereGeometry args={[4.5, 10, 8]} />
        <meshStandardMaterial color="#78350f" roughness={0.95} />
      </mesh>
      <mesh position={[8.5, 0.7, -2]} scale={[0.7, 0.45, 0.8]}>
        <sphereGeometry args={[3.2, 8, 6]} />
        <meshStandardMaterial color="#92400e" roughness={0.9} />
      </mesh>
      {/* Drill jumbo boom */}
      <group position={[-8, 0, 5]} rotation={[0, 0.6, 0]}>
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[2.8, 1.4, 5]} />
          <meshStandardMaterial color="#64748b" metalness={0.4} roughness={0.4} />
        </mesh>
        <mesh position={[0, 2.4, -3.5]} rotation={[0.35, 0, 0]}>
          <boxGeometry args={[0.45, 0.45, 7]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 3.8, -7]}>
          <cylinderGeometry args={[0.35, 0.25, 1.2, 8]} />
          <meshStandardMaterial color="#cbd5e1" />
        </mesh>
      </group>
      {/* Support props / timber stand-ins */}
      {([-10, 10] as const).map((x) => (
        <mesh key={x} position={[x, 4, 0]}>
          <cylinderGeometry args={[0.35, 0.35, 8, 6]} />
          <meshStandardMaterial color="#57534e" />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Shaft station steelwork: cage guides + platform (galloway / bunton inspired).
 */
export function ShaftCageStructure({
  node,
  opacity,
}: {
  node: MineNode;
  opacity: number;
}) {
  if (opacity < 0.12) return null;
  if (node.type !== "lift_station" && node.type !== "surface") return null;

  const isSurface = node.type === "surface" || (node.y ?? 0) > -5;
  const H = isSurface ? 28 : 18;

  return (
    <group position={[node.x, node.y, node.z ?? 0]}>
      {/* Vertical guide rails */}
      {([-3.2, 3.2] as const).map((x) =>
        ([-3.2, 3.2] as const).map((z) => (
          <mesh key={`${x}-${z}`} position={[x, H / 2, z]}>
            <boxGeometry args={[0.35, H, 0.35]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.55} roughness={0.35} />
          </mesh>
        )),
      )}
      {/* Bunton rings */}
      {[0.25, 0.55, 0.85].map((t) => (
        <mesh key={t} position={[0, H * t, 0]}>
          <boxGeometry args={[7.2, 0.3, 7.2]} />
          <meshStandardMaterial color="#64748b" metalness={0.45} roughness={0.4} transparent opacity={0.55} />
        </mesh>
      ))}
      {/* Cage / skip car */}
      <mesh position={[0, isSurface ? 4 : 3, 0]}>
        <boxGeometry args={[4.2, 5.5, 4.2]} />
        <meshStandardMaterial color="#eab308" metalness={0.35} roughness={0.45} transparent opacity={0.85} />
      </mesh>
      {isSurface && (
        <>
          {/* Headframe legs */}
          <mesh position={[-6, 16, -6]} rotation={[0, 0, 0.25]}>
            <boxGeometry args={[0.5, 36, 0.5]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.3} />
          </mesh>
          <mesh position={[6, 16, -6]} rotation={[0, 0, -0.25]}>
            <boxGeometry args={[0.5, 36, 0.5]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.3} />
          </mesh>
          <mesh position={[0, 32, -4]}>
            <boxGeometry args={[14, 1.2, 4]} />
            <meshStandardMaterial color="#f8fafc" metalness={0.4} roughness={0.35} />
          </mesh>
          {/* Sheave wheel */}
          <mesh position={[0, 34, -4]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[2.2, 0.35, 8, 20]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
          </mesh>
        </>
      )}
    </group>
  );
}

export function WorkshopGear({ node, opacity }: { node: MineNode; opacity: number }) {
  if (opacity < 0.12 || node.type !== "workshop") return null;
  return (
    <group position={[node.x, node.y, node.z ?? 0]}>
      <mesh position={[4, 1.5, 3]}>
        <boxGeometry args={[5, 3, 2.5]} />
        <meshStandardMaterial color="#ea580c" metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[-5, 0.8, -2]}>
        <boxGeometry args={[3, 1.6, 6]} />
        <meshStandardMaterial color="#78716c" />
      </mesh>
    </group>
  );
}
