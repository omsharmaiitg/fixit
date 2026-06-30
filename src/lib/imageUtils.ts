// Small browser-side image helpers shared by the report flow.

export interface CapturedImage {
  /** Base64 WITHOUT the data-URL prefix — what /api/triage and Storage want. */
  base64: string;
  mimeType: string;
  /** Full data URL, for <img> previews. */
  preview: string;
}

// Cap the longest edge and re-encode as JPEG before sending to Gemini/Storage.
// Gemini's image understanding doesn't need full phone-camera resolution, and
// the API bills/limits image tokens based on resolution — a multi-MB photo can
// eat a large chunk of a tight (e.g. free-tier) per-minute token budget for no
// quality benefit. This keeps reports fast to upload and friendlier to quota.
const MAX_DIMENSION_PX = 1024;
const JPEG_QUALITY = 0.8;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = dataUrl;
  });
}

async function compressDataUrl(dataUrl: string): Promise<{ dataUrl: string; mimeType: string }> {
  try {
    const img = await loadImage(dataUrl);
    const { width, height } = img;

    // Already small enough — skip the canvas round-trip entirely.
    if (width <= MAX_DIMENSION_PX && height <= MAX_DIMENSION_PX) {
      return { dataUrl, mimeType: 'image/jpeg' };
    }

    const scale = MAX_DIMENSION_PX / Math.max(width, height);
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { dataUrl, mimeType: 'image/jpeg' }; // canvas unsupported — fall back to original

    ctx.drawImage(img, 0, 0, targetW, targetH);
    const compressed = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    return { dataUrl: compressed, mimeType: 'image/jpeg' };
  } catch {
    // Any failure (decode error, canvas restrictions, etc.) — fall back to the
    // original image rather than blocking the report flow.
    return { dataUrl, mimeType: 'image/jpeg' };
  }
}

export function fileToCapturedImage(file: File): Promise<CapturedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = String(reader.result);
      try {
        const { dataUrl, mimeType } = await compressDataUrl(rawDataUrl);
        resolve({
          base64: dataUrl.split(',')[1] ?? '',
          mimeType,
          preview: dataUrl,
        });
      } catch {
        // Compression pipeline failed unexpectedly — still resolve with the
        // original, uncompressed image so the report flow isn't blocked.
        resolve({
          base64: rawDataUrl.split(',')[1] ?? '',
          mimeType: file.type || 'image/jpeg',
          preview: rawDataUrl,
        });
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'));
    reader.readAsDataURL(file);
  });
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}