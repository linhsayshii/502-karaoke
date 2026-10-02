import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { EinvoiceStatus, Prisma } from '@prisma/client';
import { LoginThrottle } from '../auth/login-throttle';
import type { AuthUser } from '../auth/auth-user';
import { BranchScopeService } from '../common/branch-scope.service';
import { fromDbDate } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { decryptSecret, encryptSecret } from './einvoice-secret';
import type { SellerProfile } from './einvoice-types';
import {
  MinvoiceClient,
  type InvoiceSymbol,
  type MarkerQuery,
  type MarkerSearch,
  type MinvoiceSession,
} from './minvoice/minvoice-client';
import {
  MinvoiceHttpError,
  MinvoiceLoginError,
} from './minvoice/minvoice-errors';
import { MinvoiceLoginDto, SelectSymbolDto } from './dto/config.dto';

// What the page may know about the Minvoice account of a branch: never the
// password, the cookie or the token (spec 2026-10-01 §7.1).
export interface EinvoiceConfigView {
  branchTaxCode: string | null;
  username: string | null;
  symbolCode: string | null;
  registerInvoiceId: string | null;
  sellerName: string | null;
  loginError: string | null;
  // Date of the newest issued invoice of the symbol: the lowest date allowed.
  minInvoiceDate: string | null;
  latestInvoiceNumber: number | null;
  needsLogin: boolean;
  configured: boolean;
}

// Everything an issue needs, decrypted (spec §8).
export interface IssueConfig {
  branchId: number;
  taxCode: string;
  symbolCode: string;
  registerInvoiceId: string;
  currencyId: string;
  seller: SellerProfile;
  session: MinvoiceSession | null;
}

// Minvoice (or the network to it) failed. 424, not 502: Cloudflare replaces an
// origin's 502 page with its own and the message would be lost.
export const minvoiceUnavailable = (error: unknown) =>
  new HttpException(
    `Không kết nối được Minvoice: ${error instanceof Error ? error.message : 'lỗi không xác định'}`,
    HttpStatus.FAILED_DEPENDENCY,
  );

const NO_TAX_CODE = 'Cơ sở chưa có mã số thuế. Nhập ở trang Cơ sở trước.';
const PASSWORD_CHANGED =
  'Mật khẩu Minvoice đã đổi, quản lý hệ thống cần đăng nhập lại';
const PASSWORD_UNREADABLE =
  'Không đọc được mật khẩu Minvoice đã lưu (khóa EINVOICE_SECRET đã đổi?), quản lý hệ thống cần đăng nhập lại';

// A session and the tenant it was opened on.
interface BranchLogin {
  taxCode: string;
  session: MinvoiceSession;
}

function parseSession(text: string | null): MinvoiceSession | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<MinvoiceSession>;
    return typeof value.cookie === 'string' &&
      typeof value.token === 'string' &&
      typeof value.userName === 'string'
      ? (value as MinvoiceSession)
      : null;
  } catch {
    return null;
  }
}

@Injectable()
export class EinvoiceConfigService {
  // Five wrong Minvoice passwords in 15 minutes lock the branch's login for
  // 15 minutes, before Minvoice locks the account itself. Only a wrong
  // password counts (MinvoiceLoginError reason 'password').
  private throttle = new LoginThrottle();
  // One re-login per branch at a time; at most one entry per branch.
  private relogins = new Map<number, Promise<BranchLogin>>();

  constructor(
    private prisma: PrismaService,
    private scope: BranchScopeService,
    private client: MinvoiceClient,
  ) {}

  async view(user: AuthUser, branchCode?: string): Promise<EinvoiceConfigView> {
    return this.viewOf(await this.scope.resolveBranchId(user, branchCode));
  }

