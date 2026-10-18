import { useEffect, useMemo, useState } from "react";
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
  const { listings, metadata, loading, error, refresh, search, source, backendAvailable } = useProgram();
  const { publicKey } = useWallet();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radiusKm, setRadiusKm] = useState("25");
  const [remote, setRemote] = useState<Listing[] | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const nowSec = Math.floor(Date.now() / 1000);

  // Server-side search (text, category, radius, availability) with a short
  // debounce. If the backend is offline, `remote` stays null and the local
  // filter below keeps the portal usable against RPC only.
  useEffect(() => {
    if (!backendAvailable) {
      setRemote(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const latNum = Number(lat);
      const lngNum = Number(lng);
      const hasGeo =
        lat.trim() !== "" &&
        lng.trim() !== "" &&
        Number.isFinite(latNum) &&
        Number.isFinite(lngNum);
      void search({
        q: query.trim() || undefined,
        category: category === "all" ? undefined : Number(category),
        lat: hasGeo ? latNum : undefined,
        lng: hasGeo ? lngNum : undefined,
        radiusKm: hasGeo ? Number(radiusKm) || 25 : undefined,
        availableFrom: onlyAvailable ? Math.floor(Date.now() / 1000) : undefined,
        days: 1,
        includeInactive: true,
        sort: hasGeo ? "relevance" : "newest",
        limit: 100,
      }).then((result) => {
        if (!cancelled) setRemote(result ? result.listings : null);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, category, onlyAvailable, lat, lng, radiusKm, search, backendAvailable]);

  const localFiltered = useMemo(() => {
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

  // The backend returns inactive rows when asked (so owners still see them),
  // so apply the local "available only" guard to remote results too.
  const filtered = useMemo(() => {
    if (!remote) return localFiltered;
    return remote.filter((listing) => {
      if (!onlyAvailable) return true;
      return listing.active && listing.busyUntil <= BigInt(nowSec);
    });
  }, [remote, localFiltered, onlyAvailable, nowSec]);

  const useMyLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("this browser does not expose geolocation");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toFixed(4));
        setLng(position.coords.longitude.toFixed(4));
      },
      () => setGeoError("location permission was denied; enter coordinates manually")
    );
  };

  const usedCategories = useMemo(
    () => Array.from(new Set(listings.map((l) => l.category))).sort((a, b) => a - b),
    [listings]
  );

  return (
    <Card
      title={`market · ${filtered.length} listing${filtered.length === 1 ? "" : "s"}`}
      actions={
        <div className="row" style={{ gap: 8 }}>
          <span className="badge muted" title="Where this read came from">
            {source === "backend" ? "backend index" : "rpc"}
          </span>
          <button type="button" className="btn tiny" onClick={() => void refresh()} disabled={loading}>
            {loading ? "reading…" : "refresh"}
          </button>
        </div>
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
        <Field label="latitude" hint="optional — radius search needs both coordinates">
          <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" placeholder="e.g. 12.9716" />
        </Field>
        <Field label="longitude">
          <input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" placeholder="e.g. 77.5946" />
        </Field>
        <Field label="radius (km)">
          <input
            value={radiusKm}
            onChange={(e) => setRadiusKm(e.target.value)}
            inputMode="numeric"
          />
        </Field>
        <div className="row" style={{ alignItems: "flex-end", paddingBottom: 6 }}>
          <button type="button" className="btn tiny" onClick={useMyLocation}>
            use my location
          </button>
          {(lat || lng) && (
            <button
              type="button"
              className="btn ghost tiny"
              onClick={() => {
                setLat("");
                setLng("");
              }}
            >
              clear
            </button>
          )}
        </div>
      </div>
      {geoError && (
        <div style={{ padding: "0 12px 10px" }}>
          <Notice kind="error" title="Location search">
            {geoError}
          </Notice>
        </div>
      )}

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
