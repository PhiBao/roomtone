import Link from "next/link";
import { ROOMS, CITIES } from "@/lib/roomtone/catalog";
import { Evidence } from "@/components/Evidence";
import type { QlooCall } from "@/lib/qloo/types";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const calls: QlooCall[] = [];
  const byCity = CITIES.map((city) => ({ city, rooms: ROOMS.filter((r) => r.city === city) }));

  return (
    <>
      <h1 style={{ fontSize: 34 }}>The catalog</h1>
      <p className="lede" style={{ marginBottom: 28 }}>
        {ROOMS.length} rooms across {CITIES.length} cities, each pinned to a verified Qloo entity. Same-named
        venues are common in the graph — there are a dozen venues called &ldquo;The Stone&rdquo; — so every room
        here was resolved by name <em>and</em> confirmed by reading its geocode back. Rooms that failed that
        check were dropped rather than shown wrong.
      </p>

      {byCity.map(({ city, rooms }) => (
        <section key={city} style={{ marginBottom: 34 }}>
          <div className="card-head">
            <h2 style={{ margin: 0 }}>{city}</h2>
            <span className="tiny faint">{rooms.length} rooms</span>
          </div>
          <div className="grid grid-3">
            {rooms.map((room) => (
              <Link key={room.id} href={`/rooms/${room.id}`} className="card" style={{ display: "block" }}>
                <h3 style={{ marginBottom: 4 }}>{room.name}</h3>
                <div className="tiny faint" style={{ marginBottom: 8 }}>
                  {room.neighborhood ?? "—"}
                </div>
                <span className="pill">{room.genre ?? "Venue"}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <Evidence calls={calls} title="Evidence for this page" />
    </>
  );
}