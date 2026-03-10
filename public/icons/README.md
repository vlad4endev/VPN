# Иконки для PWA и магазинов

Для манифеста и «Добавить на экран» нужны PNG-иконки.

**Быстрая генерация** (требует `sharp`):
```bash
npm run pwa:icons
```

Создаст: icon-72.png, icon-96.png, icon-128.png, icon-192.png, icon-384.png, icon-512.png из `../favicon.svg`.

**Вручную** — конвертер [realfavicongenerator.net](https://realfavicongenerator.net/) или:
```bash
rsvg-convert -w 192 -h 192 public/favicon.svg -o public/icons/icon-192.png
rsvg-convert -w 512 -h 512 public/favicon.svg -o public/icons/icon-512.png
```

Для maskable: важно сохранять содержимое в центральном круге ~80% площади.
