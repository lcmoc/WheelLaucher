// Build absolute file:// icon URLs using the path exposed by the preload
const ICONS_ROOT = window.electronAPI.iconsPath;
function iconUrl(filename) {
  return `file://${ICONS_ROOT}/${filename}`;
}

// App names must match the keys in APP_COMMANDS in main.js exactly
const APPS = [
  { name: 'iTerm',       icon: iconUrl('iTerm.png')   },
  { name: 'VS Code',     icon: iconUrl('VSCode.png')  },
  { name: 'Spotify',     icon: iconUrl('Spotify.png') },
  { name: 'Zen Browser', icon: iconUrl('Zen.png')     },
  { name: 'Finder',      icon: iconUrl('Finder.png')  },
];

const RADIUS     = 150;
const HIT_RADIUS = 58;
const STAGGER_MS = 40;

function computeItemPositions() {
  return APPS.map((app, i) => {
    const angleDeg = i * (360 / APPS.length) - 90;
    const angleRad = angleDeg * (Math.PI / 180);
    return {
      ...app,
      offsetX: RADIUS * Math.cos(angleRad),
      offsetY: RADIUS * Math.sin(angleRad),
    };
  });
}

function buildWheel(root) {
  const items = computeItemPositions();

  const container = document.createElement('div');
  container.className = 'wheel-container';
  container.id = 'wheel';

  const backdrop = document.createElement('div');
  backdrop.className = 'wheel-backdrop';
  container.appendChild(backdrop);

  const centerDot = document.createElement('div');
  centerDot.className = 'wheel-center';
  container.appendChild(centerDot);

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

    // Position relative to container center using transform offset
    el.style.left = `calc(50% + ${item.offsetX}px)`;
    el.style.top  = `calc(50% + ${item.offsetY}px)`;

    container.appendChild(el);
  });

  root.appendChild(container);

  return {
    container,
    items,
    elements: Array.from(container.querySelectorAll('.wheel-item')),
  };
}

let currentHovered  = null;
let wheelCenterX    = 0;
let wheelCenterY    = 0;
let mouseMoveHandler = null;
let staggerTimers   = [];

const root = document.getElementById('wheel-root');
const { container, items, elements } = buildWheel(root);

function clearStaggerTimers() {
  staggerTimers.forEach(clearTimeout);
  staggerTimers = [];
}

function updateHover(mouseX, mouseY) {
  let found = null;

  for (let i = 0; i < items.length; i++) {
    const itemX = wheelCenterX + items[i].offsetX;
    const itemY = wheelCenterY + items[i].offsetY;
    const dist  = Math.hypot(mouseX - itemX, mouseY - itemY);
    if (dist < HIT_RADIUS) {
      found = items[i].name;
      break;
    }
  }

  if (found !== currentHovered) {
    currentHovered = found;
    elements.forEach((el) => {
      el.classList.toggle('hovered', el.dataset.app === found);
    });
    window.electronAPI.updateHover(currentHovered);
    // Toggle OS cursor: claim the window when over an item so we can show pointer
    window.electronAPI.setIgnoreMouseEvents(!found);
    document.body.style.cursor = found ? 'pointer' : '';
  }
}

window.electronAPI.onShowWheel(({ x, y }) => {
  wheelCenterX = x;
  wheelCenterY = y;
  currentHovered = null;
  window.electronAPI.updateHover(null);

  // Center the container on the cursor
  container.style.left = x + 'px';
  container.style.top  = y + 'px';

  // Reset all items to hidden state instantly (no transition)
  clearStaggerTimers();
  elements.forEach((el) => {
    el.style.transition = 'none';
    el.classList.remove('hovered', 'visible');
  });
  container.classList.remove('visible');

  // Force reflow so the "no transition" state sticks before we re-enable
  void container.offsetHeight;

  elements.forEach((el) => {
    el.style.transition = '';
  });

  // Show the backdrop/center-dot immediately
  container.classList.add('visible');

  // Stagger each item in individually
  elements.forEach((el, i) => {
    const t = setTimeout(() => {
      el.classList.add('visible');
    }, i * STAGGER_MS);
    staggerTimers.push(t);
  });

  mouseMoveHandler = (e) => updateHover(e.clientX, e.clientY);
  document.addEventListener('mousemove', mouseMoveHandler);
});

window.electronAPI.onHideWheel(() => {
  clearStaggerTimers();
  container.classList.remove('visible');
  elements.forEach((el) => {
    el.classList.remove('hovered', 'visible');
  });
  currentHovered = null;
  document.body.style.cursor = '';
  window.electronAPI.setIgnoreMouseEvents(true);

  if (mouseMoveHandler) {
    document.removeEventListener('mousemove', mouseMoveHandler);
    mouseMoveHandler = null;
  }
});
