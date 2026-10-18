import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TransactionInstruction, type Connection, type TransactionSignature } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";

import {
  fetchConfig,
  fetchListings,
  fetchRentals,
  type ConfigAccount,
  type Listing,
  type Rental,
} from "./solana/accounts";
import { parseProgramError } from "@rental-client/wire";
import { sendInstructions } from "./solana/tx";
import { getMetadataMany, hashToHex, type AssetMetadata } from "./metadata/store";

interface ProgramValue {
  connection: Connection;
  config: ConfigAccount | null;
  listings: Listing[];
  rentals: Rental[];
  /** Off-chain metadata known to this browser, keyed by hex metadata hash. */
  metadata: Record<string, AssetMetadata>;
  loading: boolean;
  error: string | null;
  refreshedAt: number | null;
  refresh: () => Promise<void>;
  /** Re-hydrate the metadata map from the currently loaded listings. */
  syncMetadata: () => void;
  /** Sign and send one or more instructions with the connected wallet. */
  run: (instructions: TransactionInstruction[], label: string) => Promise<TransactionSignature | null>;
  busy: string | null;
  lastAction: string | null;
  lastSignature: TransactionSignature | null;
  actionError: string | null;
  clearAction: () => void;
}

const ProgramContext = createContext<ProgramValue | null>(null);

const hashesOf = (listings: Listing[]): string[] =>
  listings.map((listing) => hashToHex(listing.metadataHash));

export function ProgramProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

  const [config, setConfig] = useState<ConfigAccount | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [metadata, setMetadata] = useState<Record<string, AssetMetadata>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [lastSignature, setLastSignature] = useState<TransactionSignature | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Sequential, not parallel: the public devnet RPC rate-limits bursts
      // (HTTP 429), so one request at a time with backoff is far more reliable.
      const nextConfig = await withRetry(() => fetchConfig(connection));
      const nextListings = await withRetry(() => fetchListings(connection));
      const nextRentals = await withRetry(() => fetchRentals(connection));
      setConfig(nextConfig);
      setListings(nextListings);
      setRentals(nextRentals);
      setMetadata(getMetadataMany(hashesOf(nextListings)));
      setRefreshedAt(Date.now());
    } catch (cause) {
      setError(describeReadError(cause));
    } finally {
      setLoading(false);
    }
  }, [connection]);

  // Guard against React StrictMode's double-invoked mount effect, which would
  // otherwise double the traffic against an already rate-limited RPC.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void refresh();
  }, [refresh]);

  const syncMetadata = useCallback(() => {
    setMetadata(getMetadataMany(hashesOf(listings)));
  }, [listings]);

  const run = useCallback<ProgramValue["run"]>(
    async (instructions, label) => {
      if (!publicKey || !sendTransaction) {
        setActionError("Connect a Phantom or Solflare wallet first.");
        return null;
      }
      setBusy(label);
      setActionError(null);
      setLastSignature(null);
      setLastAction(null);
      try {
        const signature = await sendInstructions(connection, { publicKey, sendTransaction }, instructions);
        setLastSignature(signature);
        setLastAction(label);
        await refresh();
        return signature;
      } catch (cause) {
        setActionError(describeError(cause));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [connection, publicKey, sendTransaction, refresh]
  );

  const clearAction = useCallback(() => {
    setLastAction(null);
    setLastSignature(null);
    setActionError(null);
  }, []);

  const value = useMemo<ProgramValue>(
    () => ({
      connection,
      config,
      listings,
      rentals,
      metadata,
      loading,
      error,
      refreshedAt,
      refresh,
      syncMetadata,
      run,
      busy,
      lastAction,
      lastSignature,
      actionError,
      clearAction,
    }),
    [
      connection,
      config,
      listings,
      rentals,
      metadata,
      loading,
      error,
      refreshedAt,
      refresh,
      syncMetadata,
      run,
      busy,
      lastAction,
      lastSignature,
      actionError,
      clearAction,
    ]
  );

  return <ProgramContext.Provider value={value}>{children}</ProgramContext.Provider>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry transient RPC failures (429 / 5xx / timeouts) with linear backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (cause) {
      lastError = cause;
      const retryable = /429|too many requests|rate|timeout|fetch failed|5\d\d/i.test(String(cause));
      if (!retryable || attempt === attempts - 1) throw cause;
      await sleep(700 * (attempt + 1));
    }
  }
  throw lastError;
}

/** Turn a read failure into an actionable message. */
function describeReadError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/429|too many requests/i.test(message)) {
    return "Devnet RPC is rate-limiting reads (HTTP 429). Retrying usually clears it — press refresh in a moment.";
  }
  return message;
}

export function useProgram(): ProgramValue {
  const value = useContext(ProgramContext);
  if (!value) throw new Error("useProgram must be used inside <ProgramProvider>");
  return value;
}

/**
 * Turn a wallet/anchor error into something a human can read.
 *
 * `parseProgramError` recovers the program's code, name and message from the
 * logs, which matters because Anchor 0.30 + web3.js >= 1.95 can otherwise
 * surface a bare `Unknown action 'undefined'`.
 */
export function describeError(cause: unknown): string {
  return parseProgramError(cause).message;
}
