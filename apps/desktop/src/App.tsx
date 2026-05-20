import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { LibraryView } from "./views/LibraryView";
import { DuplicatesView } from "./views/DuplicatesView";
import { FacesView } from "./views/FacesView";
import { SearchView } from "./views/SearchView";
import { SettingsView } from "./views/SettingsView";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/library" element={<LibraryView />} />
        <Route path="/duplicates" element={<DuplicatesView />} />
        <Route path="/faces" element={<FacesView />} />
        <Route path="/search" element={<SearchView />} />
        <Route path="/settings" element={<SettingsView />} />
      </Routes>
    </AppShell>
  );
}
