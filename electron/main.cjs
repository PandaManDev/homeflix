const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const DiscordRPC = require('discord-rpc');

const DISCORD_CLIENT_ID = '1559626336795107379';

const APP_ID = 'com.homeflix.cybernode';
const WEB_URL = 'https://homeflix-cyber-node.vercel.app/';
const REMOTE_PORT = Number(process.env.HOMEFLIX_REMOTE_PORT || 47831);
const pin = String(Math.floor(100000 + Math.random() * 900000));
const tokens = new Set();
let mainWindow;
let remoteServer;
let discordClient;
let discordReady = false;
let discordRetryTimer;
let lastDiscordUpdate = 0;
let lastDiscordKey = '';
let remoteStatus = { title: 'HomeFlix', playing: false, currentTime: 0, duration: 0, volume: 1 };

function getLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) return item.address;
    }
  }
  return '127.0.0.1';
}
function getRemoteInfo() {
  const host = getLanAddress();
  return { url: `http://${host}:${REMOTE_PORT}/`, host, port: REMOTE_PORT, pin };
}

function startRemoteServer() {
  const serverApp = express();
  serverApp.use(express.json({ limit: '32kb' }));
  serverApp.options('/api/discord-presence', (req, res) => {
    const origin = req.headers.origin;
    if (origin === 'https://homeflix-cyber-node.vercel.app' || origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000') {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      res.setHeader('Access-Control-Max-Age', '600');
      return res.sendStatus(204);
    }
    return res.sendStatus(403);
  });
  serverApp.post('/api/discord-presence', (req, res) => {
    const origin = req.headers.origin;
    if (origin !== 'https://homeflix-cyber-node.vercel.app' && origin !== 'http://localhost:3000' && origin !== 'http://127.0.0.1:3000') {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (String(req.body?.pin || '') !== pin) return res.status(401).json({ error: 'Incorrect pairing PIN' });
    if (req.body?.action === 'ping') return res.json({ ok: true, connected: discordReady });
    const presence = req.body?.presence;
    if (!presence || typeof presence !== 'object') return res.status(400).json({ error: 'Presence is required' });
    if (presence.clear) clearDiscordPresence();
    else updateDiscordPresence({
      title: cleanPresenceText(presence.title, 'HomeFlix Cyber Node'),
      playing: Boolean(presence.playing),
      currentTime: Math.max(0, Number(presence.currentTime) || 0),
      duration: Math.max(0, Number(presence.duration) || 0)
    });
    return res.json({ ok: true, discordReady });
  });
  serverApp.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'remote.html')));
  serverApp.get('/api/info', (_req, res) => res.json({ app: 'HomeFlix Cyber Node', name: os.hostname() }));
  serverApp.post('/api/pair', (req, res) => {
    if (String(req.body?.pin || '') !== pin) return res.status(401).json({ error: 'Incorrect pairing PIN' });
    const token = require('node:crypto').randomBytes(24).toString('hex');
    tokens.add(token);
    res.json({ token, status: remoteStatus });
  });
  serverApp.use('/api', (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token || !tokens.has(token)) return res.status(401).json({ error: 'Pair this phone with the desktop PIN first.' });
    next();
  });
  serverApp.get('/api/status', (_req, res) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('homeflix:remote-command', { action: 'status' });
      setTimeout(() => res.json(remoteStatus), 120);
    } else {
      res.json(remoteStatus);
    }
  });
  serverApp.post('/api/command', (req, res) => {
    const allowed = new Set(['toggle', 'play', 'pause', 'seek', 'volume', 'mute', 'next', 'previous', 'fullscreen', 'status']);
    const action = String(req.body?.action || '');
    if (!allowed.has(action)) return res.status(400).json({ error: 'Unsupported command' });
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('homeflix:remote-command', { action, value: req.body?.value });
    res.json({ ok: true });
  });
  remoteServer = serverApp.listen(REMOTE_PORT, '0.0.0.0', () => {
    console.log(`HomeFlix phone remote listening on port ${REMOTE_PORT}`);
  });
  remoteServer.on('error', error => console.error('Remote server failed:', error.message));
}


function cleanPresenceText(value, fallback, max = 128) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, max);
}

function scheduleDiscordReconnect() {
  if (discordRetryTimer || app.isQuitting) return;
  discordRetryTimer = setTimeout(() => {
    discordRetryTimer = null;
    startDiscordRPC();
  }, 10000);
}

async function startDiscordRPC() {
  if (discordClient && discordReady) return;
  try {
    DiscordRPC.register(DISCORD_CLIENT_ID);
    discordClient = new DiscordRPC.Client({ transport: 'ipc' });
    discordClient.on('ready', () => {
      discordReady = true;
      console.log('HomeFlix Discord Rich Presence connected.');
      if (remoteStatus.title && remoteStatus.title !== 'HomeFlix') updateDiscordPresence(remoteStatus, true);
    });
    discordClient.on('disconnected', () => {
      discordReady = false;
      console.log('Discord desktop client disconnected; retrying Rich Presence connection.');
      discordClient = null;
      scheduleDiscordReconnect();
    });
    discordClient.on('error', error => console.warn('Discord Rich Presence:', error.message));
    await discordClient.login({ clientId: DISCORD_CLIENT_ID });
  } catch (error) {
    discordReady = false;
    discordClient = null;
    console.warn('Discord Rich Presence unavailable. Make sure the Discord desktop app is running:', error.message);
    scheduleDiscordReconnect();
  }
}

