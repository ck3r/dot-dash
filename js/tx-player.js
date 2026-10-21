/*
 * ============================================================
 * TX PLAYER — play a message back, with a scrub bar
 * ============================================================
 *
 * A message becomes a timeline of marks (ms from the start):
 *
 *   H              E        /   …
 *   █ █ █ █ ░░░░░░ █ ░░░░░░░░░░░░░░░ …
 *   ↑ dit, gap 1   ↑ letter gap      ↑ word gap (Farnsworth-stretched)
 *
 * Sound is scheduled a little ahead on the audio clock (a
 * "lookahead" scheduler), so it stays exact even if the page is
 * busy; everything you SEE (logo, message, tree, scrub bar) is
 * drawn each frame from the same position.
 *
 *   createPlayer({ sound, timing, frame, end, rounds, gap })
 *     load(words)     set the message (array of words of codes)
 *     play()  pause()  stop()  seek(ms)
 *     playing, position, duration
 *
 *   frame(state)  every animation frame while playing / seeking:
 *     { position, duration, down, symbol, letter, mark, path }
 *       symbol: "." or "-" while a mark is sounding, else null
 *       phase: { kind: "hold" | "gap", elapsed, ideal, … } for the
 *              timing bar (null before the first / after the last)
 *       letter / mark: indexes of the letter and mark reached
 *       path: that letter's marks so far (".-" …), "" in a gap
 *   end()         reached the end (not called while repeating)
 *
 *   rounds()  → how many times to play it (1, 3, Infinity …).
 *               Between rounds it keeps PLAYING through a pause
 *               of gap() ms (a word space), so play/pause behave
 *               the same at any moment
 */

const LOOKAHEAD = 160;   // ms of sound scheduled ahead
const TICK = 40;         // ms between scheduler runs

/*
 * rec (optional): how each mark was actually keyed, in order,
 * as [on, gap, unit] (or null): ms held, ms waited before it, and
 * the unit length (speed) it was keyed at. Recorded marks keep
 * YOUR rhythm, scaled to the current speed (keyed at 5 wpm and
 * played at 10, everything runs twice as fast, quirks and all);
 * anything missing plays at the ideal timing. A very long pause
 * (you stopped to think) is capped at two word gaps.
 */
export function timeline(words, t, rec = []) {
  const marks = [];
  const letters = [];
  let at = 0;
  let k = 0;
  words.forEach((word, w) => {
    word.forEach((code, c) => {
      const first = marks.length;
      [...code].forEach((m, i) => {
        const ideal = (m === "." ? 1 : 3) * t.unit;
        const r = rec[k++] ?? null;
        const scale = r?.[2] ? t.unit / r[2] : 1;      // keyed at another speed
        let gapKind = null, idealGap = 0, gap = 0;
        if (marks.length) {
          gapKind = i ? "inner" : c ? "letter" : "word";
          idealGap = gapKind === "inner" ? t.unit : gapKind === "letter" ? t.letter : t.word;
          gap = Math.min(r?.[1] != null ? r[1] * scale : idealGap, 2 * t.word);
        }
        at += gap;
        const length = r ? r[0] * scale : ideal;
        marks.push({ start: at, end: at + length, mark: m, letter: letters.length, index: i, ideal, gapKind, idealGap, recorded: !!r });
        at += length;
      });
      letters.push({ code, start: marks[first].start, end: at, first, last: marks.length - 1 });
    });
  });
  const duration = marks.length ? marks[marks.length - 1].end : 0;
  return { marks, letters, duration };
}


