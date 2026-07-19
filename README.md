# mac-wheel-launcher

A radial app launcher for macOS. Hold Option (⌥) anywhere to summon a wheel of apps around your cursor, move your mouse to the one you want, and release to launch it.

## Requirements

- macOS
- Node.js + npm
- The following apps installed (or customize the list — see below):
  - iTerm
  - Visual Studio Code
  - Spotify
  - Zen Browser
  - Finder

## Setup

```bash
npm install
npm run install-app   # builds and installs WheelLauncher.app to /Applications
```

Then launch **WheelLauncher** from Spotlight or Finder. It runs in the background with no Dock icon — only a menu bar icon.

On first launch, macOS will prompt for **Accessibility permission**. Grant it in:

> System Settings → Privacy & Security → Accessibility

Enable **WheelLauncher**, then relaunch the app. This permission is required for the global key listener to work.

If you get a native module error after installing, run:

```bash
npm run rebuild
npm run install-app
```

### Updating after code changes

```bash
npm run install-app
```

Then relaunch WheelLauncher from /Applications.

## Usage

| Action | Effect |
|--------|--------|
| Hold `Option` (⌥) | Summon the wheel at the cursor |
| Move mouse toward an app | Highlight it |
| Release `Option` | Launch the highlighted app |
| Press `Escape` | Dismiss without launching |

The wheel appears at your cursor position and disappears from the Dock — it runs entirely as a background overlay.

## Customizing Apps

Edit the `APP_COMMANDS` object in `main.js` and the `APPS` array in `renderer/wheel.js` to add, remove, or rename entries. Both must stay in sync.

```js
// main.js
const APP_COMMANDS = {
  'iTerm':       'open -a iTerm',
  'VS Code':     'open -a "Visual Studio Code"',
  'Spotify':     'open -a Spotify',
  'Zen Browser': 'open -a Zen',
  'Finder':      'open -a Finder',
};
```

```js
// renderer/wheel.js
const APPS = [
  { name: 'iTerm' },
  { name: 'VS Code' },
  { name: 'Spotify' },
  { name: 'Zen Browser' },
  { name: 'Finder' },
];
```

The `name` field in `APPS` must match the key in `APP_COMMANDS` exactly.
