
const { contextBridge, ipcRenderer } = require('electron');

try {
  console.log('[preload] starting expose (CJS)');
  const api = {
    openFolder: () => ipcRenderer.invoke('fs:openFolder'),
    exists: (absPath) => ipcRenderer.invoke('fs:exists', absPath),
    executeRename: (items) => ipcRenderer.invoke('rename:execute', items),
    revertRename: () => ipcRenderer.invoke('rename:revert'),
    exportDiagnostics: () => ipcRenderer.invoke('debug:exportDiagnostics'),
    onProgress: (_cb) => () => {}
  };
  contextBridge.exposeInMainWorld('beehive', api);
  console.log('[preload] expose complete: window.beehive ready');
} catch (e) {
  console.error('[preload] expose failed', e);
}

window.addEventListener('DOMContentLoaded', () => {
  console.log('[preload] DOMContentLoaded (CJS)');
});
