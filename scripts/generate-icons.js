const { createCanvas } = require('canvas')
const fs = require('fs')
const path = require('path')

function generateIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#0E0E0E'
  ctx.fillRect(0, 0, size, size)

  ctx.fillStyle = '#E8FF3C'
  ctx.font = `bold ${Math.floor(size * 0.32)}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('AP', size / 2, size / 2)

  return canvas.toBuffer('image/png')
}

fs.writeFileSync(path.join(__dirname, '../public/icon-192.png'), generateIcon(192))
fs.writeFileSync(path.join(__dirname, '../public/icon-512.png'), generateIcon(512))
console.log('Ikoner genereret: icon-192.png og icon-512.png')
