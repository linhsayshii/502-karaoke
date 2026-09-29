import {
  REPORT_CONNECTION_LIMIT,
  REPORT_POOL_TIMEOUT,
  reportDatabaseUrl,
} from './report-prisma.service';

describe('reportDatabaseUrl', () => {
  it('gives the report pool its own size and wait, keeping the rest', () => {
    const url = new URL(
      reportDatabaseUrl(
        'postgresql://u:p%40ss@db:5432/kara?schema=public&connection_limit=10&pool_timeout=20',
      )!,
    );
    expect(url.password).toBe('p%40ss');
    expect(url.pathname).toBe('/kara');
    expect(url.searchParams.get('schema')).toBe('public');
    expect(url.searchParams.get('connection_limit')).toBe(
      String(REPORT_CONNECTION_LIMIT),
    );
    expect(url.searchParams.get('pool_timeout')).toBe(
      String(REPORT_POOL_TIMEOUT),
    );
  });

  it('adds the parameters to a URL without any', () => {
    expect(reportDatabaseUrl('postgresql://u:p@localhost:5433/kara')).toBe(
      `postgresql://u:p@localhost:5433/kara?connection_limit=${REPORT_CONNECTION_LIMIT}&pool_timeout=${REPORT_POOL_TIMEOUT}`,
    );
  });
});
