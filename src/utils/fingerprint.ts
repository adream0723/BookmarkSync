/** Generate a fingerprint for a bookmark node (title + url) */
export function fp(title: string, url?: string): string {
  return `${title}||${url || ''}`;
}
