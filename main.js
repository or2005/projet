const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        icon: path.join(__dirname, 'icon.png'), // אייקון התוכנה
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js'),
            sandbox: true
        }
    });

    // טעינת קובץ ה-HTML הראשי
    mainWindow.loadFile('index.html');

    // הסרת תפריט ברירת המחדל
    mainWindow.setMenuBarVisibility(false);
    
    // יצירת תפריט מותאם (עם Dev Tools בעת פיתוח בלבד)
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    // שמירת גודל והמיקום של החלון
    mainWindow.on('close', () => {
        const bounds = mainWindow.getBounds();
        global.windowBounds = bounds;
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// טיפול בשגיאות לא תפוסות
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    app.quit();
});