# dot-dash
```
┌─────────────────────────────────────────────────┐
│                     dot-da.sh                   │
│                                                 │
│   .... . .-.. .-.. --- / .-- --- .-. .-.. -..   │
│    H   E  L    L    O     W   O   R   L    D    │
│                                                 │
│                                                 │
│               Morse Code Translator             │
└─────────────────────────────────────────────────┘
```

```
index.html      page + reference chart
style.css
js/morse.js     the core: tree, encode/decode, URL formats, cost
js/keyer.js     favicon + title transmitter; announces each beat
js/tree.js      live ASCII trees (horizontal + vertical), built from the data
js/main.js      wires the page to the core
```

No build step. Preview locally with any static server (ES modules
don't load from file://):

    python -m http.server

