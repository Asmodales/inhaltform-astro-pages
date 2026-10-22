// Remember only an explicitly chosen device-save option. Legacy timelines alone
// never count as permission to resume persistent storage.
export const DEVICE_STORAGE_KEY = 'if-social-device-storage-v1';
let revokedHere = false;

export function deviceStorageEnabled() {
  try { return !revokedHere && localStorage.getItem(DEVICE_STORAGE_KEY) === 'yes'; }
  catch { return false; }
}

export function setDeviceStorageEnabled(enabled) {
  if (enabled) {
    localStorage.setItem(DEVICE_STORAGE_KEY, 'yes');
    revokedHere = false;
  } else {
    // Stop writes even if the browser refuses deletion of an older saved copy.
    revokedHere = true;
    localStorage.removeItem(DEVICE_STORAGE_KEY);
    localStorage.removeItem('timeline');
  }
}
