// Small browser-side image helpers shared by the report flow.

export interface CapturedImage {
  /** Base64 WITHOUT the data-URL prefix — what /api/triage and Storage want. */
  base64: string;
  mimeType: string;
  /** Full data URL, for <img> previews. */
  preview: string;
}

export function fileToCapturedImage(file: File): Promise<CapturedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve({
        base64: dataUrl.split(",")[1] ?? "",
        mimeType: file.type || "image/jpeg",
        preview: dataUrl,
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}
