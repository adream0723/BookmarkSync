import ky from 'ky';

/**
 * Gitee API v5 HTTP client (access_token via query param for GET, body for PATCH)
 */
export const giteeHttp = ky.create({
  prefixUrl: 'https://gitee.com/api/v5',
  timeout: 15000,
  retry: 1,
  hooks: {
    beforeRequest: [
      request => {
        request.headers.set('Content-Type', 'application/json;charset=utf-8');
        request.headers.set('cache', 'no-store');
      }
    ]
  }
});

/**
 * GitHub API HTTP client (Bearer token auth via header)
 */
export const githubHttp = ky.create({
  prefixUrl: 'https://api.github.com',
  timeout: 15000,
  retry: 1,
  hooks: {
    beforeRequest: [
      request => {
        request.headers.set('Content-Type', 'application/json;charset=utf-8');
        request.headers.set('Accept', 'application/vnd.github+json');
        request.headers.set('cache', 'no-store');
      }
    ]
  }
});
