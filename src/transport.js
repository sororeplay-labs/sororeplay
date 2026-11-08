import { execFile } from 'node:child_process';

// Optional system transport for environments where Node HTTPS cannot connect.
// Certificate verification stays enabled, redirects are not followed, and request
// bodies go through stdin rather than shell interpolation or process arguments.
export function curlFetch(url, options = {}) {
  const parsed = new URL(url);
  const friendbotQuery = parsed.hostname === 'friendbot.stellar.org' && [...parsed.searchParams.keys()].length === 1 && /^G[A-Z2-7]{55}$/.test(parsed.searchParams.get('addr') || '');
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash || (parsed.search && !friendbotQuery)) throw new Error('curl fallback requires credential-free HTTPS');
  const method = options.method || 'GET';
  if (!['GET', 'POST'].includes(method)) throw new Error('Unsupported fallback method');
  const args = ['-q', '--ipv4', '--http1.1', '--silent', '--show-error', '--proto', '=https', '--connect-timeout', '10', '--max-time', '45', '--max-filesize', '16777216', '--request', method, '--write-out', '\n%{http_code}'];
  if (method === 'POST') args.push('--header', 'Content-Type: application/json', '--data-binary', '@-');
  args.push(parsed.href);
  return new Promise((resolve, reject) => {
    const child = execFile('curl', args, { timeout: 50000, maxBuffer: 17000000 }, (error, stdout) => {
      if (error) { reject(new Error('HTTPS fallback failed (curl exit ' + error.code + ') for ' + parsed.host)); return; }
      const split = stdout.lastIndexOf('\n');
      const status = Number(stdout.slice(split + 1));
      if (!Number.isInteger(status) || status < 200 || status > 599) { reject(new Error('Invalid fallback response status')); return; }
      resolve(new Response([204, 205, 304].includes(status) ? null : stdout.slice(0, split), { status }));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(method === 'POST' ? options.body || '' : undefined);
  });
}

export async function resilientFetch(url, options = {}, { fetcher = fetch, fallback = curlFetch, log = console.warn } = {}) {
  try { return await fetcher(url, options); }
  catch (error) {
    const code = error.cause?.code || error.name;
    log('Node HTTPS transport failed (' + code + '); retrying with IPv4 curl.');
    return fallback(url, options);
  }
}
