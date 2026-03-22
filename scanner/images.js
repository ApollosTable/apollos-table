// scanner/images.js
const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, '..', 'images');

function ensureImagesDir() {
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
  return IMAGES_DIR;
}

function imagePath(listingId, index) {
  return path.join(IMAGES_DIR, `${listingId}_${index}.jpg`);
}

async function downloadImage(page, url, savePath) {
  try {
    const base64 = await page.evaluate(async (imgUrl) => {
      try {
        const res = await fetch(imgUrl);
        if (!res.ok) return null;
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch { return null; }
    }, url);

    if (!base64) return false;
    const match = base64.match(/^data:image\/[^;]+;base64,(.+)$/);
    if (!match) return false;

    fs.writeFileSync(savePath, Buffer.from(match[1], 'base64'));
    return true;
  } catch {
    return false;
  }
}

function imageToBase64(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const data = fs.readFileSync(filePath).toString('base64');
  return { media_type: 'image/jpeg', data };
}

module.exports = { ensureImagesDir, imagePath, downloadImage, imageToBase64 };
