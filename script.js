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
     * Extract Morse from:
     *
     *   dot-da.sh/?/...././.-../.-../---
     *
     * Everything after "?/" is the Morse payload.
     */
    function getMorseFromURL() {
      const url = window.location.href;
      const marker = "?/";

      const index = url.indexOf(marker);

      if (index === -1) {
        return "";
      }

      return url.substring(index + marker.length);
    }


    /*
     * Decode:
     *
     *   .... / . / .-.. / .-.. / ---
     *
     * into:
     *
     *   H E L L O
     *
     * "/"  = character separator
     * "//" = word separator
     */
    function decodeMorse(morse) {
      return morse
        .split("//")
        .map(word =>
          word
            .split("/")
            .filter(Boolean)
            .map(code => MORSE[code] ?? "�")
            .join("")
        )
        .join(" ");
    }


    /*
     * Render the current URL.
     */
    function loadFromURL() {
      const morse = getMorseFromURL();
      const text = decodeMorse(morse);

      document.querySelector("#morse").textContent =
        morse.replaceAll("/", " ")
        .replaceAll("  ", " / ");

      document.querySelector("#text").textContent =
        text;

      document.title = text
        ? `${text} — dot-da.sh`
        : "dot-da.sh — Morse Code Translator";

      document.querySelector("#debug").textContent =
        `URL: ${window.location.href}\n` +
        `Payload: ${morse}\n` +
        `Decoded: ${text}`;
    }


    loadFromURL();
