import type { ReactNode } from "react";

import { statusTone } from "../solana/format";
import type { RentalStatusName } from "../solana/constants";

/** White panel with an HN-style header strip. */
export function Card({
  title,
  actions,
  children,
  tight = false,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  tight?: boolean;
}) {
  return (
    <section className="card">
      {title !== undefined && (
        <div className="card-head">
          <h2>{title}</h2>
          {actions && <div className="spacer" />}
          {actions}
        </div>
      )}
      <div className={`card-body${tight ? " tight" : ""}`}>{children}</div>
    </section>
  );
}

/** Coloured lifecycle badge for a rental status. */
export function StatusBadge({ status }: { status: RentalStatusName }) {
  return <span className={`badge ${statusTone(status)}`}>{status}</span>;
}

/** Plain outline chip (categories, ids, etc.). */
export function Chip({ children }: { children: ReactNode }) {
  return <span className="badge plain">{children}</span>;
}

export function Notice({
  kind = "info",
  title,
  children,
}: {
  kind?: "info" | "error" | "ok";
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`notice${kind === "info" ? "" : ` ${kind}`}`}>
      <div>
        {title && <strong>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  full = false,
  children,
}: {
  label: string;
  hint?: ReactNode;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`field${full ? " full" : ""}`}>
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" style={{ padding: 14, gap: 16 }} aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="stack" style={{ gap: 8 }}>
          <div className="skeleton" style={{ width: "38%", height: 14 }} />
          <div className="skeleton" style={{ width: "72%" }} />
          <div className="skeleton" style={{ width: "52%" }} />
        </div>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="big">{title}</div>
      <div>{children}</div>
    </div>
  );
}
