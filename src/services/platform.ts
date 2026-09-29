/**
 * Platform protections from SPEC 3.4: persistent storage and install detection.
 * Safari may evict storage of sites not opened for 7 days; installed PWAs are usually exempt.
 */

/** Asks the browser not to evict our IndexedDB. Returns whether storage is persisted. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** True when running as an installed home-screen app. */
export function isInstalledApp(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Saves text as a file on the device (backup export). No network involved.
 * On iPhone the share sheet ("Save to Files") is more reliable than a download link, especially in
 * an installed PWA. Rejects with AbortError if the user closes the share sheet.
 */
export async function saveFile(fileName: string, text: string, mime = 'application/json'): Promise<void> {
  const file = new File([text], fileName, { type: mime });
  if (isIos() && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
