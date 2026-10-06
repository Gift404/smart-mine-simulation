import { NavLink, Outlet } from "react-router-dom";
import Header from "./Header";
import { useLive } from "../context/LiveDataContext";

const NAV = [
  { to: "/", label: "Map", end: true },
  { to: "/alerts", label: "Alerts" },
  { to: "/miners", label: "Miners" },
  { to: "/systems", label: "Systems" },
  { to: "/analytics", label: "Trends" },
  { to: "/risk", label: "Risk" },
] as const;

export default function AppShell() {
  const { state } = useLive();
  const activeAlerts = Object.values(state.alerts).filter((a) => a.status === "ACTIVE").length;

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-panel text-slate-100">
      <Header status={state.status} />
      <nav className="shrink-0 border-b border-border bg-panel2 px-4 py-2 sm:px-6">
        <div className="flex w-full gap-1 rounded-lg bg-panel p-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={"end" in item ? item.end : false}
              className={({ isActive }) =>
                [
                  "flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-center text-xs font-semibold tracking-wide transition-colors duration-150",
                  isActive
                    ? "bg-slate-600 text-slate-100 shadow-sm"
                    : "text-slate-400 hover:bg-panel2 hover:text-slate-200",
                ].join(" ")
              }
            >
              <span className="truncate">{item.label}</span>
              {item.to === "/alerts" && activeAlerts > 0 && (
                <span className="shrink-0 rounded-full bg-status-critical/25 px-1.5 py-0.5 text-[10px] leading-none text-status-critical">
                  {activeAlerts}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="min-h-0 flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
