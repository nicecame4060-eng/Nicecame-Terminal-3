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
  
  // Drag & Drop файлов - вставляет путь
  document.getElementById('terminal').addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  
  document.getElementById('terminal').addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const paths = Array.from(files).map(f => `"${f.path}"`).join(' ');
      ipcRenderer.send('terminal-input', paths);
    }
  });
  
  // Звук при завершении команды
  let lastLine = '';
  let commandRunning = false;
  
  ipcRenderer.on('terminal-data', (event, data) => {
    term.write(data);
    
    // Проверяем завершение команды (появление промпта)
    if (commandRunning && data.includes('>')) {
      commandRunning = false;
      if (config.soundEnabled !== false) {
        playNotificationSound();
      }
    }
  });
  
  term.onData((data) => {
    ipcRenderer.send('terminal-input', data);
    if (data === '\r') commandRunning = true;
    
    // Звук печатания при каждом нажатии
    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      playTypingSound();
    }
  });
  
  // Удаление выделенного текста по Delete/Backspace
  term.attachCustomKeyEventHandler((e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && e.type === 'keydown') {
      const selection = term.getSelection();
      if (selection && selection.length > 0) {
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
  
  // Применяем сохранённую фоновую картинку
  applyBgImage();
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
  document.getElementById('opacity').value = config.opacity || 0.85;
}

async function saveSettings() {
  const newConfig = {
    ...config,
    fontSize: parseInt(document.getElementById('fontSize').value),
    opacity: parseFloat(document.getElementById('opacity').value)
  };
  
  config = await ipcRenderer.invoke('set-config', newConfig);
  
  // Применяем размер шрифта
  term.options.fontSize = newConfig.fontSize;
  fitAddon.fit();
  
  // Применяем прозрачность
  applyOpacity(newConfig.opacity);
  
  closeSettings();
}

document.getElementById('settingsModal').addEventListener('click', (e) => {
  if (e.target.id === 'settingsModal') closeSettings();
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === ',') openSettings();
});

// Функция воспроизведения звука уведомления
function playNotificationSound() {
  const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkI2Coverage');
  audio.volume = 0.3;
  audio.play().catch(() => {});
}

// Глобальный AudioContext для звуков
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Функция звука печатания (мягкий приятный клик)
function playTypingSound() {
  if (config.typingSoundEnabled === false) return;
  
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    // Мягкий фильтр для приятного звука
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    filter.Q.value = 1;
    
    oscillator.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Мягкий синусоидальный звук
    oscillator.type = 'sine';
    oscillator.frequency.value = 400 + Math.random() * 100;
    
    // Плавное затухание
    gainNode.gain.setValueAtTime(0.03, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.08);
  } catch (e) {}
}

// Применение темы
function applyTheme(themeName) {
  const themes = {
    dark: { bg: '#000000', fg: '#eee', accent: '#e94560' },
    light: { bg: '#f5f5f5', fg: '#333', accent: '#e94560' },
    hacker: { bg: '#0a0a0a', fg: '#00ff00', accent: '#00ff00' },
    ocean: { bg: '#1a1a2e', fg: '#eee', accent: '#4fc3f7' }
  };
  const theme = themes[themeName] || themes.dark;
  document.body.style.background = theme.bg;
  config.theme = themeName;
}

// Применение прозрачности
function applyOpacity(value) {
  ipcRenderer.send('set-opacity', value);
  config.opacity = value;
}

// Включение/выключение blur
function toggleBlur(enabled) {
  if (enabled) {
    document.body.classList.add('blur-enabled');
  } else {
    document.body.classList.remove('blur-enabled');
  }
  ipcRenderer.send('set-blur', enabled);
  config.blurEnabled = enabled;
}

// Установка фоновой картинки
function setBgImage(input) {
  const file = input.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result;
      document.body.style.backgroundImage = `url(${base64})`;
      document.body.classList.add('has-bg-image');
      config.bgImage = base64;
      await ipcRenderer.invoke('set-config', { ...config, bgImage: base64 });
    };
    reader.readAsDataURL(file);
  }
}

// Удаление фоновой картинки
async function removeBgImage() {
  document.body.style.backgroundImage = 'none';
  document.body.classList.remove('has-bg-image');
  config.bgImage = null;
  await ipcRenderer.invoke('set-config', { ...config, bgImage: null });
}

// Применяем сохранённую картинку при загрузке (или дефолтную)
function applyBgImage() {
  // Дефолтный фон Pepe
  const defaultBg = 'pepe.jpg';
  
  if (config.bgImage) {
    document.body.style.backgroundImage = `url(${config.bgImage})`;
    document.body.classList.add('has-bg-image');
  } else {
    // Используем дефолтный фон
    document.body.style.backgroundImage = `url(${defaultBg})`;
    document.body.classList.add('has-bg-image');
  }
  
  // Применяем прозрачность
  if (config.opacity) {
    applyOpacity(config.opacity);
  }
}

init();
