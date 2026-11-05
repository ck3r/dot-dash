/*
 * The spoken alphabet: real recordings, one file a voice, each word
 * played by its place in the file (voice-times.js). Two voices, the
 * same words in the same slots, so only the file and the lengths
 * differ:
 *
 *   phonetic   ALFA BRAVO CHARLIE … ONE TWO …   (sound: phonetic)
 *   letters    A B C … ONE TWO …                (sound: letters)
 *
 * and one file for both, the symbols (FULL STOP, COMMA …) and a few
 * numbers said as words (73 "seventy-three"). Each voice is loaded
 * with the symbols laid after it, as one buffer, so a word is always
 * a place in one recording; the phonetic voice gets the plain letters
 * too, for what's said by its letters even on the radio (prosigns,
 * Q codes: "Q S L", never "Quebec Sierra Lima"):
 *
 *   phonetic  |ALFA … THOUSAND    |FULL STOP … DAH|a b c … 9 ZED|
 *             0 s                 38 s            75.2 s
 *   letters   |A … THOUSAND ZED   |FULL STOP … DAH|
 *             0 s                 39 s            76.2 s
 *
 * A word is its name in the voice's file ("A", "HUNDRED"), a symbol's
 * word ("FULL STOP"), or a letter in lower case, said plainly ("a").
 * Web Audio, not an
 * <audio> element: that can't start and stop on the exact moment, and
 * this way a tap and a rendered .wav share the same decoded sound.
 *
 *   say(ch, volume)      say one character (a letter, a digit, a symbol's
 *                        word); a tap while it's speaking
 *                        starts over, so never two at once
 *   setVoice(name)       which voice from now on ("phonetic", "letters",
 *                        "didah", "dotdash")
 *   loadVoice()          the decoded recording, fetched the first time
 *   wordPlace(word)      { offset, length } in seconds
 *   spokenWords(text)    what a message reads out as (null: a word gap)
 *   gapBetween(a, b)     the pause between two words said, in s
 *   symbolWord(ch)       a symbol's word in this voice (FULL STOP), or none
 *   codeSaid(ch)         in a code voice, how its marks are said ("dit-dah")
 *   voiceTimeline(words, names)   the player's timeline, spoken
 */
import { VOICE_SLOT, VOICE_WORDS, EXTRA_WORDS, VOICE_LENGTHS, SYMBOL_SLOT, SYMBOL_WORDS, SYMBOL_LENGTHS } from "../voice-times.js";
import { isQ } from "../characters.js";
import { ENCODE } from "../morse.js";

/*
 * Two voices say the code instead of the name, the way Morse is
 * learnt by ear: each mark a word, a letter's marks run together, a
 * pause between letters. Both are words from the symbols' file:
 *
 *   didah     A  DIT·DAH         C  DAH·DIT·DAH·DIT
 *   dotdash   A  DOT·DASH        C  DASH·DOT·DASH·DOT
 *
 * A mark inside a letter is its word in lower case ("dit"), the last
 * one in upper ("DIT"): lower runs on into the next, as a Q code's
 * plain letters do (gapBetween), upper leaves the letter's pause.
 */
const CODE_VOICES = { didah: ["DIT", "DAH"], dotdash: ["DOT", "DASH"] };
const MARK_WORD = /^(dit|dah|dot|dash)$/;
const saysCode = (name = voice) => name in CODE_VOICES;

export const VOICES = [...Object.keys(VOICE_LENGTHS), ...Object.keys(CODE_VOICES)];
let voice = "phonetic";

export function setVoice(name) {
  if (VOICES.includes(name)) voice = name;
}
export const voiceName = () => voice;

export const SAY_GAP = 0.15, WORD_GAP = 0.6;   // s, between letters and words

/*
 * Some words run together, with no gap of their own (each recording
 * still has a little quiet at either end): a prosign's or a Q code's
 * letters, said plainly ("q s l" as one call sign, not three letters),
 * and a digit with its HUNDRED or THOUSAND.
 *
 *   H · I          SAY_GAP between
 *   q s l          none
 *   2 THOUSAND     none
 */
const plainLetter = word => /^[a-z]$/.test(word ?? "");
export function gapBetween(word, next) {
  if (MARK_WORD.test(word ?? "")) return 0;
  if (plainLetter(word) && plainLetter(next)) return 0;
  if (next === "HUNDRED" || next === "THOUSAND") return 0;
  return SAY_GAP;
}
const SILENT = 200;   // ms, for a letter with nothing to say

/* each file's length, in ms: an alphabet's own words and its extras
   (ZED, in letters), the symbols on their own grid */
const FILE_MS = {
  phonetic: (VOICE_WORDS.length + EXTRA_WORDS.phonetic.length) * VOICE_SLOT,
  letters: (VOICE_WORDS.length + EXTRA_WORDS.letters.length) * VOICE_SLOT,
  symbols: SYMBOL_WORDS.length * SYMBOL_SLOT
};
const PARTS = {
  phonetic: ["phonetic", "symbols", "letters"],
  letters: ["letters", "symbols"],
  didah: ["symbols"],
  dotdash: ["symbols"]
};
/* where each part starts in a voice's buffer, in ms */
const PART_AT = Object.fromEntries(Object.entries(PARTS).map(([name, files]) => {
  let at = 0;
  return [name, Object.fromEntries(files.map(file => [file, (at += FILE_MS[file]) - FILE_MS[file]]))];
}));

