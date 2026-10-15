import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";

import { useProgram } from "../ProgramContext";
import { GRACE_SECONDS, categoryLabel } from "../solana/constants";
import {
  ixCancelRental,
  ixCloseRental,
  ixRaiseDispute,
  ixResolveDispute,
  ixSettleRental,
} from "../solana/instructions";
import { formatTs, lamportsToSol, shortAddr, shortId } from "../solana/format";
import type { Listing, Rental } from "../solana/accounts";
import { Card, Empty, Notice, StatusBadge } from "../components/ui";

export function RentalsView({ onSelect }: { onSelect: (address: PublicKey) => void }) {
  const { rentals, listings, config, run, busy } = useProgram();
  const { publicKey } = useWallet();

  const mine = publicKey
    ? rentals
        .filter((r) => r.owner.equals(publicKey) || r.renter.equals(publicKey))
        .sort((a, b) => Number(b.createdAt - a.createdAt))
    : [];

  return (
    <Card title={`rentals · ${mine.length}`} tight>
      {!publicKey ? (
        <Empty title="Connect a wallet">Your rentals appear here once you connect Phantom or Solflare.</Empty>
      ) : mine.length === 0 ? (
        <Empty title="No rentals for this wallet">
          Book an item from the <strong>market</strong>, or settle the ones you own from here.
        </Empty>
      ) : (
        <ol className="item-list flush">
          {mine.map((rental) => (
            <RentalRow
              key={rental.address.toBase58()}
              rental={rental}
              listing={listings.find((l) => l.address.equals(rental.listing)) ?? null}
              treasury={config?.treasury ?? null}
              isAdmin={!!config && !!publicKey && config.admin.equals(publicKey)}
              busy={busy}
              run={run}
              onSelect={onSelect}
            />
          ))}
        </ol>
      )}
    </Card>
  );
}

