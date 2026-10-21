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

## Free, in the spirit of amateur radio

Ham radio and CW are a free service, run by people who share what
they know, and dot-da.sh is too: free to use, no ads, no tracking.
If it's useful to you, share it with a friend. To support it,
contribute, buy merch, or donate.

## License

Source-available under the PolyForm Noncommercial License 1.0.0
(LICENSE.md): study it, change it, and use it for anything
non-commercial (a hobby, teaching, a club station). Selling it, or
running it with ads, isn't allowed. The font has its own licence
(fonts/OFL.txt). To contribute, see CONTRIBUTING.md.

