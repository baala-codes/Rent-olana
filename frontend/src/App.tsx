import { useState } from "react";
import type { PublicKey } from "@solana/web3.js";

import { TopBar, type Tab } from "./components/TopBar";
import { Footer } from "./components/Footer";
import { ActionBar } from "./components/ActionBar";
import { ProgramStatus } from "./components/ProgramStatus";
import { MarketView } from "./views/MarketView";
import { ListingDetailView } from "./views/ListingDetailView";
import { ManageView } from "./views/ManageView";
import { RentalsView } from "./views/RentalsView";
import { AdminView } from "./views/AdminView";

export function App() {
  const [tab, setTab] = useState<Tab>("market");
  const [selected, setSelected] = useState<PublicKey | null>(null);

  const goTab = (next: Tab) => {
    setSelected(null);
    setTab(next);
  };

  const openListing = (address: PublicKey) => {
    setSelected(address);
    setTab("market");
  };

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
      <TopBar tab={tab} onTab={goTab} />
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
