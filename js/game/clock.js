/*
 * A song's clock: the time into the song, in ms, that can stand still
 * and can run faster than the page's.
 *
 *   page   ──────●━━━━━━━━━●──────●━━━━━━━━━━▶
 *              start     stop   start
 *   song   0 ────┘━━━━━━━━━┘──────┘━━━━━━━━━━▶   (it stood while stopped)
 *
 * It is where it stood (base) when the page's clock read mark, and
 * how fast it runs from there (rate: 1, or more for a song speeding
 * up). Read with an event's own time stamp, a press is timed by when
 * it happened, not by the frame it's drawn in.
 *
 *   createClock() → {
 *     now(stamp?)      the song's time (at that stamp of the page's clock)
 *     start(stamp)     run from here
 *     stop(stamp?)     stand here
 *     reset()          back to nothing, standing, at rate 1
 *     rewind(ms)       back so much of the page's time (never before
 *                      the start), to run up to where it stood
 *     setRate(rate)    faster or slower from now on
 *     rate             as it is
 *   }
 */
export function createClock() {
  let base = 0, mark = 0, rate = 1, running = false;

  const now = (stamp = performance.now()) => (running ? base + (stamp - mark) * rate : base);

  return {
    now,
    start(stamp) { mark = stamp; running = true; },
    stop(stamp) { base = now(stamp); running = false; },
    reset() { base = 0; rate = 1; running = false; },
    rewind(ms) { base = Math.max(0, now() - ms * rate); mark = performance.now(); },
    setRate(next) {
      const stamp = performance.now();
      base = now(stamp);
      mark = stamp;
      rate = next;
    },
    get rate() { return rate; },
  };
}
