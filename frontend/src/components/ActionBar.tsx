import { CLUSTER, explorerUrl } from "../solana/constants";
import { useProgram } from "../ProgramContext";
import { shortAddr } from "../solana/format";

/** Live feedback for wallet actions: in-flight, confirmed, or failed. */
export function ActionBar() {
  const { busy, lastAction, lastSignature, actionError, clearAction, refreshedAt } = useProgram();

  if (!busy && !lastAction && !actionError) {
    return (
      <div className="notice">
        <div style={{ flex: 1 }}>
          <div className="status-bar">
            <span>
              <span className="pulse" />
              Live <strong>{CLUSTER}</strong> reads
            </span>
            <span className="muted small">
              {refreshedAt ? `last read ${new Date(refreshedAt).toLocaleTimeString()}` : "reading…"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`notice${actionError ? " error" : lastAction ? " ok" : ""}`}>
      <div style={{ flex: 1 }}>
        {busy && (
          <div className="status-bar">
            <span className="spinner" />
            <span>
              Signing <strong>{busy}</strong> in your wallet…
            </span>
          </div>
        )}
        {!busy && actionError && (
          <>
            <strong>Action failed</strong>
            <div className="mono">{actionError}</div>
          </>
        )}
        {!busy && !actionError && lastAction && lastSignature && (
          <>
            <strong>{lastAction} confirmed</strong>
            <div>
              <a href={explorerUrl(`tx/${lastSignature}`)} target="_blank" rel="noreferrer">
                {shortAddr(lastSignature, 10)}
              </a>
            </div>
          </>
        )}
      </div>
      {!busy && (
        <button type="button" className="btn tiny" onClick={clearAction}>
          dismiss
        </button>
      )}
    </div>
  );
}
