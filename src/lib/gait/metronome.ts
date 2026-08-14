/**
 * Web Audio API Real-Time Clinical Biofeedback Metronome Engine
 *
 * Provides auditory pacing cues (metronome ticks and asymmetry warning chimes)
 * to support Rhythmic Auditory Stimulation (RAS) protocols in clinical gait training.
 */

export interface MetronomeOptions {
  bpm: number; // Beats per minute (steps per minute)
  volume?: number; // 0.0 - 1.0
  soundType?: "click" | "tone" | "woodblock";
}

export class GaitMetronome {
  private ctx: AudioContext | null = null;
  private isRunning: boolean = false;
  private bpm: number = 108;
  private volume: number = 0.5;
  private timerId: number | null = null;
  private nextBeatTime: number = 0;
  private soundType: "click" | "tone" | "woodblock" = "woodblock";
  private beatCallback?: (beatNumber: number) => void;
  private currentBeat: number = 0;

  constructor(options?: Partial<MetronomeOptions>) {
    if (options?.bpm !== undefined) {
      this.bpm = Math.max(30, Math.min(240, options.bpm));
    }
    if (options?.volume !== undefined) {
      this.volume = Math.max(0, Math.min(1, options.volume));
    }
    if (options?.soundType) this.soundType = options.soundType;
  }

  private initContext() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  public setBpm(newBpm: number) {
    this.bpm = Math.max(30, Math.min(240, newBpm));
  }

  public getBpm(): number {
    return this.bpm;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  public onBeat(cb: (beatNumber: number) => void) {
    this.beatCallback = cb;
  }

  public start() {
    if (this.isRunning) return;
    this.initContext();
    if (!this.ctx) return;

    this.isRunning = true;
    this.currentBeat = 0;
    this.nextBeatTime = this.ctx.currentTime + 0.05;
    this.scheduler();
  }

  public stop() {
    this.isRunning = false;
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  public destroy() {
    this.stop();
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {
        // ignore if already closed
      }
      this.ctx = null;
    }
  }

  public close() {
    this.destroy();
  }

  public getActive(): boolean {
    return this.isRunning;
  }

  private scheduler = () => {
    if (!this.isRunning || !this.ctx) return;

    while (this.nextBeatTime < this.ctx.currentTime + 0.1) {
      this.scheduleNote(this.nextBeatTime, this.currentBeat);
      const secondsPerBeat = 60.0 / this.bpm;
      this.nextBeatTime += secondsPerBeat;
      this.currentBeat++;
    }

    this.timerId = window.setTimeout(this.scheduler, 25);
  };

  private scheduleNote(time: number, beat: number) {
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    // Differentiate downbeat (even vs odd for L/R footfall)
    const isLeftFoot = beat % 2 === 0;
    const freq = isLeftFoot ? 880 : 660; // 880Hz Left, 660Hz Right

    osc.frequency.setValueAtTime(freq, time);
    const startGain = Math.max(0.0001, this.volume);
    gain.gain.setValueAtTime(startGain, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);

    osc.start(time);
    osc.stop(time + 0.045);

    if (this.beatCallback) {
      // Notify UI slightly ahead or on schedule
      const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
      setTimeout(() => {
        if (this.isRunning && this.beatCallback) {
          this.beatCallback(beat);
        }
      }, delayMs);
    }
  }

  /**
   * Triggers an immediate auditory asymmetry alert chime when asymmetry exceeds threshold.
   */
  public playAsymmetryAlert() {
    this.initContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.linearRampToValueAtTime(330, now + 0.15);

    const startGain = Math.max(0.0001, this.volume * 0.7);
    gain.gain.setValueAtTime(startGain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  }
}
