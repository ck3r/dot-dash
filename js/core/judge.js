/*
 * ============================================================
 * JUDGE — how close a keyed mark came to the one it was meant to be
 * ============================================================
 *
 * Two lists of edges, side by side: the chart (what should be keyed,
 * and when) and the key (what was). No DOM, no clock of its own:
 * every time is handed in, in ms from the start of the chart.
 *
 *   the chart   ┃▓▓▓┃   ┃▓▓▓▓▓▓▓▓▓┃   ┃▓▓▓┃
 *   the key       ┃▓▓▓▓┃  ┃▓▓▓▓▓▓▓▓┃          ┃▓
 *                 ↑late   ↑on time, short     ↑no note: a stray
 *
 * A key-down takes the nearest note in its lane that nobody has
 * taken, if it starts within reach; none there, it's a stray. The
 * note is graded when the key comes up, on its start and its length,
 * the worse of the two:
 *
 *   landed    both within a quarter of a unit (never under 30 ms:
 *             a hand and a screen aren't finer than that)
 *   close     the start within reach, and the length one that would
 *             still READ as that mark (the keyer's own line: under
 *             two units is a dit, over is a dah)
 *   missed    held so long or so short it's the other mark, or
 *             never keyed at all
 *
 *   createJudge(notes, { unit }) → {
 *     down(lane, at)   → the note taken, or null (a stray)
 *     up(lane, at)     → the note, graded: note.grade, note.err
 *     sweep(at)        → the notes that went by unkeyed since last time
 *     tally()          → { landed, close, missed, stray, streak, best }
 *     windows          the reach and the landing, in ms
 *   }
 *
 * A note is { lane: "." or "-", t0, t1 } (the chart's own object:
 * the judge writes grade and err onto it, so a road can read them).
 */

export const LANDED = 0.25;   // units, either side
export const REACH = 0.5;     // units: how far off a start can be and still take its note
const LANDED_MIN = 30;        // ms
const REACH_MIN = 90;         // ms
const REACH_MAX = 0.9;        // units: at speed, the note's own stretch of road and no more

export function createJudge(notes, { unit }) {
  const landed = Math.max(LANDED * unit, LANDED_MIN);
  /*
   * Never a whole unit: two marks in one lane start at least two
   * units apart, so within a unit a press has one note it can mean.
   * Any further and a late press would be nearer the NEXT note, take
   * it early, and leave its own to be missed, and so on down the road.
   *
   *   ┃▓▓▓┃   ┃▓▓▓┃        dits, two units start to start
   *       ↑ a unit late: as near the second as the first
   */
  const reach = Math.min(Math.max(REACH * unit, REACH_MIN), REACH_MAX * unit);
  const dahAt = 2 * unit;

  const held = { ".": null, "-": null };     // the note each key is on, and when it went down
  const count = { landed: 0, close: 0, missed: 0, stray: 0 };
  let streak = 0, best = 0;
  let swept = 0;                             // notes before this one are settled

  function settle(note, grade, err = null) {
    note.grade = grade;
    note.err = err;
    count[grade]++;
    streak = grade === "missed" ? 0 : streak + 1;
    best = Math.max(best, streak);
    return note;
  }

  function down(lane, at) {
    let nearest = null;
    for (let i = swept; i < notes.length; i++) {
      const note = notes[i];
      if (note.t0 - at > reach) break;       // the rest are further still
      if (note.lane !== lane || note.taken || note.grade) continue;
      if (Math.abs(note.t0 - at) > reach) continue;
      if (!nearest || Math.abs(note.t0 - at) < Math.abs(nearest.t0 - at)) nearest = note;
    }
    if (!nearest) {
      count.stray++;
      held[lane] = null;
      return null;
    }
    nearest.taken = true;
    held[lane] = { note: nearest, at };
    return nearest;
  }

  function up(lane, at) {
    const h = held[lane];
    held[lane] = null;
    if (!h) return null;
    const { note } = h;
    const want = note.t1 - note.t0, got = at - h.at;
    const err = { start: h.at - note.t0, length: got - want };
    const reads = lane === "." ? got < dahAt : got >= dahAt;
    if (!reads) return settle(note, "missed", err);
    const on = Math.abs(err.start) <= landed && Math.abs(err.length) <= landed;
    return settle(note, on ? "landed" : "close", err);
  }

  /* a note nobody took, once a key-down could no longer reach it */
  function sweep(at) {
    const gone = [];
    while (swept < notes.length) {
      const note = notes[swept];
      if (note.grade) { swept++; continue; }
      if (note.taken) break;                 // still held: wait for the key to come up
      if (at - note.t0 <= reach) break;
      gone.push(settle(note, "missed"));
      swept++;
    }
    return gone;
  }

  return {
    down, up, sweep,
    tally: () => ({ ...count, streak, best }),
    windows: { landed, reach }
  };
}
