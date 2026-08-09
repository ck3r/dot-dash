console.log("TITLE TEST:", document.title);

setTimeout(() => {
  document.title = "TEST";
  console.log("TITLE AFTER:", document.title);
}, 1000);
    /*
     * ============================================================
     * MORSE
     * ============================================================
     */

    const MORSE = {
      ".-": "A",
      "-...": "B",
      "-.-.": "C",
      "-..": "D",
      ".": "E",
      "..-.": "F",
      "--.": "G",
      "....": "H",
      "..": "I",
      ".---": "J",
      "-.-": "K",
      ".-..": "L",
      "--": "M",
      "-.": "N",
      "---": "O",
      ".--.": "P",
      "--.-": "Q",
      ".-.": "R",
      "...": "S",
      "-": "T",
      "..-": "U",
      "...-": "V",
      ".--": "W",
      "-..-": "X",
      "-.--": "Y",
      "--..": "Z",

      "-----": "0",
      ".----": "1",
      "..---": "2",
      "...--": "3",
      "....-": "4",
      ".....": "5",
      "-....": "6",
      "--...": "7",
      "---..": "8",
      "----.": "9"
    };


    /*
     * ============================================================
     * MORSE BINARY TREE
     * ============================================================
     */

    const MORSE_TREE = {

      ".": "E",
      "-": "T",

      "..": "I",
      ".-": "A",
      "-.": "N",
      "--": "M",

      "...": "S",
      "..-": "U",
      ".-.": "R",
      ".--": "W",
      "-..": "D",
      "-.-": "K",
      "--.": "G",
      "---": "O",

      "....": "H",
      "...-": "V",
      "..-.": "F",
      ".-..": "L",
      ".--.": "P",

      "-...": "B",
      "-..-": "X",
      "-.-.": "C",
      "-.--": "Y",
      "--..": "Z",
      "--.-": "Q"
    };


    /*
     * ============================================================
     * FAVICONS
     * ============================================================
     *
     * Both SVGs are embedded as data URLs so the browser doesn't
     * need to fetch a new file every time the switch changes.
     */

    const FAVICON_OPEN = `
      <svg xmlns="http://www.w3.org/2000/svg"
           width="71"
           height="79"
           viewBox="0 0 71 79"
           fill="none">

        <circle
          cx="13.6603"
          cy="52.8063"
          r="7"
          transform="rotate(-60 13.6603 52.8063)"
          stroke="#000"
          stroke-width="6"/>

        <rect
          x="16.0214"
          y="47.2164"
          width="56"
          height="7"
          rx="3.5"
          transform="rotate(-30 16.0214 47.2164)"
          fill="#000"
          stroke="#000"/>
      </svg>
    `;


    /*
     * Replace this with your closed-switch SVG.
     */

const FAVICON_CLOSED = `
<svg xmlns="http://www.w3.org/2000/svg"
     width="71"
     height="79"
     viewBox="0 0 71 79"
     fill="none">

  <defs>

    <!-- Wide transmitter glow -->
    <filter
      id="bloom"
      x="-400%"
      y="-400%"
      width="800%"
      height="800%"
      color-interpolation-filters="sRGB">

      <feGaussianBlur
        stdDeviation="7"
        result="blur"/>

    </filter>


    <!-- Tight LED glow -->
    <filter
      id="halo"
      x="-300%"
      y="-300%"
      width="600%"
      height="600%"
      color-interpolation-filters="sRGB">

      <feGaussianBlur
        stdDeviation="2.5"
        result="blur"/>

    </filter>


    <!-- Warm amber LED -->
    <radialGradient
      id="led"
      cx="0"
      cy="0"
      r="1"
      gradientUnits="userSpaceOnUse"
      gradientTransform="
        translate(13.66 52.81)
        rotate(90)
        scale(7)">

      <stop
        offset="0"
        stop-color="#ffffff"/>

      <stop
        offset="0.18"
        stop-color="#fff9c4"/>

      <stop
        offset="0.42"
        stop-color="#ffe45c"/>

      <stop
        offset="0.70"
        stop-color="#ffbf00"/>

      <stop
        offset="1"
        stop-color="#e88900"/>

    </radialGradient>


    <!-- Subtle warm reflection -->
    <radialGradient
      id="reflection"
      cx="0"
      cy="0"
      r="1"
      gradientUnits="userSpaceOnUse"
      gradientTransform="
        translate(13.66 52.81)
        rotate(90)
        scale(13)">

      <stop
        offset="0"
        stop-color="#ffbf00"
        stop-opacity="0.45"/>

      <stop
        offset="0.45"
        stop-color="#ff9d00"
        stop-opacity="0.18"/>

      <stop
        offset="1"
        stop-color="#ff9d00"
        stop-opacity="0"/>

    </radialGradient>

  </defs>


  <!-- Large ambient transmitter bloom -->
  <circle
    cx="13.6603"
    cy="52.8063"
    r="13"
    fill="#ff9d00"
    opacity="0.75"
    filter="url(#bloom)"/>


  <!-- Warm reflection around the switch contact -->
  <circle
    cx="13.6603"
    cy="52.8063"
    r="13"
    fill="url(#reflection)"/>


  <!-- Tight amber halo -->
  <circle
    cx="13.6603"
    cy="52.8063"
    r="9"
    fill="#ffbf00"
    opacity="0.9"
    filter="url(#halo)"/>


  <!-- Black LED bezel -->
  <circle
    cx="13.6603"
    cy="52.8063"
    r="8"
    fill="#000"/>


  <!-- Glowing LED -->
  <circle
    cx="13.6603"
    cy="52.8063"
    r="6"
    fill="url(#led)"/>


  <!-- Hot specular highlight -->
  <circle
    cx="11.4"
    cy="50.4"
    r="1.6"
    fill="#ffffff"/>


  <!-- Switch arm -->
  <rect
    x="16.0214"
    y="47.2164"
    width="56"
    height="7"
    rx="3.5"
    transform="rotate(0 13.6603 52.8063)"
    fill="#000"/>

</svg>
`;


    const favicon =
      document.querySelector("#favicon");


    const faviconURLs = {

      open:
        "data:image/svg+xml," +
        encodeURIComponent(FAVICON_OPEN),

      closed:
        "data:image/svg+xml," +
        encodeURIComponent(FAVICON_CLOSED)

    };


    let faviconState = null;


    function setFavicon(closed) {

      /*
       * Don't update the favicon if it hasn't changed.
       */

      if (faviconState === closed) {
        return;
      }


      faviconState = closed;


      favicon.href =
        closed
          ? faviconURLs.closed
          : faviconURLs.open;

    }


    /*
     * ============================================================
     * URL
     * ============================================================
     */

    function getMorseFromURL() {

      const url = window.location.href;
      const marker = "?/";

      const index =
        url.indexOf(marker);

      if (index === -1) {
        return "";
      }

      return url.substring(
        index + marker.length
      );
    }


    /*
     * ============================================================
     * DECODE
     * ============================================================
     */

    function decodeMorse(morse) {

      return morse
        .split("//")
        .map(word =>
          word
            .split("/")
            .filter(Boolean)
            .map(
              code => MORSE[code] ?? "�"
            )
            .join("")
        )
        .join(" ");
    }


    /*
     * ============================================================
     * TITLE FRAMES
     * ============================================================
     *
     * A completed character remains in the title while the next
     * character traverses the Morse tree.
     *
     * Dit = 1 frame
     * Dah = 3 frames
     */

