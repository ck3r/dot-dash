/*
 * Where each phonetic name's syllables after the first start, in ms
 * from the start of its word in apps/web/voice/phonetic.webm (as
 * voice-times.js places it), for the stair to light the one being
 * said. One-syllable names (GOLF, MIKE, WUN) have none.
 * Made by tests/tools/voice-syllables.cjs; run that, don't edit this.
 */
export const SYLLABLE_AT = {0: [275], 4: [335], 7: [330], 9: [305], A: [280], B: [270], C: [355], D: [245], E: [200], F: [355], H: [290], I: [195,420], J: [235,345], K: [280], L: [295], N: [205,440], O: [290], P: [250], Q: [245], R: [300,485], S: [250,570], T: [270], U: [100,340], V: [280], W: [285], X: [205], Y: [360], Z: [320]};

/* the ones set by hand (FIX), for /design/syllables/ to keep in its table */
export const BY_HAND = [];
