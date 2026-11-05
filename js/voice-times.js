/*
 * Where the words are in site/voice/*.webm. Word i starts at
 * i × VOICE_SLOT in either voice; how long it lasts differs. The
 * symbols are one file for both voices, on a grid of their own
 * (SYMBOL_SLOT: "full stop" and "exclamation mark" don't fit a second). All in ms.
 * Made by tests/tools/encode-voice.cjs; run that, don't edit this.
 */
export const VOICE_SLOT = 1000;

export const VOICE_WORDS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","0","1","2","3","4","5","6","7","8","9","HUNDRED","THOUSAND"];

/* after those, at the end of one voice's file only */
export const EXTRA_WORDS = {"phonetic":[],"letters":["ZED"]};

export const VOICE_LENGTHS = {
  phonetic: [580,560,660,590,540,700,520,680,580,650,630,580,430,730,670,570,620,650,800,860,730,590,610,610,680,640,630,460,420,420,590,540,530,630,420,530,520,600],
  letters: [470,440,650,470,500,490,460,530,430,500,500,410,450,430,410,430,480,450,590,440,470,510,520,500,470,560,690,530,420,520,510,500,660,550,330,510,540,630,590]
};

export const SYMBOL_SLOT = 1200;

export const SYMBOL_WORDS = ["FULL STOP","PERIOD","COMMA","QUESTION MARK","QUESTION","APOSTROPHE","EXCLAMATION MARK","EXCLAIM","OPEN BRACKET","CLOSE BRACKET","COLON","SEMICOLON","STROKE","SLASH","EQUALS","PLUS","HYPHEN","UNDERSCORE","QUOTE","DOLLAR","AT","AND","AMPERSAND","33","72","73","88","DOT","DASH","DIT","DAH"];

export const SYMBOL_LENGTHS = [1150,590,530,770,660,850,1060,710,830,810,570,900,600,740,690,660,690,730,520,520,460,490,800,710,860,900,570,480,560,270,520];
