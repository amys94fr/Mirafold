import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  Images,
  Copy,
  UsersRound,
  Search,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScanIndicator } from "./ScanIndicator";
import logo from "/logo.png?url";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Images;
}

const NAV: NavItem[] = [
  { to: "/library", label: "Bibliothèque", icon: Images },
  { to: "/duplicates", label: "Doublons", icon: Copy },
  { to: "/faces", label: "Visages", icon: UsersRound },
  { to: "/search", label: "Recherche", icon: Search },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full grid-cols-[220px_1fr] grid-rows-[48px_1fr]">
      <header className="col-span-2 row-start-1 flex items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-2">
          <img src={logo} alt="" className="size-6" aria-hidden />
          <span className="font-semibold tracking-tight">Mirafold</span>
          <span className="text-xs text-muted-foreground">photo intelligence</span>
        </div>
        <ScanIndicator />
      </header>

      <nav
        aria-label="Navigation principale"
        className="col-start-1 row-start-2 flex flex-col border-r border-border bg-card/50 p-2"
      >
        <ul className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    "hover:bg-muted hover:text-foreground",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground",
                  )
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-auto">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                "hover:bg-muted hover:text-foreground",
                isActive ? "bg-muted text-foreground" : "text-muted-foreground",
              )
            }
          >
            <Settings className="size-4" aria-hidden />
            Réglages
          </NavLink>
        </div>
      </nav>

      <main className="col-start-2 row-start-2 overflow-auto">{children}</main>
    </div>
  );
}
