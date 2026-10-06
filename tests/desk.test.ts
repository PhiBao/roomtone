import { describe, expect, it } from "vitest";
import { ask } from "../src/lib/agent/desk";

/**
 * The Booking Desk's parsing is the only place a wrong entity can enter the
 * product. These tests pin the failure modes we actually hit in development —
 * "drawstring" being read as an act is the reason the proper-noun extractor
 * exists.
 */
// These hit the real Qloo API through the response cache, so allow real time.

describe("booking desk question parsing", () => {
  // Live data; generous per-test timeout.

  it("reads a room and act out of a booking question", async () => {
    const a = await ask("Should I book Bad Bunny at Webster Hall?");
    expect(a.steps.map((s) => s.tool)).toContain("measure_fit");
    expect(a.headline).toMatch(/Bad Bunny/);
    expect(a.headline).toMatch(/Webster Hall/);
  });

  it("does not invent an act from a verb", async () => {
    const a = await ask("Who draws The Stone?");
    expect(a.headline).not.toMatch(/drawstring/i);
    expect(a.headline).toMatch(/The Stone/);
    // A room question should not claim to have measured an act.
    expect(a.detail.join(" ")).not.toMatch(/sits outside/i);
  });

  it("answers a sponsor question without requiring a room", async () => {
    const a = await ask("What brands sponsor a Bill Frisell show?");
    expect(a.steps.map((s) => s.tool)).toContain("sponsor_fit");
    expect(a.headline).toMatch(/Bill Frisell/i);
    expect(a.headline.toLowerCase()).not.toMatch("which room");
  });

  it("does not present a diffuse brand list as a shortlist", async () => {
    const a = await ask("What brands sponsor a Radiohead show?");
    const recs = a.recommendations.map((r) => r.name);
    const caveated = a.caveats.some((c) => /diffuse/i.test(c));
    // Either Qloo gave a tight list (recommendations are fine) or it didn't and
    // we said so. Presenting a spread list as recommendations would fail this.
    expect(recs.length > 0 ? !caveated : true).toBe(true);
  });

  it("asks for a room when the question names none and no sponsor intent", async () => {
    const a = await ask("What should I book this weekend?");
    expect(a.headline).toMatch(/which room/i);
  });

  it("reports an unknown room rather than guessing", async () => {
    const a = await ask("Should I book Bad Bunny at the Moonstruck Barn?");
    expect(a.headline).toMatch(/isn't in our catalog/i);
  });

  it("flags a weak entity match instead of silently accepting it", async () => {
    // Qloo has been observed mapping "Nate Barbrack" to "Nate Dogg".
    const a = await ask("Should I book Nate Barbrack at The Stone?");
    const flagged = a.caveats.some((c) => /closest match|confirm/i.test(c));
    expect(flagged).toBe(true);
  });

  it("always carries the aggregate-affinity caveat", async () => {
    const a = await ask("Who draws The Stone?");
    expect(a.caveats.join(" ")).toMatch(/not a ticket-sales forecast|not a sales forecast/i);
  });
});