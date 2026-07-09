// Exercise Tracker — Rowboat app
// Data model:
//   workouts.json = { updatedAt, days: { "YYYY-MM-DD": { notes, exercises: [ { id, name, sets: [ { weight, reps, notes } ] } ] } } }

const DATA_FILE = '/_rowboat/data/workouts.json';
const HEADERS = { 'X-Rowboat-App': '1', 'Content-Type': 'application/json' };

const state = {
  data: { updatedAt: '', days: {} },
  currentDate: todayISO(),
  saveTimer: null,
  suppressReload: false,
};

// ---------- utils ----------
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function shiftDate(iso, delta) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}
function newId() {
  return 'ex_' + Math.random().toString(36).slice(2, 10);
}
function num(x) {
  const n = parseFloat(x);
  return Number.isFinite(n) ? n : 0;
}
function fmtDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function debounce(fn, ms) {
  return function (...args) {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ---------- API ----------
async function loadData() {
  try {
    const r = await fetch(DATA_FILE);
    if (r.ok) {
      const d = await r.json();
      if (d && typeof d === 'object') {
        state.data = { updatedAt: d.updatedAt || '', days: d.days || {} };
      }
    }
  } catch (e) {
    console.warn('loadData failed', e);
  }
}
async function saveData() {
  state.data.updatedAt = new Date().toISOString();
  state.suppressReload = true;
  try {
    await fetch(DATA_FILE, { method: 'PUT', headers: HEADERS, body: JSON.stringify(state.data) });
  } catch (e) {
    console.error('saveData failed', e);
  }
  setTimeout(() => { state.suppressReload = false; }, 500);
}
const scheduleSave = debounce(saveData, 400);

// ---------- day accessors ----------
function getDay(date) {
  if (!state.data.days[date]) {
    state.data.days[date] = { notes: '', exercises: [] };
  }
  return state.data.days[date];
}
function findLastExerciseByName(name, beforeDate) {
  const target = name.trim().toLowerCase();
  if (!target) return null;
  const dates = Object.keys(state.data.days).filter(d => d < beforeDate).sort().reverse();
  for (const d of dates) {
    const day = state.data.days[d];
    const match = (day.exercises || []).find(ex => (ex.name || '').trim().toLowerCase() === target);
    if (match && match.sets && match.sets.length) return { date: d, exercise: match };
  }
  return null;
}

// ---------- render ----------
function render() {
  document.getElementById('dateInput').value = state.currentDate;
  const day = getDay(state.currentDate);
  document.getElementById('dayNotes').value = day.notes || '';

  // summary
  const exercises = day.exercises || [];
  const totalSets = exercises.reduce((s, e) => s + (e.sets ? e.sets.length : 0), 0);
  const totalVolume = exercises.reduce((s, e) => s + (e.sets || []).reduce((ss, set) => ss + num(set.weight) * num(set.reps), 0), 0);
  document.getElementById('statExercises').textContent = exercises.length;
  document.getElementById('statSets').textContent = totalSets;
  document.getElementById('statVolume').textContent = totalVolume ? Math.round(totalVolume).toLocaleString() : '0';

  // exercises list
  const list = document.getElementById('exercisesList');
  list.innerHTML = '';
  if (!exercises.length) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint card';
    hint.textContent = 'No exercises logged yet for this day. Add one below.';
    list.appendChild(hint);
  } else {
    for (const ex of exercises) list.appendChild(renderExercise(ex));
  }

  renderHistory();
}

function renderExercise(ex) {
  const tpl = document.getElementById('exerciseTpl').content.cloneNode(true);
  const root = tpl.querySelector('.exercise');
  root.dataset.exerciseId = ex.id;
  const nameInput = root.querySelector('.exercise-name');
  nameInput.value = ex.name || '';
  nameInput.addEventListener('input', () => { ex.name = nameInput.value; scheduleSave(); });

  const body = root.querySelector('.sets-body');
  (ex.sets || []).forEach((set, i) => body.appendChild(renderSetRow(ex, set, i)));

  root.querySelector('.add-set-btn').addEventListener('click', () => {
    if (!ex.sets) ex.sets = [];
    // Prefill from last set if present
    const last = ex.sets[ex.sets.length - 1];
    const newSet = last ? { weight: last.weight, reps: last.reps, notes: '' } : { weight: '', reps: '', notes: '' };
    ex.sets.push(newSet);
    body.appendChild(renderSetRow(ex, newSet, ex.sets.length - 1));
    scheduleSave();
    updateSummary();
  });

  root.querySelector('.delete-exercise-btn').addEventListener('click', () => {
    if (!confirm(`Delete "${ex.name || 'this exercise'}"?`)) return;
    const day = getDay(state.currentDate);
    day.exercises = day.exercises.filter(e => e.id !== ex.id);
    scheduleSave();
    render();
  });

  root.querySelector('.duplicate-btn').addEventListener('click', () => {
    const last = findLastExerciseByName(ex.name, state.currentDate);
    if (!last) { alert(`No previous session found for "${ex.name}".`); return; }
    ex.sets = (last.exercise.sets || []).map(s => ({ weight: s.weight, reps: s.reps, notes: '' }));
    scheduleSave();
    render();
  });

  return root;
}

function renderSetRow(ex, set, idx) {
  const tpl = document.getElementById('setRowTpl').content.cloneNode(true);
  const tr = tpl.querySelector('.set-row');
  tr.querySelector('.set-idx').textContent = idx + 1;
  const w = tr.querySelector('.set-weight');
  const r = tr.querySelector('.set-reps');
  const n = tr.querySelector('.set-notes');
  w.value = set.weight ?? '';
  r.value = set.reps ?? '';
  n.value = set.notes ?? '';
  w.addEventListener('input', () => { set.weight = w.value; scheduleSave(); updateSummary(); });
  r.addEventListener('input', () => { set.reps = r.value; scheduleSave(); updateSummary(); });
  n.addEventListener('input', () => { set.notes = n.value; scheduleSave(); });
  tr.querySelector('.delete-set-btn').addEventListener('click', () => {
    ex.sets.splice(idx, 1);
    scheduleSave();
    render();
  });
  return tr;
}

function updateSummary() {
  const day = getDay(state.currentDate);
  const exercises = day.exercises || [];
  const totalSets = exercises.reduce((s, e) => s + (e.sets ? e.sets.length : 0), 0);
  const totalVolume = exercises.reduce((s, e) => s + (e.sets || []).reduce((ss, set) => ss + num(set.weight) * num(set.reps), 0), 0);
  document.getElementById('statExercises').textContent = exercises.length;
  document.getElementById('statSets').textContent = totalSets;
  document.getElementById('statVolume').textContent = totalVolume ? Math.round(totalVolume).toLocaleString() : '0';
}

function renderHistory() {
  const dates = Object.keys(state.data.days)
    .filter(d => d !== state.currentDate && (state.data.days[d].exercises || []).length)
    .sort()
    .reverse()
    .slice(0, 12);
  const list = document.getElementById('historyList');
  const countEl = document.getElementById('historyCount');
  list.innerHTML = '';
  if (!dates.length) {
    countEl.textContent = '';
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.style.padding = '12px 0';
    hint.textContent = 'No prior days yet.';
    list.appendChild(hint);
    return;
  }
  countEl.textContent = `${dates.length} day${dates.length === 1 ? '' : 's'}`;
  for (const d of dates) {
    const day = state.data.days[d];
    const row = document.createElement('div');
    row.className = 'history-day';
    const exN = day.exercises.length;
    const setN = day.exercises.reduce((s, e) => s + (e.sets ? e.sets.length : 0), 0);
    row.innerHTML = `<span class="hd-date">${fmtDate(d)}</span><span class="hd-summary">${exN} exercise${exN === 1 ? '' : 's'} · ${setN} set${setN === 1 ? '' : 's'}</span>`;
    row.addEventListener('click', () => { state.currentDate = d; render(); });
    list.appendChild(row);
  }
}

// ---------- events ----------
function wire() {
  document.getElementById('prevDay').addEventListener('click', () => { state.currentDate = shiftDate(state.currentDate, -1); render(); });
  document.getElementById('nextDay').addEventListener('click', () => { state.currentDate = shiftDate(state.currentDate, 1); render(); });
  document.getElementById('todayBtn').addEventListener('click', () => { state.currentDate = todayISO(); render(); });
  document.getElementById('dateInput').addEventListener('change', (e) => { state.currentDate = e.target.value || todayISO(); render(); });

  document.getElementById('dayNotes').addEventListener('input', (e) => { getDay(state.currentDate).notes = e.target.value; scheduleSave(); });

  document.getElementById('addExerciseBtn').addEventListener('click', addExercise);
  document.getElementById('newExerciseName').addEventListener('keydown', (e) => { if (e.key === 'Enter') addExercise(); });

  // theme
  fetch('/_rowboat/app').then(r => r.json()).then(info => applyTheme(info.theme || 'light')).catch(() => applyTheme('light'));
  try {
    const events = new EventSource('/_rowboat/events');
    events.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'theme') applyTheme(msg.theme);
      } catch {}
    });
  } catch {}

  // live data reload from agents / other tabs — but not from our own write
  window.addEventListener('rowboat:data-change', async (e) => {
    if (state.suppressReload) { e.preventDefault(); return; }
    e.preventDefault();
    await loadData();
    render();
  });
}

function applyTheme(t) {
  document.body.classList.toggle('theme-dark', t === 'dark');
}

function addExercise() {
  const input = document.getElementById('newExerciseName');
  const name = input.value.trim();
  if (!name) return;
  const day = getDay(state.currentDate);
  // Prefill sets from last matching session if available
  const last = findLastExerciseByName(name, state.currentDate);
  const sets = last ? (last.exercise.sets || []).map(s => ({ weight: s.weight, reps: s.reps, notes: '' })) : [{ weight: '', reps: '', notes: '' }];
  day.exercises.push({ id: newId(), name, sets });
  input.value = '';
  scheduleSave();
  render();
}

// ---------- boot ----------
(async function () {
  wire();
  await loadData();
  render();
})();