  async viewOf(branchId: number): Promise<EinvoiceConfigView> {
    const [branch, config] = await Promise.all([
      this.prisma.branch.findUniqueOrThrow({
        where: { id: branchId },
        select: { taxCode: true },
      }),
      this.prisma.einvoiceConfig.findUnique({ where: { branchId } }),
    ]);
    const needsLogin =
      !config ||
      decryptSecret(config.passwordEnc) === null ||
      config.loginError !== null ||
      config.taxCode !== branch.taxCode;
    // JSON column: cast through unknown (an interface is not a JsonObject).
    const seller = (config?.seller ?? null) as unknown as SellerProfile | null;
    const latest = config?.symbolCode
      ? await this.latestIssued(config.taxCode, config.symbolCode)
      : null;
    return {
      branchTaxCode: branch.taxCode,
      username: config?.username ?? null,
      symbolCode: config?.symbolCode ?? null,
      registerInvoiceId: config?.registerInvoiceId ?? null,
      sellerName: seller?.legalName || null,
      loginError: config?.loginError ?? null,
      minInvoiceDate: latest?.invoiceDate ?? null,
      latestInvoiceNumber: latest?.invoiceNumber ?? null,
      needsLogin,
      configured:
        !needsLogin &&
        !!(
          config?.symbolCode &&
          config.registerInvoiceId &&
          config.currencyId &&
          seller
        ),
    };
  }

  // The newest issued invoice of a tenant + symbol; later invoices may not be
  // dated before it (spec §9.3). Einvoice(sellerTaxCode, symbolCode, invoiceDate).
  // Its number is the highest of that day (a number left null by a clash with
  // a hand-edited one comes last).
  async latestIssued(taxCode: string, symbolCode: string) {
    const row = await this.prisma.einvoice.findFirst({
      where: {
        sellerTaxCode: taxCode,
        symbolCode,
        status: EinvoiceStatus.ISSUED,
      },
      orderBy: [
        { invoiceDate: 'desc' },
        { invoiceNumber: { sort: 'desc', nulls: 'last' } },
      ],
      select: { invoiceDate: true, invoiceNumber: true },
    });
    return row
      ? {
          invoiceDate: fromDbDate(row.invoiceDate),
          invoiceNumber: row.invoiceNumber,
        }
      : null;
  }

  async login(
    user: AuthUser,
    branchCode: string | undefined,
    dto: MinvoiceLoginDto,
  ) {
    const branchId = await this.scope.resolveBranchId(user, branchCode);
    const branch = await this.prisma.branch.findUniqueOrThrow({
      where: { id: branchId },
      select: { taxCode: true },
    });
    if (!branch.taxCode) throw new BadRequestException(NO_TAX_CODE);
    const key = `einvoice:${branchId}`;
    this.throttle.assertAllowed(key, 'Đăng nhập Minvoice sai');

    const username = dto.username.trim();
    let session: MinvoiceSession;
    try {
      session = await this.client.login(branch.taxCode, username, dto.password);
    } catch (error) {
      if (error instanceof MinvoiceLoginError) {
        if (error.reason === 'password') this.throttle.recordFailure(key);
        throw new BadRequestException(error.message);
      }
      throw minvoiceUnavailable(error);
    }
    this.throttle.recordSuccess(key);

    const previous = await this.prisma.einvoiceConfig.findUnique({
      where: { branchId },
      select: { taxCode: true },
    });
    const account = {
      taxCode: branch.taxCode,
      username,
      passwordEnc: encryptSecret(dto.password),
      sessionEnc: encryptSecret(JSON.stringify(session)),
      loginError: null,
      loggedInAt: new Date(),
      updatedById: user.id,
    };
    // Another tenant: the symbol, seller and currency of the old one do not apply.
    const reset =
      previous && previous.taxCode !== branch.taxCode
        ? {
            symbolCode: null,
            registerInvoiceId: null,
            currencyId: null,
            seller: Prisma.DbNull,
          }
        : {};
    await this.prisma.einvoiceConfig.upsert({
      where: { branchId },
      create: { branchId, ...account },
      update: { ...account, ...reset },
    });
    return this.viewOf(branchId);
  }

