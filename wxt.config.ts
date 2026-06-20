import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  manifest: {
    name: 'BookmarkSync',
    description: 'Multi-platform bookmark sync tool',
    permissions: ['bookmarks', 'storage', 'alarms', 'notifications'],
    host_permissions: [
      'https://api.github.com/*',
      'https://gitee.com/*',
    ],
  },
});
