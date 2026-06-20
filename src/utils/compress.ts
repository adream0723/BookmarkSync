import LZString from 'lz-string';

export function compress(data: string): string {
  return LZString.compressToUTF16(data);
}

export function decompress(data: string): string {
  return LZString.decompressFromUTF16(data) || data;
}

/**
 * Encode 4-byte Unicode characters (emoji etc.) as \uXXXX surrogate pairs.
 * Gitee MySQL utf8mb3 cannot store 4-byte characters, so we escape them
 * as ASCII-safe JSON escape sequences which JSON.parse will decode back.
 */
export function encodeEmoji(text: string): string {
  return text.replace(/[\u{10000}-\u{10FFFF}]/gu, c =>
    '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') +
    '\\u' + c.charCodeAt(1).toString(16).toUpperCase().padStart(4, '0')
  );
}
