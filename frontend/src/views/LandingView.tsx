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

      <section className={styles.features}>
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
          <span className={styles.featureKey}>verified mirror</span>
          <p>
            The backend mirrors finalized state only — it indexes what it can
            verify on chain and never touches keys.
          </p>
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