/* not at startup, and not in the service worker's CORE: 110–130 KB a
   file, and several MB once decoded, for something many never tap.
   Once fetched, the worker keeps them like anything else. Each voice
   is put together on its own, the first time it's wanted; a file two
   voices share is fetched once */
const files = new Map();      // file → its decoding, under way or done
const loading = new Map();    // voice → its buffer, under way or done
const Offline = () => window.OfflineAudioContext || window.webkitOfflineAudioContext;

function decodeFile(file) {
  if (!files.has(file)) {
    files.set(file, (async () => {
      const response = await fetch(`/voice/${file}.webm`);
      if (!response.ok) throw new Error(response.status);
      return new (Offline())(1, 1, 48000).decodeAudioData(await response.arrayBuffer());
    })().catch(error => {
      files.delete(file);     // offline just now: the next tap tries again
      throw error;
    }));
  }
  return files.get(file);
}

/* the parts end to end, each cut to its own length (a decoder may
   leave a few ms over at the end), at the places above */
export function loadVoice(name = voice) {
  if (!loading.has(name)) {
    loading.set(name, Promise.all(PARTS[name].map(decodeFile)).then(parts => {
      const rate = parts[0].sampleRate;
      const at = PARTS[name].map(file => Math.round(PART_AT[name][file] / 1000 * rate));
      const ends = PARTS[name].map((file, i) => at[i] + Math.round(FILE_MS[file] / 1000 * rate));
      const whole = new (Offline())(1, 1, rate).createBuffer(1, ends.at(-1), rate);
      const out = whole.getChannelData(0);
      parts.forEach((part, i) => out.set(part.getChannelData(0).subarray(0, ends[i] - at[i]), at[i]));
      return whole;
    }).catch(error => {
      loading.delete(name);
      throw error;
    }));
  }
  return loading.get(name);
}

export function wordPlace(word, name = voice) {
  const at = PART_AT[name];
  if (MARK_WORD.test(word)) word = word.toUpperCase();
  let i = VOICE_LENGTHS[name] ? [...VOICE_WORDS, ...EXTRA_WORDS[name]].indexOf(word) : -1;
  if (i >= 0) return { offset: i * VOICE_SLOT / 1000, length: VOICE_LENGTHS[name][i] / 1000 };
  i = SYMBOL_WORDS.indexOf(word);
  if (i >= 0) return { offset: (at.symbols + i * SYMBOL_SLOT) / 1000, length: SYMBOL_LENGTHS[i] / 1000 };
  /* said plainly: the letters voice is plain already */
  if (name === "letters") return wordPlace(word.toUpperCase(), name);
  i = VOICE_WORDS.indexOf(word.toUpperCase());
  return { offset: (at.letters + i * VOICE_SLOT) / 1000, length: VOICE_LENGTHS.letters[i] / 1000 };
}

/*
 * The symbols' words. Five were recorded two ways: the phonetic voice
 * takes the radio's (full stop, stroke), the letters voice the
 * everyday ones, and shorter (period, slash).
 *
 *   symbol   phonetic          letters
 *
 * DOT and DIT were recorded as other names for the full stop, DASH
 * and DAH for the hyphen; the code voices say them as marks, and a
 * choice of names may use them later.
 */
const SYMBOL_SAID = {
  ".":  ["FULL STOP",        "PERIOD"],
  "?":  ["QUESTION MARK",    "QUESTION"],
  "!":  ["EXCLAMATION MARK", "EXCLAIM"],
  "/":  ["STROKE",           "SLASH"],
  "&":  ["AND",              "AMPERSAND"],
  ",": "COMMA", "'": "APOSTROPHE", "(": "OPEN BRACKET", ")": "CLOSE BRACKET",
  ":": "COLON", ";": "SEMICOLON", "=": "EQUALS", "+": "PLUS", "-": "HYPHEN",
  "_": "UNDERSCORE", '"': "QUOTE", "$": "DOLLAR", "@": "AT"
};
/* how a character's code is said in a code voice ("dit-dah"), or null */
export const codeSaid = ch => saysCode() && ENCODE[ch]
  ? [...ENCODE[ch]].map(m => CODE_VOICES[voice][m === "." ? 0 : 1].toLowerCase()).join("-")
  : null;

export const symbolWord = ch => {
  const said = SYMBOL_SAID[ch];
  return Array.isArray(said) ? said[voice === "letters" ? 1 : 0] : said;
};

/* the operators' numbers, said as one word, as they're said on the air */
const SAID_WHOLE = ["33", "72", "73", "88"];

/* one character: its words. A prosign (<AR>) is its letters, plainly,
   as on the air; so is each letter of a Q code (`plain`) */
