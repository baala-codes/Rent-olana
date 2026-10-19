import { explorerUrl, PROGRAM_ID } from "../solana/constants";

import styles from "./LandingView.module.css";

/**
 * Cyber-core landing screen shown before the marketplace.
 *
 * Mirrors the project's hero artwork — dark purple stage, green terminal
 * eyebrow, gradient wordmark, and an orbit of rentable-asset tiles around a
 * locked-escrow core — with a single primary action: enter the marketplace.
 * The marketplace itself is untouched; `onEnter` is the only connection.
 */
export function LandingView({ onEnter }: { onEnter: () => void }) {
  return (
    <div className={styles.landing}>
      <div className={styles.backdrop} aria-hidden />
      <div className={styles.scanlines} aria-hidden />

      <header className={styles.header}>
        <span className={styles.brandMark} aria-hidden>
          ◎
        </span>
        <span className={styles.brand}>Rent-olana</span>
        <span className={styles.headerTag}>devnet · escrow live</span>
      </header>

      <main className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>
            rent anything. trust the program
            <span className={styles.cursor} aria-hidden />
          </p>
          <h1 className={styles.title} data-text="Rent-olana">
            Rent-olana
          </h1>
          <p className={styles.sub}>
            A Solana marketplace for renting physical things, with escrow
            enforced by the program.
          </p>

          <div className={styles.ctaRow}>
            <button type="button" className={styles.cta} onClick={onEnter}>
              Go to marketplace
              <span className={styles.arrow} aria-hidden>
                ▸
              </span>
            </button>
            <a
              className={styles.ghostCta}
              href={explorerUrl(`address/${PROGRAM_ID.toBase58()}`)}
              target="_blank"
              rel="noreferrer"
            >
              view program
            </a>
          </div>

          <ul className={styles.stats}>
            <li>
              <b>2.5%</b>
              <span>protocol fee</span>
            </li>
            <li>
              <b>3</b>
              <span>escrow exit paths</span>
            </li>
            <li>
              <b>0</b>
              <span>admin sweep paths</span>
            </li>
          </ul>
        </div>

        <div className={styles.orbit} aria-hidden>
          <div className={styles.ring} />
          <div className={styles.ringB} />
          <svg className={styles.connectors} viewBox="0 0 100 100">
            <line
              x1="50"
              y1="47"
              x2="22"
              y2="21"
              stroke="rgba(153,69,255,0.55)"
              strokeWidth="0.6"
              strokeDasharray="3 2.6"
            />
            <line
              x1="50"
              y1="47"
              x2="79"
              y2="19"
              stroke="rgba(20,241,149,0.5)"
              strokeWidth="0.6"
              strokeDasharray="3 2.6"
            />
          </svg>

          <div className={`${styles.tile} ${styles.tileFan}`}>
            <FanIcon />
          </div>
          <div className={`${styles.tile} ${styles.tileFridge}`}>
            <FridgeIcon />
          </div>
          <div className={`${styles.tile} ${styles.tileDrill}`}>
            <DrillIcon />
          </div>
          <div className={styles.lockHalo} />
          <div className={styles.lock}>
            <LockIcon />
          </div>
        </div>
      </main>

      <section className={styles.how}>
        <h2 className={styles.sectionHead}>how it works</h2>
        <div className={styles.steps}>
          <div className={styles.step}>
            <span className={styles.stepNo}>01 /</span>
            <span className={styles.stepTitle}>connect wallet</span>
            <p>
              Connect Phantom or Solflare on devnet. The cluster pill in the
              top bar always names the network you are on.
            </p>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNo}>02 /</span>
            <span className={styles.stepTitle}>register an asset</span>
            <p>
              Owners derive a listing PDA and register title, metadata
              commitment and daily price directly on chain.
            </p>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNo}>03 /</span>
            <span className={styles.stepTitle}>book & escrow</span>
            <p>
              Renters escrow price plus deposit in SOL. The program writes the
              busy watermark, so overlaps are impossible.
            </p>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNo}>04 /</span>
            <span className={styles.stepTitle}>settle on return</span>
            <p>
              Owner settles: deposit back to the renter, price minus fee to the
              owner, protocol fee to the treasury — one instruction.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.architecture}>
        <h2 className={styles.sectionHead}>system architecture</h2>
        <p className={styles.sectionLead}>
          The program is the source of truth for listings, rentals and escrowed
          SOL. The portal and the backend are clients: they can read, propose
          and display, but only the program can move funds.
        </p>

        <div className={styles.archFlow}>
          <article className={styles.archNode}>
            <span className={styles.nodeTag}>01 / client</span>
            <h3>portal + wallet</h3>
            <p>
              React portal in the browser. Phantom or Solflare signs every
              state-changing transaction; keys never leave the wallet.
            </p>
            <ul className={styles.nodeList}>
              <li>books</li>
              <li>settles</li>
              <li>disputes</li>
            </ul>
          </article>

          <div className={styles.archLink} aria-hidden>
            <span>signs txs</span>
            <i />
          </div>

          <article className={styles.archNode}>
            <span className={styles.nodeTag}>02 / network</span>
            <h3>Solana RPC</h3>
            <p>
              Submits signed transactions and serves account reads. A write
              counts only once the cluster finalizes it.
            </p>
            <ul className={styles.nodeList}>
              <li>devnet</li>
              <li>finalized reads</li>
            </ul>
          </article>

          <div className={styles.archLink} aria-hidden>
            <span>validates</span>
            <i />
          </div>

          <article className={`${styles.archNode} ${styles.nodeCore}`}>
            <span className={styles.nodeTag}>03 / source of truth</span>
            <h3>on-chain program</h3>
            <p>
              Owns the three accounts, validates every transition, and holds
              renter SOL in escrow until settlement, cancellation or
              resolution.
            </p>
            <ul className={styles.nodeList}>
              <li>3 accounts</li>
              <li>12 instructions</li>
              <li>escrow</li>
            </ul>
          </article>
        </div>

        <div className={styles.mirrorRow}>
          <div>
            <div className={styles.mirrorTitle}>
              <b>backend mirror</b>
              <span>search · metadata · media · audit</span>
            </div>
            <p>
              Reads the same finalized accounts into a disposable SQLite index.
              It never holds keys, never signs, and never decides fund movement.
            </p>
          </div>
          <span className={styles.mirrorTag}>read-only replica</span>
        </div>

      </section>

      <section className={styles.features}>
        <div className={styles.featuresHead}>
          <h2 className={styles.sectionHead}>trust, verifiable</h2>
          <p className={styles.sectionLead}>
            Every guarantee below is enforced by the program and readable on
            chain. None of it depends on the operator behaving well.
          </p>
        </div>

        <div className={styles.feature}>
          <span className={styles.featureKey}>escrow by program</span>
          <p>
            Deposited SOL leaves a rental only through settle, cancel or
            dispute resolution. There is no admin sweep.
          </p>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureKey}>single occupancy</span>
          <p>
            A monotonic busy-until watermark is written on every booking, so
            overlapping rentals cannot coexist.
          </p>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureKey}>deposit protected</span>
          <p>
            The deposit is escrowed with the price and returned in full on
            settlement; a pre-start cancellation refunds everything.
          </p>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureKey}>deterministic splits</span>
          <p>
            Price minus fee to the owner, fee to the treasury, deposit to the
            renter — computed on chain, to the lamport.
          </p>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureKey}>verified mirror</span>
          <p>
            The backend indexes finalized state only — it never holds keys and
            never decides fund movement.
          </p>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureKey}>disputes freeze funds</span>
          <p>
            A dispute blocks settle and cancel until an admin split resolves it
            between the owner and the renter.
          </p>
        </div>

        <div className={styles.verifyBar}>
          <div className={styles.verifyItem}>
            <span>program id</span>
            <a
              href={explorerUrl(`address/${PROGRAM_ID.toBase58()}`)}
              target="_blank"
              rel="noreferrer"
            >
              {PROGRAM_ID.toBase58()}
            </a>
          </div>
          <div className={styles.verifyItem}>
            <span>fee</span>
            <b>2.5% · capped at 10%</b>
          </div>
          <div className={styles.verifyItem}>
            <span>late settlement</span>
            <b>anyone after end + 24h</b>
          </div>
          <div className={styles.verifyItem}>
            <span>escrow exits</span>
            <b>3 · no sweep</b>
          </div>
          <span className={styles.verifySpacer} aria-hidden />
          <a
            className={styles.verifyCta}
            href={explorerUrl(`address/${PROGRAM_ID.toBase58()}`)}
            target="_blank"
            rel="noreferrer"
          >
            inspect the program ↗
          </a>
        </div>
      </section>

      <footer className={styles.landingFoot}>
        <span>Rent-olana</span>
        <span className={styles.footSep}>//</span>
        <span>program</span>
        <a
          className={styles.footAddr}
          href={explorerUrl(`address/${PROGRAM_ID.toBase58()}`)}
          target="_blank"
          rel="noreferrer"
        >
          {PROGRAM_ID.toBase58()}
        </a>
        <span className={styles.footSep}>//</span>
        <span>escrow enforced by the program</span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------- icons */

function FanIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="24" cy="24" r="20" opacity="0.4" />
      <g fill="currentColor" fillOpacity="0.28" stroke="currentColor">
        <ellipse cx="24" cy="14" rx="5" ry="9.5" />
        <ellipse cx="24" cy="14" rx="5" ry="9.5" transform="rotate(90 24 24)" />
        <ellipse cx="24" cy="14" rx="5" ry="9.5" transform="rotate(180 24 24)" />
        <ellipse cx="24" cy="14" rx="5" ry="9.5" transform="rotate(270 24 24)" />
      </g>
      <circle cx="24" cy="24" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FridgeIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <rect x="13" y="7" width="22" height="34" rx="4" />
      <line x1="13" y1="20" x2="35" y2="20" />
      <line x1="18" y1="13" x2="18" y2="17" />
      <line x1="18" y1="24" x2="18" y2="30" />
    </svg>
  );
}

function DrillIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="11" y="16" width="19" height="11" rx="3.5" />
      <path d="M15 27v8a2.5 2.5 0 0 0 2.5 2.5H23" />
      <line x1="30" y1="21.5" x2="40" y2="21.5" />
      <line x1="40" y1="18" x2="40" y2="25" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none">
      <rect
        x="5"
        y="10.5"
        width="14"
        height="9.5"
        rx="2.4"
        fill="#0d0620"
      />
      <path
        d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5"
        stroke="#0d0620"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
