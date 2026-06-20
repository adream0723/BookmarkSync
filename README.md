# BookmarkSync

> [English](README.en.md) | [中文](README.md)

> [!WARNING]
> 使用前请自行备份书签。本工具按「现状」提供，不保证功能完全稳定可靠，书签数据丢失风险自负。

浏览器书签跨平台同步工具。基于 Gist（Gitee/GitHub）存储，支持智能合并、手动合并、AES-256-GCM 加密、多语言界面、时光机回滚。

> 更多存储方式（WebDAV、自建 Git 仓库等）待后续支持。

---

## 功能

- **多端同步** — 基于 Gitee Gist / GitHub Gist 存储书签数据
- **智能三向合并** — 自动合并本地与云端的增、删、改，冲突自动仲裁
- **手动合并** — 三栏对比界面，逐项选择保留/删除
- **排序同步策略** — 不同步 / 云端优先 / 本地优先
- **防误删保护** — 检测到大量删除时自动弹出手动合并确认
- **AES-256-GCM 加密** — 可选端到端加密，密码短语派生密钥
- **多语言** — 简体中文、繁体中文（台湾/香港/澳门）、日本語、한국어、English
- **时光机** — 自动备份快照，可查看历史书签树并一键恢复
- **自动同步** — 按设定间隔后台自动同步
- **深色主题** — 跟随系统 / 浅色 / 深色

## 安装

### Chrome 网上应用商店

_待上架_

### 手动加载

1. 下载构建产物或自行构建
2. 打开 `chrome://extensions`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `BookmarkSync/.output/chrome-mv3` 目录

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式（热更新）
pnpm dev

# 构建生产版本
pnpm build

# 构建产物输出到 .output/chrome-mv3/
```

## 技术栈

- **框架**: WXT + Vite + React
- **语言**: TypeScript
- **UI**: Bootstrap 4 + react-bootstrap
- **加密**: Web Crypto API (SubtleCrypto)
- **国际化**: react-i18next + i18next
- **包管理**: pnpm

## 许可证

MIT
