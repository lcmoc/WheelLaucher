// Build absolute file:// icon URLs using the path exposed by the preload
const ICONS_ROOT = window.electronAPI.iconsPath;
function iconUrl(filename) { return `file://${ICONS_ROOT}/${filename}`; }

const APPS = [
  { name: 'iTerm',       icon: iconUrl('iTerm.png')   },
  { name: 'VS Code',     icon: iconUrl('VSCode.png')  },
  { name: 'Spotify',     icon: iconUrl('Spotify.png') },
  { name: 'Zen Browser', icon: iconUrl('Zen.png')     },
  { name: 'Finder',      icon: iconUrl('Finder.png')  },
];

const RADIUS         = 150; // px from center to icon
const STAGGER_MS     = 40;
const SECTOR_OUTER_R = 185; // hover zone outer radius
const SECTOR_INNER_R = 55;  // dead zone at center (no selection)
const SECTOR_GAP_DEG = 0;   // no gap between slices

// ── geometry helpers ────────────────────────────────────────────────────────

function computeItemPositions() {
  return APPS.map((app, i) => {
    // 0° = top, clockwise; convert to standard math for cos/sin
    const angleDeg = i * (360 / APPS.length);
    const rad = (angleDeg - 90) * Math.PI / 180;
    return {
      ...app,
      sectorAngle: angleDeg,
      offsetX: RADIUS * Math.cos(rad),
      offsetY: RADIUS * Math.sin(rad),
    };
  });
}

