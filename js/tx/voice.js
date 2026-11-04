/*
 * The spoken alphabet: real recordings, one file a voice, each word
 * played by its place in the file (voice-times.js). Two voices, the
 * same words in the same slots, so only the file and the lengths
 * differ:
 *
 *   phonetic   ALFA BRAVO CHARLIE … ONE TWO …   (sound: phonetic)
 *   letters    A B C … ONE TWO …                (sound: letters)
 * Web Audio, not an
 * <audio> element: that can't start and stop on the exact moment, and
 * this way a tap and a rendered .wav share the same decoded sound.
 *
 *   say(ch, volume)      say one character; a tap while it's speaking
 *                        starts over, so never two at once
 *   setVoice(name)       which voice from now on ("phonetic", "letters")
 *   loadVoice()          the decoded recording, fetched the first time
 *   wordPlace(word)      { offset, length } in seconds
 *   spokenWords(text)    what a message reads out as (null: a word gap)
 *   voiceTimeline(words, names)   the player's timeline, spoken
 */
import { VOICE_SLOT, VOICE_WORDS, VOICE_LENGTHS } from "../voice-times.js";

export const VOICES = Object.keys(VOICE_LENGTHS);
let voice = "phonetic";

export function setVoice(name) {
  if (VOICES.includes(name)) voice = name;
}
export const voiceName = () => voice;

export const SAY_GAP = 0.15, WORD_GAP = 0.6;   // s, between letters and words
const SILENT = 200;   // ms, for a letter with nothing to say

/* not at startup, and not in the service worker's CORE: 130 KB, and
   several MB once decoded, for something many never tap. Once
   fetched, the worker keeps it like anything else. Each voice is
   fetched on its own, the first time it's wanted */
const loading = new Map();    // voice → its decoding, under way or done

export function loadVoice(name = voice) {
  if (!loading.has(name)) {
    loading.set(name, (async () => {
      const response = await fetch(`/voice/${name}.webm`);
      if (!response.ok) throw new Error(response.status);
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      return new Offline(1, 1, 48000).decodeAudioData(await response.arrayBuffer());
    })().catch(error => {
      loading.delete(name);   // offline just now: the next tap tries again
      throw error;
    }));
  }
  return loading.get(name);
}

export function wordPlace(word, name = voice) {
  const i = VOICE_WORDS.indexOf(word);
  return { offset: i * VOICE_SLOT / 1000, length: VOICE_LENGTHS[name][i] / 1000 };
}

/*
 * A whole number of hundreds or thousands is said the way a pilot
 * would; anything else, digit by digit:
 *
 *   100   ONE HUNDRED               1234  ONE TWO THREE FOUR
 *   2500  TWO THOUSAND FIVE HUNDRED  305  THREE ZERO FIVE
 *   12000 ONE TWO THOUSAND
 *
 * What each letter of a word says, so the player can light the letter
 * being said (the zeros a HUNDRED covers say nothing). A character
 * with no recording (punctuation, the <> of a prosign) is passed over;
 * a prosign's letters are said one by one.
 */
function spokenLetters(names) {
  const text = names.join("");
  if (/^[1-9]\d*00$/.test(text)) {
    return [...text].map((digit, i) => {
      const place = text.length - 1 - i;          // 0 for the units
      if (place < 2) return [];
      if (place === 2) return digit === "0" ? [] : [digit, "HUNDRED"];
      return place === 3 ? [digit, "THOUSAND"] : [digit];
    });
  }
  return names.map(name => [...(name ?? "")].filter(c => VOICE_WORDS.includes(c)));
}

export function spokenWords(text) {
  const out = [];
  for (const word of text.toUpperCase().split(/\s+/)) {
    const said = spokenLetters(word.match(/<[^>]*>|./g) ?? []).flat();
    if (!said.length) continue;
    if (out.length) out.push(null);
    out.push(...said);
  }
  return out;
}

/*
 * Speech can't change speed without changing pitch (a faster playback
 * rate is a higher voice), so spoken playback has its own fixed
 * timeline: the speed sliders don't reach it. It's the shape
 * tx-player.js expects, so the scrub bar, the trace and the keys all
 * work as ever: each letter's marks are spread over its spoken word,
 * for the bar and the lamp, and `speech` is what actually sounds.
 *
 *   H       I
 *   HOTEL   INDIA      speech
 *   ▪▪▪▪    ▪ ▪        marks, a letter's worth of each
 *
 * The marks are never traced on the line, or the name would sound
 * before its letter had finished keying. A name is said once a letter
 * is whole, so here the letter is whole the moment it's said: code,
 * text and name together (tx-player.js stateAt).
 */
export function voiceTimeline(words, names) {
  const marks = [], letters = [], speech = [];
  let at = 0;
  words.forEach((word, w) => {
    const said = spokenLetters(names[w]);
    word.forEach((code, c) => {
      if (c) at += SAY_GAP * 1000;
      else if (w) at += WORD_GAP * 1000;
      const start = at;
      (said[c] ?? []).forEach((name, i) => {
        if (i) at += SAY_GAP * 1000;
        const length = wordPlace(name).length * 1000;
        speech.push({ start: at, end: at + length, word: name });
        at += length;
      });
      if (at === start) at += SILENT;

      const first = marks.length;
      const lengths = [...code].map(m => (m === "." ? 1 : 3));
      const unit = (at - start) / (lengths.reduce((a, b) => a + b) + code.length - 1);
      let t = start;
      [...code].forEach((m, i) => {
        if (i) t += unit;
        const length = lengths[i] * unit;
        const gapKind = !marks.length ? null : i ? "inner" : c ? "letter" : "word";
        const idealGap = !gapKind ? 0 : i ? unit : (c ? SAY_GAP : WORD_GAP) * 1000;
        marks.push({ start: t, end: t + length, mark: m, letter: letters.length, index: i, ideal: length, gapKind, idealGap, recorded: false });
        t += length;
      });
      letters.push({ code, start, end: at, first, last: marks.length - 1 });
    });
  });
  return { marks, letters, speech, duration: at };
}

let context = null, speaking = null, taps = 0;

export async function say(ch, volume = 1) {
  /* made and woken here, inside the tap: phones won't allow it later */
  const Ctx = window.AudioContext || window.webkitAudioContext;
  context ??= new Ctx();
  context.resume?.();
  const tap = ++taps;
  try { speaking?.stop(); } catch { }
  speaking = null;

  const name = voice;
  const buffer = await loadVoice(name);
  if (tap !== taps) return;       // tapped again while it loaded
  const { offset, length } = wordPlace(ch, name);
  const level = context.createGain();
  level.gain.value = volume;
  speaking = context.createBufferSource();
  speaking.buffer = buffer;
  speaking.connect(level).connect(context.destination);
  speaking.start(0, offset, length);
}
