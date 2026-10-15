import { useProgram } from "../ProgramContext";
import { MAX_FEE_BPS } from "../solana/constants";
import { shortAddr } from "../solana/format";
import { Card } from "./ui";

/** Platform config + market counters, read live from devnet. */
export function ProgramStatus() {
  const { config, listings, rentals, metadata } = useProgram();

  const openRentals = rentals.filter((r) => r.status === "Reserved" || r.status === "Active").length;
  const disputed = rentals.filter((r) => r.status === "Disputed").length;
  const activeListings = listings.filter((l) => l.active).length;

  return (
    <>
      <Card title="platform config">
        {config ? (
          <table className="kv">
            <tbody>
              <tr>
                <td>admin</td>
                <td>
                  <span className="addr" title={config.admin.toBase58()}>
                    {shortAddr(config.admin)}
                  </span>
                </td>
              </tr>
              <tr>
                <td>treasury</td>
                <td>
                  <span className="addr" title={config.treasury.toBase58()}>
                    {shortAddr(config.treasury)}
                  </span>
                </td>
              </tr>
              <tr>
                <td>fee</td>
                <td>
                  {config.feeBps} bps ({(config.feeBps / 100).toFixed(2)}%){" "}
                  <span className="muted small">· max {MAX_FEE_BPS}</span>
                </td>
              </tr>
              <tr>
                <td>paused</td>
                <td>{config.paused ? "yes — new rentals blocked" : "no"}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>
            Not initialized on this cluster yet. An admin runs <code>initialize_config</code> once
            after deploy (see the <strong>admin</strong> tab).
          </p>
        )}
      </Card>

      <Card title="off-chain metadata">
        <table className="kv">
          <tbody>
            <tr>
              <td>documents known</td>
              <td>
                {Object.keys(metadata).length}
                <span className="muted small"> for {listings.length} listings</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Only a <code>metadata_hash</code> and a category code are stored on-chain. Names, photos,
          and location are off-chain documents kept in this browser and matched to listings by that
          hash.
        </p>
      </Card>

      <Card title="market">
        <table className="kv">
          <tbody>
            <tr>
              <td>listings</td>
              <td>
                {listings.length} <span className="muted small">· {activeListings} active</span>
              </td>
            </tr>
            <tr>
              <td>rentals</td>
              <td>{rentals.length}</td>
            </tr>
            <tr>
              <td>open</td>
              <td>{openRentals}</td>
            </tr>
            <tr>
              <td>disputed</td>
              <td>{disputed}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card title="how it works">
        <ol className="small" style={{ margin: 0, paddingLeft: 18, color: "var(--ink-soft)" }}>
          <li>Connect a Phantom or Solflare wallet on devnet.</li>
          <li>Owners register an item with price, deposit, and duration.</li>
          <li>Renters book a start date and days; SOL is escrowed on-chain.</li>
          <li>The owner settles on return, refunding the deposit.</li>
        </ol>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Names, photos, and location live off-chain — only a{" "}
          <code>metadata_hash</code> and a category code are stored on-chain.
        </p>
      </Card>
    </>
  );
}
