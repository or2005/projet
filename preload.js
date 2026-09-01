const { contextBridge, ipcRenderer } = require('electron');

// חשיפה בטוחה של API לrenderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // פונקציות לעתיד - IPC communication
    invokeDialog: (channel, data) => ipcRenderer.invoke(channel, data),
    onMessage: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
});

// חשיפת מידע על הסביבה
contextBridge.exposeInMainWorld('appInfo', {
    version: '1.0.0',
    name: 'Ultimate Pro Shift Manager',
});
