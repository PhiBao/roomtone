import { BookingDesk } from "@/components/BookingDesk";

export const dynamic = "force-dynamic";

export default function DeskPage() {
  return (
    <>
      <h1 style={{ fontSize: 34 }}>The Booking Desk</h1>
      <p className="lede" style={{ marginBottom: 24 }}>
        Ask a booking question in plain language. The Desk resolves the room and the act against Qloo&apos;s
        graph, runs the measurement tools, and answers with what came back — including what it could not
        establish.
      </p>

      <div className="card" style={{ marginBottom: 26 }}>
        <h3 style={{ marginBottom: 6 }}>Why this isn&apos;t a chatbot</h3>
        <p className="dim" style={{ fontSize: 14, marginBottom: 0 }}>
          There is no language model behind it. A booking verdict that changes because a model had a bad
          afternoon is worse than no verdict, and this product&apos;s entire claim is that the number is measured
          rather than generated. The Desk follows a fixed plan of typed tools over Qloo, shows every call it
          made, and tells you when a room can&apos;t be measured rather than producing a profile anyway. Its
          limitation — it won&apos;t answer outside its plan — is stated rather than hidden.
        </p>
      </div>

      <BookingDesk />
    </>
  );
}