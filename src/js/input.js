/**
 * input.js — 输入层（Input）
 *
 * 把键盘 / 鼠标 / 触摸事件翻译成语义化的游戏动作回调。
 * 游戏逻辑不直接监听 DOM 事件，只消费这里发出的动作。
 */

(function (global) {
  'use strict';

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{
   *   onJumpStart:Function, onJumpCancel:Function, onDuck:Function,
   *   onPause:Function, onRestart:Function, onToggleSound:Function,
   *   onStart:Function, isOver:Function, isIdle:Function, isPaused:Function
   * }} handlers
   */
  function bindInput(canvas, handlers) {
    const KEY_JUMP = new Set(['Space', 'ArrowUp', 'KeyW']);
    const KEY_DUCK = new Set(['ArrowDown', 'KeyS']);
    const KEY_PAUSE = new Set(['KeyP', 'Escape']);
    const KEY_RESTART = new Set(['Enter', 'KeyR']);
    const KEY_SOUND = new Set(['KeyM']);

    let ducking = false;

    const setDuck = (value) => {
      if (ducking === value) return;
      ducking = value;
      handlers.onDuck(value);
    };

    window.addEventListener('keydown', (event) => {
      const code = event.code;
      if (KEY_JUMP.has(code) || KEY_DUCK.has(code)) event.preventDefault();

      if (handlers.isIdle() || handlers.isOver()) {
        // 待开始 / 结束后：跳跃键 = 开始新一局；方向键无效
        if (KEY_JUMP.has(code)) { handlers.onStart(); handlers.onJumpStart(); }
        else if (KEY_RESTART.has(code)) handlers.onRestart();
        else if (KEY_SOUND.has(code)) handlers.onToggleSound();
        return;
      }

      if (KEY_PAUSE.has(code)) { handlers.onPause(); return; }
      if (KEY_SOUND.has(code)) { handlers.onToggleSound(); return; }
      if (KEY_JUMP.has(code) && !event.repeat) handlers.onJumpStart();
      if (KEY_DUCK.has(code)) setDuck(true);
    });

    window.addEventListener('keyup', (event) => {
      if (KEY_JUMP.has(event.code)) handlers.onJumpCancel();
      if (KEY_DUCK.has(event.code)) setDuck(false);
    });

    // 鼠标 / 触摸：点在重开按钮上则重开，否则视为跳跃 / 开始
    const pointerHandler = (event) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const point = event.touches && event.touches.length ? event.touches[0] : event;
      const x = (point.clientX - rect.left) * scaleX;
      const y = (point.clientY - rect.top) * scaleY;

      if (handlers.isOver()) {
        const hitRestart = handlers.getRestartButton(x, y);
        if (hitRestart) { handlers.onRestart(); return; }
        handlers.onRestart();
        return;
      }
      if (handlers.isIdle()) { handlers.onStart(); handlers.onJumpStart(); return; }
      if (handlers.isPaused()) { handlers.onPause(); return; }
      handlers.onJumpStart();
    };

    canvas.addEventListener('mousedown', pointerHandler);
    canvas.addEventListener('touchstart', (event) => {
      event.preventDefault();
      pointerHandler(event);
    }, { passive: false });

    window.addEventListener('touchmove', (event) => { event.preventDefault(); }, { passive: false });

    // 窗口失焦时自动取消蹲下状态，避免状态残留
    window.addEventListener('blur', () => setDuck(false));
  }

  global.DINOInput = { bindInput };
})(window);
