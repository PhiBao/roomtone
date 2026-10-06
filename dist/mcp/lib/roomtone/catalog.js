import roomsData from "./rooms.data.json";
const raw = roomsData.rooms;
const featured = new Set(roomsData.featured);
export const ROOMS = raw.map((r) => ({ ...r, featured: featured.has(r.id) }));
export const FEATURED_ROOMS = ROOMS.filter((r) => r.featured);
export const CITIES = [...new Set(ROOMS.map((r) => r.city))].sort();
export function roomsByCity(city) {
    return ROOMS.filter((r) => r.city === city);
}
