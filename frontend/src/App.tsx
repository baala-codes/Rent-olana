import { useState } from "react";
import type { PublicKey } from "@solana/web3.js";

import { TopBar, type Tab } from "./components/TopBar";
import { Footer } from "./components/Footer";
import { ActionBar } from "./components/ActionBar";
import { ProgramStatus } from "./components/ProgramStatus";
import { LandingView } from "./views/LandingView";
import { MarketView } from "./views/MarketView";
import { ListingDetailView } from "./views/ListingDetailView";
import { ManageView } from "./views/ManageView";
import { RentalsView } from "./views/RentalsView";
import { AdminView } from "./views/AdminView";

/** Last chosen screen, so a refresh does not drop you back on the landing. */
const ENTERED_KEY = "rent-olana:entered";

const readEntered = (): boolean => {
  try {
    return window.localStorage.getItem(ENTERED_KEY) === "1";
  } catch {
    // Private mode / storage blocked — always start at the landing.
    return false;
  }
};

export function App() {
  // The landing screen renders first; "Go to marketplace" enters the app.
  // Clicking the wordmark in the top bar returns here. The choice persists
  // across refreshes (when localStorage is available).
  const [entered, setEnteredState] = useState(readEntered);
  const [tab, setTab] = useState<Tab>("market");
  const [selected, setSelected] = useState<PublicKey | null>(null);

  const setEntered = (next: boolean) => {
    setEnteredState(next);
    try {
      window.localStorage.setItem(ENTERED_KEY, next ? "1" : "0");
    } catch {
      // Non-fatal: the flag simply will not survive a refresh.
    }
  };

  const goTab = (next: Tab) => {
    setSelected(null);
    setTab(next);
  };

  const openListing = (address: PublicKey) => {
    setSelected(address);
    setTab("market");
  };

  if (!entered) {
    return <LandingView onEnter={() => setEntered(true)} />;
  }

  const main = (() => {
    if (tab === "market" && selected) {
      return (
        <ListingDetailView
          address={selected}
          onBack={() => setSelected(null)}
          onBooked={() => goTab("rentals")}
        />
      );
    }
    if (tab === "market") return <MarketView onSelect={openListing} />;
    if (tab === "manage") return <ManageView onSelect={openListing} />;
    if (tab === "rentals") return <RentalsView onSelect={openListing} />;
    return <AdminView />;
  })();

  return (
    <>
      <TopBar tab={tab} onTab={goTab} onHome={() => setEntered(false)} />
      <div className="container">
        <ActionBar />
        <div className="layout">
          <div style={{ minWidth: 0 }}>{main}</div>
          <div className="stack">
            <ProgramStatus />
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
