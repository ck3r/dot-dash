/*
 * Where the words are in site/voice/*.webm. Word i starts at
 * i × VOICE_SLOT in either voice; how long it lasts differs. All in
 * ms. Made by tests/tools/encode-voice.cjs; run that, don't edit this.
 */
export const VOICE_SLOT = 1000;

export const VOICE_WORDS = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","0","1","2","3","4","5","6","7","8","9","HUNDRED","THOUSAND"];

export const VOICE_LENGTHS = {
  phonetic: [640,620,660,590,640,710,520,680,580,650,630,580,430,730,670,570,620,650,800,860,730,590,610,750,680,640,630,460,420,420,590,540,530,630,420,530,520,600],
  letters: [460,440,650,470,500,490,460,530,430,470,500,410,450,430,410,430,480,450,590,440,470,510,520,500,470,560,690,410,420,520,510,500,510,550,330,510,540,630]
};
