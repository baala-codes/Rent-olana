import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import { CLUSTER } from "../solana/constants";
import { WalletBalance } from "./WalletBalance";

export type Tab = "market" | "manage" | "rentals" | "admin";

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: "market", label: "market" },
  { id: "manage", label: "my listings" },
  { id: "rentals", label: "rentals" },
  { id: "admin", label: "admin" },
];

export function TopBar({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ◎
          </span>
          <span className="brand-logo">Rent-olana</span>
          <span className="brand-sub">escrowed asset rentals on Solana</span>
        </div>

        <nav className="nav">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`nav-link${tab === id ? " active" : ""}`}
              onClick={() => onTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          <span className="cluster-pill">
            <span className="dot">●</span> {CLUSTER}
          </span>
          <WalletBalance />
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
