import { useEffect, useState } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

/** Live devnet balance for the connected wallet, with a faucet link when low. */
export function WalletBalance() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [lamports, setLamports] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setLamports(null);
      return;
    }
    let active = true;
    const read = async () => {
      try {
        const balance = await connection.getBalance(publicKey, "confirmed");
        if (active) setLamports(balance);
      } catch {
        if (active) setLamports(null);
      }
    };
    void read();
    const timer = window.setInterval(read, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [connection, publicKey]);

  if (!publicKey) return null;

  const sol = lamports === null ? null : lamports / LAMPORTS_PER_SOL;
  const low = sol !== null && sol < 0.05;

  return (
    <span className={`balance-chip${low ? " low" : ""}`} title="devnet balance">
      {sol === null ? "… SOL" : `${sol.toFixed(3)} SOL`}
      {low && (
        <>
          {" · "}
          <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">
            faucet
          </a>
        </>
      )}
    </span>
  );
}
