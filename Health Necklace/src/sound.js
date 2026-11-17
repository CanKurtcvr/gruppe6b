/**
 * SoundPlayer — low-latency playback with the Web Audio API.
 *
 * Why not <audio>? Web Audio decodes the file into memory once, so every
 * press starts instantly, and it handles a press during playback cleanly
 * (restart from the beginning).
 *
 * Browsers block audio until the user has clicked or pressed a key on the page.
 * Gamepad presses do NOT count, so call `unlock()` from mousePressed/keyPressed.
 */
class SoundPlayer {
  /** @param {string[]} urls candidate files; the first one that decodes is used */
  constructor(urls) {
    this.urls = urls;
    this.ctx = null;
    this.buffer = null;
    this.source = null;
    this.endsAt = 0;
    this.error = null;
  }

  async load() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
      this.error = "Web Audio not supported";
      return;
    }
    this.ctx = new AudioCtx();
    this.gain = this.ctx.createGain();
    this.gain.connect(this.ctx.destination);

    for (const url of this.urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        this.buffer = await this.ctx.decodeAudioData(data);
        this.error = null;
        return;
      } catch (err) {
        this.error = `Could not load ${url}: ${err.message}`;
        console.warn("[sound]", this.error);
      }
    }
  }

  get ready() {
    return Boolean(this.buffer);
  }

  get unlocked() {
    return Boolean(this.ctx) && this.ctx.state === "running";
  }

  async unlock() {
    if (this.ctx && this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch (err) {
        console.warn("[sound] resume failed:", err);
      }
    }
  }

  get isPlaying() {
    return Boolean(this.ctx) && this.ctx.currentTime < this.endsAt;
  }

  /** 0 → 1 progress of the current playback (0 when idle). */
  get progress() {
    if (!this.isPlaying || !this.buffer) return 0;
    const start = this.endsAt - this.buffer.duration;
    return (this.ctx.currentTime - start) / this.buffer.duration;
  }

  /** Play from the start. A new press during playback restarts it. */
  play() {
    if (!this.ready) return false;
    if (this.ctx.state !== "running") this.ctx.resume();

    if (this.source) {
      try {
        this.source.stop();
      } catch (_) {
        /* already stopped */
      }
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gain);
    src.start();
    this.source = src;
    this.endsAt = this.ctx.currentTime + this.buffer.duration;
    return true;
  }
}

