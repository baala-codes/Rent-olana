import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";

import { useProgram } from "../ProgramContext";
import { MAX_FEE_BPS } from "../solana/constants";
import { ixInitializeConfig, ixResolveDispute, ixSetConfig } from "../solana/instructions";
import { lamportsToSol, shortAddr, shortId } from "../solana/format";
import { Card, Empty, Field, Notice } from "../components/ui";

export function AdminView() {
  const { config, listings, rentals, run, busy } = useProgram();
  const { publicKey } = useWallet();

  const isAdmin = !!config && !!publicKey && config.admin.equals(publicKey);
  const disputed = rentals.filter((r) => r.status === "Disputed");

  return (
    <div className="stack">
      {config ? (
        <Card title="platform config">
          <table className="kv">
            <tbody>
              <tr>
                <td>admin</td>
                <td>
                  <span className="addr">{config.admin.toBase58()}</span>{" "}
                  {isAdmin && <span className="badge active">you</span>}
                </td>
              </tr>
              <tr>
                <td>treasury</td>
                <td>
                  <span className="addr">{config.treasury.toBase58()}</span>
                </td>
              </tr>
              <tr>
                <td>fee</td>
                <td>
                  {config.feeBps} bps ({(config.feeBps / 100).toFixed(2)}%)
                </td>
              </tr>
              <tr>
                <td>paused</td>
                <td>
                  {config.paused ? (
                    <span className="badge frozen">paused</span>
                  ) : (
                    <span className="badge active">running</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="muted small">
            Pausing blocks new rentals only; settlement, cancels, and disputes keep working so escrow
            is never trapped.
          </p>
          <SetConfigForm isAdmin={isAdmin} />
        </Card>
      ) : (
        <InitializeForm />
      )}

      <Card title={`dispute queue · ${disputed.length}`} tight>
        {disputed.length === 0 ? (
          <Empty title="No frozen rentals">
            Disputes raised by an owner or renter land here for the admin to split.
          </Empty>
        ) : (
          <ol className="item-list flush">
            {disputed.map((rental) => (
              <DisputeRow
                key={rental.address.toBase58()}
                rental={rental}
                listingLabel={
                  (() => {
                    const listing = listings.find((l) => l.address.equals(rental.listing));
                    return listing ? shortId(listing.assetId) : shortAddr(rental.listing);
                  })()
                }
                isAdmin={isAdmin}
                busy={busy}
                run={run}
                adminKey={publicKey}
              />
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

function InitializeForm() {
  const { run, busy } = useProgram();
  const { publicKey } = useWallet();
  const [treasury, setTreasury] = useState("");
  const [feeBps, setFeeBps] = useState(250);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    if (!publicKey) return;
    setLocalError(null);
    let treasuryKey: PublicKey;
    try {
      treasuryKey = new PublicKey(treasury.trim());
    } catch {
      setLocalError("treasury must be a valid base58 public key");
      return;
    }
    if (feeBps < 0 || feeBps > MAX_FEE_BPS) {
      setLocalError(`fee must be between 0 and ${MAX_FEE_BPS} bps`);
      return;
    }
    await run([ixInitializeConfig(publicKey, treasuryKey, feeBps)], "initialize_config");
  };

  return (
    <Card title="initialize platform config">
      <Notice title="No PlatformConfig on this cluster">
        The program returns no config account, so no rentals can be created yet. The wallet that runs
        this becomes the platform <strong>admin</strong> and can resolve disputes.
      </Notice>
      <div className="form-grid">
        <Field label="treasury public key" hint="receives the platform fee (receives only)">
          <input
            value={treasury}
            onChange={(e) => setTreasury(e.target.value)}
            placeholder="e.g. 23Y75gsoeTF68uMxPVZ6TtMfL6a73bDouxLJLRZ6kTeX"
          />
        </Field>
        <Field label="fee (basis points)" hint={`0 – ${MAX_FEE_BPS} (1000 = 10%)`}>
          <input
            type="number"
            min={0}
            max={MAX_FEE_BPS}
            value={feeBps}
            onChange={(e) => setFeeBps(Number(e.target.value) || 0)}
          />
        </Field>
      </div>
      {localError && (
        <Notice kind="error" title="Check the form">
          {localError}
        </Notice>
      )}
      <div className="btn-row">
        <button type="button" className="btn primary" disabled={!!busy || !publicKey} onClick={() => void submit()}>
          {busy === "initialize_config" ? "initializing…" : "Initialize config"}
        </button>
      </div>
    </Card>
  );
}

function SetConfigForm({ isAdmin }: { isAdmin: boolean }) {
  const { run, busy } = useProgram();
  const { publicKey } = useWallet();

  const [treasury, setTreasury] = useState("");
  const [fee, setFee] = useState("");
  const [paused, setPaused] = useState<"unchanged" | "true" | "false">("unchanged");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    if (!publicKey) return;
    setLocalError(null);
    let treasuryKey: PublicKey | undefined;
    if (treasury.trim()) {
      try {
        treasuryKey = new PublicKey(treasury.trim());
      } catch {
        setLocalError("treasury must be a valid base58 public key");
        return;
      }
    }
    const feeBps = fee.trim() === "" ? undefined : Number(fee);
    if (feeBps !== undefined && (Number.isNaN(feeBps) || feeBps < 0 || feeBps > MAX_FEE_BPS)) {
      setLocalError(`fee must be between 0 and ${MAX_FEE_BPS} bps`);
      return;
    }
    await run(
      [
        ixSetConfig(publicKey, {
          treasury: treasuryKey,
          feeBps,
          paused: paused === "unchanged" ? undefined : paused === "true",
        }),
      ],
      "set_config"
    );
  };

  return (
    <div>
      <hr className="hr" />
      <div className="section-title">update config {isAdmin ? "" : "· admin only"}</div>
      <div className="form-grid">
        <Field label="treasury (blank = unchanged)">
          <input value={treasury} onChange={(e) => setTreasury(e.target.value)} placeholder="leave blank to keep" />
        </Field>
        <Field label="fee bps (blank = unchanged)">
          <input
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="leave blank to keep"
            inputMode="numeric"
          />
        </Field>
        <Field label="paused">
          <select value={paused} onChange={(e) => setPaused(e.target.value as typeof paused)}>
            <option value="unchanged">unchanged</option>
            <option value="true">pause new rentals</option>
            <option value="false">resume</option>
          </select>
        </Field>
      </div>
      {localError && (
        <Notice kind="error" title="Check the form">
          {localError}
        </Notice>
      )}
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button
          type="button"
          className="btn primary"
          disabled={!!busy || !publicKey || !isAdmin}
          title={isAdmin ? "" : "connect the admin wallet"}
          onClick={() => void submit()}
        >
          {busy === "set_config" ? "updating…" : "Update config"}
        </button>
      </div>
    </div>
  );
}

function DisputeRow({
  rental,
  listingLabel,
  isAdmin,
  busy,
  run,
  adminKey,
}: {
  rental: import("../solana/accounts").Rental;
  listingLabel: string;
  isAdmin: boolean;
  busy: string | null;
  run: ReturnType<typeof useProgram>["run"];
  adminKey: PublicKey | null;
}) {
  const [share, setShare] = useState(5000);
  const toOwner = (rental.escrow * BigInt(share)) / 10000n;
  const toRenter = rental.escrow - toOwner;

  return (
    <li className="item">
      <div className="item-rank">·</div>
      <div className="item-main">
        <div className="item-title">asset {listingLabel}</div>
        <div className="item-meta">
          <span className="badge frozen">disputed</span>
          <span className="sep">·</span>
          <span>escrow {lamportsToSol(rental.escrow)} SOL</span>
          <span className="sep">·</span>
          <span className="addr">owner {shortAddr(rental.owner)}</span>
          <span className="sep">·</span>
          <span className="addr">renter {shortAddr(rental.renter)}</span>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label className="field" style={{ maxWidth: 170 }}>
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
          <span className="muted small">
            → owner {lamportsToSol(toOwner)} SOL · renter {lamportsToSol(toRenter)} SOL
          </span>
          <button
            type="button"
            className="btn primary tiny"
            disabled={!!busy || !isAdmin || !adminKey}
            title={isAdmin ? "" : "connect the admin wallet"}
            onClick={() =>
              void run(
                [
                  ixResolveDispute(adminKey!, {
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
            resolve
          </button>
        </div>
      </div>
    </li>
  );
}
