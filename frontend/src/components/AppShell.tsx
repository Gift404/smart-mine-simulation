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

/**
 * Desktop (lg+) is a fixed control-room layout where each page scrolls inside `main`.
 * Narrower screens scroll as a normal page with the navigation pinned to the top.
 */
export default function AppShell() {
  const { state } = useLive();
  const activeAlerts = Object.values(state.alerts).filter((a) => a.status === "ACTIVE").length;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-panel text-slate-100 lg:h-screen lg:min-h-0 lg:overflow-hidden">
      <Header status={state.status} />
      <nav className="sticky top-0 z-30 shrink-0 border-b border-border bg-panel2 px-2 py-2 sm:px-6 lg:static">
        <div className="flex w-full gap-0.5 overflow-x-auto rounded-lg bg-panel p-1 sm:gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={"end" in item ? item.end : false}
              className={({ isActive }) =>
                [
                  "flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-center sm:px-3 text-xs font-semibold tracking-wide transition-colors duration-150 sm:flex-1",
                  isActive
                    ? "bg-slate-600 text-slate-100 shadow-sm"
                    : "text-slate-400 hover:bg-panel2 hover:text-slate-200",
                ].join(" ")
              }
            >
              <span>{item.label}</span>
              {item.to === "/alerts" && activeAlerts > 0 && (
                <span className="shrink-0 rounded-full bg-status-critical/25 px-1.5 py-0.5 text-[11px] leading-none text-status-critical">
                  {activeAlerts}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="flex-1 lg:min-h-0 lg:overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