export function createPlayer({ sound, timing, frame, end, rounds = () => 1, gap = () => 0 }) {
  let words = [];
  let rec = [];
  let line = { marks: [], letters: [], duration: 0 };

  let playing = false;
  let position = 0;          // ms into the message (when paused)
  let startedAt = 0;         // performance.now() when position 0 would have been
  let nextMark = 0;          // first mark not yet sent to the sound
  let ticker = null;
  let raf = 0;

  /* while repeating, time keeps running past the end; each round
     starts `round` ms after the previous one */
  let soundBase = 0;         // start of the round the scheduler is in
  let viewBase = 0;          // start of the round on screen
  let soundRound = 0;        // which round each of them is on (0 = first)
  let viewRound = 0;

  const now = () => performance.now();
  const elapsed = () => now() - startedAt;
  const round = () => line.duration + gap();
  const current = () => (playing ? Math.min(elapsed() - viewBase, line.duration) : position);

  function load(next, recording = []) {
    stop();
    words = next;
    rec = recording;
    line = timeline(words, timing(), rec);
  }

  /*
   * The speed changed mid-play: rebuild the timeline and carry on
   * from the same place in the message (the same mark, the same
   * fraction of the way through it or the gap after it).
   */
  function retime() {
    if (!line.marks.length) return;
    const was = playing;
    const pos = current();
    const old = line;
    line = timeline(words, timing(), rec);

    let next = 0;
    const ms = old.marks;
    let i = -1;
    while (i + 1 < ms.length && ms[i + 1].start <= pos) i++;
    if (i < 0) {
      next = 0;
    } else {
      const a = ms[i], b = line.marks[i];
      if (pos < a.end) {
        next = b.start + (pos - a.start) / (a.end - a.start) * (b.end - b.start);
      } else if (i + 1 < ms.length) {
        const gapOld = ms[i + 1].start - a.end, gapNew = line.marks[i + 1].start - b.end;
        next = b.end + (gapOld ? (pos - a.end) / gapOld : 0) * gapNew;
      } else {
        next = line.duration;
      }
    }
    if (was) pause();
    position = Math.max(0, Math.min(next, line.duration));
    if (was) play();
    else frame(stateAt(position));
  }

  /* where in the message a position falls */
  function stateAt(pos) {
    const { marks, letters, duration } = line;
    let letter = -1, mark = -1, down = false, path = "";
    for (let i = 0; i < marks.length && marks[i].start <= pos; i++) {
      mark = i;
      letter = marks[i].letter;
    }
    if (mark >= 0) {
      const m = marks[mark];
      down = pos < m.end;
      const l = letters[letter];
      /* inside the letter (or its inner gaps): the path so far;
         at the very end the last letter is over too, so it lands
         (between rounds and when the message ends, not just mid-way) */
      if (pos < l.end + 1 && pos < duration) path = l.code.slice(0, m.index + 1);
    }
    const symbol = down ? marks[mark].mark : null;

    /* for the timing bar: what's happening now, and how long it
       should ideally last */
    let phase = null;
    if (mark >= 0 && down) {
      const m = marks[mark];
      phase = { kind: "hold", elapsed: pos - m.start, ideal: m.ideal, symbol: m.mark };
    } else if (mark >= 0 && mark + 1 < marks.length) {
      const next = marks[mark + 1];
      phase = { kind: "gap", elapsed: pos - marks[mark].end, ideal: next.idealGap, gap: next.gapKind };
    }
    return { position: Math.min(pos, duration), duration, down, symbol, letter, mark, path, phase };
  }

  function schedule() {
    const t = elapsed();
    const { marks } = line;
    for (;;) {
      if (nextMark >= marks.length) {
        if (soundRound + 1 >= rounds()) break;
        soundRound++;
        soundBase += round();                          // on to the next round
        nextMark = 0;
      }
      const m = marks[nextMark];
      const at = soundBase + m.start;
      if (at >= t + LOOKAHEAD) break;
      nextMark++;
      const length = m.end - m.start;
      if (at < t - 5) {
        /* started already (a seek, a speed change): sound what's left of it */
        if (at + length > t + 5) sound.mark(0, (at + length - t) / 1000);
        continue;
      }
      sound.mark((at - t) / 1000, length / 1000);
    }
  }

  function loop() {
    const t = elapsed() - viewBase;
    if (t >= line.duration) {
      if (viewRound + 1 >= rounds()) {
        frame(stateAt(line.duration));
        pause();
        position = line.duration;
        end();
        return;
      }
      if (t >= round()) {
        viewBase += round();                           // next round begins
        viewRound++;
      } else {
        frame({ ...stateAt(line.duration), between: true });   // the pause between rounds
        raf = requestAnimationFrame(loop);
        return;
      }
    }
    frame(stateAt(elapsed() - viewBase));
    raf = requestAnimationFrame(loop);
  }

  function play() {
    if (!line.marks.length) return;
    if (position >= line.duration) position = 0;
    sound.unlock?.();
    playing = true;
    startedAt = now() - position;
    soundBase = viewBase = 0;
    soundRound = viewRound = 0;
    nextMark = line.marks.findIndex(m => m.end > position + 5);   // including one under way
    if (nextMark < 0) nextMark = line.marks.length;
    schedule();
    ticker = setInterval(schedule, TICK);
    loop();
  }

  function pause() {
    if (!playing) return;
    position = current();
    playing = false;
    clearInterval(ticker);
    cancelAnimationFrame(raf);
    sound.silence();
  }

  function stop() {
    pause();
    position = 0;
  }

  function seek(pos) {
    const wasPlaying = playing;
    pause();
    position = Math.max(0, Math.min(pos, line.duration));
    frame(stateAt(position));
    if (wasPlaying) play();
  }

  return {
    load, retime, play, pause, stop, seek, stateAt,
    get playing() { return playing; },
    get position() { return current(); },
    get duration() { return line.duration; },
    get loaded() { return line.marks.length > 0; }
  };
}
