/**
 * 100% Procedural Web Audio API synthesizer for engine roar, turbo blow-off valve,
 * tire screech, nitro boost jet, checkpoint chime, and collision impact thuds.
 */
class SoundEngine {
  private ctx: AudioContext | null = null;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private screechNode: AudioBufferSourceNode | null = null;
  private screechFilter: BiquadFilterNode | null = null;
  private screechGain: GainNode | null = null;
  private isMuted = false;
  private isRunning = false;

  public init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();

      // Dual-oscillator procedural engine note
      this.engineOsc1 = this.ctx.createOscillator();
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc1.type = 'sawtooth';
      this.engineOsc2.type = 'triangle';

      const engineFilter = this.ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 340;

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;

      this.engineOsc1.connect(engineFilter);
      this.engineOsc2.connect(engineFilter);
      engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);

      this.engineOsc1.start();
      this.engineOsc2.start();

      // Tire screech noise loop
      const bufferSize = this.ctx.sampleRate * 1.5;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      this.screechNode = this.ctx.createBufferSource();
      this.screechNode.buffer = noiseBuffer;
      this.screechNode.loop = true;

      this.screechFilter = this.ctx.createBiquadFilter();
      this.screechFilter.type = 'bandpass';
      this.screechFilter.frequency.value = 1450;
      this.screechFilter.Q.value = 4.5;

      this.screechGain = this.ctx.createGain();
      this.screechGain.gain.value = 0.0;

      this.screechNode.connect(this.screechFilter);
      this.screechFilter.connect(this.screechGain);
      this.screechGain.connect(this.ctx.destination);
      this.screechNode.start();

      this.isRunning = true;
    } catch {
      // Ignore AudioContext restriction until user gesture
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted && this.engineGain && this.screechGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.screechGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public silenceLoops() {
    if (!this.ctx || !this.engineGain || !this.screechGain) return;
    this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    this.screechGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  public updateTelemetry(rpm: number, throttle: number, isDrifting: boolean, slipDeg: number, active: boolean) {
    if (!this.isRunning || !this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineGain || !this.screechGain) {
      return;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (this.isMuted || !active) {
      this.silenceLoops();
      return;
    }

    const now = this.ctx.currentTime;
    const baseFreq = 36 + (rpm / 8200) * 145;
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.03);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.03);

    const targetGain = 0.035 + throttle * 0.045 + (rpm / 8200) * 0.025;
    this.engineGain.gain.setTargetAtTime(targetGain, now, 0.04);

    const screechLevel = isDrifting ? Math.min(0.06, (slipDeg / 45) * 0.055) : 0;
    this.screechGain.gain.setTargetAtTime(screechLevel, now, 0.05);
    if (this.screechFilter) {
      this.screechFilter.frequency.setTargetAtTime(1250 + Math.min(600, slipDeg * 12), now, 0.05);
    }
  }

  public playCollision(impactKmh: number) {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const startFreq = Math.min(180, 65 + impactKmh * 0.5);
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(24, now + 0.22);

      const vol = Math.min(0.22, 0.05 + (impactKmh / 200) * 0.16);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch {}
  }

  public playChime(type: 'beacon' | 'checkpoint' | 'victory' | 'ui') {
    if (this.isMuted) return;
    this.init();
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';

      if (type === 'beacon') {
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(1040, now + 0.16);
        gain.gain.setValueAtTime(0.09, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.23);
      } else if (type === 'checkpoint') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(660, now + 0.07);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.19);
      } else if (type === 'victory') {
        const notes = [440, 554.37, 659.25, 880];
        notes.forEach((n, idx) => {
          if (!this.ctx) return;
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(n, now + idx * 0.08);
          g.gain.setValueAtTime(0.09, now + idx * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.28);
          o.connect(g);
          g.connect(this.ctx.destination);
          o.start(now + idx * 0.08);
          o.stop(now + idx * 0.08 + 0.3);
        });
      } else {
        osc.frequency.setValueAtTime(620 * (0.95 + Math.random() * 0.1), now);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.07);
      }
    } catch {}
  }
}

export const soundEngine = new SoundEngine();
