import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";

import { useProgram } from "../ProgramContext";
import { CATEGORIES } from "../solana/constants";
import {
  ixCloseListing,
  ixRegisterAsset,
  ixSetListingStatus,
  ixUpdateAsset,
} from "../solana/instructions";
import { lamportsToSol, shortId, solToLamports } from "../solana/format";
import { hexToBytes, hashToHex, getMetadata, saveMetadata } from "../metadata/store";
import type { Listing } from "../solana/accounts";
import { Card, Empty, Field, Notice } from "../components/ui";

const random32 = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));

const label = (code: number): string =>
  CATEGORIES.find((c) => c.code === code)?.label ?? `Category ${code}`;

export function ManageView({ onSelect }: { onSelect: (address: PublicKey) => void }) {
  const { listings, config } = useProgram();
  const { publicKey } = useWallet();

  const mine = listings.filter((l) => publicKey && l.owner.equals(publicKey));

  return (
    <div className="stack">
      <RegisterForm />

      <Card title={`my listings · ${mine.length}`} tight>
        {mine.length === 0 ? (
          <Empty title={publicKey ? "You have no listings yet" : "Connect to see your listings"}>
            {publicKey && (
              <>
                Register an item above — it becomes bookable the moment it lands on-chain.
                {!config && " An admin still needs to initialize the platform config first."}
              </>
            )}
          </Empty>
        ) : (
          <ol className="item-list flush">
            {mine.map((listing) => (
              <ManageRow key={listing.address.toBase58()} listing={listing} onSelect={onSelect} />
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

/** Name / description / photo / location — the off-chain half of a listing. */
function MetadataFields({
  name,
  setName,
  description,
  setDescription,
  imageUrl,
  setImageUrl,
  location,
  setLocation,
}: {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  imageUrl: string;
  setImageUrl: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
}) {
  return (
    <>
      <Field label="name" hint="shown as the listing title across the market">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 2kW portable generator" />
      </Field>
      <Field label="location label" hint="coarse area only — coordinates stay off-chain">
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Indiranagar, Bengaluru" />
      </Field>
      <Field label="description" full>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Condition, accessories, pickup notes…"
        />
      </Field>
      <Field label="photo URL" full hint="any https image URL; its hash is committed on-chain">
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
      </Field>
    </>
  );
}

function RegisterForm() {
  const { run, busy, syncMetadata } = useProgram();
  const { publicKey } = useWallet();

  const [category, setCategory] = useState(1);
  const [priceSol, setPriceSol] = useState("0.01");
  const [depositSol, setDepositSol] = useState("0.05");
  const [maxDays, setMaxDays] = useState(30);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [location, setLocation] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    if (!publicKey) return;
    setLocalError(null);

    if (!name.trim()) {
      setLocalError("give the item a name");
      return;
    }
    let pricePerDay: bigint;
    let deposit: bigint;
    try {
      pricePerDay = solToLamports(priceSol);
      deposit = solToLamports(depositSol);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : String(cause));
      return;
    }
    if (pricePerDay <= 0n) {
      setLocalError("price per day must be greater than 0");
      return;
    }

    if (!name.trim()) {
      setLocalError("name is required");
      return;
    }

    // Commit to the off-chain document: the on-chain metadata_hash is the
    // SHA-256 of exactly this record, so the chain provably points at it.
    let record;
    try {
      record = await saveMetadata({
        name,
        description,
        category,
        location: location.trim() ? { label: location.trim() } : null,
        images: imageUrl.trim() ? [imageUrl.trim()] : [],
      });
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : String(cause));
      return;
    }
    syncMetadata();

    await run(
      [
        ixRegisterAsset(publicKey, {
          assetId: random32(),
          category,
          pricePerDay,
          deposit,
          maxDays,
          metadataHash: hexToBytes(record.metadataHash),
        }),
      ],
      "register_asset"
    );
  };

  return (
    <Card title="register an asset">
      {!publicKey && (
        <Notice title="Connect a wallet">
          Connect Phantom or Solflare to register an item. The form below is exactly what you will
          sign.
        </Notice>
      )}
      <div className="form-grid">
        <MetadataFields
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          imageUrl={imageUrl}
          setImageUrl={setImageUrl}
          location={location}
          setLocation={setLocation}
        />
        <Field label="category">
          <select value={category} onChange={(e) => setCategory(Number(e.target.value))}>
            {CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="max duration (days)" hint="1 – 36500">
          <input
            type="number"
            min={1}
            value={maxDays}
            onChange={(e) => setMaxDays(Number(e.target.value) || 1)}
          />
        </Field>
        <Field label="price per day (SOL)" hint="charged on settlement, minus the platform fee">
          <input value={priceSol} onChange={(e) => setPriceSol(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="deposit (SOL)" hint="refunded to the renter on every terminal path">
          <input
            value={depositSol}
            onChange={(e) => setDepositSol(e.target.value)}
            inputMode="decimal"
          />
        </Field>
      </div>

      <p className="muted small">
        On submit the portal hashes the off-chain document (SHA-256) and registers the listing with
        that commitment, so anyone can verify the document later. Only the hash and the category
        code go on-chain.
      </p>

      {localError && (
        <Notice kind="error" title="Check the form">
          {localError}
        </Notice>
      )}

      <div className="btn-row">
        <button
          type="button"
          className="btn primary"
          disabled={!!busy || !publicKey}
          onClick={() => void submit()}
        >
          {busy === "register_asset" ? "registering…" : "Register listing"}
        </button>
      </div>
    </Card>
  );
}

function ManageRow({
  listing,
  onSelect,
}: {
  listing: Listing;
  onSelect: (address: PublicKey) => void;
}) {
  const { run, busy, syncMetadata } = useProgram();
  const [editingTerms, setEditingTerms] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [priceSol, setPriceSol] = useState(lamportsToSol(listing.pricePerDay));
  const [depositSol, setDepositSol] = useState(lamportsToSol(listing.deposit));
  const [maxDays, setMaxDays] = useState(listing.maxDays);
  const [category, setCategory] = useState(listing.category);

  const currentHash = hashToHex(listing.metadataHash);
  const existing = getMetadata(currentHash);
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [imageUrl, setImageUrl] = useState(existing?.images?.[0] ?? "");
  const [location, setLocation] = useState(existing?.location?.label ?? "");

  const rented = !listing.currentRental.equals(PublicKey.default);

  const saveTerms = async () => {
    await run(
      [
        ixUpdateAsset(listing.owner, listing.address, {
          pricePerDay: solToLamports(priceSol),
          deposit: solToLamports(depositSol),
          maxDays,
          category,
        }),
      ],
      "update_asset"
    );
  };

  const saveMeta = async () => {
    setMetaError(null);
    if (!name.trim()) {
      setMetaError("name is required");
      return;
    }
    let record;
    try {
      record = await saveMetadata({
        name,
        description,
        category,
        location: location.trim() ? { label: location.trim() } : null,
        images: imageUrl.trim() ? [imageUrl.trim()] : [],
      });
    } catch (cause) {
      setMetaError(cause instanceof Error ? cause.message : String(cause));
      return;
    }
    syncMetadata();
    await run(
      [
        ixUpdateAsset(listing.owner, listing.address, {
          metadataHash: hexToBytes(record.metadataHash),
        }),
      ],
      "update_asset"
    );
  };

  return (
    <li className="item">
      <div className="item-rank">·</div>
      <div className="item-main">
        <div className="item-title" onClick={() => onSelect(listing.address)}>
          {existing?.name ?? label(listing.category)}
          <span className="tag">asset {shortId(listing.assetId)}</span>
        </div>
        {existing?.description && (
          <div className="small muted" style={{ marginTop: 2 }}>
            {existing.description}
          </div>
        )}
        <div className="item-meta">
          <span className="price">{lamportsToSol(listing.pricePerDay)} SOL/day</span>
          <span className="sep">·</span>
          <span>deposit {lamportsToSol(listing.deposit)} SOL</span>
          <span className="sep">·</span>
          <span>max {listing.maxDays} days</span>
          <span className="sep">·</span>
          <span className={`badge ${listing.active ? "active" : "muted"}`}>
            {listing.active ? "active" : "inactive"}
          </span>
          {rented && <span className="badge open">rented</span>}
          {!existing && <span className="badge muted">no off-chain doc</span>}
        </div>

        {metaError && (
          <Notice kind="error" title="Metadata not saved">
            {metaError}
          </Notice>
        )}

        <div className="item-actions">
          <button
            type="button"
            className="btn tiny"
            disabled={!!busy}
            onClick={() =>
              void run(
                [ixSetListingStatus(listing.owner, listing.address, !listing.active)],
                "set_listing_status"
              )
            }
          >
            {listing.active ? "deactivate" : "activate"}
          </button>

          <button
            type="button"
            className="btn tiny"
            onClick={() => {
              setEditingMeta((v) => !v);
              setEditingTerms(false);
            }}
          >
            {editingMeta ? "cancel" : "edit metadata"}
          </button>

          <button
            type="button"
            className="btn tiny"
            onClick={() => {
              setEditingTerms((v) => !v);
              setEditingMeta(false);
            }}
          >
            {editingTerms ? "cancel" : "edit terms"}
          </button>

          <button
            type="button"
            className="btn tiny danger"
            disabled={!!busy || rented}
            title={rented ? "an open rental holds this listing" : "reclaim the listing rent"}
            onClick={() =>
              void run([ixCloseListing(listing.owner, listing.address)], "close_listing")
            }
          >
            close
          </button>
        </div>

        {editingTerms && (
          <div className="form-grid" style={{ marginTop: 10 }}>
            <Field label="price / day (SOL)">
              <input
                value={priceSol}
                onChange={(e) => setPriceSol(e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="deposit (SOL)">
              <input
                value={depositSol}
                onChange={(e) => setDepositSol(e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <Field label="max days">
              <input
                type="number"
                min={1}
                value={maxDays}
                onChange={(e) => setMaxDays(Number(e.target.value) || 1)}
              />
            </Field>
            <Field label="category">
              <select value={category} onChange={(e) => setCategory(Number(e.target.value))}>
                {CATEGORIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="row" style={{ gridColumn: "1 / -1" }}>
              <button
                type="button"
                className="btn primary tiny"
                disabled={!!busy || rented}
                onClick={() => void saveTerms()}
              >
                save terms
              </button>
              {rented && (
                <span className="muted small">
                  Price, deposit, and max days are frozen while a rental is open.
                </span>
              )}
            </div>
          </div>
        )}

        {editingMeta && (
          <div className="form-grid" style={{ marginTop: 10 }}>
            <MetadataFields
              name={name}
              setName={setName}
              description={description}
              setDescription={setDescription}
              imageUrl={imageUrl}
              setImageUrl={setImageUrl}
              location={location}
              setLocation={setLocation}
            />
            <div className="row" style={{ gridColumn: "1 / -1" }}>
              <button
                type="button"
                className="btn primary tiny"
                disabled={!!busy || !name.trim()}
                onClick={() => void saveMeta()}
              >
                save & commit hash
              </button>
              <span className="muted small">
                The new document's SHA-256 is written to <code>metadata_hash</code> — always allowed,
                even while rented.
              </span>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
