// npx electron scripts/render-icons.mjs: renders the SVG app icons in build/ to the PNGs electron-builder packages.
// Electron is already a dev dependency, so this needs no image tool; run it again after editing an icon SVG.
import { readFileSync, writeFileSync } from 'node:fs'
import { app, BrowserWindow } from 'electron'

const ICONS = ['build/icon.svg', 'build/icon-windows.svg']
const SIZE = 1024

async function renderIcon(window, svgPath) {
  const svg = Buffer.from(readFileSync(svgPath)).toString('base64')
  const page = `<style>html,body{margin:0;background:transparent}</style><img src="data:image/svg+xml;base64,${svg}" width="${SIZE}" height="${SIZE}">`
  await window.loadURL(`data:text/html,${encodeURIComponent(page)}`)
  await window.webContents.executeJavaScript('document.images[0].decode()')
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })
  const pngPath = svgPath.replace(/\.svg$/, '.png')
  writeFileSync(pngPath, image.resize({ width: SIZE, height: SIZE }).toPNG())
  console.log(`${pngPath} (${SIZE}x${SIZE})`)
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: SIZE, height: SIZE, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } })
  for (const icon of ICONS) await renderIcon(window, icon)
  app.quit()
})