function wordsOf(ch, plain) {
  if (saysCode()) {
    const marks = [...(ENCODE[ch] ?? "")].map(m => CODE_VOICES[voice][m === "." ? 0 : 1]);
    return marks.map((word, i) => (i < marks.length - 1 ? word.toLowerCase() : word));
  }
  if (ch.startsWith("<")) return [...ch.slice(1, -1)].map(c => c.toLowerCase());
  if (/[A-Z]/.test(ch)) return [plain ? ch.toLowerCase() : ch];
  if (VOICE_WORDS.includes(ch)) return [ch];
  const word = symbolWord(ch);
  return word ? [word] : [];
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
 * being said (the zeros a HUNDRED covers say nothing). The operators'
 * numbers are one word on the first digit (73 SEVENTY-THREE), a Q
 * code's letters are said plainly (QSL? q s l QUESTION MARK; CQ too), and a
 * symbol is its word; a character with nothing recorded is passed over.
 */
function spokenLetters(names) {
  names = names.map(name => name ?? "");
  if (saysCode()) return names.map(name => wordsOf(name));   // each its marks, numbers too
  const text = names.join("");
  if (SAID_WHOLE.includes(text)) return names.map((_, i) => (i ? [] : [text]));
  if (/^[1-9]\d*00$/.test(text)) {
    return [...text].map((digit, i) => {
      const place = text.length - 1 - i;          // 0 for the units
      if (place < 2) return [];
      if (place === 2) return digit === "0" ? [] : [digit, "HUNDRED"];
      return place === 3 ? [digit, "THOUSAND"] : [digit];
    });
  }
  const plain = isQ(text) || text === "CQ";   // said C Q on the air too
  return names.map(name => wordsOf(name, plain));
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
  let at = 0, last = null;     // the last word said
  words.forEach((word, w) => {
    const said = spokenLetters(names[w]);

    /* when each letter is said: its words, and the gaps before them.
       A letter that says nothing after one that did (the 3 of 73, the
       zeros of 100) is part of that one's word, and has no time yet */
    const spans = [];
    word.forEach((code, c) => {
      const own = said[c] ?? [];
      if (!own.length && spans.some(span => span.spoke)) { spans.push({ joins: true }); return; }
      if (c) at += (own.length ? gapBetween(last, own[0]) : SAY_GAP) * 1000;
      else if (w) at += WORD_GAP * 1000;
      const start = at;
      own.forEach((name, i) => {
        if (i) at += gapBetween(own[i - 1], name) * 1000;
        const length = wordPlace(name).length * 1000;
        speech.push({ start: at, end: at + length, word: name });
        at += length;
        last = name;
      });
      if (at === start) at += SILENT;
      spans.push({ start, end: at, spoke: own.length > 0 });
    });

    /* a word shared: its time split among its letters by their marks'
       length, so each lands as the word goes and the last as it ends,
       none waiting after it

         SEVENTY-THREE
         7······3····       (not 7, then 3 in silence after) */
    for (let c = 0; c < spans.length; c++) {
      let n = c + 1;
      while (n < spans.length && spans[n].joins) n++;
      if (n === c + 1) continue;
      const units = word.slice(c, n).map(code => [...code].reduce((sum, m) => sum + (m === "." ? 2 : 4), 0));
      const total = units.reduce((a, b) => a + b), { start, end } = spans[c];
      let t = start;
      for (let k = c; k < n; k++) {
        const length = (end - start) * units[k - c] / total;
        spans[k] = { start: t, end: t + length };
        t += length;
      }
      c = n - 1;
    }

    word.forEach((code, c) => {
      const { start, end } = spans[c];
      const first = marks.length;
      const lengths = [...code].map(m => (m === "." ? 1 : 3));
      const unit = (end - start) / (lengths.reduce((a, b) => a + b) + code.length - 1);
      let t = start;
      [...code].forEach((m, i) => {
        if (i) t += unit;
        const length = lengths[i] * unit;
        const gapKind = !marks.length ? null : i ? "inner" : c ? "letter" : "word";
        const idealGap = !gapKind ? 0 : i ? unit : c ? start - spans[c - 1].end : WORD_GAP * 1000;
        marks.push({ start: t, end: t + length, mark: m, letter: letters.length, index: i, ideal: length, gapKind, idealGap, recorded: false });
        t += length;
      });
      letters.push({ code, start, end, first, last: marks.length - 1 });
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
  const words = wordsOf(ch, false);   // a letter's name, a symbol's word, or its marks
  if (!words.length) return;
  const buffer = await loadVoice(name);
  if (tap !== taps) return;       // tapped again while it loaded
  const level = context.createGain();
  level.gain.value = volume;
  level.connect(context.destination);
  const sources = [];
  let at = context.currentTime;
  words.forEach((word, i) => {
    const { offset, length } = wordPlace(word, name);
    const src = context.createBufferSource();
    src.buffer = buffer;
    src.connect(level);
    src.start(at, offset, length);
    sources.push(src);
    at += length + gapBetween(word, words[i + 1]);
  });
  speaking = { stop: () => sources.forEach(src => { try { src.stop(); } catch { } }) };
}
