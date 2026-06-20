(() => {
  'use strict';

  const BASE_TOPICS = Array.isArray(window.DIPLOMAEZ_TOPICS) ? window.DIPLOMAEZ_TOPICS : [];
  const VERSION = 'settings-delete-v1';
  const TOPICS_KEY = 'diplomaez_topics_' + VERSION;
  const PROGRESS_KEY = 'diplomaez_progress_' + VERSION;
  const PANEL_KEY = 'diplomaez_panel_collapsed';
  const CHARACTER_KEY = 'diplomaez_character_' + VERSION;
  const SETTINGS_KEY = 'diplomaez_settings_' + VERSION;
  const REVIEW_MS = 7 * 24 * 60 * 60 * 1000;

  let initialized = false;
  let ui = {}, started = false, logged = false, modalOpen = false, activePanel = 'stats';
  let keys = {}, nearest = null, last = 0, dpr = 1;
  let panelCollapsed = localStorage.getItem(PANEL_KEY) === 'yes';
  let topics = loadTopics();
  let progress = loadProgress();
  let character = loadCharacter();
  let settings = loadSettings();
  let faceImg = new Image();
  let faceReady = false;
  let world = { w: 3200, h: 2100 };
  let player = { x: 1550, y: 980, v: settings.speed, step: 0 };
  let camera = { x: 1550, y: 980 };
  let portals = [], grass = [];

  if (character.face) {
    faceImg.onload = () => { faceReady = true; };
    faceImg.src = character.face;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  function init() {
    if (initialized) return;
    initialized = true;

    ui.canvas = document.getElementById('gameCanvas');
    ui.ctx = ui.canvas.getContext('2d');
    ui.login = document.getElementById('loginScreen');
    ui.loginId = document.getElementById('loginId');
    ui.loginPass = document.getElementById('loginPass');
    ui.loginBtn = document.getElementById('loginButton');
    ui.loginError = document.getElementById('loginError');
    ui.hud = document.getElementById('hud');
    ui.prompt = document.getElementById('portalPrompt');
    ui.modal = document.getElementById('modal');
    ui.modalContent = document.getElementById('modalContent');
    ui.score = document.getElementById('scoreText');
    ui.progress = document.getElementById('progressText');
    ui.streak = document.getElementById('streakText');
    ui.toast = document.getElementById('toast');
    const oldSide = document.getElementById('sidePanel');
    if (oldSide) oldSide.classList.add('hidden');

    createPanel();
    buildWorld();
    resize();
    updateHud();
    renderPanel();
    draw(0);

    ui.loginBtn.onclick = login;
    ui.loginId.onkeydown = e => { if (e.key === 'Enter') ui.loginPass.focus(); };
    ui.loginPass.onkeydown = e => { if (e.key === 'Enter') login(); };
    ui.modal.onclick = e => { if (e.target === ui.modal) closeModal(); };
    ui.canvas.tabIndex = 0;
    ui.canvas.addEventListener('pointerdown', () => ui.canvas.focus());

    window.addEventListener('resize', resize);
    window.addEventListener('keydown', keyDown, { passive: false });
    window.addEventListener('keyup', keyUp, { passive: false });
    window.addEventListener('blur', () => { keys = {}; });
    setTimeout(() => ui.loginId.focus(), 100);
  }

  function normalize(list) {
    return (list || []).map(t => ({
      title: String(t.title || 'Untitled Portal'),
      questions: (t.questions || []).map(q => ({ question: String(q.question || ''), answer: String(q.answer || '') }))
    }));
  }
  function loadTopics() {
    try { const saved = JSON.parse(localStorage.getItem(TOPICS_KEY) || 'null'); if (saved && Array.isArray(saved.topics)) return saved.topics; } catch {}
    return normalize(BASE_TOPICS);
  }
  function saveTopics() { localStorage.setItem(TOPICS_KEY, JSON.stringify({ topics })); buildWorld(); updateHud(); renderPanel(); }
  function loadProgress() {
    try { const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null'); if (saved) return Object.assign(blankProgress(), saved); } catch {}
    return blankProgress();
  }
  function blankProgress() { return { score: 0, streak: 0, best: 0, done: {}, wrong: {}, reviewAt: {}, answers: {}, attempts: {}, correct: 0, total: 0 }; }
  function saveProgress() { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); }
  function loadCharacter() { try { const c = JSON.parse(localStorage.getItem(CHARACTER_KEY) || 'null'); if (c) return Object.assign({ name: 'Gabby', face: '' }, c); } catch {} return { name: 'Gabby', face: '' }; }
  function saveCharacter() { localStorage.setItem(CHARACTER_KEY, JSON.stringify(character)); renderPanel(); }
  function loadSettings() { try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); if (s) return Object.assign({ speed: 285 }, s); } catch {} return { speed: 285 }; }
  function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); player.v = Number(settings.speed) || 285; renderPanel(); }
  function qid(ti, qi) { return ti + '_' + qi; }
  function totalQuestions() { return topics.reduce((a, t) => a + t.questions.length, 0); }
  function solvedCount() { return Object.keys(progress.done).length; }
  function topicSolved(ti) { return (topics[ti]?.questions || []).filter((_, qi) => progress.done[qid(ti, qi)]).length; }
  function topicWrong(ti) { return (topics[ti]?.questions || []).filter((_, qi) => progress.wrong[qid(ti, qi)] && !progress.done[qid(ti, qi)]).length; }
  function topicAvailable(ti) { const now = Date.now(); return (topics[ti]?.questions || []).filter((_, qi) => { const id = qid(ti, qi); return !progress.done[id] && (!progress.reviewAt[id] || progress.reviewAt[id] <= now); }).length; }
  function stats() { const now = Date.now(); const wrong = Object.keys(progress.wrong).filter(id => !progress.done[id]).length; const scheduled = Object.keys(progress.reviewAt).filter(id => !progress.done[id] && progress.reviewAt[id] > now).length; const due = Object.keys(progress.reviewAt).filter(id => !progress.done[id] && progress.reviewAt[id] <= now).length; const attempts = Object.keys(progress.attempts).length; const accuracy = progress.total ? Math.round(progress.correct / progress.total * 100) : 0; return { wrong, scheduled, due, attempts, accuracy, solved: solvedCount(), total: totalQuestions() }; }

  function login() {
    const id = ui.loginId.value.trim().toLowerCase();
    const pass = ui.loginPass.value.trim();
    if (id === 'gabby' && pass === '1234') {
      logged = true;
      ui.login.classList.add('hidden');
      ui.hud.classList.remove('hidden');
      ui.panel.classList.remove('hidden');
      ui.loginId.blur(); ui.loginPass.blur(); document.body.focus();
      toast('Welcome, ' + character.name + '.');
      if (!started) { started = true; requestAnimationFrame(loop); }
    } else ui.loginError.textContent = 'Wrong ID or password.';
  }

  function createPanel() {
    const panel = document.createElement('aside');
    panel.id = 'commandPanel';
    panel.className = 'command-panel hidden' + (panelCollapsed ? ' collapsed' : '');
    panel.innerHTML = `<div class="panel-brand"><div class="brand-mark">D</div><strong class="brand-title">DiplomaEZ</strong><button id="collapsePanelBtn" class="icon-btn">⇤</button></div><nav class="panel-nav"><button class="nav-item active" data-panel="stats" data-tooltip="Stats"><span class="nav-icon">◎</span><span class="nav-text">Player stats</span></button><button class="nav-item" data-panel="portals" data-tooltip="Portals"><span class="nav-icon">▦</span><span class="nav-text">Portals</span></button><button class="nav-item" data-panel="character" data-tooltip="Character"><span class="nav-icon">☻</span><span class="nav-text">Custom character</span></button><button class="nav-item" data-panel="settings" data-tooltip="Settings"><span class="nav-icon">⚙</span><span class="nav-text">Settings</span></button><button class="nav-item" data-panel="help" data-tooltip="Help"><span class="nav-icon">?</span><span class="nav-text">Help</span></button></nav><div class="panel-divider"></div><div id="panelBody" class="panel-body"></div>`;
    document.body.appendChild(panel);
    ui.panel = panel;
    ui.panelBody = panel.querySelector('#panelBody');
    panel.querySelector('#collapsePanelBtn').onclick = () => { panelCollapsed = !panelCollapsed; localStorage.setItem(PANEL_KEY, panelCollapsed ? 'yes' : 'no'); panel.classList.toggle('collapsed', panelCollapsed); };
    panel.querySelectorAll('.nav-item').forEach(b => b.onclick = () => { activePanel = b.dataset.panel; renderPanel(); });
  }
  function renderPanel() {
    if (!ui.panel) return;
    ui.panel.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.panel === activePanel));
    if (activePanel === 'stats') renderStatsPanel();
    if (activePanel === 'portals') renderPortalsPanel();
    if (activePanel === 'character') renderCharacterPanel();
    if (activePanel === 'settings') renderSettingsPanel();
    if (activePanel === 'help') renderHelpPanel();
  }
  function renderStatsPanel() { const s = stats(); ui.panelBody.innerHTML = `<div class="panel-section-title">Player overview</div><div class="stat-grid"><div class="stat-card"><span>Name</span><strong>${esc(character.name)}</strong></div><div class="stat-card"><span>Score</span><strong>${progress.score}</strong></div><div class="stat-card"><span>Solved</span><strong>${s.solved}/${s.total}</strong></div><div class="stat-card"><span>Streak</span><strong>${progress.streak}</strong></div><div class="stat-card"><span>Best</span><strong>${progress.best || 0}</strong></div><div class="stat-card"><span>Wrong</span><strong>${s.wrong}</strong></div><div class="stat-card"><span>7-day review</span><strong>${s.scheduled}</strong></div><div class="stat-card"><span>Accuracy</span><strong>${s.accuracy}%</strong></div></div><button class="panel-action" id="openStatsBtn">Open detailed stats</button>`; document.getElementById('openStatsBtn').onclick = openStats; }
  function renderPortalsPanel() {
    ui.panelBody.innerHTML = `<div class="panel-topline"><div class="panel-section-title">Portals</div><button class="mini-btn" id="addPortalBtn">+ Portal</button></div><div id="portalEditorList" class="portal-editor-list"></div><button class="panel-action danger-action" id="resetQuestionsBtn">Reset edited portals</button>`;
    document.getElementById('addPortalBtn').onclick = addPortal;
    document.getElementById('resetQuestionsBtn').onclick = resetTopics;
    const list = document.getElementById('portalEditorList');
    topics.forEach((t, ti) => {
      const d = document.createElement('details');
      d.className = 'portal-details';
      d.innerHTML = `<summary><span><strong>${esc(t.title)}</strong><small>${t.questions.length} questions • ${topicSolved(ti)} solved • ${topicWrong(ti)} wrong</small></span><span class="summary-caret">⌄</span></summary><div class="portal-tools"><button class="mini-btn" data-a="editp">Edit portal</button><button class="mini-btn" data-a="addq">+ Question</button><button class="mini-btn" data-a="play">Play</button><button class="mini-btn danger-mini" data-a="deletep">Delete</button></div><div class="question-list"></div>`;
      d.querySelector('[data-a="editp"]').onclick = () => editPortal(ti);
      d.querySelector('[data-a="addq"]').onclick = () => editQuestion(ti, -1);
      d.querySelector('[data-a="play"]').onclick = () => openPortal(ti);
      d.querySelector('[data-a="deletep"]').onclick = () => deletePortal(ti);
      const ql = d.querySelector('.question-list');
      t.questions.forEach((q, qi) => { const b = document.createElement('button'); b.className = 'question-row'; b.innerHTML = `<span>${qi + 1}. ${esc(short(q.question || 'Empty question', 58))}</span><em>${status(qid(ti, qi))}</em>`; b.onclick = () => editQuestion(ti, qi); ql.appendChild(b); });
      list.appendChild(d);
    });
  }
  function renderCharacterPanel() { ui.panelBody.innerHTML = `<div class="panel-section-title">Custom character</div><div class="character-preview"><div class="face-preview">${character.face ? `<img src="${character.face}" alt="Face preview">` : `<span>${esc((character.name || 'G')[0].toUpperCase())}</span>`}</div><div><strong>${esc(character.name)}</strong><p class="muted small-copy">This photo is used as the character face and is saved only in this browser.</p></div></div><label>Character name</label><input id="characterNameInput" value="${esc(character.name)}" placeholder="Gabby"><button class="panel-action" id="saveNameBtn">Save name</button><label>Upload face photo</label><input id="faceUploadInput" type="file" accept="image/*"><button class="panel-action danger-action" id="resetCharacterBtn">Reset character</button>`; document.getElementById('saveNameBtn').onclick = () => { const n = document.getElementById('characterNameInput').value.trim(); if (!n) return toast('Name is required.'); character.name = n; saveCharacter(); updateHud(); toast('Character name saved.'); }; document.getElementById('faceUploadInput').onchange = e => handleFaceUpload(e.target.files && e.target.files[0]); document.getElementById('resetCharacterBtn').onclick = () => { character = { name: 'Gabby', face: '' }; faceReady = false; faceImg = new Image(); saveCharacter(); toast('Character reset.'); }; }
  function renderSettingsPanel() { ui.panelBody.innerHTML = `<div class="panel-section-title">Settings</div><div class="settings-block"><label>Movement speed</label><div class="speed-value"><strong id="speedNumber">${settings.speed}</strong><span> px/sec</span></div><input id="speedSlider" type="range" min="120" max="650" step="10" value="${settings.speed}"><p class="muted small-copy">Lower = slower movement, higher = faster WASD movement.</p></div><button class="panel-action" id="saveSpeedBtn">Save speed</button><button class="panel-action danger-action" id="resetSpeedBtn">Reset speed</button>`; const slider = document.getElementById('speedSlider'); const number = document.getElementById('speedNumber'); slider.oninput = () => { number.textContent = slider.value; player.v = Number(slider.value); }; document.getElementById('saveSpeedBtn').onclick = () => { settings.speed = Number(slider.value); saveSettings(); toast('Movement speed saved.'); }; document.getElementById('resetSpeedBtn').onclick = () => { settings.speed = 285; saveSettings(); toast('Movement speed reset.'); }; }
  function renderHelpPanel() { ui.panelBody.innerHTML = `<div class="panel-section-title">Controls</div><div class="help-line"><b>WASD / arrows</b><span>Move around map</span></div><div class="help-line"><b>E / Enter</b><span>Enter nearest portal</span></div><div class="help-line"><b>T</b><span>Statistics</span></div><div class="help-line"><b>H</b><span>Help</span></div><div class="panel-section-title spaced">Settings</div><p class="muted small-copy">Open Settings to change the WASD movement speed.</p><div class="panel-section-title spaced">Custom character</div><p class="muted small-copy">Open Custom character to upload a face photo and change the name.</p>`; }
  function handleFaceUpload(file) { if (!file || !file.type.startsWith('image/')) return toast('Please upload an image file.'); const reader = new FileReader(); reader.onload = () => { const img = new Image(); img.onload = () => { const size = 256; const cnv = document.createElement('canvas'); cnv.width = size; cnv.height = size; const c = cnv.getContext('2d'); const side = Math.min(img.width, img.height); const sx = (img.width - side) / 2; const sy = (img.height - side) / 2; c.drawImage(img, sx, sy, side, side, 0, 0, size, size); character.face = cnv.toDataURL('image/jpeg', 0.82); faceImg = new Image(); faceReady = false; faceImg.onload = () => { faceReady = true; }; faceImg.src = character.face; saveCharacter(); toast('Face photo saved.'); }; img.src = reader.result; }; reader.readAsDataURL(file); }

  function status(id) { const now = Date.now(); if (progress.done[id]) return 'Done'; if (progress.reviewAt[id] > now) return 'Review ' + inTime(progress.reviewAt[id] - now); if (progress.reviewAt[id] && progress.reviewAt[id] <= now) return 'Due'; if (progress.wrong[id]) return 'Wrong'; return 'Ready'; }
  function addPortal() { showModal(`<h2>Add New Portal</h2><label>Portal name</label><input id="portalTitleInput" placeholder="New topic"><button class="btn primary" data-a="save">Create Portal</button><button class="btn secondary" data-a="cancel">Cancel</button>`); ui.modalContent.querySelector('[data-a="save"]').onclick = () => { const title = document.getElementById('portalTitleInput').value.trim(); if (!title) return toast('Portal name is required.'); topics.push({ title, questions: [] }); clearProgressAfterEdit(); saveTopics(); closeModal(); activePanel = 'portals'; renderPanel(); toast('Portal added.'); }; ui.modalContent.querySelector('[data-a="cancel"]').onclick = closeModal; }
  function editPortal(ti) { const t = topics[ti]; showModal(`<h2>Edit Portal</h2><label>Portal name</label><input id="portalTitleInput" value="${esc(t.title)}"><button class="btn primary" data-a="save">Save Portal</button><button class="btn secondary" data-a="cancel">Cancel</button>`); ui.modalContent.querySelector('[data-a="save"]').onclick = () => { const title = document.getElementById('portalTitleInput').value.trim(); if (!title) return toast('Portal name is required.'); t.title = title; saveTopics(); closeModal(); renderPanel(); toast('Portal saved.'); }; ui.modalContent.querySelector('[data-a="cancel"]').onclick = closeModal; }
  function editQuestion(ti, qi) { const isNew = qi < 0, t = topics[ti], q = isNew ? { question: '', answer: '' } : t.questions[qi]; showModal(`<h2>${isNew ? 'Add Question' : 'Edit Question'}</h2><p class="muted">Portal: ${esc(t.title)}</p><label>Question</label><textarea id="questionEdit">${esc(q.question)}</textarea><label>Correct answer</label><textarea id="answerEdit">${esc(q.answer)}</textarea><button class="btn primary" data-a="save">${isNew ? 'Add Question' : 'Save Question'}</button>${isNew ? '' : '<button class="btn danger" data-a="deleteq">Delete question</button>'}<button class="btn secondary" data-a="cancel">Cancel</button>`); ui.modalContent.querySelector('[data-a="save"]').onclick = () => { const nq = document.getElementById('questionEdit').value.trim(), na = document.getElementById('answerEdit').value.trim(); if (!nq) return toast('Question text is required.'); if (isNew) t.questions.push({ question: nq, answer: na }); else { q.question = nq; q.answer = na; } clearProgressAfterEdit(); saveTopics(); closeModal(); renderPanel(); toast(isNew ? 'Question added.' : 'Question saved.'); }; const del = ui.modalContent.querySelector('[data-a="deleteq"]'); if (del) del.onclick = () => deleteQuestion(ti, qi); ui.modalContent.querySelector('[data-a="cancel"]').onclick = closeModal; }
  function deletePortal(ti) { if (!confirm('Delete this portal and all its questions? Progress will be reset to prevent broken question IDs.')) return; topics.splice(ti, 1); clearProgressAfterEdit(); saveTopics(); renderPanel(); toast('Portal deleted.'); }
  function deleteQuestion(ti, qi) { if (!confirm('Delete this question? Progress will be reset to prevent broken question IDs.')) return; topics[ti].questions.splice(qi, 1); clearProgressAfterEdit(); saveTopics(); closeModal(); renderPanel(); toast('Question deleted.'); }
  function clearProgressAfterEdit() { progress = blankProgress(); saveProgress(); updateHud(); }
  function resetTopics() { if (!confirm('Reset all edited portals/questions to the original uploaded pack? This also resets progress.')) return; localStorage.removeItem(TOPICS_KEY); topics = normalize(BASE_TOPICS); clearProgressAfterEdit(); saveTopics(); renderPanel(); toast('Questions reset.'); }

  function keyDown(e) { const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase(); const typing = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable; if (!typing) { keys[e.key.toLowerCase()] = true; keys[e.code] = true; } if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code) && !typing) e.preventDefault(); if (e.key === 'Escape' && modalOpen) return closeModal(); if (!logged || modalOpen || typing) return; const k = e.key.toLowerCase(); if ((k === 'e' || k === 'enter') && nearest) { e.preventDefault(); openPortal(nearest.index); } if (k === 't') openStats(); if (k === 'h') openHelp(); }
  function keyUp(e) { keys[e.key.toLowerCase()] = false; keys[e.code] = false; }
  function buildWorld() { const cols = 5, gx = 560, gy = 370, rows = Math.ceil(Math.max(1, topics.length) / cols); world.w = Math.max(3200, 360 + (cols - 1) * gx + 420); world.h = Math.max(2100, 340 + (rows - 1) * gy + 500); const colors = ['#8eff87', '#ffa7eb', '#82efff', '#ffe27f', '#c59cff', '#ffb089', '#77fff3', '#a2b7ff', '#ff92bd']; portals = topics.map((t, i) => ({ index: i, title: t.title, x: 330 + (i % cols) * gx, y: 300 + Math.floor(i / cols) * gy, color: colors[i % colors.length] })); let seed = 24681357; const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); grass = []; for (let i = 0; i < 350; i++) grass.push({ x: 130 + rand() * (world.w - 260), y: 130 + rand() * (world.h - 260), h: 12 + rand() * 30, p: rand() * 7, c: rand() > .22 ? '#7cee72' : '#dd7d86' }); }
  function updateHud() { const s = stats(); ui.score.textContent = 'Score ' + progress.score; ui.progress.textContent = `Solved ${s.solved}/${s.total} • Review ${s.scheduled}`; ui.streak.textContent = 'Streak ' + progress.streak; }
  function resize() { dpr = Math.min(devicePixelRatio || 1, 1.5); ui.canvas.width = innerWidth * dpr; ui.canvas.height = innerHeight * dpr; ui.canvas.style.width = innerWidth + 'px'; ui.canvas.style.height = innerHeight + 'px'; }
  function loop(ts) { const dt = Math.min(.033, (ts - last) / 1000 || .016); last = ts; update(dt); draw(ts / 1000); requestAnimationFrame(loop); }
  function update(dt) { if (!logged || modalOpen) return; let dx = 0, dy = 0; if (keys.w || keys.KeyW || keys.arrowup || keys.ArrowUp) dy--; if (keys.s || keys.KeyS || keys.arrowdown || keys.ArrowDown) dy++; if (keys.a || keys.KeyA || keys.arrowleft || keys.ArrowLeft) dx--; if (keys.d || keys.KeyD || keys.arrowright || keys.ArrowRight) dx++; const l = Math.hypot(dx, dy) || 1; if (dx || dy) { player.x = clamp(player.x + dx / l * player.v * dt, 120, world.w - 120); player.y = clamp(player.y + dy / l * player.v * dt, 120, world.h - 120); player.step += dt * 9; } camera.x += (player.x - camera.x) * .09; camera.y += (player.y - camera.y) * .09; let best = Infinity; nearest = null; portals.forEach(p => { const dist = Math.hypot(p.x - player.x, p.y - player.y); if (dist < best) { best = dist; nearest = p; } }); if (nearest && best < 132) { ui.prompt.textContent = 'Press E / Enter to enter ' + nearest.title; ui.prompt.classList.remove('hidden'); } else { nearest = null; ui.prompt.classList.add('hidden'); } }
  function draw(t) { const c = ui.ctx; c.clearRect(0, 0, ui.canvas.width, ui.canvas.height); const bg = c.createLinearGradient(0, 0, 0, ui.canvas.height); bg.addColorStop(0, '#88c816'); bg.addColorStop(.55, '#3f641a'); bg.addColorStop(1, '#13230e'); c.fillStyle = bg; c.fillRect(0, 0, ui.canvas.width, ui.canvas.height); c.save(); c.scale(dpr, dpr); c.translate(-(camera.x - innerWidth / 2), -(camera.y - innerHeight / 2)); drawMap(c); grass.forEach(g => { const sw = Math.sin(t * 1.5 + g.p) * 4; c.strokeStyle = g.c; c.lineWidth = 3; c.beginPath(); c.moveTo(g.x, g.y + g.h * .45); c.quadraticCurveTo(g.x + sw, g.y, g.x, g.y - g.h); c.stroke(); }); portals.forEach(p => drawPortal(c, p, t)); drawPlayer(c, t); c.restore(); }
  function drawMap(c) { round(c, 80, 80, world.w - 160, world.h - 160, 52, '#6f8b42', '#91a66d', 4); c.strokeStyle = 'rgba(0,0,0,.18)'; for (let x = 110; x < world.w - 110; x += 50) { c.beginPath(); c.moveTo(x, 110); c.lineTo(x, world.h - 110); c.stroke(); } for (let y = 110; y < world.h - 110; y += 50) { c.beginPath(); c.moveTo(110, y); c.lineTo(world.w - 110, y); c.stroke(); } }
  function drawPortal(c, p, t) { const done = topics[p.index] && topics[p.index].questions.length && topicSolved(p.index) === topics[p.index].questions.length, col = done ? '#ffe680' : p.color; c.fillStyle = 'rgba(0,0,0,.30)'; c.beginPath(); c.ellipse(p.x, p.y + 18, 76, 24, 0, 0, 7); c.fill(); const g = c.createRadialGradient(p.x, p.y, 6, p.x, p.y, 92); g.addColorStop(0, rgba(col, .65)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, 86 + Math.sin(t * 2 + p.index) * 5, 0, 7); c.fill(); c.strokeStyle = '#dacb9b'; c.lineWidth = 6; c.beginPath(); c.ellipse(p.x, p.y, 58, 18, 0, 0, 7); c.stroke(); c.strokeStyle = col; c.lineWidth = 4; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(p.x, p.y, 45 + i * 8 + Math.sin(t * 2.5 + i) * 2, 12 + i * 4, 0, 0, 7); c.stroke(); } round(c, p.x - 44, p.y - 36, 12, 54, 6, '#7f8b72'); round(c, p.x + 32, p.y - 36, 12, 54, 6, '#7f8b72'); c.font = '700 15px system-ui'; const label = short(p.title, 28), w = c.measureText(label).width; round(c, p.x - w / 2 - 14, p.y - 78, w + 28, 28, 14, 'rgba(8,12,10,.86)', 'rgba(255,255,255,.1)', 1); c.textAlign = 'center'; c.fillStyle = '#f8ffd8'; c.fillText(label, p.x, p.y - 58); if (done) { c.font = '900 24px system-ui'; c.fillText('✓', p.x, p.y + 5); } }
  function drawPlayer(c, t) { c.save(); c.translate(player.x, player.y + Math.sin(player.step || t) * 2); c.fillStyle = 'rgba(0,0,0,.34)'; c.beginPath(); c.ellipse(0, 36, 35, 14, 0, 0, 7); c.fill(); c.strokeStyle = '#442f1c'; c.lineWidth = 5; c.beginPath(); c.moveTo(18, 0); c.lineTo(45, 30); c.stroke(); c.fillStyle = '#9cff8e'; c.beginPath(); c.arc(47, 31, 8, 0, 7); c.fill(); c.fillStyle = '#ff8f71'; c.beginPath(); c.moveTo(0, -5); c.lineTo(31, 36); c.lineTo(-31, 36); c.closePath(); c.fill(); c.fillStyle = '#5f3aa0'; c.beginPath(); c.moveTo(-12, -58); c.lineTo(4, -94); c.lineTo(21, -54); c.quadraticCurveTo(6, -62, -12, -58); c.fill(); c.save(); c.beginPath(); c.arc(0, -28, 34, 0, 7); c.clip(); if (faceReady) c.drawImage(faceImg, -34, -62, 68, 68); else { c.fillStyle = '#eadcc5'; c.fillRect(-34, -62, 68, 68); c.fillStyle = '#2d241e'; c.font = '900 24px system-ui'; c.textAlign = 'center'; c.fillText((character.name || 'G')[0].toUpperCase(), 0, -20); } c.restore(); c.strokeStyle = '#eadcc5'; c.lineWidth = 3; c.beginPath(); c.arc(0, -28, 34, 0, 7); c.stroke(); c.restore(); }

  function openPortal(ti) { const t = topics[ti]; showModal(`<h2>${esc(t.title)}</h2><p class="muted">Correct questions disappear, or can be scheduled to appear again after 7 days.</p><div class="chips"><span class="chip">${topicSolved(ti)}/${t.questions.length} solved</span><span class="chip">${topicWrong(ti)} wrong</span><span class="chip">${topicAvailable(ti)} available now</span></div><div class="qbox">Choose a random mission from this topic.</div><button class="btn primary" data-a="random">Start Random Question</button><button class="btn secondary" data-a="wrong">Practice Wrong Questions</button><button class="btn secondary" data-a="manage">Open in Portals Panel</button><button class="btn secondary" data-a="close">Close</button>`); ui.modalContent.querySelector('[data-a="random"]').onclick = () => startQuestion(ti, false); ui.modalContent.querySelector('[data-a="wrong"]').onclick = () => startQuestion(ti, true); ui.modalContent.querySelector('[data-a="manage"]').onclick = () => { closeModal(); activePanel = 'portals'; renderPanel(); if (panelCollapsed) ui.panel.querySelector('#collapsePanelBtn').click(); }; ui.modalContent.querySelector('[data-a="close"]').onclick = closeModal; }
  function chooseQuestion(ti, wrongOnly) { const now = Date.now(); let pool = topics[ti].questions.map((q, qi) => ({ q, qi, id: qid(ti, qi) })).filter(o => !progress.done[o.id] && (!progress.reviewAt[o.id] || progress.reviewAt[o.id] <= now)); if (wrongOnly) pool = pool.filter(o => progress.wrong[o.id]); if (!pool.length) return null; const fresh = pool.filter(o => !progress.wrong[o.id] && !progress.reviewAt[o.id]), missed = pool.filter(o => progress.wrong[o.id] || progress.reviewAt[o.id]); return !wrongOnly && fresh.length && missed.length ? (Math.random() < .7 ? pick(fresh) : pick(missed)) : pick(pool); }
  function startQuestion(ti, wrongOnly) { const sel = chooseQuestion(ti, wrongOnly), t = topics[ti]; if (!sel) { showModal(`<h2>${esc(t.title)}</h2><p class="muted">${wrongOnly ? 'No wrong questions in this topic right now.' : 'No available questions right now. Some questions may be scheduled for 7-day review.'}</p><button class="btn primary" data-a="back">Back to Portal</button><button class="btn secondary" data-a="close">Close</button>`); ui.modalContent.querySelector('[data-a="back"]').onclick = () => openPortal(ti); ui.modalContent.querySelector('[data-a="close"]').onclick = closeModal; return; } showQuestion(ti, sel, wrongOnly); }
  function showQuestion(ti, sel, wrongOnly) { const t = topics[ti], saved = progress.answers[sel.id] || ''; showModal(`<h2>${esc(t.title)}</h2><div class="chips"><span class="chip">${wrongOnly ? 'Wrong practice' : 'Random mission'}</span><span class="chip">Question ${sel.qi + 1}/${t.questions.length}</span><span class="chip">${status(sel.id)}</span></div><div class="qbox"><b>Question</b><br><br>${esc(sel.q.question)}</div><label>Your answer</label><textarea id="answerInput">${esc(saved)}</textarea><button class="btn primary" data-a="submit">Submit Answer</button><button class="btn secondary" data-a="editq">Edit this question</button><button class="btn secondary" data-a="back">Back to Portal</button>`); ui.modalContent.querySelector('[data-a="submit"]').onclick = () => reviewAnswer(ti, sel, wrongOnly); ui.modalContent.querySelector('[data-a="editq"]').onclick = () => editQuestion(ti, sel.qi); ui.modalContent.querySelector('[data-a="back"]').onclick = () => openPortal(ti); document.getElementById('answerInput').focus(); }
  function reviewAnswer(ti, sel, wrongOnly) { const ans = document.getElementById('answerInput').value.trim(), correct = sel.q.answer || 'No official answer has been added for this question yet.'; progress.answers[sel.id] = ans; saveProgress(); showModal(`<h2>Review Your Answer</h2><div class="answer"><b>Question:</b>\n${esc(sel.q.question)}</div><div class="answer"><b>Your answer:</b>\n${esc(ans || '(empty)')}</div><div class="answer"><b>Correct answer:</b>\n${esc(correct)}</div><button class="btn primary" data-a="yes">Yes, it was correct</button><button class="btn secondary" data-a="review7">Correct, show again after 7 days</button><button class="btn danger" data-a="no">No, it was not</button><button class="btn secondary" data-a="edit">Back and Edit</button>`); ui.modalContent.querySelector('[data-a="yes"]').onclick = () => finishQuestion(ti, sel, wrongOnly, 'done'); ui.modalContent.querySelector('[data-a="review7"]').onclick = () => finishQuestion(ti, sel, wrongOnly, 'review7'); ui.modalContent.querySelector('[data-a="no"]').onclick = () => finishQuestion(ti, sel, wrongOnly, 'wrong'); ui.modalContent.querySelector('[data-a="edit"]').onclick = () => showQuestion(ti, sel, wrongOnly); }
  function finishQuestion(ti, sel, wrongOnly, res) { const id = sel.id; progress.attempts[id] = (progress.attempts[id] || 0) + 1; progress.total = (progress.total || 0) + 1; if (res === 'done' || res === 'review7') { delete progress.wrong[id]; if (res === 'done') { progress.done[id] = true; delete progress.reviewAt[id]; } else { delete progress.done[id]; progress.reviewAt[id] = Date.now() + REVIEW_MS; } progress.score += wrongOnly ? 8 : 10; progress.streak++; progress.correct = (progress.correct || 0) + 1; progress.best = Math.max(progress.best || 0, progress.streak); } else { delete progress.done[id]; delete progress.reviewAt[id]; progress.wrong[id] = true; progress.streak = 0; } saveProgress(); updateHud(); renderPanel(); const msg = res === 'done' ? 'This question will not appear again.' : res === 'review7' ? 'This question will appear again after 7 days.' : 'This question can appear again later.'; showModal(`<h2>${res === 'wrong' ? 'Returned to Pool' : 'Saved as Correct'}</h2><p class="muted">${msg}</p><div class="chips"><span class="chip">Remaining in topic: ${topics[ti].questions.length - topicSolved(ti)}</span><span class="chip">Score: ${progress.score}</span><span class="chip">Streak: ${progress.streak}</span></div><button class="btn primary" data-a="next">Next Question</button><button class="btn secondary" data-a="portal">Back to Portal</button><button class="btn secondary" data-a="close">Close</button>`); ui.modalContent.querySelector('[data-a="next"]').onclick = () => startQuestion(ti, wrongOnly); ui.modalContent.querySelector('[data-a="portal"]').onclick = () => openPortal(ti); ui.modalContent.querySelector('[data-a="close"]').onclick = closeModal; }
  function openStats() { const s = stats(); showModal(`<h2>Player Statistics</h2><div class="stat-grid modal-stats"><div class="stat-card"><span>Name</span><strong>${esc(character.name)}</strong></div><div class="stat-card"><span>Speed</span><strong>${settings.speed}</strong></div><div class="stat-card"><span>Score</span><strong>${progress.score}</strong></div><div class="stat-card"><span>Solved</span><strong>${s.solved}/${s.total}</strong></div><div class="stat-card"><span>Wrong queue</span><strong>${s.wrong}</strong></div><div class="stat-card"><span>7-day review</span><strong>${s.scheduled}</strong></div><div class="stat-card"><span>Due now</span><strong>${s.due}</strong></div><div class="stat-card"><span>Accuracy</span><strong>${s.accuracy}%</strong></div></div><button class="btn danger" data-a="reset">Reset Progress</button><button class="btn secondary" data-a="logout">Logout</button><button class="btn primary" data-a="close">Close</button>`); ui.modalContent.querySelector('[data-a="reset"]').onclick = resetProgress; ui.modalContent.querySelector('[data-a="logout"]').onclick = logout; ui.modalContent.querySelector('[data-a="close"]').onclick = closeModal; }
  function openHelp() { showModal(`<h2>How to Play</h2><div class="qbox"><p>Login with <b>Gabby</b> / <b>1234</b>.</p><p>Move with <b>WASD</b> or arrows. Stand near a portal and press <b>E</b> or <b>Enter</b>.</p><p>Use the left panel to see stats, edit/delete portals/questions, add portals, add questions, customize character, and change movement speed.</p></div><button class="btn primary" data-a="close">Got it</button>`); ui.modalContent.querySelector('[data-a="close"]').onclick = closeModal; }
  function resetProgress() { if (!confirm('Reset all DiplomaEZ progress?')) return; localStorage.removeItem(PROGRESS_KEY); progress = loadProgress(); updateHud(); renderPanel(); closeModal(); toast('Progress reset.'); }
  function logout() { logged = false; modalOpen = false; keys = {}; ui.modal.classList.add('hidden'); ui.hud.classList.add('hidden'); ui.panel.classList.add('hidden'); ui.prompt.classList.add('hidden'); ui.loginPass.value = ''; ui.login.classList.remove('hidden'); setTimeout(() => ui.loginId.focus(), 100); }
  function showModal(html) { modalOpen = true; keys = {}; ui.modalContent.innerHTML = html; ui.modal.classList.remove('hidden'); }
  function closeModal() { modalOpen = false; keys = {}; ui.modal.classList.add('hidden'); ui.modalContent.innerHTML = ''; if (logged) ui.canvas.focus(); }
  let toastTimer = 0; function toast(txt) { ui.toast.textContent = txt; ui.toast.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.add('hidden'), 2200); }
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function short(t, n) { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; }
  function inTime(ms) { const d = Math.ceil(ms / 86400000); if (d > 1) return 'in ' + d + 'd'; if (d === 1) return 'tomorrow'; return 'in ' + Math.max(1, Math.ceil(ms / 3600000)) + 'h'; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function rgba(hex, a) { const v = parseInt(String(hex).replace('#', ''), 16); return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`; }
  function round(c, x, y, w, h, r, f, s, lw) { c.save(); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); if (f) { c.fillStyle = f; c.fill(); } if (s) { c.strokeStyle = s; c.lineWidth = lw || 1; c.stroke(); } c.restore(); }
})();