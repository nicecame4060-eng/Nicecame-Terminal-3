const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const pty = require('node-pty');

app.disableHardwareAcceleration();

let mainWindow;
let ptyProcess;

const configPath = path.join(app.getPath('userData'), 'config.json');
let config = {
  fontSize: 14,
  fontFamily: 'Consolas',
  colors: {
    cursor: '#ffffff',
    red: '#e94560',
    green: '#4ade80',
    yellow: '#228B22',
    blue: '#60a5fa',
    magenta: '#a78bfa',
    cyan: '#22d3ee'
  }
};

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf-8')) };
    }
  } catch {}
}

function saveConfig() {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function createWindow() {
  loadConfig();
  
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 650,
    minWidth: 600,
    minHeight: 400,
    frame: false,
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  Menu.setApplicationMenu(null);
  
  mainWindow.on('closed', () => {
    if (ptyProcess) ptyProcess.kill();
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

ipcMain.on('terminal-create', (event) => {
  const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
  const homeDir = os.homedir();
  
  ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: homeDir,
    env: { ...process.env, TERM: 'xterm-256color' },
    useConpty: false
  });
  
  // Переходим в домашнюю папку при запуске (для админа)
  if (process.platform === 'win32') {
    ptyProcess.write(`cd /d "${homeDir}"\r`);
  }
  
  ptyProcess.onData((data) => {
    event.sender.send('terminal-data', data);
  });
});

ipcMain.on('terminal-input', (event, data) => {
  if (ptyProcess) ptyProcess.write(data);
});

ipcMain.on('terminal-resize', (event, { cols, rows }) => {
  if (ptyProcess && cols > 0 && rows > 0) {
    ptyProcess.resize(cols, rows);
  }
});

ipcMain.handle('get-config', () => config);
ipcMain.handle('set-config', (event, newConfig) => {
  config = { ...config, ...newConfig };
  saveConfig();
  return config;
});

ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());
