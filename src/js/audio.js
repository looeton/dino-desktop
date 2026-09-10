/**
 * audio.js — 音效层（Audio）
 *
 * 全部音效由 WebAudio 实时合成，不引入任何音频文件。
 * 浏览器/Chromium 要求用户手势后才能播放，因此 AudioContext 延迟到首次触发时才创建。
 */

(function (global) {
  'use strict';

  class AudioKit {
    constructor() {
      this.enabled = true;
      this.ctx = null;
      this.master = null;
    }

    /** 惰性初始化音频上下文 */
    ensureContext() {
      if (this.ctx) return this.ctx;
      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
      return this.ctx;
    }

    setEnabled(enabled) {
      this.enabled = enabled;
    }

    toggle() {
      this.enabled = !this.enabled;
      return this.enabled;
    }

    /** 通用：播放一个带包络的方波/三角波音符 */
    tone({ freq, type = 'square', duration = 0.12, sweepTo = null, volume = 1 }) {
      if (!this.enabled) return;
      const ctx = this.ensureContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (sweepTo) {
        osc.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + duration);
      }
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain).connect(this.master);
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.02);
    }

    /** 跳跃：短促上滑音 */
    jump() {
      this.tone({ freq: 420, type: 'square', duration: 0.14, sweepTo: 760, volume: 0.5 });
    }

    /** 每 100 分奖励音 */
    score() {
      this.tone({ freq: 880, type: 'triangle', duration: 0.09, volume: 0.55 });
      setTimeout(() => this.tone({ freq: 1320, type: 'triangle', duration: 0.09, volume: 0.5 }), 90);
    }

    /** 撞击结束：下滑低音 */
    hit() {
      this.tone({ freq: 260, type: 'sawtooth', duration: 0.3, sweepTo: 70, volume: 0.6 });
    }
  }

  global.DINOAudio = { AudioKit };
})(window);
