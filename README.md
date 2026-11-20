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
index.html      the station: key, type, play and share Morse
ref/            the reference: the chart, the tree, a page per character
hero/           Key hero, a game for the sending hand
css/            the stylesheets; base.css is every page's
js/core/        the Morse itself: the tree, encode and decode, the
                link's formats, timing, cost. Runs anywhere, no page
js/shared/      what more than one page uses: sound, playback, the
                bar, the card, the tab that keys
js/station/     the station's own; js/ref/, js/hero/ likewise
js/game/        what any game would want
sw.js           works offline
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
(fonts/OFL.txt), and the voice recordings (voice/) have their own
terms, at the top of LICENSE.md. To contribute, see CONTRIBUTING.md.

