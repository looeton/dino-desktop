/**
 * game.js — 游戏主逻辑（Game Loop & State Machine）
 *
 * 职责：状态机、主循环、难度调度、障碍生成、碰撞判定、分数与日夜切换。
 * 依赖：sprites / entities / renderer / input / audio / storage
 */

(function (global) {
  'use strict';

  const { VIEW, GROUND_Y, Renderer } = global.DINORenderer;
  const { Dino, Obstacle, Cloud, Ground, aabb } = global.DINOEntities;
  const { bindInput } = global.DINOInput;
  const { AudioKit } = global.DINOAudio;
  const { Storage } = global.DINOStorage;

  /** 游戏状态机 */
  const State = {
    IDLE: 'idle',        // 待开始
    RUNNING: 'running',  // 进行中
    PAUSED: 'paused',    // 暂停
    OVER: 'over',        // 结束
  };

  /** 平衡性参数集中在此，方便调参 */
  const CONFIG = {
    BASE_SPEED: 300,        // 起始速度 px/s
    MAX_SPEED: 760,         // 速度上限 px/s
    SPEED_PER_SCORE: 700,   // 每多少分达到下一次加速
    SCORE_RATE: 12,         // 每秒基础得分
    NIGHT_INTERVAL: 300,    // 每多少分切换一次昼夜
    MILESTONE: 100,         // 每多少分播放一次得分音效
    PTERO_AFTER_SCORE: 450, // 分数达到该值后翼龙才出现
    DINO_X: 60,
    MAX_CLOUDS: 5,
    MAX_FRAME_TIME: 0.05,   // 单帧最大 dt，防止后台切回来时“穿模”
  };

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.canvas.width = VIEW.w;
      this.canvas.height = VIEW.h;
      this.renderer = new Renderer(canvas);
      this.storage = new Storage();
      this.audio = new AudioKit();

      this.state = State.IDLE;
      this.best = this.storage.getBestScore();
      this.isNewRecord = false;
      this.restartButton = null;

      this.audio.setEnabled(this.storage.getSoundEnabled());

      this.resetWorld();
      this.bindEvents();

      this.lastTimestamp = 0;
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    // ----------------------------------------------------------------
    // 世界初始化
    // ----------------------------------------------------------------

    resetWorld() {
      this.dino = new Dino(CONFIG.DINO_X, GROUND_Y);
      this.ground = new Ground(GROUND_Y, VIEW.w, Date.now() % 2147483647);
      this.obstacles = [];
      this.clouds = [];
      this.score = 0;
      this.speed = CONFIG.BASE_SPEED;
      this.distanceToSpawn = 420;
      this.distanceToCloud = 200;
      this.nextMilestone = CONFIG.MILESTONE;
      this.isNight = false;
      this.nightProgress = 0;
      for (let i = 0; i < 3; i++) {
        this.spawnCloud(VIEW.w * (0.3 + i * 0.3));
      }
    }

    // ----------------------------------------------------------------
    // 输入绑定：把语义动作接到游戏方法上
    // ----------------------------------------------------------------

    bindEvents() {
      bindInput(this.canvas, {
        onJumpStart: () => {
          if (this.state !== State.RUNNING) return;
          if (this.dino.jump()) this.audio.jump();
        },
        onJumpCancel: () => this.dino.cancelJump(),
        onDuck: (value) => {
          if (this.state !== State.RUNNING) return;
          this.dino.setDucking(value);
        },
        onStart: () => this.start(),
        onRestart: () => this.restart(),
        onPause: () => this.togglePause(),
        onToggleSound: () => {
          const enabled = this.audio.toggle();
          this.storage.saveSoundEnabled(enabled);
        },
        isIdle: () => this.state === State.IDLE,
        isOver: () => this.state === State.OVER,
        isPaused: () => this.state === State.PAUSED,
        getRestartButton: (x, y) => {
          const btn = this.restartButton;
          if (!btn) return false;
          return Math.hypot(x - btn.cx, y - btn.cy) <= btn.r + 12;
        },
      });
    }

    // ----------------------------------------------------------------
    // 状态切换
    // ----------------------------------------------------------------

    start() {
      if (this.state !== State.IDLE) return;
      this.state = State.RUNNING;
    }

    restart() {
      if (this.state !== State.OVER) return;
      this.resetWorld();
      this.isNewRecord = false;
      this.restartButton = null;
      this.state = State.RUNNING;
    }

    togglePause() {
      if (this.state === State.RUNNING) this.state = State.PAUSED;
      else if (this.state === State.PAUSED) {
        this.state = State.RUNNING;
        this.lastTimestamp = performance.now();
      }
    }

    gameOver() {
      this.state = State.OVER;
      this.dino.die();
      this.audio.hit();
      if (Math.floor(this.score) > this.best) {
        this.best = Math.floor(this.score);
        this.isNewRecord = true;
        this.storage.saveBestScore(this.best);
      }
    }

    // ----------------------------------------------------------------
    // 主循环
    // ----------------------------------------------------------------

    loop(timestamp) {
      if (!this.lastTimestamp) this.lastTimestamp = timestamp;
      const dt = Math.min((timestamp - this.lastTimestamp) / 1000, CONFIG.MAX_FRAME_TIME);
      this.lastTimestamp = timestamp;

      if (this.state === State.RUNNING) {
        this.update(dt);
      }
      this.render(dt);
      requestAnimationFrame(this.loop);
    }

    update(dt) {
      const speedRatio = this.speed / CONFIG.BASE_SPEED;

      // 得分：速度越快得分越快
      this.score += dt * CONFIG.SCORE_RATE * speedRatio;
      if (Math.floor(this.score) >= this.nextMilestone) {
        this.nextMilestone += CONFIG.MILESTONE;
        this.audio.score();
      }

      // 难度：随分数线性加速，到上限封顶
      this.speed = Math.min(
        CONFIG.BASE_SPEED * (1 + this.score / CONFIG.SPEED_PER_SCORE),
        CONFIG.MAX_SPEED,
      );

      // 昼夜切换
      this.isNight = Math.floor(this.score / CONFIG.NIGHT_INTERVAL) % 2 === 1;
      this.nightProgress += dt;

      this.dino.update(dt, speedRatio);
      this.ground.update(dt, this.speed);

      // 障碍 · 生成与回收
      this.distanceToSpawn -= this.speed * dt;
      if (this.distanceToSpawn <= 0) {
        this.spawnObstacle();
      }
      for (const obstacle of this.obstacles) {
        obstacle.update(dt, this.speed);
      }
      this.obstacles = this.obstacles.filter((o) => !o.isOffScreen);

      // 云
      this.distanceToCloud -= this.speed * dt;
      if (this.distanceToCloud <= 0 && this.clouds.length < CONFIG.MAX_CLOUDS) {
        this.spawnCloud(VIEW.w + 40);
      }
      for (const cloud of this.clouds) cloud.update(dt, this.speed);
      this.clouds = this.clouds.filter((c) => !c.isOffScreen);

      // 碰撞
      const dinoBox = this.dino.hitbox;
      for (const obstacle of this.obstacles) {
        if (aabb(dinoBox, obstacle.hitbox)) {
          this.gameOver();
          break;
        }
      }
    }

    // ----------------------------------------------------------------
    // 生成逻辑
    // ----------------------------------------------------------------

    pickRandom(max) {
      return Math.floor(Math.random() * max);
    }

    spawnObstacle() {
      // 间距随速度增大，保证高难度下仍有反应时间
      const minGap = 170 + this.speed * 0.32;
      const maxGap = 400 + this.speed * 0.62;
      this.distanceToSpawn = minGap + Math.random() * (maxGap - minGap);

      const allowPtero = this.score >= CONFIG.PTERO_AFTER_SCORE;
      const usePtero = allowPtero && Math.random() < 0.35;

      if (usePtero) {
        const level = this.pickRandom(3);
        this.obstacles.push(new Obstacle('ptero', VIEW.w + 20, GROUND_Y, level));
        return;
      }

      const isLarge = this.score > 250 && Math.random() < 0.22;
      if (isLarge) {
        this.obstacles.push(new Obstacle('cactus', VIEW.w + 20, GROUND_Y, 'large'));
      } else {
        const count = 1 + this.pickRandom(3); // 1~3 株
        this.obstacles.push(new Obstacle('cactus', VIEW.w + 20, GROUND_Y, count));
      }
    }

    spawnCloud(x) {
      this.distanceToCloud = 220 + Math.random() * 420;
      const y = 40 + Math.random() * 90;
      const speedScale = 0.25 + Math.random() * 0.25; // 视差层级
      this.clouds.push(new Cloud(x, y, speedScale));
    }

    // ----------------------------------------------------------------
    // 渲染
    // ----------------------------------------------------------------

    render(dt) {
      const theme = this.renderer.theme(this.isNight);
      this.renderer.clear(theme.background);
      this.renderer.drawNightSky(this.isNight, this.nightProgress);
      this.renderer.drawClouds(this.clouds, this.isNight ? theme.subtle : theme.subtle);
      this.renderer.drawGround(this.ground, theme.ground, theme.subtle);
      this.renderer.drawObstacles(this.obstacles, theme.foreground);
      this.renderer.drawDino(this.dino, theme.foreground);
      this.renderer.drawScore(this.score, this.best, this.isNewRecord, theme.foreground);
      this.renderer.drawSoundIcon(this.audio.enabled, theme.foreground, theme.background);

      if (this.state === State.IDLE) {
        this.renderer.drawCenterMessage(
          ['按 空格 / ↑ 开始游戏', 'SPACE or ↑ to start'],
          theme.foreground,
        );
        this.restartButton = null;
      } else if (this.state === State.OVER) {
        this.renderer.drawCenterMessage(
          ['游戏结束 / GAME OVER', '空格·点击重开 / Space·Click to restart'],
          theme.foreground,
        );
        this.restartButton = this.renderer.drawRestartButton(theme.foreground, theme.background);
      } else if (this.state === State.PAUSED) {
        this.renderer.drawPauseOverlay(theme.foreground, theme.background);
        this.restartButton = null;
      } else {
        this.restartButton = null;
      }
    }
  }

  global.DINOGame = { Game, State, CONFIG };

  window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    global.dinoGameInstance = new Game(canvas);
  });
})(window);
