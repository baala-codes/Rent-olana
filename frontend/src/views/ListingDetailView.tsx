import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";

import { useProgram } from "../ProgramContext";
import { categoryLabel, SECONDS_PER_DAY } from "../solana/constants";
import { ixCreateRental } from "../solana/instructions";
import {
  dateInputToUnix,
  defaultStartDate,
  formatTs,
  lamportsToSol,
  shortAddr,
  shortId,
  todayDateInput,
} from "../solana/format";
import { Card, Notice } from "../components/ui";

/** Persist the pending rental id before signing so a retry never double-charges. */
const pendingKey = (listing: string) => `rent-olana:pending-rental:${listing}`;

function loadPending(listing: string): Uint8Array | null {
  try {
    const hex = localStorage.getItem(pendingKey(listing));
    if (!hex || hex.length !== 64) return null;
    return Uint8Array.from(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  } catch {
    return null;
  }
}

function storePending(listing: string, rentalId: Uint8Array): void {
  const hex = Array.from(rentalId)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  try {
    localStorage.setItem(pendingKey(listing), hex);
  } catch {
    // Storage is best-effort; the id is still held in memory for this session.
  }
}

function clearPending(listing: string): void {
  try {
    localStorage.removeItem(pendingKey(listing));
  } catch {
    // ignore
  }
}

export function ListingDetailView({
  address,
  onBack,
  onBooked,
}: {
  address: PublicKey;
  onBack: () => void;
  onBooked: () => void;
}) {
  const { listings, metadata, run, busy } = useProgram();
  const { publicKey } = useWallet();

  const listing = listings.find((l) => l.address.equals(address)) ?? null;
  const hex = (b: Uint8Array) =>
    Array.from(b)
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  const meta = listing ? metadata[hex(listing.metadataHash)] : undefined;

  const [startDate, setStartDate] = useState(defaultStartDate());
  const [days, setDays] = useState(1);
  const [rentalId, setRentalId] = useState<Uint8Array | null>(null);

  const listingKey = address.toBase58();

  // Reuse any persisted id for this listing; otherwise mint one on first submit.
  useEffect(() => {
    setRentalId(loadPending(listingKey));
  }, [listingKey]);

  const nowSec = Math.floor(Date.now() / 1000);
  const startTs = useMemo(() => dateInputToUnix(startDate), [startDate]);
  const isOwner = !!publicKey && !!listing && listing.owner.equals(publicKey);
  const free = !!listing && listing.busyUntil <= BigInt(nowSec);

  const priceTotal = listing ? listing.pricePerDay * BigInt(days) : 0n;
  const deposit = listing ? listing.deposit : 0n;
  const escrow = priceTotal + deposit;

  const startInPast = startTs < nowSec;
  const daysValid = !!listing && days >= 1 && days <= listing.maxDays;
  const canBook =
    !!listing && !!publicKey && !isOwner && listing.active && free && !startInPast && daysValid;

  const book = async () => {
    if (!listing || !publicKey) return;
    const id = rentalId ?? crypto.getRandomValues(new Uint8Array(32));
    if (!rentalId) {
      setRentalId(id);
      storePending(listingKey, id); // persist BEFORE signing
    }
    const signature = await run(
      [ixCreateRental(publicKey, listing.address, { rentalId: id, startTs, days })],
      "create_rental"
    );
    if (signature) {
      clearPending(listingKey);
      onBooked();
    }
  };

  if (!listing) {
    return (
      <Card title="listing not found">
        <p className="muted small">
          This listing is not among the accounts returned by devnet right now. It may have been
          closed, or the read is stale.
        </p>
        <button type="button" className="btn" onClick={onBack}>
          ← back to market
        </button>
      </Card>
    );
  }

  return (
    <div className="stack">
      <div className="row">
        <button type="button" className="btn ghost tiny" onClick={onBack}>
          ← market
        </button>
        <span className="muted small">listing detail</span>
      </div>

      <div className="layout">
        <Card title={meta?.name ?? categoryLabel(listing.category)}>
          {meta?.images?.[0] ? (
            <img className="asset-thumb" src={meta.images[0]} alt={meta.name} />
          ) : (
            <div className="asset-thumb placeholder" style={{ marginBottom: 12 }}>
              no photo · metadata {shortId(listing.metadataHash, 6)}
            </div>
          )}
          {meta?.description && (
            <p className="small muted" style={{ marginTop: 0 }}>
              {meta.description}
            </p>
          )}
          <table className="kv">
            <tbody>
              <tr>
                <td>listing PDA</td>
                <td>
                  <span className="addr" title={listing.address.toBase58()}>
                    {listing.address.toBase58()}
                  </span>
                </td>
              </tr>
              <tr>
                <td>asset id</td>
                <td>
                  <span className="addr">{shortId(listing.assetId, 8)}</span>
                </td>
              </tr>
              <tr>
                <td>owner</td>
                <td>
                  <span className="addr">{shortAddr(listing.owner)}</span>
                </td>
              </tr>
              <tr>
                <td>price / day</td>
                <td className="price">{lamportsToSol(listing.pricePerDay)} SOL</td>
              </tr>
              <tr>
                <td>deposit</td>
                <td>{lamportsToSol(listing.deposit)} SOL</td>
              </tr>
              <tr>
                <td>max duration</td>
                <td>{listing.maxDays} days</td>
              </tr>
              <tr>
                <td>status</td>
                <td>
                  <span className={`badge ${listing.active ? "active" : "muted"}`}>
                    {listing.active ? "active" : "inactive"}
                  </span>{" "}
                  {free ? (
                    <span className="muted small">· available now</span>
                  ) : (
                    <span className="badge open">booked until {formatTs(listing.busyUntil)}</span>
                  )}
                </td>
              </tr>
              <tr>
                <td>completed rentals</td>
                <td>{listing.totalRentals.toString()}</td>
              </tr>
              <tr>
                <td>registered</td>
                <td>{formatTs(listing.createdAt)}</td>
              </tr>
              {meta?.location?.label && (
                <tr>
                  <td>location</td>
                  <td>{meta.location.label}</td>
                </tr>
              )}
              <tr>
                <td>metadata hash</td>
                <td>
                  <span className="addr">0x{shortId(listing.metadataHash, 8)}</span>
                  <div className="muted small">
                    commitment to the off-chain document (name, photos, location)
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card title="book this item">
          {!publicKey ? (
            <Notice title="Connect a wallet">
              Connect Phantom or Solflare to book. Your wallet signs; the portal never holds keys.
            </Notice>
          ) : isOwner ? (
            <Notice title="This is your listing">
              You cannot rent your own asset. Manage it from <strong>my listings</strong>.
            </Notice>
          ) : null}

          <div className="form-grid">
            <label className="field">
              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>START DATE (UTC)</span>
              <input
                type="date"
                value={startDate}
                min={todayDateInput()}
                onChange={(e) => setStartDate(e.target.value)}
              />
              {startInPast && <span className="hint" style={{ color: "var(--bad)" }}>Start must be now or later.</span>}
            </label>
            <label className="field">
              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>DAYS</span>
              <input
                type="number"
                min={1}
                max={listing.maxDays}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(listing.maxDays, Number(e.target.value) || 1)))}
              />
              {!daysValid && <span className="hint" style={{ color: "var(--bad)" }}>1–{listing.maxDays} days.</span>}
            </label>
          </div>

          <hr className="hr" />

          <table className="kv">
            <tbody>
              <tr>
                <td>
                  price × {days} day{days === 1 ? "" : "s"}
                </td>
                <td>{lamportsToSol(priceTotal)} SOL</td>
              </tr>
              <tr>
                <td>deposit (refundable)</td>
                <td>{lamportsToSol(deposit)} SOL</td>
              </tr>
              <tr>
                <td>
                  <strong>escrowed now</strong>
                </td>
                <td>
                  <strong>{lamportsToSol(escrow)} SOL</strong>
                </td>
              </tr>
              <tr>
                <td>rental window</td>
                <td>
                  {formatTs(startTs)} → {formatTs(startTs + days * SECONDS_PER_DAY)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="btn-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn primary" disabled={!canBook || !!busy} onClick={() => void book()}>
              {busy === "create_rental" ? "booking…" : "Book & escrow"}
            </button>
            {rentalId && <span className="muted small">rental id held for retry: {shortId(rentalId)}</span>}
          </div>

          <p className="muted small" style={{ marginBottom: 0 }}>
            Booking escrows price + deposit into the rental PDA and reserves the window on-chain. The
            rental id is persisted before signing, so a retry reuses the same agreement instead of
            double-charging.
          </p>
        </Card>
      </div>
    </div>
  );
}