function getTitleFrames(morse) {

  const frames = [];

  let decoded = "";


  for (
    const word of morse.split("//")
  ) {

    for (
      const code of word.split("/")
    ) {

      if (!code) {
        continue;
      }


      let path = "";


      /*
       * Each Morse signal starts by assuming
       * that it is a dit.
       *
       * If the signal continues into a second
       * beat, we revise that decision to a dah.
       */

      for (
        const symbol of code
      ) {

        /*
         * First beat:
         * assume dit → traverse left.
         */

        path += ".";

        frames.push(
          decoded +
          (MORSE_TREE[path] ?? "�")
        );


        /*
         * If it is actually a dah, the second
         * beat reveals that and moves right.
         */

        if (symbol === "-") {

          path =
            path.slice(0, -1) + "-";

          frames.push(
            decoded +
            (MORSE_TREE[path] ?? "�")
          );


          /*
           * Third beat confirms the dah.
           */

          frames.push(
            decoded +
            (MORSE_TREE[path] ?? "�")
          );

        }

      }


      /*
       * Character is now fully decoded.
       */

      decoded +=
        MORSE[code] ?? "�";

    }


    /*
     * Word separator.
     */

    decoded += " ";

  }


  decoded =
    decoded.trimEnd();


  /*
   * Guarantee final state.
   */

  if (
    frames.length === 0 ||
    frames[frames.length - 1] !== decoded
  ) {

    frames.push(decoded);

  }


  return frames;
}


    /*
     * ============================================================
     * KEYER EVENTS
     * ============================================================
     *
     * Each event has:
     *
     * state = closed/open
     * units = duration
     *
     * Morse timing:
     *
     * dit          1
     * dah          3
     * symbol gap   1
     * char gap     3
     * word gap     7
     */

    function getKeyerEvents(morse) {

      const events = [];


      function addSignal(symbol) {

        events.push({

          state: "closed",

          symbol,

          units:
            symbol === "."
              ? 1
              : 3

        });

      }


      function addGap(units) {

        events.push({

          state: "open",

          units

        });

      }


      const words =
        morse.split("//");


      words.forEach(
        (word, wordIndex) => {

          const characters =
            word
              .split("/")
              .filter(Boolean);


          characters.forEach(
            (code, charIndex) => {

              for (
                let i = 0;
                i < code.length;
                i++
              ) {

                addSignal(
                  code[i]
                );


                /*
                 * Intra-character gap.
                 */

                if (
                  i <
                  code.length - 1
                ) {

                  addGap(1);

                }

              }


              /*
               * Inter-character gap.
               */

              if (
                charIndex <
                characters.length - 1
              ) {

                addGap(3);

              }

            }
          );


          /*
           * Inter-word gap.
           */

          if (
            wordIndex <
            words.length - 1
          ) {

            addGap(7);

          }

        }
      );


      return events;
    }


    /*
     * ============================================================
     * KEYER STATE
     * ============================================================
     */

    const ZERO_WIDTH = "\u200B";

    const WPM = 20;
    const FARNSWORTH_WPM = 20;

    const DOT_MS =
      1200 / WPM;


