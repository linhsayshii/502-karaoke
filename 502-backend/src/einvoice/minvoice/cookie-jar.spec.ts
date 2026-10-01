import { CookieJar } from './cookie-jar';

describe('CookieJar', () => {
  it('keeps the last value of each cookie and drops expired ones', () => {
    const jar = new CookieJar('__tenant=t1');
    jar.store([
      'XSRF-TOKEN=a; path=/',
      '.AspNetCore.Identity.Application=s1; path=/; httponly',
      'XSRF-TOKEN=b; path=/',
    ]);
    expect(jar.get('XSRF-TOKEN')).toBe('b');
    jar.store([
      '.AspNetCore.Identity.Application=; expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ]);
    expect(jar.get('.AspNetCore.Identity.Application')).toBeUndefined();
    expect(jar.header()).toBe('__tenant=t1; XSRF-TOKEN=b');
  });
});
