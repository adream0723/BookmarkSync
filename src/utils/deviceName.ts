const osLabels: Record<string, string> = {
  win: 'Windows',
  mac: 'macOS',
  cros: 'ChromeOS',
  linux: 'Linux',
  android: 'Android',
  openbsd: 'OpenBSD',
};

function randomSuffix(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * Generate a default device name like "Windows - A3bK8x"
 */
export async function getDefaultDeviceName(): Promise<string> {
  let os = 'Unknown';
  try {
    const info = await chrome.runtime.getPlatformInfo();
    os = osLabels[info.os] || info.os;
  } catch {
    // Fallback: parse navigator.platform
    const p = navigator.platform || '';
    if (p.includes('Win')) os = 'Windows';
    else if (p.includes('Mac')) os = 'macOS';
    else if (p.includes('Linux')) os = 'Linux';
    else if (p.includes('Android')) os = 'Android';
  }
  return `${os} - ${randomSuffix()}`;
}
