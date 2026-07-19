const APPS = [
  { name: 'iTerm',       icon: '../assets/icons/iTerm.png' },
  { name: 'VS Code',     icon: '../assets/icons/VSCode.png' },
  { name: 'Spotify',     icon: '../assets/icons/Spotify.png' },
  { name: 'Zen Browser', icon: '../assets/icons/Zen.png' },
  { name: 'Finder',      icon: '../assets/icons/Finder.png' },
];

const RADIUS = 120;
const HIT_RADIUS = 46;
const STAGGER_MS = 30;

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

    el.style.left = '50%';
    el.style.top = '50%';
    el.style.marginLeft = item.offsetX + 'px';
    el.style.marginTop = item.offsetY + 'px';
    container.appendChild(el);
  });

  root.appendChild(container);

  return {
    container,
    items,
    elements: Array.from(container.querySelectorAll('.wheel-item')),
  };
}

let currentHovered = null;
let wheelCenterX = 0;
let wheelCenterY = 0;
let mouseMoveHandler = null;
let staggerTimers = [];

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
    const dist = Math.hypot(mouseX - itemX, mouseY - itemY);
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
  }
}

window.electronAPI.onShowWheel(({ x, y }) => {
  wheelCenterX = x;
  wheelCenterY = y;
  currentHovered = null;
  window.electronAPI.updateHover(null);

  container.style.left = x + 'px';
  container.style.top = y + 'px';

  // Reset items to invisible before stagger-in
  clearStaggerTimers();
  elements.forEach((el) => {
    el.style.transition = 'none';
    el.classList.remove('hovered');
  });
  container.classList.remove('visible');

  // Force reflow so transition resets land before we re-add .visible
  container.offsetHeight;

  elements.forEach((el) => {
    el.style.transition = '';
  });

  // Stagger each item in with a small delay
  elements.forEach((el, i) => {
    const t = setTimeout(() => {
      el.style.transitionDelay = '0ms';
      container.classList.add('visible');
    }, i * STAGGER_MS);
    staggerTimers.push(t);
  });

  // Ensure container.visible is set immediately for center dot + backdrop
  container.offsetHeight;
  container.classList.add('visible');

  mouseMoveHandler = (e) => updateHover(e.clientX, e.clientY);
  document.addEventListener('mousemove', mouseMoveHandler);
});

window.electronAPI.onHideWheel(() => {
  clearStaggerTimers();
  container.classList.remove('visible');
  elements.forEach((el) => el.classList.remove('hovered'));
  currentHovered = null;

  if (mouseMoveHandler) {
    document.removeEventListener('mousemove', mouseMoveHandler);
    mouseMoveHandler = null;
  }
});
