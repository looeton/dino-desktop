/**
 * entities.js — 游戏实体层（Entities）
 *
 * 负责：所有可见对象的状态更新与碰撞盒计算。
 * 不含任何绘制代码（绘制在 renderer.js），也不含游戏流程（在 game.js）。
 */

(function (global) {
  'use strict';

  const { dinoRunA, dinoRunB, dinoDuckA, dinoDuckB, dinoDead,
    cactusSmall, cactusLarge, pteroUp, pteroDown, cloud } = global.DINOSprites;

  /** 每个像素点放大倍数（决定整体“像素块”大小） */
  const PIXEL = 3;

  // ------------------------------------------------------------------
  // 物理常量
  // ------------------------------------------------------------------
  const PHYSICS = {
    GRAVITY: 2600,        // px/s^2
    JUMP_VELOCITY: -900,  // px/s（负值向上）
    SHORT_JUMP_CUT: 0.45, // 提前松手时对上升速度的衰减系数
  };

  // ------------------------------------------------------------------
  // 恐龙
  // ------------------------------------------------------------------

  const DINO_STATE = { RUNNING: 'running', JUMPING: 'jumping', DUCKING: 'ducking', DEAD: 'dead' };

  class Dino {
    constructor(x, groundY) {
      this.x = x;
      this.groundY = groundY;          // 脚底所在的基线 Y
      this.baseSprite = dinoRunA;
      this.PIXEL = PIXEL;
      this.state = DINO_STATE.RUNNING;
      this.y = groundY;                // 当前脚底 Y
      this.vy = 0;
      this.frameTimer = 0;             // 跑动两帧交替计时
      this.frameIndex = 0;
    }

    /** 当前使用的精灵 */
    get sprite() {
      if (this.state === DINO_STATE.DEAD) return dinoDead;
      if (this.state === DINO_STATE.DUCKING) {
        return this.frameIndex ? dinoDuckB : dinoDuckA;
      }
      if (this.state === DINO_STATE.JUMPING) return dinoRunA;
      return this.frameIndex ? dinoRunB : dinoRunA;
    }

    get width() { return this.sprite.w * PIXEL; }
    get height() { return this.sprite.h * PIXEL; }

    /** 碰撞盒：比贴图略小，手感更宽容 */
    get hitbox() {
      const shrinkX = PIXEL * 2;
      const shrinkY = PIXEL;
      return {
        x: this.x + shrinkX,
        y: this.y - this.height + shrinkY * 2,
        w: this.width - shrinkX * 2,
        h: this.height - shrinkY * 3,
      };
    }

    /** 起跳（只有在地面上、按下蹲时松开EventListener允许） */
    jump() {
      if (this.state === DINO_STATE.JUMPING || this.state === DINO_STATE.DEAD) return false;
      this.state = DINO_STATE.JUMPING;
      this.vy = PHYSICS.JUMP_VELOCITY;
      return true;
    }

    /** 短跳：松手瞬间削减上升速度 */
    cancelJump() {
      if (this.state === DINO_STATE.JUMPING && this.vy < 0) {
        this.vy *= PHYSICS.SHORT_JUMP_CUT;
      }
    }

    /** 设置是否下蹲 */
    setDucking(isDucking) {
      if (this.state === DINO_STATE.JUMPING || this.state === DINO_STATE.DEAD) return;
      const next = isDucking ? DINO_STATE.DUCKING : DINO_STATE.RUNNING;
      if (this.state !== next) {
        this.state = next;
      }
    }

    die() {
      this.state = DINO_STATE.DEAD;
      if (this.state === DINO_STATE.JUMPING) this.vy = 0;
    }

    reset() {
      this.state = DINO_STATE.RUNNING;
      this.y = this.groundY;
      this.vy = 0;
      this.frameTimer = 0;
      this.frameIndex = 0;
    }

    update(dt, speedRatio) {
      // 跑动 / 下蹲 的帧动画
      this.frameTimer += dt;
      const frameDuration = 0.16 / Math.max(speedRatio, 0.6);
      if (this.frameTimer >= frameDuration) {
        this.frameTimer = 0;
        this.frameIndex ^= 1;
      }

      if (this.state === DINO_STATE.JUMPING) {
        this.vy += PHYSICS.GRAVITY * dt;
        this.y += this.vy * dt;
        if (this.y >= this.groundY) {
          this.y = this.groundY;
          this.vy = 0;
          this.state = DINO_STATE.RUNNING;
        }
      }
    }

    get isDucking() { return this.state === DINO_STATE.DUCKING; }
  }

  // ------------------------------------------------------------------
  // 障碍物
  // ------------------------------------------------------------------

  class Obstacle {
    /**
     * @param {'cactus'|'ptero'} type
     */
    constructor(type, x, groundY, variant) {
      this.type = type;
      this.x = x;
      this.groundY = groundY;
      this.PIXEL = PIXEL;
      this.scored = false;

      if (type === 'cactus') {
        this.sprite = variant === 'large' ? cactusLarge : cactusSmall;
        // 大型仙人掌单株出现；小型可成丛：1~3 株并排
        this.count = variant === 'large' ? 1 : (typeof variant === 'number' ? variant : 1);
        this.y = groundY;
      } else {
        this.sprite = pteroUp;
        this.frameTimer = 0;
        this.frameIndex = 0;
        // 翼龙三种飞行高度（相对地面的偏移，单位为「奔跑时恐龙身高」的比例）：
        // level 0 低空需跳过 / level 1 中空站着或蹲下均可 / level 2 高空可直接跑过
        const HEIGHT_LEVELS = [-0.05, -0.32, -0.66];
        const dinoRunHeight = 13 * PIXEL;
        this.y = groundY + HEIGHT_LEVELS[(variant || 0) % HEIGHT_LEVELS.length] * dinoRunHeight;
      }
      // 成丛仙人掌的整体宽度（相邻两株有 2 像素重叠）
      const units = this.type === 'cactus' ? this.count : 1;
      this.width = (this.sprite.w + (units - 1) * (this.sprite.w - 2)) * PIXEL;
      this.height = this.sprite.h * PIXEL;
    }

    get hitbox() {
      if (this.type === 'ptero') {
        return { x: this.x + PIXEL * 2, y: this.y - this.height + PIXEL, w: this.width - PIXEL * 4, h: this.height - PIXEL * 2 };
      }
      return {
        x: this.x + PIXEL,
        y: this.y - this.height + PIXEL,
        w: this.width - PIXEL * 2,
        h: this.height - PIXEL,
      };
    }

    update(dt, speed) {
      this.x -= speed * dt;
      if (this.type === 'ptero') {
        this.frameTimer += dt;
        if (this.frameTimer >= 0.14) {
          this.frameTimer = 0;
          this.frameIndex ^= 1;
          this.sprite = this.frameIndex ? pteroDown : pteroUp;
        }
      }
    }

    get isOffScreen() { return this.x + this.width < -20; }
  }

  // ------------------------------------------------------------------
  // 云
  // ------------------------------------------------------------------

  class Cloud {
    constructor(x, y, speedScale) {
      this.sprite = cloud;
      this.x = x;
      this.y = y;
      this.PIXEL = PIXEL;
      this.speedScale = speedScale; // 视差：远处的云飘得更慢
      this.width = this.sprite.w * PIXEL;
      this.height = this.sprite.h * PIXEL;
    }

    update(dt, speed) {
      this.x -= speed * this.speedScale * dt;
    }

    get isOffScreen() { return this.x + this.width < -20; }
  }

  // ------------------------------------------------------------------
  // 地面（程序生成的碎石点缀 + 滚动地平线）
  // ------------------------------------------------------------------

  class Ground {
    constructor(y, width, seed) {
      this.y = y;
      this.width = width;
      this.pebbles = [];
      // 用固定步长生成碎石，随橡皮筋滚动；用简单伪随机保证每次不一样但可控
      let rng = seed || 20260910;
      const rand = () => {
        rng = (rng * 1103515245 + 12345) % 2147483648;
        return rng / 2147483648;
      };
      for (let i = 0; i < 60; i++) {
        this.pebbles.push({
          x: rand() * width * 2,
          size: rand() < 0.75 ? PIXEL : PIXEL * 2,
          offset: rand() * 8,
        });
      }
    }

    update(dt, speed) {
      for (const pebble of this.pebbles) {
        pebble.x -= speed * dt;
        if (pebble.x + pebble.size < -10) {
          // 从右侧随机位置重新出现，保证分布不出现周期性空洞
          pebble.x = this.width + 20 + Math.random() * this.width;
        }
      }
    }
  }

  global.DINOEntities = {
    PIXEL,
    PHYSICS,
    DINO_STATE,
    Dino,
    Obstacle,
    Cloud,
    Ground,
    cactusLarge,
    cactusSmall,
    /** AABB 矩形相交判定 */
    aabb(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    },
  };
})(window);
