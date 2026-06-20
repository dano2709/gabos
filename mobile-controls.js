(() => {
  'use strict';

  const MODE_KEY = 'diplomaez_input_mode_v1';
  let mode = localStorage.getItem(MODE_KEY) || 'computer';
  let activeKeys = new Set();
  let joystickPointer = null;
  let dragPointer = null;
  let dragStart = null;
  let currentVector = { x: 0, y: 0 };
  let controls, joystick, knob, actionBtn;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  function init() {
    injectVersionChooser();
    createControls();
    applyMode(mode);
  }

  function injectVersionChooser() {
    const card = document.querySelector('.login-card');
    const firstLabel = document.querySelector('label[for="loginId"]');
    if (!card || !firstLabel || document.getElementById('versionChoice')) return;

    const box = document.createElement('div');
    box.id = 'versionChoice';
    box.className = 'version-choice';
    box.innerHTML = `
      <div class="version-choice-title">Choose version</div>
      <div class="version-buttons">
        <button type="button" class="version-btn" data-mode="computer">Computer version</button>
        <button type="button" class="version-btn" data-mode="mobile">Mobile version</button>
      </div>
      <p class="version-note" id="versionNote"></p>
    `;
    card.insertBefore(box, firstLabel);

    box.querySelectorAll('.version-btn').forEach(btn => {
      btn.addEventListener('click', () => applyMode(btn.dataset.mode));
    });
  }

  function createControls() {
    if (document.getElementById('mobileControls')) return;
    controls = document.createElement('div');
    controls.id = 'mobileControls';
    controls.className = 'mobile-controls';
    controls.innerHTML = `
      <div id="mobileJoystick" class="mobile-joystick"><div id="mobileKnob" class="mobile-knob"></div></div>
      <button id="mobileEnterBtn" class="mobile-action-btn" type="button">Enter</button>
      <div class="mobile-touch-hint">Drag anywhere to move • Joystick also works</div>
    `;
    document.body.appendChild(controls);
    joystick = document.getElementById('mobileJoystick');
    knob = document.getElementById('mobileKnob');
    actionBtn = document.getElementById('mobileEnterBtn');

    joystick.addEventListener('pointerdown', startJoystick);
    window.addEventListener('pointermove', movePointer, { passive: false });
    window.addEventListener('pointerup', endPointer, { passive: false });
    window.addEventListener('pointercancel', endPointer, { passive: false });

    const canvas = document.getElementById('gameCanvas');
    if (canvas) canvas.addEventListener('pointerdown', startDragMove, { passive: false });

    actionBtn.addEventListener('pointerdown', e => {
      e.preventDefault();
      dispatchKey('Enter', 'Enter', 'down');
      setTimeout(() => dispatchKey('Enter', 'Enter', 'up'), 80);
    });
  }

  function applyMode(nextMode) {
    mode = nextMode === 'mobile' ? 'mobile' : 'computer';
    localStorage.setItem(MODE_KEY, mode);
    document.body.classList.toggle('mobile-mode', mode === 'mobile');
    stopAllKeys();

    document.querySelectorAll('.version-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const note = document.getElementById('versionNote');
    if (note) {
      note.textContent = mode === 'mobile'
        ? 'Mobile version: use the joystick, drag with your finger, and tap Enter near a portal.'
        : 'Computer version: use WASD / arrows and E or Enter on your keyboard.';
    }
  }

  function isMobileMode() {
    return mode === 'mobile';
  }

  function gameReadyForTouch() {
    const loginVisible = !document.getElementById('loginScreen')?.classList.contains('hidden');
    const modalVisible = !document.getElementById('modal')?.classList.contains('hidden');
    return isMobileMode() && !loginVisible && !modalVisible;
  }

  function startJoystick(event) {
    if (!gameReadyForTouch()) return;
    event.preventDefault();
    joystickPointer = event.pointerId;
    joystick.setPointerCapture?.(event.pointerId);
    updateJoystick(event.clientX, event.clientY);
  }

  function startDragMove(event) {
    if (!gameReadyForTouch()) return;
    if (event.target.closest && event.target.closest('#mobileControls')) return;
    event.preventDefault();
    dragPointer = event.pointerId;
    dragStart = { x: event.clientX, y: event.clientY };
    currentVector = { x: 0, y: 0 };
  }

  function movePointer(event) {
    if (!isMobileMode()) return;
    if (event.pointerId === joystickPointer) {
      event.preventDefault();
      updateJoystick(event.clientX, event.clientY);
    } else if (event.pointerId === dragPointer && dragStart) {
      event.preventDefault();
      const dx = event.clientX - dragStart.x;
      const dy = event.clientY - dragStart.y;
      applyVector(dx, dy, 38);
    }
  }

  function endPointer(event) {
    if (event.pointerId === joystickPointer) {
      joystickPointer = null;
      resetKnob();
      stopAllKeys();
    }
    if (event.pointerId === dragPointer) {
      dragPointer = null;
      dragStart = null;
      stopAllKeys();
    }
  }

  function updateJoystick(clientX, clientY) {
    const rect = joystick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const max = rect.width * 0.31;
    const len = Math.hypot(dx, dy) || 1;
    const limitedX = len > max ? dx / len * max : dx;
    const limitedY = len > max ? dy / len * max : dy;
    knob.style.transform = `translate(${limitedX}px, ${limitedY}px)`;
    applyVector(dx, dy, 18);
  }

  function resetKnob() {
    if (knob) knob.style.transform = 'translate(0, 0)';
  }

  function applyVector(dx, dy, deadzone) {
    const next = new Set();
    if (Math.abs(dx) > deadzone) next.add(dx > 0 ? 'KeyD' : 'KeyA');
    if (Math.abs(dy) > deadzone) next.add(dy > 0 ? 'KeyS' : 'KeyW');
    setActiveMovement(next);
  }

  function setActiveMovement(next) {
    const all = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
    for (const code of all) {
      if (next.has(code) && !activeKeys.has(code)) {
        activeKeys.add(code);
        dispatchKey(keyFromCode(code), code, 'down');
      }
      if (!next.has(code) && activeKeys.has(code)) {
        activeKeys.delete(code);
        dispatchKey(keyFromCode(code), code, 'up');
      }
    }
  }

  function stopAllKeys() {
    for (const code of Array.from(activeKeys)) {
      dispatchKey(keyFromCode(code), code, 'up');
    }
    activeKeys.clear();
    resetKnob();
  }

  function dispatchKey(key, code, phase) {
    const eventName = phase === 'down' ? 'keydown' : 'keyup';
    const ev = new KeyboardEvent(eventName, {
      key,
      code,
      bubbles: true,
      cancelable: true
    });
    window.dispatchEvent(ev);
  }

  function keyFromCode(code) {
    return ({ KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd' })[code] || code;
  }
})();
