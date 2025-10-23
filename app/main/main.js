
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV !== 'production'

let win
async function createWindow() {
  const preloadPath = path.join(__dirname, '../preload/preload.cjs')
  const preloadExists = fs.existsSync(preloadPath)
  console.log('[main] preloadPath:', preloadPath, 'exists:', preloadExists)

  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false
  })
  win.once('ready-to-show', () => win.show())

  if (isDev) {
    await win.loadURL('http://localhost:5173')
  } else {
    const indexFile = path.join(__dirname, '../renderer/index.html')
    await win.loadFile(indexFile)
  }

  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    console.log('[renderer]', { level, message, line, sourceId })
  })
}

// ========= helpers =========
function userDir(sub) {
  const base = app.getPath('userData')
  const p = path.join(base, sub)
  fs.mkdirSync(p, { recursive: true })
  return p
}

// ========= IPC =========
ipcMain.handle('fs:openFolder', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (res.canceled || res.filePaths.length === 0) return null
  const dir = res.filePaths[0]
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  const files = entries.filter(e => e.isFile()).map(e => ({ name: e.name, path: path.join(dir, e.name) }))
  return { dir, files }
})

ipcMain.handle('fs:exists', async (_evt, absPath) => {
  try { await fsp.access(absPath); return true } catch { return false }
})

// Rename execute with log and reversible batch
let lastBatch = null
ipcMain.handle('rename:execute', async (_evt, items) => {
  const applied = []
  const logDir = userDir('logs')
  const logFile = path.join(logDir, 'operations.log')
  const lines = []
  lines.push(`[${new Date().toISOString()}] EXECUTE BEGIN count=${items.length}`)
  try {
    for (const it of items) {
      await fsp.rename(it.from, it.to)
      applied.push(it)
      lines.push(`RENAMED "${it.from}" -> "${it.to}"`)
    }
    lastBatch = applied.map(x => ({ from: x.to, to: x.from }))
    lines.push(`[${new Date().toISOString()}] EXECUTE OK`)
    await fsp.appendFile(logFile, lines.join('\n') + '\n', 'utf8')
    return { ok: true, count: applied.length }
  } catch (e) {
    lines.push(`[${new Date().toISOString()}] EXECUTE FAIL ${String(e)}`)
    await fsp.appendFile(logFile, lines.join('\n') + '\n', 'utf8')
    // best-effort rollback
    for (const it of applied.reverse()) { try { await fsp.rename(it.to, it.from) } catch {} }
    return { ok: false, error: String(e) }
  }
})

ipcMain.handle('rename:revert', async () => {
  if (!lastBatch) return { ok: false, error: 'no batch' }
  const items = lastBatch.slice()
  try {
    for (const it of items) { await fsp.rename(it.from, it.to) }
    lastBatch = null
    return { ok: true, count: items.length }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
})

ipcMain.handle('debug:exportDiagnostics', async () => {
  const userData = app.getPath('userData')
  const dir = path.join(userData, 'snapshots')
  await fsp.mkdir(dir, { recursive: true })
  const file = path.join(dir, `BeeHiVE_snapshot_${new Date().toISOString().replace(/[:]/g,'-')}.json`)
  const payload = {
    appInfo: {
      version: app.getVersion?.() ?? 'dev',
      platform: process.platform,
      arch: process.arch,
      electron: process.versions?.electron,
      node: process.versions.node
    },
    env: {
      cpus: os.cpus()?.length ?? 0,
      totalMem: os.totalmem(),
      freeMem: os.freemem()
    }
  }
  await fsp.writeFile(file, JSON.stringify(payload, null, 2), 'utf8')
  return file
})

// ========= lifecycle =========
app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
