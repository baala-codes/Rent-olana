import { CLUSTER, PROGRAM_ID, RPC_URL, explorerUrl } from "../solana/constants";

export function Footer() {
  return (
    <footer className="footer">
      <div className="links">
        <button type="button" className="btn ghost tiny" onClick={() => window.location.reload()}>
          refresh
        </button>
        <span className="sep">|</span>
        <a href={explorerUrl(`address/${PROGRAM_ID.toBase58()}`)} target="_blank" rel="noreferrer">
          program on explorer
        </a>
        <span className="sep">|</span>
        <a href="https://explorer.solana.com" target="_blank" rel="noreferrer">
          explorer
        </a>
        <span className="sep">|</span>
        <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">
          airdrop (faucet)
        </a>
        <span className="sep">|</span>
        <a href="https://docs.solana.com" target="_blank" rel="noreferrer">
          docs
        </a>
      </div>
      <div>
        <span className="sol">Solana</span> · {CLUSTER} · program{" "}
        <span className="addr">{PROGRAM_ID.toBase58()}</span>
      </div>
      <div className="mono">{RPC_URL}</div>
      <div className="small" style={{ marginTop: 6 }}>
        The program is the source of truth for funds and rental state; this portal only reads it and
        requests wallet-signed transactions. No keys leave your wallet.
      </div>
    </footer>
  );
}