  async symbols(user: AuthUser, branchCode: string | undefined, year?: number) {
    const branchId = await this.scope.resolveBranchId(user, branchCode);
    const symbols = await this.withSession(branchId, (taxCode, session) =>
      this.client.listSymbols(
        taxCode,
        session,
        year ?? new Date().getFullYear(),
      ),
    );
    return { symbols };
  }

  async selectSymbol(
    user: AuthUser,
    branchCode: string | undefined,
    dto: SelectSymbolDto,
  ) {
    const branchId = await this.scope.resolveBranchId(user, branchCode);
    const symbols = await this.withSession(branchId, (taxCode, session) =>
      this.client.listSymbols(taxCode, session),
    );
    const symbol = symbols.find(
      (s) => s.registerInvoiceId === dto.registerInvoiceId,
    );
    if (!symbol) {
      throw new BadRequestException(
        'Ký hiệu không có trong danh sách của tài khoản Minvoice',
      );
    }
    const [seller, currencyId] = await this.withSession(
      branchId,
      (taxCode, session) =>
        Promise.all([
          this.client.getSeller(taxCode, session),
          this.client.getVndCurrencyId(taxCode, session),
        ]),
    );
    await this.prisma.einvoiceConfig.update({
      where: { branchId },
      data: {
        symbolCode: symbol.symbolCode,
        registerInvoiceId: symbol.registerInvoiceId,
        currencyId,
        seller: seller as unknown as Prisma.InputJsonObject,
        updatedById: user.id,
      },
    });
    return this.viewOf(branchId);
  }

  async readyForIssue(branchId: number): Promise<IssueConfig> {
    const config = await this.account(branchId);
    const seller = config.seller as unknown as SellerProfile | null;
    if (
      !config.symbolCode ||
      !config.registerInvoiceId ||
      !config.currencyId ||
      !seller
    ) {
      throw new BadRequestException('Chưa chọn ký hiệu hóa đơn cho cơ sở này');
    }
    if (decryptSecret(config.passwordEnc) === null) {
      throw new BadRequestException(PASSWORD_UNREADABLE);
    }
    return {
      branchId,
      taxCode: config.taxCode,
      symbolCode: config.symbolCode,
      registerInvoiceId: config.registerInvoiceId,
      currencyId: config.currencyId,
      seller,
      session: parseSession(decryptSecret(config.sessionEnc)),
    };
  }

  // The current range of the same symbol after a re-login (the user's rule,
  // spec §9.1); stored so the next issue starts from it.
  async refreshRange(
    config: IssueConfig,
    session: MinvoiceSession,
  ): Promise<IssueConfig> {
    let symbols: InvoiceSymbol[];
    try {
      symbols = await this.client.listSymbols(config.taxCode, session);
    } catch (error) {
      throw minvoiceUnavailable(error);
    }
    const symbol = symbols.find((s) => s.symbolCode === config.symbolCode);
    if (!symbol) {
      throw new BadRequestException(
        `Ký hiệu ${config.symbolCode} không còn dùng được, chọn ký hiệu khác`,
      );
    }
    if (symbol.registerInvoiceId !== config.registerInvoiceId) {
      // Only while the branch still uses this symbol: a symbol chosen during
      // the send keeps its own range.
      await this.prisma.einvoiceConfig.updateMany({
        where: { branchId: config.branchId, symbolCode: config.symbolCode },
        data: { registerInvoiceId: symbol.registerInvoiceId },
      });
    }
    return { ...config, registerInvoiceId: symbol.registerInvoiceId, session };
  }

