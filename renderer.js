const { ipcRenderer } = require('electron');
const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');
const { WebLinksAddon } = require('xterm-addon-web-links');

let term;
let fitAddon;
let config;

async function init() {
  config = await ipcRenderer.invoke('get-config');
  
  term = new Terminal({
    fontSize: config.fontSize || 14,
    fontFamily: config.fontFamily || 'Consolas',
    cursorStyle: 'bar',
    cursorBlink: false,
    cursorWidth: 2,
    theme: {
      background: '#000000',
      foreground: '#eee',
      cursor: 'transparent',
      selection: '#e9456050',
      black: '#000000',
      red: config.colors?.red || '#e94560',
      green: config.colors?.green || '#4ade80',
      yellow: config.colors?.yellow || '#228B22',
      blue: config.colors?.blue || '#60a5fa',
      magenta: config.colors?.magenta || '#a78bfa',
      cyan: config.colors?.cyan || '#22d3ee',
      white: '#eee',
      brightBlack: '#666',
      brightRed: config.colors?.red || '#e94560',
      brightGreen: config.colors?.green || '#4ade80',
      brightYellow: config.colors?.yellow || '#228B22',
      brightBlue: config.colors?.blue || '#60a5fa',
      brightMagenta: config.colors?.magenta || '#a78bfa',
      brightCyan: config.colors?.cyan || '#22d3ee',
      brightWhite: '#fff'
    },
    scrollback: 1000,
    windowsMode: true
  });
  
  const style = document.createElement('style');
  style.textContent = `
    .xterm-viewport::-webkit-scrollbar { width: 8px; }
    .xterm-viewport::-webkit-scrollbar-track { background: #0a0a0a; }
    .xterm-viewport::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
    .xterm-viewport::-webkit-scrollbar-thumb:hover { background: #444; }
    .xterm-cursor-layer { display: none !important; }
    .xterm-cursor { display: none !important; }
    .xterm-cursor-outline { display: none !important; }
    .xterm-cursor-block { display: none !important; }
    .xterm-cursor-bar { display: none !important; }
    .xterm-cursor-underline { display: none !important; }
    #custom-cursor {
      position: absolute;
      width: 2px;
      background: ${config.colors?.cursor || '#ffffff'};
      pointer-events: none;
      z-index: 100;
      transition: left 0.08s ease-out, top 0.08s ease-out;
      animation: expandFromCenter 0.8s ease-in-out infinite;
      transform-origin: center;
    }
    @keyframes expandFromCenter {
      0%, 100% { 
        transform: scaleY(1);
        opacity: 1;
      }
      50% { 
        transform: scaleY(0);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
  
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());
  
  term.open(document.getElementById('terminal'));
  fitAddon.fit();
  
  // Создаём кастомный курсор внутри xterm-screen
  const cursor = document.createElement('div');
  cursor.id = 'custom-cursor';
  
  setTimeout(() => {
    const screen = document.querySelector('.xterm-screen');
    if (screen) {
      screen.style.position = 'relative';
      screen.appendChild(cursor);
    }
  }, 50);
  
  // Обновляем позицию курсора
  function updateCursor() {
    try {
      const cellWidth = term._core._renderService.dimensions.css.cell.width;
      const cellHeight = term._core._renderService.dimensions.css.cell.height;
      const cursorX = term.buffer.active.cursorX;
      const cursorY = term.buffer.active.cursorY;
      
      cursor.style.left = (cursorX * cellWidth) + 'px';
      cursor.style.top = (cursorY * cellHeight) + 'px';
      cursor.style.height = cellHeight + 'px';
    } catch (e) {}
  }
  
  term.onCursorMove(updateCursor);
  term.onRender(updateCursor);
  setTimeout(updateCursor, 200);
  
  ipcRenderer.send('terminal-create');
  
  ipcRenderer.on('terminal-data', (event, data) => {
    term.write(data);
  });
  
  term.onData((data) => {
    ipcRenderer.send('terminal-input', data);
  });
  
  // Удаление выделенного текста по Delete/Backspace
  term.attachCustomKeyEventHandler((e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && e.type === 'keydown') {
      const selection = term.getSelection();
      if (selection && selection.length > 0) {
        // Отправляем backspace для каждого символа выделения
        for (let i = 0; i < selection.length; i++) {
          ipcRenderer.send('terminal-input', '\b \b');
        }
        term.clearSelection();
        return false;
      }
    }
    return true;
  });
  
  term.onResize(({ cols, rows }) => {
    ipcRenderer.send('terminal-resize', { cols, rows });
  });
  
  window.addEventListener('resize', () => {
    fitAddon.fit();
  });
  
  setTimeout(() => fitAddon.fit(), 100);
}

function minimize() { ipcRenderer.send('window-minimize'); }
function maximize() { ipcRenderer.send('window-maximize'); }
function closeWin() { ipcRenderer.send('window-close'); }

function openSettings() { 
  loadSettingsForm();
  document.getElementById('settingsModal').style.display = 'flex'; 
}
function closeSettings() { 
  document.getElementById('settingsModal').style.display = 'none'; 
}

function loadSettingsForm() {
  document.getElementById('fontSize').value = config.fontSize || 14;
  document.getElementById('fontFamily').value = config.fontFamily || 'Consolas';
  document.getElementById('cursorColor').value = config.colors?.cursor || '#ffffff';
  document.getElementById('colorRed').value = config.colors?.red || '#e94560';
  document.getElementById('colorGreen').value = config.colors?.green || '#4ade80';
  document.getElementById('colorYellow').value = config.colors?.yellow || '#228B22';
}

async function saveSettings() {
  const newConfig = {
    fontSize: parseInt(document.getElementById('fontSize').value),
    fontFamily: document.getElementById('fontFamily').value,
    colors: {
      ...config.colors,
      cursor: document.getElementById('cursorColor').value,
      red: document.getElementById('colorRed').value,
      green: document.getElementById('colorGreen').value,
      yellow: document.getElementById('colorYellow').value
    }
  };
  
  config = await ipcRenderer.invoke('set-config', newConfig);
  closeSettings();
}

document.getElementById('settingsModal').addEventListener('click', (e) => {
  if (e.target.id === 'settingsModal') closeSettings();
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === ',') openSettings();
});

init();
