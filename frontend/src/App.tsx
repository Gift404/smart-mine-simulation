import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LiveDataProvider } from "./context/LiveDataContext";
import AppShell from "./components/AppShell";
import LiveMapPage from "./pages/LiveMapPage";
import AlertsPage from "./pages/AlertsPage";
import MinersPage from "./pages/MinersPage";
import SystemsPage from "./pages/SystemsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import RiskPage from "./pages/RiskPage";

export default function App() {
  return (
    <BrowserRouter>
      <LiveDataProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<LiveMapPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="miners" element={<MinersPage />} />
            <Route path="systems" element={<SystemsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="risk" element={<RiskPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </LiveDataProvider>
    </BrowserRouter>
  );
}
