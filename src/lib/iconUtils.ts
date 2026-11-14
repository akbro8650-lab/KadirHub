// Convert any user-selected image into a 160x160 center-cropped WebP raw Base64 string (<= 120000 chars)
import { MAX_LENGTHS } from '@/src/types/kadirhub';

export async function processAppIconToWebPBase64(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (PNG, JPG, WebP, or SVG).');
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode selected icon image.'));
      el.src = imageUrl;
    });

    const targetSize = 160;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is unavailable.');
    }

    // Center-crop square from source image
    const minSide = Math.min(img.naturalWidth || targetSize, img.naturalHeight || targetSize);
    const sx = ((img.naturalWidth || targetSize) - minSide) / 2;
    const sy = ((img.naturalHeight || targetSize) - minSide) / 2;

    ctx.clearRect(0, 0, targetSize, targetSize);
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);

    const qualities = [0.85, 0.72, 0.55, 0.4];
    for (const quality of qualities) {
      const dataUrl = canvas.toDataURL('image/webp', quality);
      const rawBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      if (rawBase64.length <= MAX_LENGTHS.iconBase64) {
        return rawBase64;
      }
    }

    throw new Error('Processed icon exceeds 120,000 Base64 character limit.');
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export function getIconDataUri(iconBase64: string): string | null {
  const clean = iconBase64.trim();
  if (!clean) return null;
  if (clean.startsWith('data:image/')) return clean;
  return `data:image/webp;base64,${clean}`;
}