  // Looks an invoice up by our reference (spec §9.2) with the branch's
  // session, logging in again once when Minvoice refuses it. Only on the
  // tenant it was sent to: another one cannot hold it, so finding nothing
  // there would prove nothing.
  findByMarker(
    branchId: number,
    sellerTaxCode: string,
    query: MarkerQuery,
  ): Promise<MarkerSearch> {
    return this.withSession(branchId, (taxCode, session) => {
      if (taxCode !== sellerTaxCode) {
        throw new BadRequestException(
          `Hóa đơn đã gửi với MST ${sellerTaxCode}, cơ sở nay dùng MST ${taxCode}`,
        );
      }
      return this.client.findByMarker(taxCode, session, query);
    });
  }

  // Logs the branch in again with the stored password, one at a time per
  // branch. With `taxCode`, the session must be of that tenant: the branch may
  // have moved to another MST (and logged in to its account) since the caller
  // read its config, and the caller is about to talk to that MST's host.
  async relogin(branchId: number, taxCode?: string): Promise<MinvoiceSession> {
    let running = this.relogins.get(branchId);
    if (!running) {
      running = this.loginAgain(branchId).finally(() =>
        this.relogins.delete(branchId),
      );
      this.relogins.set(branchId, running);
    }
    const login = await running;
    if (taxCode !== undefined && login.taxCode !== taxCode) {
      throw new BadRequestException(
        `MST của cơ sở đã đổi từ ${taxCode} sang ${login.taxCode}, tải lại rồi thử lại`,
      );
    }
    return login.session;
  }

  // Runs a read with the stored session, logging in again once when Minvoice
  // refuses it (reads are safe to repeat).
  private async withSession<T>(
    branchId: number,
    read: (taxCode: string, session: MinvoiceSession) => Promise<T>,
  ): Promise<T> {
    const config = await this.account(branchId);
    const stored = parseSession(decryptSecret(config.sessionEnc));
    if (stored) {
      try {
        return await read(config.taxCode, stored);
      } catch (error) {
        if (!(error instanceof MinvoiceHttpError)) {
          throw minvoiceUnavailable(error);
        }
      }
    }
    const fresh = await this.relogin(branchId, config.taxCode);
    try {
      return await read(config.taxCode, fresh);
    } catch (error) {
      throw minvoiceUnavailable(error);
    }
  }

  private async loginAgain(branchId: number): Promise<BranchLogin> {
    const config = await this.account(branchId);
    const password = decryptSecret(config.passwordEnc);
    if (password === null) throw new BadRequestException(PASSWORD_UNREADABLE);
    try {
      const session = await this.client.login(
        config.taxCode,
        config.username,
        password,
      );
      await this.prisma.einvoiceConfig.update({
        where: { branchId },
        data: {
          sessionEnc: encryptSecret(JSON.stringify(session)),
          loginError: null,
          loggedInAt: new Date(),
        },
      });
      return { taxCode: config.taxCode, session };
    } catch (error) {
      if (error instanceof MinvoiceLoginError) {
        // Only a refused password means it was changed; a locked, not
        // allowed or two-factor account keeps its own message.
        const message =
          error.reason === 'password' ? PASSWORD_CHANGED : error.message;
        await this.prisma.einvoiceConfig.update({
          where: { branchId },
          data: { loginError: message, sessionEnc: null },
        });
        throw new BadRequestException(message);
      }
      throw minvoiceUnavailable(error);
    }
  }

  // The branch's config when it may talk to Minvoice at all.
  private async account(branchId: number) {
    const [branch, config] = await Promise.all([
      this.prisma.branch.findUniqueOrThrow({
        where: { id: branchId },
        select: { taxCode: true },
      }),
      this.prisma.einvoiceConfig.findUnique({ where: { branchId } }),
    ]);
    if (!branch.taxCode) throw new BadRequestException(NO_TAX_CODE);
    if (!config) {
      throw new BadRequestException('Chưa đăng nhập Minvoice cho cơ sở này');
    }
    if (config.taxCode !== branch.taxCode) {
      throw new BadRequestException(
        'MST của cơ sở đã đổi, quản lý hệ thống cần đăng nhập Minvoice lại',
      );
    }
    if (config.loginError) throw new BadRequestException(config.loginError);
    return config;
  }
}
