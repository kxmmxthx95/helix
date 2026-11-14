// Short UI click for the POS keypads. WebAudio, no asset: an oscillator with a ~50 ms decay.
let ctx: AudioContext | null = null;

/** `hz` sets the pitch: digits 1000, clear / backspace lower so the two are told apart by ear. */
export function tick(hz = 1000) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  } catch {
    /* no audio device / blocked: the keypad just stays silent */
  }
}
