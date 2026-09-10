/**
 * renderer.js — 渲染层（Renderer）
 *
 * 只做一件事：把游戏状态画到 canvas 上。
 * 不读取任何输入、不修改任何游戏状态。
 */

(function (global) {
  'use strict';

  const { font } = global.DINOSprites;

  /** 画布逻辑分辨率（再整体缩放到窗口） */
  const VIEW = { w: 960, h: 300 };
  const GROUND_Y = 246;

  /** 白天 / 夜晚两套配色 */
  const PALETTE = {
    day: {
      background: '#f7f7f7',
      foreground: '#535353',
      ground: '#535353',
      subtle: '#d8d8d8',
    },
    night: {
      background: '#16161c',
      foreground: '#f7f7f7',
      ground: '#f7f7f7',
      subtle: '#2e2e3a',
    },
  };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.ctx.imageSmoothingEnabled = false;
      this.stars = null;
    }

    /** 取当前配色 */
    theme(isNight) {
      return isNight ? PALETTE.night : PALETTE.day;
    }

    /**
     * 绘制一个点阵精灵
     * @param {{w:number,h:number,data:boolean[][]}} sprite
     * @param {number} x 左上角 X
     * @param {number} y 左上角 Y
     * @param {number} pixel 单像素放大倍数
     * @param {string} color 颜色
     */
    drawSprite(sprite, x, y, pixel, color) {
      const ctx = this.ctx;
      ctx.fillStyle = color;
      for (let row = 0; row < sprite.h; row++) {
        const line = sprite.data[row];
        for (let col = 0; col < sprite.w; col++) {
          if (line[col]) {
            ctx.fillRect(x + col * pixel, y + row * pixel, pixel, pixel);
          }
        }
      }
    }

    /**
     * 绘制 5x5 像素字体文本
     */
    drawPixelText(text, x, y, size, color) {
      const ctx = this.ctx;
      ctx.fillStyle = color;
      let cursorX = x;
      for (const char of text.toUpperCase()) {
        const glyph = font[char];
        if (glyph) {
          for (let row = 0; row < glyph.length; row++) {
            for (let col = 0; col < glyph[row].length; col++) {
              if (glyph[row][col] === '#') {
                ctx.fillRect(cursorX + col * size, y + row * size, size, size);
              }
            }
          }
        }
        cursorX += (glyph ? glyph[0].length + 1 : 4) * size;
      }
      return cursorX;
    }

    /** 清空背景 */
    clear(color) {
      this.ctx.fillStyle = color;
      this.ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    }

    /** 夜空：星星 + 月亮 */
    drawNightSky(isNight, nightProgress) {
      if (!isNight) { this.stars = null; return; }
      const ctx = this.ctx;
      if (!this.stars) {
        this.stars = [];
        for (let i = 0; i < 40; i++) {
          this.stars.push({ x: Math.random() * VIEW.w, y: Math.random() * 150, r: Math.random() < 0.7 ? 1 : 2 });
        }
      }
      ctx.fillStyle = '#ffffff';
      for (const star of this.stars) {
        ctx.globalAlpha = 0.4 + Math.abs(Math.sin((star.x + nightProgress * 40) * 0.01)) * 0.6;
        ctx.fillRect(star.x, star.y, star.r, star.r);
      }
      ctx.globalAlpha = 1;
      // 月亮
      ctx.fillStyle = '#f7f7f7';
      ctx.fillRect(VIEW.w - 130, 40, 4, 4);
      ctx.beginPath();
      ctx.arc(VIEW.w - 120, 44, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.night.background;
      ctx.beginPath();
      ctx.arc(VIEW.w - 112, 38, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    /** 地平线 + 滚动碎石 */
    drawGround(ground, color, subtle) {
      const ctx = this.ctx;
      ctx.fillStyle = subtle;
      for (const pebble of ground.pebbles) {
        if (pebble.x < VIEW.w + 10) {
          ctx.fillRect(pebble.x, ground.y + 6 + pebble.offset, pebble.size, pebble.size);
        }
      }
      ctx.fillStyle = color;
      ctx.fillRect(0, ground.y, VIEW.w, 2);
    }

    drawClouds(clouds, color) {
      for (const c of clouds) {
        this.drawSprite(c.sprite, c.x, c.y, c.PIXEL, color);
      }
    }

    drawObstacles(obstacles, color) {
      for (const o of obstacles) {
        if (o.type === 'cactus') {
          for (let i = 0; i < o.count; i++) {
            const offsetX = i * (o.sprite.w - 2) * o.PIXEL;
            this.drawSprite(o.sprite, o.x + offsetX, o.y - o.height, o.PIXEL, color);
          }
        } else {
          this.drawSprite(o.sprite, o.x, o.y - o.height, o.PIXEL, color);
        }
      }
    }

    drawDino(dino, color) {
      this.drawSprite(dino.sprite, dino.x, dino.y - dino.height, dino.PIXEL, color);
    }

    /** 右上角：最高分 + 当前分 */
    drawScore(score, best, newRecord, color) {
      const size = 4;
      const y = 24;
      const hiX = VIEW.w - 200;
      this.drawPixelText('HI', hiX, y, size, color);
      const hiText = String(Math.floor(best)).padStart(5, '0');
      this.drawPixelText(hiText, hiX + 4 * size * 3, y, size, color);
      const scoreText = String(Math.floor(score)).padStart(5, '0');
      this.drawPixelText(scoreText, VIEW.w - 30 - 5 * 4 * size, y, size, color);

      // 破纪录瞬间的感叹号
      if (newRecord) {
        this.drawPixelText('!!', VIEW.w - 250, y, size, color);
      }
    }

    /** 居中的提示性文字 */
    drawCenterMessage(lines, color) {
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.font = '600 26px "Segoe UI", system-ui, sans-serif';
      let y = 110;
      for (const line of lines) {
        ctx.fillText(line, VIEW.w / 2, y);
        y += 36;
      }
      ctx.restore();
    }

    /** 重新开始按钮（圆形箭头图标 + 方框） */
    drawRestartButton(color, background) {
      const ctx = this.ctx;
      const cx = VIEW.w / 2;
      const cy = 178;
      const r = 22;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.1);
      ctx.stroke();
      // 箭头
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.55, cy - r * 0.95);
      ctx.lineTo(cx + r * 0.98, cy - r * 0.62);
      ctx.lineTo(cx + r * 0.42, cy - r * 0.42);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      return { cx, cy, r };
    }

    /** 暂停遮罩 */
    drawPauseOverlay(color, background) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, VIEW.w, VIEW.h);
      ctx.restore();
      this.drawCenterMessage(['已暂停 / PAUSED'], color);
    }

    /** 音效开关图标（右上角小提示） */
    drawSoundIcon(enabled, color, background) {
      const ctx = this.ctx;
      const x = 24;
      const y = 24;
      ctx.save();
      ctx.fillStyle = color;
      // 喇叭主体
      ctx.beginPath();
      ctx.moveTo(x, y + 6);
      ctx.lineTo(x + 6, y + 6);
      ctx.lineTo(x + 12, y);
      ctx.lineTo(x + 12, y + 16);
      ctx.lineTo(x + 6, y + 10);
      ctx.lineTo(x, y + 10);
      ctx.closePath();
      ctx.fill();
      if (!enabled) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 16, y + 2);
        ctx.lineTo(x + 24, y + 14);
        ctx.moveTo(x + 24, y + 2);
        ctx.lineTo(x + 16, y + 14);
        ctx.stroke();
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 15, y + 8, 6, Math.PI * 0.3, Math.PI * 1.7);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  global.DINORenderer = { Renderer, VIEW, GROUND_Y };
})(window);
