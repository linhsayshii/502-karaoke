// Cookies of one Minvoice session (port of the minvoice-hddt-sender CookieJar).
export class CookieJar {
  private cookies = new Map<string, string>();

  constructor(header = '') {
    for (const part of header.split(';')) {
      const at = part.indexOf('=');
      if (at > 0)
        this.cookies.set(part.slice(0, at).trim(), part.slice(at + 1).trim());
    }
  }

  // Set-Cookie headers of a response (Headers.getSetCookie()).
  store(setCookies: string[]) {
    for (const cookie of setCookies) {
      const pair = cookie.split(';')[0];
      const at = pair.indexOf('=');
      if (at <= 0) continue;
      const name = pair.slice(0, at).trim();
      const value = pair.slice(at + 1).trim();
      if (value === '' || /max-age=0/i.test(cookie) || isExpired(cookie)) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  set(name: string, value: string) {
    this.cookies.set(name, value);
  }

  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  header(): string {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

function isExpired(cookie: string): boolean {
  const match = /expires=([^;]+)/i.exec(cookie);
  if (!match) return false;
  const time = Date.parse(match[1]);
  return Number.isFinite(time) && time <= Date.now();
}
