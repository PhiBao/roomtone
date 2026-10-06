/**
 * Qloo domain types.
 *
 * We deliberately model only what Roomtone actually reads. Qloo returns verbose
 * entities; extracting at the edge keeps the UI honest and the payloads small.
 */

export type EntityType =
  | "urn:entity:artist"
  | "urn:entity:place"
  | "urn:entity:brand"
  | "urn:entity:destination"
  | "urn:entity:movie"
  | "urn:entity:tv_show"
  | "urn:entity:book"
  | "urn:entity:podcast"
  | "urn:entity:video_game"
  | "urn:entity:person";

/** A taste tag as Qloo attaches it to an entity. */
export interface QlooTag {
  id: string;
  name: string;
  type: string;
  subtype?: string;
}

export interface QlooEntity {
  entity_id: string;
  name: string;
  subtype?: EntityType | string;
  popularity?: number;
  /** Qloo places the affinity for this result at `query.affinity`, not on the entity root. */
  query?: { affinity?: number; measurements?: { audience_growth?: number } };
  tags?: QlooTag[];
  disambiguation?: string;
  properties?: {
    description?: string;
    address?: string;
    neighborhood?: string;
    geocode?: {
      name?: string;
      city?: string;
      admin1_region?: string;
      country_code?: string;
      metro?: string;
      latitude?: number;
      longitude?: number;
    };
    primary_genre?: { name?: string; id?: string };
    image?: { url?: string };
    website?: string;
    business_rating?: number;
    price_range?: { currency?: string; min?: number; max?: number };
    /** Present on artists. */
    primary_genres?: { name?: string; id?: string }[];
    genres_influenced?: string[];
    artists_influenced?: string[];
    adjectives_for_fans?: string;
    adjectives_for_music?: string;
    short_descriptions?: string[];
    external?: {
      spotify?: { id?: string; followers?: number; monthly_listeners?: number }[];
      lastfm?: { listeners?: number }[];
      imdb?: { id?: string }[];
      twitter?: { id?: string }[];
    };
  };
}

/** A single audited Qloo HTTP call. Rendered verbatim in the Evidence panel. */
export interface QlooCall {
  id: string;
  at: string;
  method: "GET" | "POST";
  path: string;
  params: Record<string, string>;
  status: number;
  durationMs: number;
  resultCount: number;
  cache: "miss" | "hit" | "stale";
  /** Resolved human labels for entity ids, so provenance is readable without a second lookup. */
  labels?: Record<string, string>;
  note?: string;
}

export interface InsightsResult {
  entities: QlooEntity[];
  calls: QlooCall[];
  /** True when Qloo had no taste signal for the entity we used as the signal. */
  empty?: boolean;
}