function RentalRow({
  rental,
  listing,
  treasury,
  isAdmin,
  busy,
  run,
  onSelect,
}: {
  rental: Rental;
  listing: Listing | null;
  treasury: PublicKey | null;
  isAdmin: boolean;
  busy: string | null;
  run: ReturnType<typeof useProgram>["run"];
  onSelect: (address: PublicKey) => void;
}) {
  const { publicKey } = useWallet();
  const [share, setShare] = useState(5000);

  const now = Math.floor(Date.now() / 1000);
  const isOwner = !!publicKey && rental.owner.equals(publicKey);
  const isRenter = !!publicKey && rental.renter.equals(publicKey);
  const role = isOwner ? "owner" : isRenter ? "renter" : "observer";

  const open = rental.status === "Reserved" || rental.status === "Active";
  const beforeStart = now < Number(rental.startTs);
  const afterGrace = now >= Number(rental.endTs) + GRACE_SECONDS;

  const canCancel = open && beforeStart;
  const canDispute = open;
  const canOwnerSettle = open && isOwner && now >= Number(rental.startTs);
  const canTimeoutSettle = open && afterGrace;
  const canClose = ["Completed", "Cancelled", "Resolved"].includes(rental.status);

  const title = listing
    ? `${categoryLabel(listing.category)} · asset ${shortId(listing.assetId)}`
    : `listing ${shortAddr(rental.listing)}`;

  return (
    <li className="item">
      <div className="item-rank">·</div>
      <div className="item-main">
        <div className="item-title" onClick={() => listing && onSelect(listing.address)}>
          {title}
          <span className="tag">{role}</span>
        </div>
        <div className="item-meta">
          <StatusBadge status={rental.status} />
          <span className="sep">·</span>
          <span>
            {formatTs(rental.startTs)} → {formatTs(rental.endTs)} ({rental.days}d)
          </span>
          <span className="sep">·</span>
          <span className="price">{lamportsToSol(rental.priceTotal)} SOL price</span>
          <span className="sep">·</span>
          <span>{lamportsToSol(rental.deposit)} SOL deposit</span>
          {rental.escrow > 0n && (
            <>
              <span className="sep">·</span>
              <span>
                <strong>{lamportsToSol(rental.escrow)} SOL escrowed</strong>
              </span>
            </>
          )}
        </div>
        <div className="item-meta">
          <span className="addr">owner {shortAddr(rental.owner)}</span>
          <span className="sep">·</span>
          <span className="addr">renter {shortAddr(rental.renter)}</span>
          <span className="sep">·</span>
          <span className="addr">rental {shortId(rental.rentalId)}</span>
        </div>

        {open && treasury && (
          <div className="item-actions">
            <button
              type="button"
              className="btn tiny"
              disabled={!!busy || !canCancel}
              title={beforeStart ? "refund before start" : "rental has started — cancel is closed"}
              onClick={() =>
                void run(
                  [
                    ixCancelRental(publicKey!, {
                      listing: rental.listing,
                      rental: rental.address,
                      renterWallet: rental.renter,
                    }),
                  ],
                  "cancel_rental"
                )
              }
            >
              cancel
            </button>

            <button
              type="button"
              className="btn tiny"
              disabled={!!busy || !canDispute}
              onClick={() =>
                void run(
                  [
                    ixRaiseDispute(publicKey!, {
                      listing: rental.listing,
                      rental: rental.address,
                    }),
                  ],
                  "raise_dispute"
                )
              }
            >
              dispute
            </button>

            <button
              type="button"
              className="btn tiny primary"
              disabled={!!busy || !(canOwnerSettle || canTimeoutSettle)}
              title={
                canOwnerSettle
                  ? "owner settles after handover"
                  : canTimeoutSettle
                    ? "permissionless settle after end + grace"
                    : "settle opens at start (owner) or end + 24h (anyone)"
              }
              onClick={() =>
                void run(
                  [
                    ixSettleRental(publicKey!, {
                      listing: rental.listing,
                      rental: rental.address,
                      ownerWallet: rental.owner,
                      platformTreasury: treasury,
                      renterWallet: rental.renter,
                    }),
                  ],
                  "settle_rental"
                )
              }
            >
              settle
            </button>
          </div>
        )}

        {open && !treasury && (
          <div className="muted small">settlement needs the platform config; an admin must initialize it.</div>
        )}

        {rental.status === "Disputed" && (
          <div className="stack" style={{ marginTop: 8 }}>
            <Notice title="Frozen by dispute">
              Escrow cannot move until the admin resolves the split. Only the platform admin can act.
            </Notice>
            {isAdmin && (
              <div className="row">
                <label className="field" style={{ maxWidth: 160 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>OWNER SHARE (BPS)</span>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={share}
                    onChange={(e) => setShare(Math.max(0, Math.min(10000, Number(e.target.value) || 0)))}
                  />
                </label>
                <button type="button" className="btn tiny" onClick={() => setShare(5000)}>
                  50 / 50
                </button>
                <button
                  type="button"
                  className="btn primary tiny"
                  disabled={!!busy}
                  onClick={() =>
                    void run(
                      [
                        ixResolveDispute(publicKey!, {
                          listing: rental.listing,
                          rental: rental.address,
                          ownerWallet: rental.owner,
                          renterWallet: rental.renter,
                          ownerShareBps: share,
                        }),
                      ],
                      "resolve_dispute"
                    )
                  }
                >
                  resolve ({(share / 100).toFixed(0)}% owner)
                </button>
              </div>
            )}
            {!isAdmin && <div className="muted small">Connect the admin wallet to resolve.</div>}
          </div>
        )}

        {canClose && (
          <div className="item-actions">
            <button
              type="button"
              className="btn tiny"
              disabled={!!busy}
              title="reclaim the rent-exempt lamports to the renter"
              onClick={() =>
                void run(
                  [ixCloseRental({ rental: rental.address, renterWallet: rental.renter })],
                  "close_rental"
                )
              }
            >
              close & reclaim rent
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