// Convert "0=top, clockwise" angle to SVG/screen Cartesian
function toCartesian(cx, cy, r, angleDeg) {
  const rad = angleDeg * Math.PI / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

// Build a donut-slice SVG path
function donutSlicePath(cx, cy, inner, outer, startDeg, endDeg) {
  const p1 = toCartesian(cx, cy, outer, startDeg);
  const p2 = toCartesian(cx, cy, outer, endDeg);
  const p3 = toCartesian(cx, cy, inner, endDeg);
  const p4 = toCartesian(cx, cy, inner, startDeg);
  const span = ((endDeg - startDeg) + 360) % 360;
  const large = span > 180 ? 1 : 0;
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${outer} ${outer} 0 ${large} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${inner} ${inner} 0 ${large} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ');
}

// ── build DOM ────────────────────────────────────────────────────────────────

function buildWheel(root) {
  const items = computeItemPositions();
  const N     = items.length;
  const slice = 360 / N;

  const container = document.createElement('div');
  container.className = 'wheel-container';
  container.id = 'wheel';

  // 1 · dark circular backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'wheel-backdrop';
  container.appendChild(backdrop);

  // 2 · SVG sector slices
  const SVG_SIZE = 420;
  const cx = SVG_SIZE / 2, cy = SVG_SIZE / 2;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.classList.add('wheel-sectors');
  svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
  svg.setAttribute('width',  SVG_SIZE);
  svg.setAttribute('height', SVG_SIZE);

  const sectorPaths = [];
  items.forEach((item, i) => {
    const center = i * slice;
    const start  = center - slice / 2;
    const end    = center + slice / 2;

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', donutSlicePath(cx, cy, SECTOR_INNER_R, SECTOR_OUTER_R, start, end));
    path.style.fill       = 'rgba(255,255,255,0.05)';
    path.style.stroke     = 'rgba(255,255,255,0.12)';
    path.style.strokeWidth = '0.75';
    path.style.transition  = 'fill 0.15s ease';
    path.dataset.app = item.name;
    svg.appendChild(path);
    sectorPaths.push(path);
  });
  container.appendChild(svg);

  // 3 · center dot
  const centerDot = document.createElement('div');
  centerDot.className = 'wheel-center';
  container.appendChild(centerDot);

  // 4 · icon items
  items.forEach((item) => {
    const el = document.createElement('div');
    el.className = 'wheel-item';
    el.dataset.app = item.name;

    const img = document.createElement('img');
    img.src = item.icon;
    img.alt = item.name;
    img.draggable = false;
    el.appendChild(img);

    const label = document.createElement('span');
    label.className = 'wheel-label';
    label.textContent = item.name;
    el.appendChild(label);

    el.style.left = `calc(50% + ${item.offsetX}px)`;
    el.style.top  = `calc(50% + ${item.offsetY}px)`;
    container.appendChild(el);
  });

  root.appendChild(container);
  return { container, items, elements: Array.from(container.querySelectorAll('.wheel-item')), sectorPaths };
}

// ── sector hit detection ─────────────────────────────────────────────────────

function getHoveredIndex(mouseX, mouseY) {
  const dx   = mouseX - wheelCenterX;
  const dy   = mouseY - wheelCenterY;
  const dist = Math.hypot(dx, dy);

  if (dist < SECTOR_INNER_R || dist > SECTOR_OUTER_R) return -1;

  // angle: 0=top, clockwise (matches sectorAngle in items)
  let angle = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
  const slice = 360 / APPS.length;
  return Math.floor(((angle + slice / 2) % 360) / slice) % APPS.length;
}

// ── state ────────────────────────────────────────────────────────────────────

let currentHovered   = null;
let frontmostApp     = null;
let wheelCenterX     = 0;
let wheelCenterY     = 0;
let mouseMoveHandler = null;
let staggerTimers    = [];
let showSequence      = 0;

const root = document.getElementById('wheel-root');
const { container, items, elements, sectorPaths } = buildWheel(root);

function clearStaggerTimers() {
  staggerTimers.forEach(clearTimeout);
  staggerTimers = [];
}

function setSectorHover(appName) {
  sectorPaths.forEach((path) => {
    const active = path.dataset.app === appName;
    const willMinimize = active && appName === frontmostApp;
    path.style.fill = willMinimize
      ? 'rgba(235, 80, 80, 0.28)'
      : active
      ? 'rgba(255, 255, 255, 0.16)'
      : 'rgba(255, 255, 255, 0.05)';
    path.style.stroke = willMinimize
      ? 'rgba(255, 125, 125, 0.42)'
      : 'rgba(255, 255, 255, 0.12)';
  });
}

// ── hover update ─────────────────────────────────────────────────────────────

function updateHover(mouseX, mouseY) {
  const idx   = getHoveredIndex(mouseX, mouseY);
  const found = idx >= 0 ? items[idx].name : null;

  if (found !== currentHovered) {
    currentHovered = found;

    elements.forEach((el) => el.classList.toggle('hovered', el.dataset.app === found));
    setSectorHover(found);

    window.electronAPI.updateHover(currentHovered);
    window.electronAPI.setIgnoreMouseEvents(!found);
    document.body.style.cursor = found ? 'pointer' : '';
  }
}

// ── show / hide ──────────────────────────────────────────────────────────────

window.electronAPI.onShowWheel(({ x, y }) => {
  const currentShow = ++showSequence;
  wheelCenterX = x;
  wheelCenterY = y;
  currentHovered = null;
  frontmostApp = null;
  window.electronAPI.updateHover(null);

  container.style.left = x + 'px';
  container.style.top  = y + 'px';

  clearStaggerTimers();
  elements.forEach((el) => {
    el.style.transition = 'none';
    el.classList.remove('hovered', 'visible');
  });
  setSectorHover(null);
  container.classList.remove('visible');

  void container.offsetHeight; // force reflow

  elements.forEach((el) => { el.style.transition = ''; });
  container.classList.add('visible');

  elements.forEach((el, i) => {
    const t = setTimeout(() => el.classList.add('visible'), i * STAGGER_MS);
    staggerTimers.push(t);
  });

  mouseMoveHandler = (e) => updateHover(e.clientX, e.clientY);
  document.addEventListener('mousemove', mouseMoveHandler);

  window.electronAPI.getFrontmostLauncherApp().then((appName) => {
    if (currentShow !== showSequence) return;
    frontmostApp = appName;
    setSectorHover(currentHovered);
  });
});

window.electronAPI.onHideWheel(() => {
  showSequence += 1;
  clearStaggerTimers();
  container.classList.remove('visible');
  elements.forEach((el) => el.classList.remove('hovered', 'visible'));
  setSectorHover(null);
  currentHovered = null;
  frontmostApp = null;
  document.body.style.cursor = '';
  window.electronAPI.setIgnoreMouseEvents(true);

  if (mouseMoveHandler) {
    document.removeEventListener('mousemove', mouseMoveHandler);
    mouseMoveHandler = null;
  }
});
