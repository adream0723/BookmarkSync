/**
 * Show a Chrome desktop notification (右下角弹窗)
 */
export function showNotification(title: string, message: string) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/128.png'),
    title,
    message,
  });
}
