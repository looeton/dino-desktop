/**
 * storage.js — 持久化层（Storage）
 *
 * 优先使用主进程提供的持久化桥（数据落在 app.getPath('userData')/save.json），
 * 桌面应用清缓存也不会丢失最高分。
 * 若桥不可用（例如直接用浏览器打开页面），自动降级到 localStorage，最后降级到内存。
 */

(function (global) {
  'use strict';

  const KEY_BEST = 'dino.best';
  const KEY_SOUND = 'dino.sound';

  class Storage {
    constructor() {
      this.memory = Object.create(null);
      this.backend = this.detectBackend();
    }

    detectBackend() {
      const bridge = global.dinoBridge;
      if (bridge && typeof bridge.getItem === 'function' && typeof bridge.setItem === 'function') {
        try {
          bridge.getItem('__probe__');
          return 'bridge';
        } catch (error) {
          // 桥不可用，继续降级
        }
      }
      try {
        global.localStorage.getItem('__probe__');
        return 'localStorage';
      } catch (error) {
        return 'memory';
      }
    }

    getItem(key) {
      try {
        if (this.backend === 'bridge') return global.dinoBridge.getItem(key);
        if (this.backend === 'localStorage') return global.localStorage.getItem(key);
      } catch (error) {
        // 单次读写失败不影响游戏进行
      }
      return Object.prototype.hasOwnProperty.call(this.memory, key) ? this.memory[key] : null;
    }

    setItem(key, value) {
      this.memory[key] = value;
      try {
        if (this.backend === 'bridge') global.dinoBridge.setItem(key, value);
        else if (this.backend === 'localStorage') global.localStorage.setItem(key, value);
      } catch (error) {
        // 忽略：至少还有内存副本
      }
    }

    getBestScore() {
      const raw = this.getItem(KEY_BEST);
      const value = Number.parseInt(raw, 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    }

    saveBestScore(score) {
      this.setItem(KEY_BEST, String(Math.floor(score)));
    }

    getSoundEnabled() {
      const raw = this.getItem(KEY_SOUND);
      if (raw === null) return true;
      return raw === '1' || raw === 'true';
    }

    saveSoundEnabled(enabled) {
      this.setItem(KEY_SOUND, enabled ? '1' : '0');
    }
  }

  global.DINOStorage = { Storage, KEY_BEST, KEY_SOUND };
})(window);
