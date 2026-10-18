import { useMemo } from "react";

import type { Listing } from "../solana/accounts";
import { SECONDS_PER_DAY } from "../solana/constants";
import styles from "./AvailabilityCalendar.module.css";

const DAYS = 28;

const dateKey = (unixSeconds: number): string =>
  new Date(unixSeconds * 1000).toISOString().slice(0, 10);

const label = (unixSeconds: number): string =>
  new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

/**
 * Availability is derived from the listing's `busy_until` watermark: the program
 * allows a booking to start only at or after it. There is no interval set, so
 * every day before the watermark is occupied and every day after is free.
 */
export function AvailabilityCalendar({
  listing,
  selectedDate,
  onSelect,
}: {
  listing: Listing;
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const days = useMemo(() => {
    const today = Math.floor(Date.now() / 1000 / SECONDS_PER_DAY) * SECONDS_PER_DAY;
    const busyUntil = Number(listing.busyUntil);
    return Array.from({ length: DAYS }, (_, index) => {
      const start = today + index * SECONDS_PER_DAY;
      const free = listing.active && start >= busyUntil;
      return {
        start,
        key: dateKey(start),
        label: label(start),
        dayNumber: new Date(start * 1000).getUTCDate(),
        free,
      };
    });
  }, [listing.active, listing.busyUntil]);

  return (
    <div className={styles.calendar}>
      <div className={styles.head}>
        <span className={styles.title}>availability · next {DAYS} days</span>
        <span className={styles.legend}>
          <i className={styles.freeDot} /> free
          <i className={styles.busyDot} /> booked
        </span>
      </div>
      <div className={styles.grid}>
        {days.map((day) => (
          <button
            key={day.key}
            type="button"
            disabled={!day.free}
            title={
              day.free
                ? `Start on ${day.key}`
                : listing.active
                  ? `Booked through ${dateKey(Number(listing.busyUntil))}`
                  : "Listing is deactivated"
            }
            className={[
              styles.day,
              day.free ? styles.free : styles.busy,
              day.key === selectedDate ? styles.selected : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelect(day.key)}
          >
            <span className={styles.dayNumber}>{day.dayNumber}</span>
            <span className={styles.dayLabel}>{day.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
