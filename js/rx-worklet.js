/*
 * The microphone's samples, handed to the page (js/tx/rx.js).
 *
 * The browser runs this beside the sound itself, 128 samples at a
 * time; four of those go across together (about 10 ms), so the page
 * isn't woken hundreds of times a second for nothing. Nothing is
 * worked out here: the hearing is js/rx-decoder.js, on the page.
 */
class Tap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.held = new Float32Array(512);
    this.n = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    this.held.set(channel, this.n);
    this.n += channel.length;
    if (this.n >= this.held.length) {
      this.port.postMessage(this.held.slice(0, this.n));
      this.n = 0;
    }
    return true;
  }
}
registerProcessor("rx-tap", Tap);
