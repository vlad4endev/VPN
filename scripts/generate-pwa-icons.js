#!/usr/bin/env node
/**
 * Генерация PNG-иконок для PWA из public/favicon.svg.
 * Требует: npm install --save-dev sharp
 * Запуск: node scripts/generate-pwa-icons.js
 */
import { readFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const svgPath = join(root, 'public', 'favicon.svg')
const iconsDir = join(root, 'public', 'icons')
const SIZES = [72, 96, 128, 192, 384, 512]

async function main() {
  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    console.error('Установите sharp: npm install --save-dev sharp')
    process.exit(1)
  }

  if (!existsSync(svgPath)) {
    console.error('Не найден public/favicon.svg')
    process.exit(1)
  }

  mkdirSync(iconsDir, { recursive: true })
  const svg = readFileSync(svgPath)

  for (const size of SIZES) {
    const outPath = join(iconsDir, `icon-${size}.png`)
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(outPath)
    console.log('Создан:', outPath)
  }
  console.log('Готово.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
