import { useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";

import { useProgram } from "../ProgramContext";
import { categoryLabel } from "../solana/constants";
import { formatTs, lamportsToSol, shortAddr, shortId } from "../solana/format";
import type { Listing } from "../solana/accounts";
import { Card, Empty, Field, Notice, SkeletonRows } from "../components/ui";

const hexOf = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

export function MarketView({ onSelect }: { onSelect: (address: PublicKey) => void }) {
  const { listings, metadata, loading, error, refresh } = useProgram();
  const { publicKey } = useWallet();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const nowSec = Math.floor(Date.now() / 1000);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return listings
      .filter((listing) => {
        if (category !== "all" && String(listing.category) !== category) return false;
        const free = listing.busyUntil <= BigInt(nowSec);
        if (onlyAvailable && (!listing.active || !free)) return false;
        if (!needle) return true;
        const meta = metadata[hexOf(listing.metadataHash)];
        return (
          hexOf(listing.assetId).includes(needle) ||
          listing.owner.toBase58().toLowerCase().includes(needle) ||
          categoryLabel(listing.category).toLowerCase().includes(needle) ||
          (meta?.name ?? "").toLowerCase().includes(needle) ||
          (meta?.description ?? "").toLowerCase().includes(needle) ||
          (meta?.location?.label ?? "").toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => Number(b.createdAt - a.createdAt));
  }, [listings, metadata, query, category, onlyAvailable, nowSec]);

  const usedCategories = useMemo(
    () => Array.from(new Set(listings.map((l) => l.category))).sort((a, b) => a - b),
    [listings]
  );

  return (
    <Card
      title={`market · ${filtered.length} listing${filtered.length === 1 ? "" : "s"}`}
      actions={
        <button type="button" className="btn tiny" onClick={() => void refresh()} disabled={loading}>
          {loading ? "reading…" : "refresh"}
        </button>
      }
      tight
    >
      <div className="form-grid" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
        <Field label="search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="name, asset id, owner, category…"
          />
        </Field>
        <div className="row" style={{ alignItems: "flex-end", gap: 14 }}>
          <Field label="category">
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">all categories</option>
              {usedCategories.map((code) => (
                <option key={code} value={String(code)}>
                  {categoryLabel(code)}
                </option>
              ))}
            </select>
          </Field>
          <label className="row small" style={{ paddingBottom: 6 }}>
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
              style={{ width: "auto" }}
            />
            available only
          </label>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12 }}>
          <Notice kind="error" title="Could not read devnet">
            <span className="mono">{error}</span>
          </Notice>
        </div>
      )}

      {loading && listings.length === 0 ? (
        <SkeletonRows />
      ) : filtered.length === 0 ? (
        <Empty title="No listings on devnet yet">
          <div>
            The program returns zero accounts for this cluster. Once an owner runs{" "}
            <code>register_asset</code>, listings appear here automatically.
          </div>
          <div className="mono-note">
            Try the <strong>admin</strong> tab to initialise config, then{" "}
            <strong>my listings</strong> to register the first item.
          </div>
        </Empty>
      ) : (
        <ol className="item-list flush">
          {filtered.map((listing, index) => (
            <MarketRow
              key={listing.address.toBase58()}
              rank={index + 1}
              listing={listing}
              name={metadata[hexOf(listing.metadataHash)]?.name}
              description={metadata[hexOf(listing.metadataHash)]?.description}
              nowSec={nowSec}
              isMine={!!publicKey && listing.owner.equals(publicKey)}
              onOpen={() => onSelect(listing.address)}
            />
          ))}
        </ol>
      )}
    </Card>
  );
}

function MarketRow({
  rank,
  listing,
  name,
  description,
  nowSec,
  isMine,
  onOpen,
}: {
  rank: number;
  listing: Listing;
  name?: string;
  description?: string;
  nowSec: number;
  isMine: boolean;
  onOpen: () => void;
}) {
  const free = listing.busyUntil <= BigInt(nowSec);
  return (
    <li className="item">
      <div className="item-rank">{rank}.</div>
      <div className="item-main">
        <div className="item-title" onClick={onOpen}>
          {name ?? categoryLabel(listing.category)}
          <span className="tag">asset {shortId(listing.assetId)}</span>
          {isMine && <span className="owner-flag">yours</span>}
        </div>
        {description && <div className="small muted" style={{ marginTop: 2 }}>{description}</div>}
        <div className="item-meta">
          <span className="price">{lamportsToSol(listing.pricePerDay)} SOL/day</span>
          <span className="sep">·</span>
          <span>deposit {lamportsToSol(listing.deposit)} SOL</span>
          <span className="sep">·</span>
          <span>max {listing.maxDays} days</span>
          <span className="sep">·</span>
          <span className="addr" title={listing.owner.toBase58()}>
            owner {shortAddr(listing.owner)}
          </span>
          <span className="sep">·</span>
          <span className={`badge ${listing.active ? "active" : "muted"}`}>
            {listing.active ? "active" : "inactive"}
          </span>
          {!free && <span className="badge open">booked to {formatTs(listing.busyUntil)}</span>}
          <span className="sep">·</span>
          <span>{listing.totalRentals.toString()} completed</span>
        </div>
        <div className="item-actions">
          <button type="button" className="btn tiny" onClick={onOpen}>
            details & book
          </button>
        </div>
      </div>
    </li>
  );
}