function updateDiscordPresence(presence, force = false) {
  if (!presence || typeof presence !== 'object') return;
  const title = cleanPresenceText(presence.title, 'HomeFlix Cyber Node');
  const playing = Boolean(presence.playing);
  const currentTime = Math.max(0, Number(presence.currentTime) || 0);
  const duration = Math.max(0, Number(presence.duration) || 0);
  remoteStatus = { ...remoteStatus, title, playing, currentTime, duration };
  if (!discordReady || !discordClient) return;
  const now = Date.now();
  const key = [title, playing, Math.floor(currentTime / 15), Math.floor(duration)].join('|');
  if (!force && (key === lastDiscordKey || now - lastDiscordUpdate < 12000)) return;
  lastDiscordKey = key;
  lastDiscordUpdate = now;
  const activity = {
    details: cleanPresenceText(title, 'HomeFlix Cyber Node'),
    state: playing ? 'Watching on HomeFlix' : 'Paused in HomeFlix',
    largeImageKey: 'homeflix',
    largeImageText: 'HomeFlix Cyber Node',
    instance: false
  };
  if (playing) activity.startTimestamp = new Date(now - currentTime * 1000);
  if (duration > 0 && playing) activity.endTimestamp = new Date(now + Math.max(0, duration - currentTime) * 1000);
  discordClient.setActivity(activity).catch(error => console.warn('Could not update Discord Rich Presence:', error.message));
}

function clearDiscordPresence() {
  if (discordReady && discordClient) discordClient.clearActivity().catch(() => {});
  lastDiscordKey = '';
}


function installDiscordPageBridge() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.executeJavaScript(`(() => {
    if (window.__homeflixDiscordBridgeInstalled) return;
    window.__homeflixDiscordBridgeInstalled = true;
    const send = (clear = false) => {
      const api = window.homeflixDesktop;
      if (!api || typeof api.sendDiscordPresence !== 'function') return;
      const video = document.querySelector('#cyber-video, video');
      const titleNode = document.querySelector('#current-title, [data-media-title], .player-title');
      const title = (titleNode && titleNode.textContent || document.title || 'HomeFlix Cyber Node').trim();
      if (clear || !video || !video.currentSrc) {
        api.sendDiscordPresence({ clear: true });
        return;
      }
      api.sendDiscordPresence({
        title: title.slice(0, 128),
        playing: !video.paused && !video.ended,
        currentTime: Number.isFinite(video.currentTime) ? video.currentTime : 0,
        duration: Number.isFinite(video.duration) ? video.duration : 0
      });
    };
    const attach = () => {
      const video = document.querySelector('#cyber-video, video');
      if (!video || video.__homeflixDiscordEvents) return;
      video.__homeflixDiscordEvents = true;
      ['play', 'playing', 'pause', 'timeupdate', 'loadedmetadata', 'seeked'].forEach(eventName => video.addEventListener(eventName, () => send()));
      video.addEventListener('ended', () => send(true));
      send();
    };
    attach();
    new MutationObserver(attach).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) send(); });
  })()`).catch(error => console.warn('Could not attach HomeFlix Discord page bridge:', error.message));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 620,
    title: 'HomeFlix Cyber Node',
    icon: path.join(__dirname, '..', 'build', 'homeflix-icon.png'),
    backgroundColor: '#080808',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith(WEB_URL) || url.startsWith('file://');
    if (!allowed) { event.preventDefault(); shell.openExternal(url); }
  });
  mainWindow.webContents.on('did-finish-load', installDiscordPageBridge);
  mainWindow.loadURL(WEB_URL);
  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL, isMainFrame) => {
    if (isMainFrame && !validatedURL.startsWith('file://') && code !== -3) {
      console.warn('HomeFlix website could not load:', description, 'Trying packaged fallback.');
      mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}
app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID);
  ipcMain.handle('homeflix:remote-info', () => getRemoteInfo());
  ipcMain.on('homeflix:discord-presence', (_event, presence) => {
    if (presence && presence.clear) clearDiscordPresence();
    else updateDiscordPresence(presence);
  });
  startDiscordRPC();
  ipcMain.on('homeflix:remote-status', (_event, status) => { if (status && typeof status === 'object') remoteStatus = { ...remoteStatus, ...status }; });
  startRemoteServer();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => {
  app.isQuitting = true;
  if (discordRetryTimer) clearTimeout(discordRetryTimer);
  clearDiscordPresence();
  if (discordClient) { try { discordClient.destroy(); } catch (_) {} }
  if (remoteServer) remoteServer.close();
});
