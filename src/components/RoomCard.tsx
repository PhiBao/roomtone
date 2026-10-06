import Link from "next/link";
import type { Room } from "../lib/roomtone/catalog";
import type { RoomAct } from "../lib/roomtone/engine";

export function RoomCard({ room, acts, note }: { room: Room; acts?: RoomAct[]; note?: string }) {
  return (
    <Link href={`/rooms/${room.id}`} className="card" style={{ display: "block" }}>
      <div className="card-head">
        <h3 style={{ margin: 0 }}>{room.name}</h3>
        <span className="pill">{room.genre ?? "Venue"}</span>
      </div>
      <div className="tiny faint" style={{ marginBottom: 10 }}>
        {[room.neighborhood, room.city].filter(Boolean).join(" · ")}
      </div>
      {acts && acts.length > 0 ? (
        <div className="act-list">
          {acts.slice(0, 3).map((a) => (
            <div className="act-row" key={a.entity_id}>
              <span className="act-rank">{a.rank}</span>
              <span className="act-name">{a.name}</span>
              <span className="act-aff">{a.affinity.toFixed(3)}</span>
            </div>
          ))}
        </div>
      ) : note ? (
        <p className="dim" style={{ margin: 0, fontSize: 13.5 }}>
          {note}
        </p>
      ) : null}
    </Link>
  );
}

export function ActList({ acts, limit = 12, showAffinity = true }: { acts: RoomAct[]; limit?: number; showAffinity?: boolean }) {
  return (
    <ul className="act-list">
      {acts.slice(0, limit).map((a) => (
        <li className="act-row" key={a.entity_id}>
          <span className="act-rank">{a.rank}</span>
          <span>
            <span className="act-name">{a.name}</span>
            {a.genres.length > 0 ? <div className="act-sub">{a.genres.slice(0, 3).join(" · ")}</div> : null}
          </span>
          {showAffinity ? <span className="act-aff">{a.affinity.toFixed(3)}</span> : <span />}
        </li>
      ))}
    </ul>
  );
}