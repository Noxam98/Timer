'use strict';

(() => {
  /* =========================================================
   * Утилиты
   * ========================================================= */
  const $ = (sel) => document.querySelector(sel);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const pad2 = (v) => String(v).padStart(2, '0');

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children) if (c != null) el.append(c);
    return el;
  }

  function plural(n, forms) {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
    return forms[2];
  }

  function hexToRgb(hex) {
    let s = String(hex || '').replace('#', '');
    if (s.length === 3) s = s.split('').map((c) => c + c).join('');
    const n = parseInt(s, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbStr = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const BLACK = [0, 0, 0];

  function storageGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим и т.п. */ }
  }

  function mulberry32(seed) {
    let a = seed | 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const newSeed = () => (Math.random() * 2 ** 31) | 0;

  /* Прямоугольник со скруглением — работает и для контекста, и для Path2D. */
  function addRR(p, x, y, w, hh, r) {
    if (r <= 0.5) { p.rect(x, y, w, hh); return; }
    r = Math.min(r, w / 2, hh / 2);
    p.moveTo(x + r, y);
    p.arcTo(x + w, y, x + w, y + hh, r);
    p.arcTo(x + w, y + hh, x, y + hh, r);
    p.arcTo(x, y + hh, x, y, r);
    p.arcTo(x, y, x + w, y, r);
    p.closePath();
  }

  /* =========================================================
   * Константы и настройки
   * ========================================================= */
  const SKEY = 'fs-timer:settings:v1';
  const TKEY = 'fs-timer:state:v1';
  const MAX_TILES = 20000;
  const BUCKETS = 48;
  const MAX_DURATION = 99 * 3600 + 59 * 60 + 59;
  const DEMO_MS = 5000;

  const ORDERS = [
    ['reading', 'Построчно: слева направо, сверху вниз'],
    ['bottomup', 'Построчно снизу вверх'],
    ['columns', 'По столбцам слева направо'],
    ['snake', 'Змейкой'],
    ['diagonal', 'По диагонали'],
    ['clock', 'По часовой стрелке, как циферблат'],
    ['spiral-in', 'Спираль: от краёв к центру'],
    ['spiral-out', 'Спираль: из центра наружу'],
    ['center-out', 'Кругами: из центра к краям'],
    ['edges-in', 'Кругами: от краёв к центру'],
    ['curtain', 'Шторки: с боков к середине'],
    ['random', 'В случайном порядке'],
  ];

  const EFFECTS = [
    ['fade', 'Затухание'],
    ['darken', 'Затемнение до чёрного'],
    ['shrink', 'Сжатие'],
    ['spin', 'Вращение со сжатием'],
    ['flip', 'Переворот'],
    ['fall', 'Падение вниз за экран'],
    ['rise', 'Улёт вверх за экран'],
    ['scatter', 'Разлёт в стороны'],
  ];

  const POSITIONS = [
    ['center', 'По центру'],
    ['top', 'Сверху'],
    ['bottom', 'Снизу'],
    ['top-left', 'Слева сверху'],
    ['top-right', 'Справа сверху'],
    ['bottom-left', 'Слева снизу'],
    ['bottom-right', 'Справа снизу'],
  ];

  const FORMATS = [
    ['auto', 'Авто: ММ:СС, с часами — Ч:ММ:СС'],
    ['hms', 'Ч:ММ:СС'],
    ['ms', 'ММ:СС (минуты без часов)'],
    ['s', 'Только секунды'],
    ['percent', 'Проценты'],
    ['tiles', 'Сколько элементов осталось'],
  ];

  const UNITS = [
    [1, '1 секунде'], [5, '5 секундам'], [10, '10 секундам'], [15, '15 секундам'],
    [30, '30 секундам'], [60, '1 минуте'], [120, '2 минутам'], [300, '5 минутам'],
    [600, '10 минутам'], [900, '15 минутам'], [1800, '30 минутам'], [3600, '1 часу'],
  ];

  const PRESETS = [1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60, 90];

  const THEMES = [
    { name: 'Ночь', bg: '#0b0d12', color: '#4ade80', color2: '#22d3ee', ghostColor: '#ffffff', warnColor: '#facc15', critColor: '#ef4444', clockColor: '#ffffff' },
    { name: 'День', bg: '#f4f4ef', color: '#16a34a', color2: '#2563eb', ghostColor: '#000000', warnColor: '#d97706', critColor: '#dc2626', clockColor: '#111827' },
    { name: 'Океан', bg: '#03152b', color: '#38bdf8', color2: '#818cf8', ghostColor: '#7dd3fc', warnColor: '#fbbf24', critColor: '#f43f5e', clockColor: '#e0f2fe' },
    { name: 'Закат', bg: '#1c0a12', color: '#fb923c', color2: '#f43f5e', ghostColor: '#fda4af', warnColor: '#fde047', critColor: '#e11d48', clockColor: '#fff1f2' },
    { name: 'Неон', bg: '#000000', color: '#e879f9', color2: '#22d3ee', ghostColor: '#e879f9', warnColor: '#fde047', critColor: '#ff2d55', clockColor: '#ffffff' },
    { name: 'Графит', bg: '#111111', color: '#e5e5e5', color2: '#737373', ghostColor: '#ffffff', warnColor: '#a3a3a3', critColor: '#ef4444', clockColor: '#ffffff' },
  ];
  const THEME_KEYS = ['bg', 'color', 'color2', 'ghostColor', 'warnColor', 'critColor', 'clockColor'];

  const DEFAULTS = {
    duration: 300,
    // элементы
    sizeMode: 'size', tileSize: 64, tileCount: 60, unitSec: 60,
    gap: 4, radius: 22,
    // порядок
    order: 'reading', reverse: false, fillMode: false,
    // эффект
    effect: 'fade', transition: 'smooth', softness: 3, stepAnim: 700,
    // цвета
    bg: '#0b0d12', colorMode: 'status',
    color: '#4ade80', color2: '#22d3ee', warnColor: '#facc15', critColor: '#ef4444', ghostColor: '#ffffff',
    warnAt: 25, critAt: 10,
    // затемнение
    ghost: 7, brightness: 100, dimToEnd: 0,
    finalSecs: 10, pulse: true, tick: false,
    // цифры
    showClock: true, clockSize: 26, clockPos: 'center', clockFormat: 'auto',
    clockColor: '#ffffff', clockOpacity: 92, showEndTime: false,
    // финал
    sound: true, volume: 60, flash: true, overtime: true,
    // интерфейс
    uiScale: 100, autoHide: true,
  };

  const isStatus = (s) => s.colorMode === 'status';
  const clockOn = (s) => s.showClock;

  const SCHEMA = [
    { section: 'Элементы на экране' },
    {
      key: 'sizeMode', type: 'select', label: 'Сколько элементов',
      options: [['size', 'По размеру элемента'], ['count', 'Точное количество'], ['unit', '1 элемент = отрезок времени']],
    },
    { key: 'tileSize', type: 'range', label: 'Размер элемента', min: 10, max: 600, unit: 'px', show: (s) => s.sizeMode === 'size' },
    { key: 'tileCount', type: 'range', label: 'Количество элементов', min: 1, max: 3000, show: (s) => s.sizeMode === 'count' },
    { key: 'unitSec', type: 'select', label: 'Один элемент равен', options: UNITS, num: true, show: (s) => s.sizeMode === 'unit' },
    { key: 'gap', type: 'range', label: 'Отступ между элементами', min: 0, max: 60, unit: 'px' },
    { key: 'radius', type: 'range', label: 'Скругление (100% — круги)', min: 0, max: 100, unit: '%' },
    { type: 'info', id: 'layoutInfo' },

    { section: 'Порядок ухода с экрана' },
    { key: 'order', type: 'select', label: 'Порядок', options: ORDERS },
    { type: 'button', id: 'btnShuffle', label: 'Перемешать заново', show: (s) => s.order === 'random' },
    { key: 'reverse', type: 'check', label: 'Обратный порядок' },
    { key: 'fillMode', type: 'check', label: 'Заполнять экран вместо опустошения', hint: 'Элементы не уходят, а появляются по мере хода времени.' },

    { section: 'Как уходит элемент' },
    { key: 'effect', type: 'select', label: 'Эффект', options: EFFECTS },
    { key: 'transition', type: 'select', label: 'Ход времени', options: [['smooth', 'Плавно, непрерывно'], ['step', 'Шагами, с анимацией']] },
    {
      key: 'softness', type: 'range', label: 'Ширина фронта', min: 1, max: 100, unit: 'эл.',
      hint: 'Сколько элементов уходит одновременно — чем больше, тем мягче граница.',
      show: (s) => s.transition === 'smooth',
    },
    { key: 'stepAnim', type: 'range', label: 'Длительность анимации', min: 100, max: 5000, step: 50, unit: 'мс', show: (s) => s.transition === 'step' },

    { section: 'Цвета' },
    { type: 'themes' },
    { key: 'bg', type: 'color', label: 'Фон' },
    {
      key: 'colorMode', type: 'select', label: 'Окраска элементов',
      options: [['status', 'По оставшемуся времени'], ['gradient', 'Градиент по порядку ухода'], ['solid', 'Один цвет']],
    },
    {
      key: 'color', type: 'color',
      label: (s) => (s.colorMode === 'gradient' ? 'Цвет уходящих первыми' : s.colorMode === 'status' ? 'Цвет, пока времени много' : 'Цвет элементов'),
    },
    { key: 'color2', type: 'color', label: 'Цвет уходящих последними', show: (s) => s.colorMode === 'gradient' },
    { key: 'warnColor', type: 'color', label: 'Цвет «мало времени»', show: isStatus },
    { key: 'warnAt', type: 'range', label: '«Мало времени», когда осталось', min: 0, max: 100, unit: '%', show: isStatus },
    { key: 'critColor', type: 'color', label: 'Цвет «почти всё» и сигнала' },
    { key: 'critAt', type: 'range', label: '«Почти всё», когда осталось', min: 0, max: 100, unit: '%', show: isStatus },
    { key: 'ghostColor', type: 'color', label: 'Цвет следа ушедших' },

    { section: 'Затемнение' },
    { key: 'ghost', type: 'range', label: 'След ушедших элементов', min: 0, max: 100, unit: '%', hint: '0% — ушедшие элементы исчезают полностью.' },
    { key: 'brightness', type: 'range', label: 'Яркость элементов', min: 5, max: 100, unit: '%' },
    { key: 'dimToEnd', type: 'range', label: 'Затемнение экрана к концу', min: 0, max: 100, unit: '%', hint: 'Экран постепенно темнеет по мере хода времени. Цифры не затемняются.' },
    { key: 'finalSecs', type: 'range', label: 'Финальный отсчёт', min: 0, max: 120, unit: 'с' },
    { key: 'pulse', type: 'check', label: 'Пульсация в финальном отсчёте', show: (s) => s.finalSecs > 0 },
    { key: 'tick', type: 'check', label: 'Тиканье в финальном отсчёте', show: (s) => s.finalSecs > 0 },

    { section: 'Цифры' },
    { key: 'showClock', type: 'check', label: 'Показывать цифры' },
    { key: 'clockSize', type: 'range', label: 'Размер цифр (от высоты экрана)', min: 3, max: 100, unit: '%', show: clockOn },
    { key: 'clockPos', type: 'select', label: 'Положение', options: POSITIONS, show: clockOn },
    { key: 'clockFormat', type: 'select', label: 'Формат', options: FORMATS, show: clockOn },
    { key: 'clockColor', type: 'color', label: 'Цвет цифр', show: clockOn },
    { key: 'clockOpacity', type: 'range', label: 'Непрозрачность цифр', min: 5, max: 100, unit: '%', show: clockOn },
    { key: 'showEndTime', type: 'check', label: 'Показывать время окончания', show: clockOn },

    { section: 'Когда время вышло' },
    { key: 'sound', type: 'check', label: 'Звуковой сигнал' },
    { key: 'volume', type: 'range', label: 'Громкость', min: 0, max: 100, unit: '%', show: (s) => s.sound || s.tick },
    { type: 'button', id: 'btnTestSound', label: 'Проверить звук', show: (s) => s.sound },
    { key: 'flash', type: 'check', label: 'Мигание экрана' },
    { key: 'overtime', type: 'check', label: 'Считать время после нуля' },

    { section: 'Интерфейс' },
    { key: 'uiScale', type: 'range', label: 'Размер кнопок', min: 60, max: 200, unit: '%' },
    { key: 'autoHide', type: 'check', label: 'Прятать кнопки во время отсчёта' },
  ];

  const LAYOUT_KEYS = new Set(['sizeMode', 'tileSize', 'tileCount', 'unitSec', 'gap', 'radius']);
  const ORDER_KEYS = new Set(['order', 'reverse']);

  function loadSettings() {
    const saved = storageGet(SKEY) || {};
    const s = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) {
      if (k in saved && typeof saved[k] === typeof DEFAULTS[k]) s[k] = saved[k];
    }
    return s;
  }

  let S = loadSettings();
  let saveTimerId = 0;
  function saveSettings() {
    clearTimeout(saveTimerId);
    saveTimerId = setTimeout(() => storageSet(SKEY, S), 200);
  }

  /* =========================================================
   * Состояние таймера
   * ========================================================= */
  const T = { status: 'idle', duration: S.duration * 1000, acc: 0, startedAt: 0, seed: newSeed() };

  (function loadTimer() {
    const st = storageGet(TKEY);
    if (!st || !['idle', 'running', 'paused', 'done'].includes(st.status)) return;
    if (!(st.duration > 0) || !Number.isFinite(st.acc) || !Number.isFinite(st.startedAt)) return;
    Object.assign(T, {
      status: st.status, duration: st.duration, acc: st.acc, startedAt: st.startedAt,
      seed: Number.isFinite(st.seed) ? st.seed : T.seed,
    });
    if (T.status === 'idle') T.duration = S.duration * 1000;
  })();

  const saveTimer = () => storageSet(TKEY, T);

  function elapsed(now) {
    const live = T.status === 'running' || T.status === 'done';
    return T.acc + (live ? now - T.startedAt : 0);
  }

  function parseDuration(str) {
    const s = String(str || '').trim().toLowerCase();
    if (!s) return null;
    let m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    if (m) return m[3] != null ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
    if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s) * 60);
    m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (m && (m[1] || m[2] || m[3])) return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
    return null;
  }

  /* =========================================================
   * DOM
   * ========================================================= */
  const canvas = $('#stage');
  const ctx = canvas.getContext('2d', { alpha: false });
  const dimEl = $('#dim');
  const clockWrap = $('#clockWrap');
  const clockEl = $('#clock');
  const clockText = $('#clockText');
  const clockSub = $('#clockSub');
  const controls = $('#controls');
  const panel = $('#panel');
  const btnStart = $('#btnStart');
  const btnFs = $('#btnFs');
  const btnSettings = $('#btnSettings');
  const metaTheme = document.querySelector('meta[name="theme-color"]');

  let VW = 0;
  let VH = 0;
  let dpr = 1;
  let dirty = true;
  let demo = null;
  let panelOpen = false;

  /* =========================================================
   * Раскладка элементов
   * ========================================================= */
  const L = {
    n: 0, cols: 0, rows: 0, cw: 0, ch: 0, tw: 0, th: 0, g: 0, rad: 0, version: 0,
    x: new Float32Array(0), y: new Float32Array(0),
    col: new Int32Array(0), row: new Int32Array(0),
    rank: new Int32Array(0), bucket: new Uint8Array(0), dir: new Float32Array(0),
  };

  function targetCount() {
    if (S.sizeMode === 'count') return clamp(Math.round(S.tileCount), 1, MAX_TILES);
    return clamp(Math.ceil(T.duration / 1000 / S.unitSec), 1, MAX_TILES);
  }

  function gridFor(W, H) {
    if (S.sizeMode === 'size') {
      const size = Math.max(8, S.tileSize);
      let cols = Math.max(1, Math.round(W / size));
      let rows = Math.max(1, Math.round(H / size));
      if (cols * rows > MAX_TILES) {
        const k = Math.sqrt((cols * rows) / MAX_TILES);
        cols = Math.max(1, Math.floor(cols / k));
        rows = Math.max(1, Math.floor(rows / k));
      }
      return { cols, rows, n: cols * rows };
    }
    // Подбираем сетку под точное количество: элементы как можно ближе к квадрату,
    // неполный последний ряд — только если без него форма сильно хуже.
    const n = targetCount();
    let best = null;
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const empty = c * r - n;
      const aspect = (W / c) / (H / r);
      const cost = Math.abs(Math.log(aspect)) + (empty ? 0.35 + (0.6 * empty) / c : 0);
      if (!best || cost < best.cost) best = { cols: c, rows: r, n, cost };
    }
    return best;
  }

  function buildLayout() {
    if (!VW || !VH) return;
    const { cols, rows, n } = gridFor(VW, VH);
    const cw = VW / cols;
    const ch = VH / rows;
    const g = Math.min(S.gap, cw * 0.45, ch * 0.45);

    if (L.x.length !== n) {
      L.x = new Float32Array(n); L.y = new Float32Array(n);
      L.col = new Int32Array(n); L.row = new Int32Array(n);
      L.rank = new Int32Array(n); L.bucket = new Uint8Array(n); L.dir = new Float32Array(n);
    }
    Object.assign(L, { n, cols, rows, cw, ch, g, tw: cw - g, th: ch - g });
    L.rad = (clamp(S.radius, 0, 100) / 100) * (Math.min(L.tw, L.th) / 2);

    const lastRow = n - (rows - 1) * cols;
    let i = 0;
    for (let r = 0; r < rows; r++) {
      const inRow = r === rows - 1 ? lastRow : cols;
      const off = ((cols - inRow) * cw) / 2;
      for (let c = 0; c < inRow; c++, i++) {
        L.x[i] = off + c * cw + g / 2;
        L.y[i] = r * ch + g / 2;
        L.col[i] = c;
        L.row[i] = r;
        const hsh = (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296;
        L.dir[i] = (hsh < 0.5 ? -1 : 1) * (0.5 + hsh);
      }
    }
    computeRanks();
    updateInfo();
    dirty = true;
  }

  function computeRanks() {
    const n = L.n;
    if (!n) return;
    const k1 = new Float64Array(n);
    const k2 = new Float64Array(n);
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;

    const halfW = L.tw / 2;
    const halfH = L.th / 2;
    const mx = VW / 2;
    const my = VH / 2;
    let sorted = false;

    const forEach = (fn) => {
      for (let i = 0; i < n; i++) fn(i, L.x[i] + halfW, L.y[i] + halfH);
    };

    switch (S.order) {
      case 'bottomup':
        forEach((i, cx) => { k1[i] = -L.row[i]; k2[i] = cx; });
        break;
      case 'columns':
        forEach((i, cx, cy) => { k1[i] = Math.round(cx * 4); k2[i] = cy; });
        break;
      case 'snake':
        forEach((i, cx) => { k1[i] = L.row[i]; k2[i] = L.row[i] % 2 ? -cx : cx; });
        break;
      case 'diagonal':
        forEach((i, cx, cy) => { k1[i] = Math.round((cx / L.cw + cy / L.ch) * 1000); k2[i] = cy; });
        break;
      case 'clock':
        forEach((i, cx, cy) => {
          let a = Math.atan2(cx - mx, -(cy - my));
          if (a < 0) a += Math.PI * 2;
          k1[i] = Math.round(a * 1e5);
          k2[i] = Math.hypot(cx - mx, cy - my);
        });
        break;
      case 'center-out':
      case 'edges-in': {
        const sign = S.order === 'center-out' ? 1 : -1;
        forEach((i, cx, cy) => {
          k1[i] = sign * Math.round(Math.hypot(cx - mx, cy - my) * 8);
          let a = Math.atan2(cx - mx, -(cy - my));
          if (a < 0) a += Math.PI * 2;
          k2[i] = a;
        });
        break;
      }
      case 'curtain':
        forEach((i, cx, cy) => {
          k1[i] = Math.round(Math.min(cx, VW - cx) * 8);
          k2[i] = cy * 2 + (cx > mx ? 1 : 0);
        });
        break;
      case 'spiral-in':
      case 'spiral-out': {
        const grid = new Int32Array(L.cols * L.rows).fill(-1);
        for (let i = 0; i < n; i++) grid[L.row[i] * L.cols + L.col[i]] = i;
        let k = 0;
        const visit = (r, c) => {
          const t = grid[r * L.cols + c];
          if (t >= 0) k1[t] = k++;
        };
        let top = 0;
        let bottom = L.rows - 1;
        let left = 0;
        let right = L.cols - 1;
        while (top <= bottom && left <= right) {
          for (let c = left; c <= right; c++) visit(top, c);
          top++;
          for (let r = top; r <= bottom; r++) visit(r, right);
          right--;
          if (top <= bottom) { for (let c = right; c >= left; c--) visit(bottom, c); bottom--; }
          if (left <= right) { for (let r = bottom; r >= top; r--) visit(r, left); left++; }
        }
        if (S.order === 'spiral-out') for (let i = 0; i < n; i++) k1[i] = -k1[i];
        break;
      }
      case 'random': {
        const rnd = mulberry32(T.seed);
        for (let i = n - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
        }
        sorted = true;
        break;
      }
      default: // 'reading'
        forEach((i, cx) => { k1[i] = L.row[i]; k2[i] = cx; });
    }

    if (!sorted) idx.sort((a, b) => k1[a] - k1[b] || k2[a] - k2[b] || a - b);

    for (let p = 0; p < n; p++) {
      const rank = S.reverse ? n - 1 - p : p;
      L.rank[idx[p]] = rank;
    }
    for (let i = 0; i < n; i++) {
      L.bucket[i] = n > 1 ? Math.round((L.rank[i] / (n - 1)) * (BUCKETS - 1)) : 0;
    }
    L.version++;
    dirty = true;
  }

  /* =========================================================
   * Цвета
   * ========================================================= */
  let P = null;
  function prepColors() {
    const base = hexToRgb(S.color);
    const c2 = hexToRgb(S.color2);
    const grad = [];
    const gradStr = [];
    for (let b = 0; b < BUCKETS; b++) {
      const c = mixRgb(base, c2, b / (BUCKETS - 1));
      grad.push(c);
      gradStr.push(rgbStr(c));
    }
    P = { base, baseStr: rgbStr(base), warn: hexToRgb(S.warnColor), crit: hexToRgb(S.critColor), grad, gradStr };
  }

  /* Плавный переход цвета в полосе 3% перед порогом, ступенями (чтобы не перерисовывать слой каждый кадр). */
  function statusRgb(remPct) {
    const band = 3;
    const step = (t) => Math.round(clamp(t, 0, 1) * 16) / 16;
    let c = P.base;
    if (S.warnAt > 0) c = mixRgb(c, P.warn, step((S.warnAt + band - remPct) / band));
    if (S.critAt > 0) c = mixRgb(c, P.crit, step((S.critAt + band - remPct) / band));
    return c;
  }

  /* =========================================================
   * Отрисовка
   * ========================================================= */
  function progressAt(now) {
    if (demo) {
      const t = now - demo.start;
      return { e: clamp(t / demo.len, 0, 1), durMs: demo.len, remMs: Math.max(0, demo.len - t) };
    }
    const el = elapsed(now);
    return { e: clamp(el / T.duration, 0, 1), durMs: T.duration, remMs: Math.max(0, T.duration - el) };
  }

  /*
   * Неподвижные элементы (целые и «следы» ушедших) рисуются в отдельный кэш-слой,
   * и в нём перерисовываются только изменившиеся ячейки. Каждый кадр на экран
   * копируется этот слой, а поверх — только элементы, которые сейчас в движении.
   */
  const base = document.createElement('canvas');
  const bctx = base.getContext('2d');
  let baseState = new Uint8Array(0); // 1 — элемент на месте, 0 — пустая ячейка (след)
  let changed = new Uint32Array(0);
  let baseKey = '';

  function paintBase(list, count, fullStr) {
    const grad = S.colorMode === 'gradient';
    const { tw, th, rad, cw, ch, g } = L;
    const clear = list ? new Path2D() : null;
    const ghost = new Path2D();
    const full = grad ? new Array(BUCKETS) : [null];
    let hasGhost = false;

    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.globalAlpha = 1;
    if (!list) {
      bctx.fillStyle = S.bg;
      bctx.fillRect(0, 0, VW, VH);
    }
    for (let k = 0; k < count; k++) {
      const i = list ? list[k] : k;
      const x = L.x[i];
      const y = L.y[i];
      if (clear) clear.rect(x - g / 2, y - g / 2, cw, ch);
      if (baseState[i] === 1) {
        const b = grad ? L.bucket[i] : 0;
        if (!full[b]) full[b] = new Path2D();
        addRR(full[b], x, y, tw, th, rad);
      } else {
        addRR(ghost, x, y, tw, th, rad);
        hasGhost = true;
      }
    }
    if (clear) {
      bctx.fillStyle = S.bg;
      bctx.fill(clear);
    }
    if (hasGhost && S.ghost > 0) {
      bctx.globalAlpha = S.ghost / 100;
      bctx.fillStyle = S.ghostColor;
      bctx.fill(ghost);
      bctx.globalAlpha = 1;
    }
    for (let b = 0; b < full.length; b++) {
      if (!full[b]) continue;
      bctx.fillStyle = grad ? P.gradStr[b] : fullStr;
      bctx.fill(full[b]);
    }
  }

  function render(now) {
    const n = L.n;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = S.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!n) return;

    const { e, durMs, remMs } = progressAt(now);
    const smooth = S.transition === 'smooth';
    const w = Math.max(1, Math.round(S.softness));
    const front = (n + w - 1) * e;
    const animF = Math.min(1, Math.max(50, S.stepAnim) / durMs);
    const solidRgb = S.colorMode === 'status' ? statusRgb((1 - e) * 100) : P.base;
    const fullStr = rgbStr(solidRgb);

    if (baseState.length !== n) {
      baseState = new Uint8Array(n).fill(255);
      changed = new Uint32Array(n);
    }

    const partI = [];
    const partG = [];
    let nc = 0;
    for (let i = 0; i < n; i++) {
      const rk = L.rank[i];
      let p;
      if (smooth) {
        p = (front - rk) / w;
      } else {
        const d = (rk + 1) / n;
        const s = d > animF ? d - animF : 0;
        p = (e - s) / (d - s);
      }
      p = p <= 0 ? 0 : p >= 1 ? 1 : p;
      const v = S.fillMode ? p : 1 - p; // насколько элемент на месте
      const st = v >= 1 ? 1 : 0;
      if (st !== baseState[i]) {
        baseState[i] = st;
        changed[nc++] = i;
      }
      if (v > 0 && v < 1) {
        partI.push(i);
        partG.push(1 - v);
      }
    }

    const key = [L.version, VW, VH, dpr, S.bg, S.ghost, S.ghostColor, S.colorMode, fullStr, P.gradStr[0], P.gradStr[BUCKETS - 1]].join('|');
    if (key !== baseKey || nc > n * 0.35) {
      baseKey = key;
      paintBase(null, n, fullStr);
    } else if (nc) {
      paintBase(changed, nc, fullStr);
    }

    let pulse = 1;
    if (S.pulse && S.finalSecs > 0 && !demo && T.status === 'running' && remMs > 0 && remMs <= S.finalSecs * 1000) {
      const ph = (remMs / 1000) % 1; // 1 → 0 внутри каждой секунды
      pulse = 0.45 + 0.55 * ph * ph;
    }
    const alpha = (S.brightness / 100) * pulse;

    ctx.globalAlpha = alpha;
    ctx.drawImage(base, 0, 0);

    const grad = S.colorMode === 'gradient';
    for (let k = 0; k < partI.length; k++) {
      const i = partI[k];
      drawPartial(i, partG[k], grad ? P.grad[L.bucket[i]] : solidRgb, alpha, smooth);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;

    const dim = ((S.dimToEnd / 100) * e).toFixed(3);
    if (dimEl.style.opacity !== dim) dimEl.style.opacity = dim;
  }

  /* g: 0 — элемент на месте, 1 — ушёл полностью */
  function drawPartial(i, g, rgb, alpha, smooth) {
    const { tw, th } = L;
    let x = L.x[i] + tw / 2;
    let y = L.y[i] + th / 2;
    let a = 1;
    let sx = 1;
    let sy = 1;
    let rot = 0;
    let col = rgb;
    const eg = smooth ? g : smoothstep(g);
    const fly = g * g;

    switch (S.effect) {
      case 'darken': {
        col = mixRgb(rgb, BLACK, Math.min(1, eg / 0.7));
        a = eg < 0.7 ? 1 : 1 - (eg - 0.7) / 0.3;
        break;
      }
      case 'shrink':
        sx = sy = 1 - eg;
        break;
      case 'spin':
        rot = eg * Math.PI * L.dir[i];
        sx = sy = 1 - eg;
        break;
      case 'flip':
        sx = Math.cos((eg * Math.PI) / 2);
        col = mixRgb(rgb, BLACK, eg * 0.6);
        break;
      case 'fall':
        y += fly * (VH - L.y[i] + Math.max(tw, th));
        rot = fly * 0.9 * L.dir[i];
        break;
      case 'rise':
        y -= fly * (L.y[i] + th + Math.max(tw, th));
        rot = fly * 0.7 * L.dir[i];
        break;
      case 'scatter': {
        let dx = x - VW / 2;
        let dy = y - VH / 2;
        const d = Math.hypot(dx, dy);
        if (d < 1) { dx = 0; dy = 1; } else { dx /= d; dy /= d; }
        const dist = Math.hypot(VW, VH);
        x += dx * fly * dist;
        y += dy * fly * dist;
        rot = fly * 1.5 * L.dir[i];
        break;
      }
      default: // 'fade'
        a = 1 - eg;
    }

    if (a <= 0.003 || Math.abs(sx) < 0.003 || sy < 0.003) return;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    ctx.setTransform(dpr * c * sx, dpr * s * sx, -dpr * s * sy, dpr * c * sy, dpr * x, dpr * y);
    ctx.globalAlpha = alpha * a;
    ctx.fillStyle = rgbStr(col);
    ctx.beginPath();
    addRR(ctx, -tw / 2, -th / 2, tw, th, L.rad);
    ctx.fill();
  }

  /* =========================================================
   * Цифры
   * ========================================================= */
  function fmtHMS(sec, forceHours) {
    const hh = Math.floor(sec / 3600);
    const mm = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    return hh || forceHours ? `${hh}:${pad2(mm)}:${pad2(ss)}` : `${pad2(mm)}:${pad2(ss)}`;
  }

  const hhmm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  function fmtSpan(sec) {
    if (sec < 0.1) return `${Math.max(1, Math.round(sec * 1000))} мс`;
    if (sec < 1) return `${sec.toFixed(2).replace('.', ',')} с`;
    if (sec < 60) return `${String(Math.round(sec * 10) / 10).replace('.', ',')} с`;
    if (sec < 3600) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return s ? `${m} мин ${s} с` : `${m} мин`;
    }
    const hh = Math.floor(sec / 3600);
    const mm = Math.floor((sec % 3600) / 60);
    return mm ? `${hh} ч ${mm} мин` : `${hh} ч`;
  }

  const measureEl = h('span', { class: 'clock-text measure', 'aria-hidden': 'true' });
  clockEl.append(measureEl);
  const emCache = new Map();
  function emWidth(text) {
    const key = text.replace(/\d/g, '0');
    if (emCache.has(key)) return emCache.get(key);
    measureEl.textContent = key;
    const w = measureEl.getBoundingClientRect().width / 100;
    if (w > 0) emCache.set(key, w);
    return w;
  }

  function fitClock() {
    if (!S.showClock) return;
    const em = emWidth(clockText.textContent || '00:00');
    if (!em) return;
    const byHeight = (S.clockSize / 100) * VH;
    const byWidth = (VW * 0.92) / em;
    clockEl.style.fontSize = `${Math.max(10, Math.min(byHeight, byWidth)).toFixed(1)}px`;
  }

  let lastClock = '';
  let lastSub = '';
  let lastTitle = '';
  function updateClock(now) {
    const el = elapsed(now);
    const dur = T.duration;
    const raw = dur - el;
    const parts = [];
    let text;

    if (T.status === 'paused') parts.push('Пауза');
    if (T.status === 'done') parts.push('Время вышло');

    if (raw < 0 && T.status === 'done' && S.overtime) {
      text = `+${fmtHMS(Math.floor(-raw / 1000), false)}`;
    } else {
      const rem = Math.max(0, raw);
      const sec = Math.ceil(rem / 1000);
      const timeStr = fmtHMS(sec, dur >= 3600000);
      switch (S.clockFormat) {
        case 'hms': text = fmtHMS(sec, true); break;
        case 'ms': text = `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`; break;
        case 's': text = String(sec); parts.push(timeStr); break;
        case 'percent': text = `${Math.ceil((rem / dur) * 100)}%`; parts.push(timeStr); break;
        case 'tiles': {
          const left = rem <= 0 ? 0 : L.n - Math.floor((1 - rem / dur) * L.n + 1e-9);
          text = String(left);
          parts.push(`из ${L.n}`, timeStr);
          break;
        }
        default: text = timeStr;
      }
      if (S.showEndTime && (T.status === 'running' || T.status === 'paused') && rem > 0) {
        parts.push(`до ${hhmm(new Date(now + rem))}`);
      }
    }

    const sub = parts.join(' · ');
    if (text !== lastClock) {
      lastClock = text;
      clockText.textContent = text;
      fitClock();
    }
    if (sub !== lastSub) {
      lastSub = sub;
      clockSub.textContent = sub;
    }
    const title = T.status === 'done' ? `⏰ ${text} · Время вышло` : `${text} · Таймер`;
    if (title !== lastTitle) {
      lastTitle = title;
      document.title = title;
    }
  }

  /* =========================================================
   * Звук
   * ========================================================= */
  let actx = null;
  let soundNodes = [];

  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { actx = new AC(); } catch { return null; }
    }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }

  function tone(freq, at, dur, vol, type = 'sine') {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(actx.destination);
    o.start(at);
    o.stop(at + dur + 0.05);
    return o;
  }

  const volume = () => (S.volume / 100) ** 2 * 0.6;

  function playAlarm(series = 4) {
    if (S.volume <= 0 || !audio()) return;
    stopSound();
    const vol = volume();
    let t = actx.currentTime + 0.05;
    for (let r = 0; r < series; r++) {
      for (let k = 0; k < 3; k++) {
        soundNodes.push(tone(880, t, 0.16, vol), tone(1320, t, 0.16, vol * 0.35));
        t += 0.24;
      }
      t += 0.55;
    }
  }

  function playTick() {
    if (S.volume <= 0 || !audio()) return;
    tone(1500, actx.currentTime + 0.01, 0.05, volume() * 0.4, 'triangle');
  }

  function stopSound() {
    for (const o of soundNodes) { try { o.stop(); } catch { /* уже остановлен */ } }
    soundNodes = [];
  }

  /* =========================================================
   * Сигнал, wake lock, полный экран
   * ========================================================= */
  let alarmOn = false;
  function setAlarm(on) {
    alarmOn = on;
    document.body.classList.toggle('alarm', on && S.flash);
    if (!on) stopSound();
  }

  let wake = null;
  async function requestWake() {
    try {
      if ('wakeLock' in navigator && !wake && document.visibilityState === 'visible') {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      }
    } catch { /* не поддерживается или запрещено */ }
  }
  function releaseWake() {
    if (wake) { wake.release().catch(() => {}); wake = null; }
  }

  const fsEnabled = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function toggleFs() {
    if (!fsEnabled) return;
    try {
      if (isFs()) {
        const r = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        if (r && r.catch) r.catch(() => {});
      } else {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        const r = req.call(el, { navigationUI: 'hide' });
        if (r && r.catch) r.catch(() => {});
      }
    } catch { /* игнорируем */ }
  }
  function updateFsIcon() {
    const fs = isFs();
    btnFs.querySelector('use').setAttribute('href', fs ? '#i-collapse' : '#i-expand');
    btnFs.setAttribute('aria-label', fs ? 'Выйти из полного экрана' : 'Полный экран');
  }

  /* =========================================================
   * Управление таймером
   * ========================================================= */
  function afterStateChange() {
    saveTimer();
    updateButtons();
    lastClock = '';
    dirty = true;
  }

  function start() {
    if (T.status === 'running') return;
    if (T.status === 'idle') { T.acc = 0; T.duration = S.duration * 1000; }
    T.startedAt = Date.now();
    T.status = 'running';
    lastTickSec = null;
    afterStateChange();
    requestWake();
  }

  function pause() {
    if (T.status !== 'running') return;
    T.acc += Date.now() - T.startedAt;
    T.status = 'paused';
    afterStateChange();
    releaseWake();
  }

  function reset() {
    Object.assign(T, { status: 'idle', acc: 0, startedAt: 0, duration: S.duration * 1000, seed: newSeed() });
    setAlarm(false);
    releaseWake();
    buildLayout();
    afterStateChange();
  }

  function finish(silent) {
    T.status = 'done';
    afterStateChange();
    releaseWake();
    if (!silent) {
      if (S.sound) playAlarm();
      setAlarm(S.sound || S.flash);
    }
  }

  function toggleStart() {
    audio(); // разблокировать звук жестом пользователя
    if (T.status === 'running') pause();
    else if (T.status === 'done') reset();
    else start();
  }

  function adjust(deltaMs) {
    const now = Date.now();
    if (T.status === 'idle') {
      const next = S.duration + deltaMs / 1000;
      if (next < 1) return;
      S.duration = clamp(next, 1, MAX_DURATION);
      T.duration = S.duration * 1000;
      saveSettings();
      syncDuration();
    } else if (T.status === 'done') {
      if (deltaMs <= 0) return;
      T.duration = elapsed(now) + deltaMs;
      T.status = 'running';
      setAlarm(false);
      requestWake();
    } else {
      T.duration = clamp(T.duration + deltaMs, 1000, MAX_DURATION * 1000);
    }
    if (S.sizeMode === 'unit') buildLayout();
    afterStateChange();
  }

  function setDuration(sec) {
    S.duration = clamp(Math.round(sec), 1, MAX_DURATION);
    saveSettings();
    reset();
    syncDuration();
  }

  function updateButtons() {
    const st = T.status;
    document.body.classList.remove('is-idle', 'is-running', 'is-paused', 'is-done');
    document.body.classList.add(`is-${st}`);
    const icon = st === 'running' ? '#i-pause' : st === 'done' ? '#i-stop' : '#i-play';
    const label = st === 'running' ? 'Пауза' : st === 'done' ? 'Стоп' : st === 'paused' ? 'Дальше' : 'Старт';
    btnStart.querySelector('use').setAttribute('href', icon);
    btnStart.querySelector('.btn-label').textContent = label;
    btnStart.setAttribute('aria-label', label);
  }

  function runDemo() {
    demo = { start: Date.now(), len: DEMO_MS };
    if (panelOpen) panel.classList.add('peek');
    dirty = true;
  }

  /* =========================================================
   * Панель настроек
   * ========================================================= */
  const formRows = [];
  let themeButtons = [];

  function setValue(key, value) {
    S[key] = value;
    saveSettings();
    applySetting(key);
    syncForm();
  }

  function applySetting(key) {
    if (LAYOUT_KEYS.has(key)) buildLayout();
    else if (ORDER_KEYS.has(key)) computeRanks();
    prepColors();
    applyCss();
    lastClock = '';
    dirty = true;
  }

  function applyCss() {
    const st = document.documentElement.style;
    st.setProperty('--ui-scale', String(S.uiScale / 100));
    st.setProperty('--bg', S.bg);
    st.setProperty('--clock-color', S.clockColor);
    st.setProperty('--clock-opacity', String(S.clockOpacity / 100));
    st.setProperty('--crit', S.critColor);
    clockWrap.dataset.pos = S.clockPos;
    clockWrap.hidden = !S.showClock;
    if (metaTheme) metaTheme.content = S.bg;
    if (!alarmOn) document.body.classList.remove('alarm');
    else document.body.classList.toggle('alarm', S.flash);
    fitClock();
  }

  function buildForm() {
    const root = $('#settingsForm');
    let section = null;

    for (const item of SCHEMA) {
      if (item.section) {
        section = h('section', { class: 'group' }, h('h3', { text: item.section }));
        root.append(section);
        continue;
      }
      const entry = { item };
      let row;

      switch (item.type) {
        case 'range': {
          const step = item.step || 1;
          entry.lab = h('span', { class: 'lbl' });
          entry.num = h('input', { type: 'number', class: 'num', min: item.min, max: item.max, step });
          entry.range = h('input', { type: 'range', min: item.min, max: item.max, step });
          row = h('div', { class: 'row' },
            h('label', { class: 'row-head' }, entry.lab,
              h('span', { class: 'val' }, entry.num, item.unit ? h('span', { text: item.unit }) : null)),
            entry.range);
          entry.range.setAttribute('aria-label', typeof item.label === 'string' ? item.label : item.key);
          entry.range.addEventListener('input', () => setValue(item.key, +entry.range.value));
          entry.num.addEventListener('change', () => {
            const v = Number(entry.num.value);
            setValue(item.key, clamp(Number.isFinite(v) ? Math.round(v / step) * step : item.min, item.min, item.max));
          });
          break;
        }
        case 'select': {
          entry.lab = h('span', { class: 'lbl' });
          entry.input = h('select');
          for (const [val, text] of item.options) entry.input.append(h('option', { value: val, text }));
          row = h('label', { class: 'row' }, h('div', { class: 'row-head' }, entry.lab), entry.input);
          entry.input.addEventListener('change', () => {
            setValue(item.key, item.num ? Number(entry.input.value) : entry.input.value);
          });
          break;
        }
        case 'check': {
          entry.lab = h('span', { class: 'lbl' });
          entry.check = h('input', { type: 'checkbox' });
          row = h('label', { class: 'row switch' }, entry.lab, entry.check);
          entry.check.addEventListener('change', () => setValue(item.key, entry.check.checked));
          break;
        }
        case 'color': {
          entry.lab = h('span', { class: 'lbl' });
          entry.input = h('input', { type: 'color' });
          row = h('label', { class: 'row color-row' }, entry.lab, entry.input);
          entry.input.addEventListener('input', () => setValue(item.key, entry.input.value));
          break;
        }
        case 'button': {
          const btn = h('button', { type: 'button', class: 'chip', id: item.id, text: item.label });
          row = h('div', { class: 'row' }, btn);
          break;
        }
        case 'info': {
          row = h('div', { class: 'info', id: item.id });
          break;
        }
        case 'themes': {
          const wrap = h('div', { class: 'themes' });
          themeButtons = THEMES.map((th) => {
            const b = h('button', { type: 'button', class: 'theme', title: `Тема «${th.name}»`, onclick: () => applyTheme(th) },
              h('span', { class: 'theme-sw', style: `background:${th.bg}` },
                h('i', { style: `background:${th.color}` }),
                h('i', { style: `background:${th.color2}` }),
                h('i', { style: `background:${th.critColor}` })),
              h('span', { text: th.name }));
            wrap.append(b);
            return { b, th };
          });
          row = h('div', { class: 'row' }, wrap);
          break;
        }
        default:
          continue;
      }
      if (item.hint) row.append(h('p', { class: 'hint', text: item.hint }));
      entry.row = row;
      section.append(row);
      formRows.push(entry);
    }

    $('#btnShuffle').addEventListener('click', () => {
      T.seed = newSeed();
      saveTimer();
      computeRanks();
    });
    $('#btnTestSound').addEventListener('click', () => playAlarm(1));

    const presets = $('#presets');
    for (const m of PRESETS) {
      const label = m < 60 ? `${m} мин` : m % 60 ? `${String(m / 60).replace('.', ',')} ч` : `${m / 60} ч`;
      presets.append(h('button', { type: 'button', class: 'chip', 'data-sec': m * 60, text: label, onclick: () => setDuration(m * 60) }));
    }
    for (const id of ['durH', 'durM', 'durS']) {
      $(`#${id}`).addEventListener('change', () => {
        const hh = Math.max(0, Number($('#durH').value) || 0);
        const mm = Math.max(0, Number($('#durM').value) || 0);
        const ss = Math.max(0, Number($('#durS').value) || 0);
        const total = hh * 3600 + mm * 60 + ss;
        if (total > 0) setDuration(total);
        else syncDuration();
      });
    }
  }

  function applyTheme(th) {
    for (const k of THEME_KEYS) S[k] = th[k];
    saveSettings();
    applySetting('bg');
    syncForm();
  }

  function syncForm() {
    for (const f of formRows) {
      const { item } = f;
      if (f.lab) f.lab.textContent = typeof item.label === 'function' ? item.label(S) : item.label;
      if (item.key) {
        const v = S[item.key];
        if (f.range) {
          f.range.value = v;
          if (document.activeElement !== f.num) f.num.value = v;
        } else if (f.check) {
          f.check.checked = !!v;
        } else if (f.input) {
          f.input.value = v;
        }
      }
      f.row.hidden = item.show ? !item.show(S) : false;
    }
    for (const { b, th } of themeButtons) {
      b.classList.toggle('active', THEME_KEYS.every((k) => S[k].toLowerCase() === th[k].toLowerCase()));
    }
    syncDuration();
    updateInfo();
  }

  function syncDuration() {
    const d = S.duration;
    const set = (id, v) => { const el = $(id); if (document.activeElement !== el) el.value = v; };
    set('#durH', Math.floor(d / 3600));
    set('#durM', Math.floor((d % 3600) / 60));
    set('#durS', d % 60);
    for (const b of document.querySelectorAll('#presets .chip')) {
      b.classList.toggle('active', Number(b.dataset.sec) === d);
    }
  }

  function updateInfo() {
    const el = document.getElementById('layoutInfo');
    if (!el || !L.n) return;
    const full = L.cols * L.rows === L.n;
    const grid = full ? `${L.cols} × ${L.rows}` : `${L.cols} × ${L.rows}, последний ряд неполный`;
    const per = T.duration / 1000 / L.n;
    el.innerHTML = '';
    el.append(
      'Сейчас ', h('b', { text: `${L.n} ${plural(L.n, ['элемент', 'элемента', 'элементов'])}` }),
      ` (${grid}). Один элемент ≈ `, h('b', { text: fmtSpan(per) }), '.',
    );
  }

  function setPanel(open) {
    panelOpen = open;
    panel.classList.toggle('open', open);
    panel.classList.remove('peek');
    panel.inert = !open;
    panel.setAttribute('aria-hidden', String(!open));
    btnSettings.setAttribute('aria-expanded', String(open));
    if (open) syncForm();
  }

  /* =========================================================
   * Скрытие интерфейса
   * ========================================================= */
  let lastActivity = Date.now();
  let uiHidden = false;
  let controlsHover = false;

  function onActivity() {
    lastActivity = Date.now();
    if (uiHidden) {
      uiHidden = false;
      document.body.classList.remove('ui-hidden');
    }
  }

  function updateUiHide(now) {
    const want = S.autoHide && T.status === 'running' && !panelOpen && !demo && !controlsHover && now - lastActivity > 2500;
    if (want !== uiHidden) {
      uiHidden = want;
      document.body.classList.toggle('ui-hidden', want);
    }
  }

  /* =========================================================
   * Главный цикл
   * ========================================================= */
  let lastTickSec = null;

  function frame() {
    requestAnimationFrame(frame);
    const now = Date.now();

    if (T.status === 'running') {
      const rem = T.duration - elapsed(now);
      if (rem <= 0) {
        finish(rem < -3000); // давно истёкший таймер (после перезагрузки) — без сигнала
      } else if (S.tick && S.finalSecs > 0) {
        const sec = Math.ceil(rem / 1000);
        if (sec <= S.finalSecs && sec !== lastTickSec && lastTickSec !== null) playTick();
        lastTickSec = sec;
      }
    }

    if (demo && now - demo.start > demo.len + 700) {
      demo = null;
      panel.classList.remove('peek');
      dirty = true;
    }

    updateClock(now);
    updateUiHide(now);

    if (dirty || demo || T.status === 'running') {
      render(now);
      dirty = false;
    }
  }

  function resize() {
    VW = window.innerWidth;
    VH = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(VW * dpr);
    canvas.height = Math.round(VH * dpr);
    canvas.style.width = `${VW}px`;
    canvas.style.height = `${VH}px`;
    base.width = canvas.width;
    base.height = canvas.height;
    buildLayout();
    fitClock();
    dirty = true;
  }

  /* =========================================================
   * События
   * ========================================================= */
  function blurAfterClick(ev) {
    if (ev.detail > 0) ev.currentTarget.blur(); // мышь/тач — убираем фокус, чтобы Пробел не нажимал кнопку
  }

  btnStart.addEventListener('click', (ev) => { blurAfterClick(ev); toggleStart(); });
  $('#btnReset').addEventListener('click', (ev) => { blurAfterClick(ev); reset(); });
  $('#btnMinus').addEventListener('click', (ev) => { blurAfterClick(ev); adjust(-60000); });
  $('#btnPlus').addEventListener('click', (ev) => { blurAfterClick(ev); adjust(60000); });
  btnSettings.addEventListener('click', (ev) => { blurAfterClick(ev); setPanel(!panelOpen); });
  btnFs.addEventListener('click', (ev) => { blurAfterClick(ev); toggleFs(); });
  $('#btnClose').addEventListener('click', () => setPanel(false));
  $('#btnDemo').addEventListener('click', runDemo);
  $('#btnResetSettings').addEventListener('click', () => {
    if (!window.confirm('Вернуть все настройки по умолчанию? Время таймера сохранится.')) return;
    S = { ...DEFAULTS, duration: S.duration };
    storageSet(SKEY, S);
    buildLayout();
    applySetting('bg');
    syncForm();
  });

  btnFs.hidden = !fsEnabled;
  document.addEventListener('fullscreenchange', updateFsIcon);
  document.addEventListener('webkitfullscreenchange', updateFsIcon);

  controls.addEventListener('mouseenter', () => { controlsHover = true; });
  controls.addEventListener('mouseleave', () => { controlsHover = false; });

  canvas.addEventListener('pointerdown', () => { if (panelOpen) setPanel(false); });
  canvas.addEventListener('dblclick', toggleFs);

  window.addEventListener('pointerdown', () => { if (alarmOn) setAlarm(false); }, true);
  for (const ev of ['pointermove', 'pointerdown', 'wheel', 'touchstart']) {
    window.addEventListener(ev, onActivity, { passive: true });
  }

  window.addEventListener('keydown', (ev) => {
    onActivity();
    if (alarmOn) {
      setAlarm(false);
      if (ev.key === 'Escape') return;
    }
    if (ev.key === 'Escape') {
      if (panelOpen) setPanel(false);
      return;
    }
    const tag = ev.target && ev.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

    switch (ev.code) {
      case 'Space': ev.preventDefault(); toggleStart(); break;
      case 'KeyR': reset(); break;
      case 'KeyF': toggleFs(); break;
      case 'KeyS': case 'Comma': setPanel(!panelOpen); break;
      case 'KeyD': runDemo(); break;
      case 'ArrowUp': case 'Equal': case 'NumpadAdd': ev.preventDefault(); adjust(60000); break;
      case 'ArrowDown': case 'Minus': case 'NumpadSubtract': ev.preventDefault(); adjust(-60000); break;
      default: break;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      dirty = true;
      if (T.status === 'running') requestWake();
    }
  });

  window.addEventListener('resize', resize);

  /* =========================================================
   * Старт
   * ========================================================= */
  const params = new URLSearchParams(window.location.search);
  const urlDuration = params.has('t') ? parseDuration(params.get('t')) : null;
  if (urlDuration) {
    S.duration = clamp(urlDuration, 1, MAX_DURATION);
    Object.assign(T, { status: 'idle', acc: 0, startedAt: 0, duration: S.duration * 1000 });
    saveTimer();
  }

  prepColors();
  buildForm();
  applyCss();
  resize();
  syncForm();
  updateButtons();
  updateFsIcon();
  if (T.status === 'running') requestWake();
  if (urlDuration && params.get('autostart') === '1') start();
  requestAnimationFrame(frame);
})();
