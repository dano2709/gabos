(function () {
  'use strict';

  const LOGIN_ID = 'gabby';
  const LOGIN_PASS = '1234';
  const STORAGE_KEY = 'diplomaez_progress_all_questions_v1';
  const TOPICS = Array.isArray(window.DIPLOMAEZ_TOPICS) ? window.DIPLOMAEZ_TOPICS : [];

  const ui = {};
  const state = {
    loggedIn: false,
    modalOpen: false,
    started: false,
    keys: {},
    dpr: 1,
    world: { w: 3000, h: 1900 },
    player: { x: 1500, y: 950, speed: 280, step: 0 },
    camera: { x: 1500, y: 950 },
    nearest: null,
    last: 0,
    portals: [],
    grass: [],
    progress: loadProgress()
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    ui.canvas = document.getElementById('gameCanvas');
    ui.ctx = ui.canvas.getContext('2d');

    ui.loginScreen = document.getElementById('loginScreen');
    ui.loginId = document.getElementById('loginId');
    ui.loginPass = document.getElementById('loginPass');
    ui.loginButton = document.getElementById('loginButton');
    ui.loginError = document.getElementById('loginError');

    ui.hud = document.getElementById('hud');
    ui.sidePanel = document.getElementById('sidePanel');
    ui.topicList = document.getElementById('topicList');
    ui.portalPrompt = document.getElementById('portalPrompt');

    ui.modal = document.getElementById('modal');
    ui.modalContent = document.getElementById('modalContent');

    ui.scoreText = document.getElementById('scoreText');
    ui.progressText = document.getElementById('progressText');
    ui.streakText = document.getElementById('streakText');
    ui.toast = document.getElementById('toast');

    buildWorld();
    resize();
    updateHud();
    renderTopicList();
    draw(0);

    ui.loginButton.addEventListener('click', doLogin);
    ui.loginId.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') ui.loginPass.focus();
    });
    ui.loginPass.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') doLogin();
    });

    ui.modal.addEventListener('click', (event) => {
      if (event.target === ui.modal) closeModal();
    });

    window.addEventListener('resize', resize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', (event) => {
      state.keys[event.key.toLowerCase()] = false;
    });

    if (!TOPICS.length) {
      ui.loginError.textContent = 'Questions could not be loaded. Check questions.js.';
      ui.loginButton.disabled = true;
    }

    setTimeout(() => ui.loginId.focus(), 100);
  }

  function doLogin() {
    const id = ui.loginId.value.trim().toLowerCase();
    const pass = ui.loginPass.value.trim();

    if (id === LOGIN_ID && pass === LOGIN_PASS) {
      state.loggedIn = true;
      ui.loginError.textContent = '';
      ui.loginScreen.classList.add('hidden');
      ui.hud.classList.remove('hidden');
      ui.sidePanel.classList.remove('hidden');
      toast('Welcome, Gabby.');

      if (!state.started) {
        state.started = true;
        requestAnimationFrame(loop);
      }
      return;
    }

    ui.loginError.textContent = 'Wrong ID or password.';
  }

  function onKeyDown(event) {
    state.keys[event.key.toLowerCase()] = true;

    if (event.key === 'Escape' && state.modalOpen) {
      closeModal();
      return;
    }

    if (!state.loggedIn || state.modalOpen) return;

    const key = event.key.toLowerCase();
    if (key === 'e' && state.nearest) openPortal(state.nearest.index);
    if (key === 't') openStats();
    if (key === 'h') openHelp();
  }

  function buildWorld() {
    const columns = 5;
    const horizontalGap = 540;
    const verticalGap = 360;
    const colors = ['#8eff87', '#ffa7eb', '#82efff', '#ffe27f', '#c59cff', '#ffb089', '#77fff3', '#a2b7ff', '#ff92bd'];

    state.portals = TOPICS.map((topic, index) => ({
      index,
      title: topic.title,
      x: 310 + (index % columns) * horizontalGap,
      y: 280 + Math.floor(index / columns) * verticalGap,
      color: colors[index % colors.length]
    }));

    let seed = 24681357;
    function rand() {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    }

    state.grass = [];
    for (let i = 0; i < 320; i++) {
      state.grass.push({
        x: 130 + rand() * (state.world.w - 260),
        y: 130 + rand() * (state.world.h - 260),
        h: 12 + rand() * 30,
        phase: rand() * Math.PI * 2,
        color: rand() > 0.22 ? '#7cee72' : '#dd7d86'
      });
    }
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (error) {
      console.warn('Could not load progress:', error);
    }

    return {
      score: 0,
      streak: 0,
      bestStreak: 0,
      done: {},
      wrong: {},
      answers: {},
      attempts: {}
    };
  }

  function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
  }

  function qid(topicIndex, questionIndex) {
    return `${topicIndex}_${questionIndex}`;
  }

  function totalQuestions() {
    return TOPICS.reduce((sum, topic) => sum + topic.questions.length, 0);
  }

  function solvedCount() {
    return Object.keys(state.progress.done).length;
  }

  function topicSolved(topicIndex) {
    return TOPICS[topicIndex].questions.filter((_, questionIndex) => state.progress.done[qid(topicIndex, questionIndex)]).length;
  }

  function topicWrong(topicIndex) {
    return TOPICS[topicIndex].questions.filter((_, questionIndex) => {
      const id = qid(topicIndex, questionIndex);
      return state.progress.wrong[id] && !state.progress.done[id];
    }).length;
  }

  function updateHud() {
    ui.scoreText.textContent = `Score ${state.progress.score}`;
    ui.progressText.textContent = `Solved ${solvedCount()}/${totalQuestions()}`;
    ui.streakText.textContent = `Streak ${state.progress.streak}`;
  }

  function renderTopicList() {
    ui.topicList.innerHTML = '';

    TOPICS.forEach((topic, index) => {
      const solved = topicSolved(index);
      const row = document.createElement('div');
      row.className = 'topic-row';

      const left = document.createElement('div');
      left.innerHTML = `<strong>${escapeHtml(topic.title)}</strong><div class="muted">${topic.questions.length} questions</div>`;

      const right = document.createElement('span');
      right.className = 'pill' + (solved === topic.questions.length ? ' done' : '');
      right.textContent = solved === topic.questions.length ? 'Cleared' : `${topic.questions.length - solved} left`;

      row.appendChild(left);
      row.appendChild(right);
      ui.topicList.appendChild(row);
    });
  }

  function resize() {
    state.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    ui.canvas.width = Math.floor(window.innerWidth * state.dpr);
    ui.canvas.height = Math.floor(window.innerHeight * state.dpr);
    ui.canvas.style.width = `${window.innerWidth}px`;
    ui.canvas.style.height = `${window.innerHeight}px`;
  }

  function loop(timestamp) {
    const dt = Math.min(0.033, (timestamp - state.last) / 1000 || 0.016);
    state.last = timestamp;

    update(dt);
    draw(timestamp / 1000);
    requestAnimationFrame(loop);
  }

  function update(dt) {
    if (!state.loggedIn || state.modalOpen) return;

    let dx = 0;
    let dy = 0;

    if (state.keys.w || state.keys.arrowup) dy -= 1;
    if (state.keys.s || state.keys.arrowdown) dy += 1;
    if (state.keys.a || state.keys.arrowleft) dx -= 1;
    if (state.keys.d || state.keys.arrowright) dx += 1;

    const length = Math.hypot(dx, dy) || 1;
    if (dx || dy) {
      state.player.x = clamp(state.player.x + dx / length * state.player.speed * dt, 120, state.world.w - 120);
      state.player.y = clamp(state.player.y + dy / length * state.player.speed * dt, 120, state.world.h - 120);
      state.player.step += dt * 9;
    }

    state.camera.x += (state.player.x - state.camera.x) * 0.09;
    state.camera.y += (state.player.y - state.camera.y) * 0.09;

    let nearest = null;
    let bestDistance = Infinity;

    state.portals.forEach((portal) => {
      const distance = Math.hypot(portal.x - state.player.x, portal.y - state.player.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = portal;
      }
    });

    if (nearest && bestDistance < 132) {
      state.nearest = nearest;
      ui.portalPrompt.textContent = `Press E to enter ${nearest.title}`;
      ui.portalPrompt.classList.remove('hidden');
    } else {
      state.nearest = null;
      ui.portalPrompt.classList.add('hidden');
    }
  }

  function draw(time) {
    const ctx = ui.ctx;
    const dpr = state.dpr;
    const width = ui.canvas.width;
    const height = ui.canvas.height;

    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#88c816');
    bg.addColorStop(0.55, '#3f641a');
    bg.addColorStop(1, '#13230e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(-(state.camera.x - window.innerWidth / 2), -(state.camera.y - window.innerHeight / 2));

    drawMap(ctx);
    drawGrass(ctx, time);
    state.portals.forEach((portal) => drawPortal(ctx, portal, time));
    drawPlayer(ctx, time);

    ctx.restore();
  }

  function drawMap(ctx) {
    rounded(ctx, 80, 80, state.world.w - 160, state.world.h - 160, 52, '#6f8b42', '#91a66d', 4);

    ctx.strokeStyle = 'rgba(0,0,0,.18)';
    ctx.lineWidth = 1;

    for (let x = 110; x < state.world.w - 110; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 110);
      ctx.lineTo(x, state.world.h - 110);
      ctx.stroke();
    }

    for (let y = 110; y < state.world.h - 110; y += 50) {
      ctx.beginPath();
      ctx.moveTo(110, y);
      ctx.lineTo(state.world.w - 110, y);
      ctx.stroke();
    }

    const glow = ctx.createRadialGradient(1500, 950, 20, 1500, 950, 170);
    glow.addColorStop(0, 'rgba(205,255,120,.55)');
    glow.addColorStop(1, 'rgba(205,255,120,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(1500, 950, 170, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGrass(ctx, time) {
    state.grass.forEach((grass) => {
      const sway = Math.sin(time * 1.5 + grass.phase) * 4;
      ctx.strokeStyle = grass.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(grass.x, grass.y + grass.h * 0.45);
      ctx.quadraticCurveTo(grass.x + sway, grass.y, grass.x, grass.y - grass.h);
      ctx.stroke();
    });
  }

  function drawPortal(ctx, portal, time) {
    const done = topicSolved(portal.index) === TOPICS[portal.index].questions.length;
    const color = done ? '#ffe680' : portal.color;

    ctx.fillStyle = 'rgba(0,0,0,.30)';
    ctx.beginPath();
    ctx.ellipse(portal.x, portal.y + 18, 76, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    const glow = ctx.createRadialGradient(portal.x, portal.y, 6, portal.x, portal.y, 92);
    glow.addColorStop(0, hexToRgba(color, 0.65));
    glow.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(portal.x, portal.y, 86 + Math.sin(time * 2 + portal.index) * 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#dacb9b';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(portal.x, portal.y, 58, 18, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(portal.x, portal.y, 45 + i * 8 + Math.sin(time * 2.5 + i) * 2, 12 + i * 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    rounded(ctx, portal.x - 44, portal.y - 36, 12, 54, 6, '#7f8b72');
    rounded(ctx, portal.x + 32, portal.y - 36, 12, 54, 6, '#7f8b72');

    ctx.font = '700 15px system-ui';
    const label = shorten(portal.title, 28);
    const textWidth = ctx.measureText(label).width;
    rounded(ctx, portal.x - textWidth / 2 - 14, portal.y - 78, textWidth + 28, 28, 14, 'rgba(8,12,10,.86)', 'rgba(255,255,255,.1)', 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8ffd8';
    ctx.fillText(label, portal.x, portal.y - 58);

    if (done) {
      ctx.font = '900 24px system-ui';
      ctx.fillText('✓', portal.x, portal.y + 5);
    }
  }

  function drawPlayer(ctx, time) {
    const bob = Math.sin(state.player.step || time) * 2;
    ctx.save();
    ctx.translate(state.player.x, state.player.y + bob);

    ctx.fillStyle = 'rgba(0,0,0,.34)';
    ctx.beginPath();
    ctx.ellipse(0, 36, 35, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#442f1c';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(45, 30);
    ctx.stroke();

    ctx.fillStyle = '#9cff8e';
    ctx.beginPath();
    ctx.arc(47, 31, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ff8f71';
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(31, 36);
    ctx.lineTo(-31, 36);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#5f3aa0';
    ctx.beginPath();
    ctx.moveTo(-12, -58);
    ctx.lineTo(4, -94);
    ctx.lineTo(21, -54);
    ctx.quadraticCurveTo(6, -62, -12, -58);
    ctx.fill();

    ctx.fillStyle = '#eadcc5';
    ctx.beginPath();
    ctx.arc(0, -28, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2d241e';
    ctx.font = '900 24px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('G', 0, -20);

    ctx.restore();
  }

  function openPortal(topicIndex) {
    const topic = TOPICS[topicIndex];
    const solved = topicSolved(topicIndex);
    const wrong = topicWrong(topicIndex);

    showModal(`
      <h2>${escapeHtml(topic.title)}</h2>
      <p class="muted">Correct questions disappear. Wrong questions return to the random pool.</p>
      <div class="chips">
        <span class="chip">${solved}/${topic.questions.length} solved</span>
        <span class="chip">${wrong} wrong</span>
        <span class="chip">${topic.questions.length} total</span>
      </div>
      <div class="qbox">Choose a random mission from this topic.</div>
      <button class="btn primary" data-action="random">Start Random Question</button>
      <button class="btn secondary" data-action="wrong">Practice Wrong Questions</button>
      <button class="btn secondary" data-action="close">Close</button>
    `);

    ui.modalContent.querySelector('[data-action="random"]').onclick = () => startQuestion(topicIndex, false);
    ui.modalContent.querySelector('[data-action="wrong"]').onclick = () => startQuestion(topicIndex, true);
    ui.modalContent.querySelector('[data-action="close"]').onclick = closeModal;
  }

  function chooseQuestion(topicIndex, wrongOnly) {
    let pool = TOPICS[topicIndex].questions
      .map((question, questionIndex) => ({
        questionIndex,
        question,
        id: qid(topicIndex, questionIndex)
      }))
      .filter((item) => !state.progress.done[item.id]);

    if (wrongOnly) {
      pool = pool.filter((item) => state.progress.wrong[item.id]);
    }

    if (!pool.length) return null;

    const fresh = pool.filter((item) => !state.progress.wrong[item.id]);
    const missed = pool.filter((item) => state.progress.wrong[item.id]);

    if (!wrongOnly && fresh.length && missed.length) {
      return Math.random() < 0.7 ? pick(fresh) : pick(missed);
    }

    return pick(pool);
  }

  function startQuestion(topicIndex, wrongOnly) {
    const selected = chooseQuestion(topicIndex, wrongOnly);
    const topic = TOPICS[topicIndex];

    if (!selected) {
      showModal(`
        <h2>${escapeHtml(topic.title)}</h2>
        <p class="muted">${wrongOnly ? 'No wrong questions in this topic right now.' : 'This topic is fully cleared.'}</p>
        <button class="btn primary" data-action="back">Back to Portal</button>
        <button class="btn secondary" data-action="close">Close</button>
      `);

      ui.modalContent.querySelector('[data-action="back"]').onclick = () => openPortal(topicIndex);
      ui.modalContent.querySelector('[data-action="close"]').onclick = closeModal;
      return;
    }

    showQuestion(topicIndex, selected, wrongOnly);
  }

  function showQuestion(topicIndex, selected, wrongOnly) {
    const topic = TOPICS[topicIndex];
    const savedAnswer = state.progress.answers[selected.id] || '';

    showModal(`
      <h2>${escapeHtml(topic.title)}</h2>
      <div class="chips">
        <span class="chip">${wrongOnly ? 'Wrong practice' : 'Random mission'}</span>
        <span class="chip">Question ${selected.questionIndex + 1}/${topic.questions.length}</span>
      </div>
      <div class="qbox"><b>Question</b><br><br>${escapeHtml(selected.question.question)}</div>
      <label for="answerInput">Your answer</label>
      <textarea id="answerInput" placeholder="Type your answer here...">${escapeHtml(savedAnswer)}</textarea>
      <button class="btn primary" data-action="submit">Submit Answer</button>
      <button class="btn secondary" data-action="back">Back to Portal</button>
    `);

    ui.modalContent.querySelector('[data-action="submit"]').onclick = () => reviewAnswer(topicIndex, selected, wrongOnly);
    ui.modalContent.querySelector('[data-action="back"]').onclick = () => openPortal(topicIndex);
    document.getElementById('answerInput').focus();
  }

  function reviewAnswer(topicIndex, selected, wrongOnly) {
    const answer = document.getElementById('answerInput').value.trim();
    const correctAnswer = selected.question.answer || 'No official answer has been added for this question yet.';

    state.progress.answers[selected.id] = answer;
    saveProgress();

    showModal(`
      <h2>Review Your Answer</h2>
      <div class="answer"><b>Question:</b>\n${escapeHtml(selected.question.question)}</div>
      <div class="answer"><b>Your answer:</b>\n${escapeHtml(answer || '(empty)')}</div>
      <div class="answer"><b>Correct answer:</b>\n${escapeHtml(correctAnswer)}</div>
      <button class="btn primary" data-action="yes">Yes, it was correct</button>
      <button class="btn danger" data-action="no">No, it was not</button>
      <button class="btn secondary" data-action="edit">Back and Edit</button>
    `);

    ui.modalContent.querySelector('[data-action="yes"]').onclick = () => finishQuestion(topicIndex, selected, wrongOnly, true);
    ui.modalContent.querySelector('[data-action="no"]').onclick = () => finishQuestion(topicIndex, selected, wrongOnly, false);
    ui.modalContent.querySelector('[data-action="edit"]').onclick = () => showQuestion(topicIndex, selected, wrongOnly);
  }

  function finishQuestion(topicIndex, selected, wrongOnly, correct) {
    const id = selected.id;
    state.progress.attempts[id] = (state.progress.attempts[id] || 0) + 1;

    if (correct) {
      state.progress.done[id] = true;
      delete state.progress.wrong[id];
      state.progress.score += wrongOnly ? 8 : 10;
      state.progress.streak += 1;
      state.progress.bestStreak = Math.max(state.progress.bestStreak || 0, state.progress.streak);
    } else {
      state.progress.wrong[id] = true;
      state.progress.streak = 0;
    }

    saveProgress();
    updateHud();
    renderTopicList();

    const remaining = TOPICS[topicIndex].questions.length - topicSolved(topicIndex);

    showModal(`
      <h2>${correct ? 'Saved as Correct' : 'Returned to Pool'}</h2>
      <p class="muted">${correct ? 'This question will not appear again.' : 'This question can appear again later.'}</p>
      <div class="chips">
        <span class="chip">Remaining in topic: ${remaining}</span>
        <span class="chip">Score: ${state.progress.score}</span>
        <span class="chip">Streak: ${state.progress.streak}</span>
      </div>
      <button class="btn primary" data-action="next">Next Question</button>
      <button class="btn secondary" data-action="portal">Back to Portal</button>
      <button class="btn secondary" data-action="close">Close</button>
    `);

    ui.modalContent.querySelector('[data-action="next"]').onclick = () => startQuestion(topicIndex, wrongOnly);
    ui.modalContent.querySelector('[data-action="portal"]').onclick = () => openPortal(topicIndex);
    ui.modalContent.querySelector('[data-action="close"]').onclick = closeModal;
  }

  function openStats() {
    const wrongCount = Object.keys(state.progress.wrong).filter((id) => !state.progress.done[id]).length;

    showModal(`
      <h2>Progress</h2>
      <div class="chips">
        <span class="chip">Score: ${state.progress.score}</span>
        <span class="chip">Solved: ${solvedCount()}/${totalQuestions()}</span>
        <span class="chip">Wrong queue: ${wrongCount}</span>
        <span class="chip">Best streak: ${state.progress.bestStreak || 0}</span>
      </div>
      <button class="btn danger" data-action="reset">Reset Progress</button>
      <button class="btn secondary" data-action="logout">Logout</button>
      <button class="btn primary" data-action="close">Close</button>
    `);

    ui.modalContent.querySelector('[data-action="reset"]').onclick = resetProgress;
    ui.modalContent.querySelector('[data-action="logout"]').onclick = logout;
    ui.modalContent.querySelector('[data-action="close"]').onclick = closeModal;
  }

  function openHelp() {
    showModal(`
      <h2>How to Play</h2>
      <div class="qbox">
        <p>Login with <b>Gabby</b> / <b>1234</b>.</p>
        <p>Move with <b>WASD</b> or arrow keys. Stand near a portal and press <b>E</b>.</p>
        <p>Each portal is one topic. Correct questions disappear. Wrong questions return to the random pool.</p>
      </div>
      <button class="btn primary" data-action="close">Got it</button>
    `);

    ui.modalContent.querySelector('[data-action="close"]').onclick = closeModal;
  }

  function resetProgress() {
    if (!confirm('Reset all DiplomaEZ progress?')) return;

    localStorage.removeItem(STORAGE_KEY);
    state.progress = loadProgress();
    updateHud();
    renderTopicList();
    closeModal();
    toast('Progress reset.');
  }

  function logout() {
    state.loggedIn = false;
    state.modalOpen = false;
    ui.modal.classList.add('hidden');
    ui.hud.classList.add('hidden');
    ui.sidePanel.classList.add('hidden');
    ui.portalPrompt.classList.add('hidden');
    ui.loginPass.value = '';
    ui.loginScreen.classList.remove('hidden');
    setTimeout(() => ui.loginId.focus(), 100);
  }

  function showModal(html) {
    state.modalOpen = true;
    ui.modalContent.innerHTML = html;
    ui.modal.classList.remove('hidden');
  }

  function closeModal() {
    state.modalOpen = false;
    ui.modal.classList.add('hidden');
    ui.modalContent.innerHTML = '';
  }

  let toastTimer = 0;
  function toast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.add('hidden'), 2200);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function clamp(number, min, max) {
    return Math.max(min, Math.min(max, number));
  }

  function pick(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  function shorten(text, limit) {
    return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
  }

  function hexToRgba(hex, alpha) {
    const clean = hex.replace('#', '');
    const value = parseInt(clean, 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }

  function rounded(ctx, x, y, width, height, radius, fill, stroke, lineWidth) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();

    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }

    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 1;
      ctx.stroke();
    }

    ctx.restore();
  }
})();
