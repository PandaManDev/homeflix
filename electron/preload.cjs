const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('homeflixDesktop', Object.freeze({
  isDesktop: true,
  getRemoteInfo: () => ipcRenderer.invoke('homeflix:remote-info'),
  sendRemoteStatus: status => ipcRenderer.send('homeflix:remote-status', status),
  sendDiscordPresence: presence => ipcRenderer.send('homeflix:discord-presence', presence),
  onRemoteCommand: callback => {
    if (typeof callback !== 'function') return;
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('homeflix:remote-command', listener);
    return () => ipcRenderer.removeListener('homeflix:remote-command', listener);
  }
}));
