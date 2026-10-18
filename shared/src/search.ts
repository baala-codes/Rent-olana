/**
 * Search-query parsing.
 *
 * The backend and the portal must agree on defaults and limits, otherwise the
 * portal shows a radius the backend silently clamped. Parse once, here.
 */

import { MAX_CATEGORY, MAX_DAYS } from "../../clients/ts/contract";
import type { NormalizedSearchQuery, SearchQuery } from "./api";

export const SEARCH_LIMITS = {
  limit: 25,
  maxLimit: 100,
  radiusKm: 25,
  maxRadiusKm: 500,
  q: 120,
} as const;

export type QueryInput = Record<string, string | string[] | undefined>;

export interface QueryParseResult {
  ok: boolean;
  query: NormalizedSearchQuery;
  issues: { field: string; message: string }[];
}

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const number = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

/** Parse and clamp URL query parameters into a normalized search. */
export function parseSearchQuery(input: QueryInput): QueryParseResult {
  const issues: { field: string; message: string }[] = [];

  const q = (first(input.q) ?? "").trim().slice(0, SEARCH_LIMITS.q);

  const categoryRaw = number(first(input.category));
  const category =
    categoryRaw === undefined
      ? null
      : Number.isInteger(categoryRaw) && categoryRaw >= 0 && categoryRaw <= MAX_CATEGORY
        ? categoryRaw
        : null;
  if (categoryRaw !== undefined && category === null) {
    issues.push({ field: "category", message: `category must be an integer in [0, ${MAX_CATEGORY}]` });
  }

  const lat = number(first(input.lat));
  const lng = number(first(input.lng));
  if ((lat === undefined) !== (lng === undefined)) {
    issues.push({ field: "location", message: "lat and lng must be provided together" });
  } else if (lat !== undefined && (lat < -90 || lat > 90 || Number.isNaN(lat))) {
    issues.push({ field: "lat", message: "lat must be between -90 and 90" });
  } else if (lng !== undefined && (lng < -180 || lng > 180 || Number.isNaN(lng))) {
    issues.push({ field: "lng", message: "lng must be between -180 and 180" });
  }

  const radiusRaw = number(first(input.radiusKm));
  const radiusKm = Math.min(
    Math.max(radiusRaw ?? SEARCH_LIMITS.radiusKm, 1),
    SEARCH_LIMITS.maxRadiusKm
  );

  const availableFromRaw = number(first(input.availableFrom));
  const availableFrom =
    availableFromRaw === undefined
      ? null
      : Number.isInteger(availableFromRaw) && availableFromRaw >= 0
        ? availableFromRaw
        : null;
  if (availableFromRaw !== undefined && availableFrom === null) {
    issues.push({ field: "availableFrom", message: "availableFrom must be Unix seconds" });
  }

  const daysRaw = number(first(input.days));
  const days =
    daysRaw === undefined ? 1 : Math.trunc(daysRaw);
  if (days < 1 || days > MAX_DAYS) {
    issues.push({ field: "days", message: `days must be between 1 and ${MAX_DAYS}` });
  }

  const includeInactive = ["1", "true", "yes"].includes((first(input.includeInactive) ?? "").toLowerCase());

  const sortRaw = first(input.sort);
  const sort =
    sortRaw === "price" || sortRaw === "newest" || sortRaw === "relevance"
      ? sortRaw
      : "relevance";

  const limitRaw = number(first(input.limit));
  const limit = Math.min(Math.max(Math.trunc(limitRaw ?? SEARCH_LIMITS.limit), 1), SEARCH_LIMITS.maxLimit);

  const offsetRaw = number(first(input.offset));
  const offset = Math.max(Math.trunc(offsetRaw ?? 0), 0);

  return {
    ok: issues.length === 0,
    issues,
    query: {
      q,
      category,
      lat: lat ?? null,
      lng: lng ?? null,
      radiusKm,
      availableFrom,
      days,
      includeInactive,
      sort,
      limit,
      offset,
    },
  };
}

/** Serialize a search query for the portal's fetch call. */
export function searchQueryToParams(query: SearchQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category !== undefined) params.set("category", String(query.category));
  if (query.lat !== undefined && query.lng !== undefined) {
    params.set("lat", String(query.lat));
    params.set("lng", String(query.lng));
    if (query.radiusKm !== undefined) params.set("radiusKm", String(query.radiusKm));
  }
  if (query.availableFrom !== undefined) params.set("availableFrom", String(query.availableFrom));
  if (query.days !== undefined) params.set("days", String(query.days));
  if (query.includeInactive) params.set("includeInactive", "1");
  if (query.sort) params.set("sort", query.sort);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset !== undefined) params.set("offset", String(query.offset));
  return params;
}