const ACTIVE_FRAME_MS = 210;
const INACTIVE_FRAME_MS = 1000;

const TITLE_LATENCY_MS = 30;


    let keyerTimer = null;

    let keyerEvents = [];

    let keyerEventIndex = 0;

    let keyerUnit = 0;

    let titleFrames = [];

    let titleFrameIndex = 0;


    const reducedMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      );


    /*
     * ============================================================
     * FRAME RATE
     * ============================================================
     */

    function getFrameInterval() {

      return document.hidden
        ? INACTIVE_FRAME_MS
        : ACTIVE_FRAME_MS;

    }


    /*
     * ============================================================
     * STOP
     * ============================================================
     */

    function stopKeyer() {

      if (keyerTimer) {

        clearInterval(
          keyerTimer
        );

        keyerTimer = null;

      }

    }


    /*
     * ============================================================
     * RENDER
     * ============================================================
     */

    function renderKeyerUnit() {

      /*
       * Finished.
       */

      if (
        keyerEventIndex >=
        keyerEvents.length
      ) {

        stopKeyer();

        setFavicon(false);


        /*
         * Guarantee final title.
         */

        if (
          titleFrames.length
        ) {

          document.title =
            titleFrames[
              titleFrames.length - 1
            ];

        }

        return;
      }


      const event =
        keyerEvents[
          keyerEventIndex
        ];


      /*
       * Favicon follows signal state.
       *
       * The state only actually changes when the
       * event changes, thanks to setFavicon().
       */

      setFavicon(
        event.state === "closed"
      );


      /*
       * Title advances once per signal unit.
       *
       * Because dah = 3 units, the current
       * character remains visible for three
       * frames.
       */

if (
  event.state === "closed"
) {

  const frame =
    titleFrames[titleFrameIndex];

  titleFrameIndex++;

  setTimeout(() => {

    if (frame !== undefined) {
      document.title = frame;
    }

  }, TITLE_LATENCY_MS);

}


      /*
       * Advance within event.
       */

      keyerUnit++;


      /*
       * Event finished.
       */

      if (
        keyerUnit >= event.units
      ) {

        keyerEventIndex = 
          keyerEventIndex + 1;

        keyerUnit = 0;

      }

    }


    /*
     * ============================================================
     * START
     * ============================================================
     */

    function startKeyer() {

      stopKeyer();


      keyerEventIndex = 0;
      keyerUnit = 0;
      titleFrameIndex = 0;


      /*
       * No message.
       */

      if (
        keyerEvents.length === 0
      ) {

        document.title =
          ZERO_WIDTH;

        setFavicon(false);

        return;

      }


      /*
       * Reduced motion.
       */

      if (
        reducedMotion.matches
      ) {

        document.title =
          titleFrames[
            titleFrames.length - 1
          ];

        setFavicon(false);

        return;

      }


      /*
       * Initial state.
       */

      document.title =
        ZERO_WIDTH;

      setFavicon(false);


      /*
       * Begin immediately.
       */

      renderKeyerUnit();


      /*
       * Continue at requested
       * active/inactive rate.
       */

      keyerTimer =
        setInterval(
          renderKeyerUnit,
          getFrameInterval()
        );

    }


    /*
     * ============================================================
     * VISIBILITY
     * ============================================================
     */

    document.addEventListener(
      "visibilitychange",
      () => {

        startKeyer();

      }
    );


    /*
     * Reduced-motion changes.
     */

    reducedMotion.addEventListener(
      "change",
      () => {

        startKeyer();

      }
    );


    /*
     * ============================================================
     * INITIALIZE
     * ============================================================
     */

    function loadPage() {

      const morse =
        getMorseFromURL();


      const text =
        decodeMorse(morse);


      titleFrames =
        getTitleFrames(morse);


      keyerEvents =
        getKeyerEvents(morse);


      /*
       * Display Morse.
       */

      document.querySelector(
        "#morse"
      ).textContent =
        morse
          .replaceAll("/", " ")
          .replaceAll("  ", " / ");


      /*
       * Display decoded text.
       */

      document.querySelector(
        "#text"
      ).textContent =
        text;


      /*
       * Debug information.
       */

      document.querySelector(
        "#status"
      ).textContent =

        `Morse: ${morse}\n` +
        `Text: ${text}\n` +
        `WPM: ${WPM}\n` +
        `Farnsworth: ${FARNSWORTH_WPM}\n` +
        `Dot: ${DOT_MS}ms\n` +
        `Tab: ${
          document.hidden
            ? "inactive"
            : "active"
        }\n` +
        `Reduced motion: ${
          reducedMotion.matches
        }\n` +
        `Title frames: ${
          titleFrames.length
        }\n` +
        `Keyer events: ${
          keyerEvents.length
        }`;


      startKeyer();

    }


    loadPage();
