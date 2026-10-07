import { useLive } from "../context/LiveDataContext";

/** Segmented control for switching the backend between mine simulations. */
export default function SimulationToggle() {
  const { state, switching, switchSimulation } = useLive();
  const { simulations } = state;
  const activeId = state.mine?.simulation_id ?? simulations.find((s) => s.active)?.id;

  if (simulations.length < 2) return null;

  return (
    <div className="mt-1.5 flex w-full gap-0.5 rounded-md bg-panel2 p-0.5" role="radiogroup" aria-label="Simulation">
      {simulations.map((sim) => {
        const active = sim.id === activeId;
        return (
          <button
            key={sim.id}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={switching}
            onClick={() => switchSimulation(sim.id).catch(console.error)}
            title={`${sim.name} — ${sim.description}`}
            className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-[10px] font-semibold transition-colors ${
              active ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200"
            } ${switching ? "cursor-wait opacity-60" : ""}`}
          >
            {sim.name.split("·").pop()?.trim() ?? sim.name}
          </button>
        );
      })}
    </div>
  );
}
