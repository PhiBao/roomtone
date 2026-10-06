import roomsData from "./rooms.data.json";

/**
 * The curated room catalog.
 *
 * Every entry here was resolved through Qloo's `/search` and then verified by
 * reading the entity's own geocode back. Qloo returns many same-named venues
 * (there are a dozen "The Stone"s, "The Roundhouse"s, "Pier 36"s) and will
 * silently resolve to the wrong city, so we pin ids and never resolve by name at
 * request time. Rooms that failed verification were dropped rather than shipped
 * mislabelled — including Brooklyn Steel, which exists in the graph but carries
 * no taste signal at all.
 */
export interface Room {
  id: string;
  name: string;
  city: string;
  neighborhood: string | null;
  /** Qloo's `primary_genre` for the venue — e.g. Arena, Concert hall, Live music venue. */
  genre: string | null;
  searchedAs?: string;
  featured?: boolean;
}

const raw = roomsData.rooms as (Room & { searchedAs?: string })[];
const featured = new Set(roomsData.featured as string[]);

export const ROOMS: Room[] = raw.map((r) => ({ ...r, featured: featured.has(r.id) }));

export const FEATURED_ROOMS: Room[] = ROOMS.filter((r) => r.featured);

export const CITIES: string[] = [...new Set(ROOMS.map((r) => r.city))].sort();

export function roomsByCity(city: string): Room[] {
  return ROOMS.filter((r) => r.city === city);
}