import { Injectable } from '@nestjs/common';
import {
  EinvoiceConfigService,
  type IssueConfig,
} from './einvoice-config.service';
import { classifySendError } from './minvoice/classify-send-error';
import {
  MinvoiceClient,
  type MinvoiceSession,
} from './minvoice/minvoice-client';

export type SendOutcome =
  | {
      kind: 'issued';
      minvoiceId: string;
      invoiceNumber: number;
      config: IssueConfig;
    }
  | { kind: 'failed'; message: string; dateOrder?: boolean }
  | { kind: 'uncertain'; message: string };

type Attempt = SendOutcome | { kind: 'retry'; message: string };

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Lỗi không xác định';

// Sends one invoice with the user's rule (spec 2026-10-01 §9.1): when
// Minvoice surely created nothing, log in again for a fresh cookie and token,
// fetch the symbol's current range and resend once. What may have been
// created is never resent.
@Injectable()
export class EinvoiceSender {
  constructor(
    private client: MinvoiceClient,
    private config: EinvoiceConfigService,
  ) {}

  async send(
    ready: IssueConfig,
    build: (config: IssueConfig) => Record<string, unknown>,
  ): Promise<SendOutcome> {
    let config = ready;
    let session: MinvoiceSession;
    try {
      session =
        config.session ??
        (await this.config.relogin(config.branchId, config.taxCode));
    } catch (error) {
      return { kind: 'failed', message: messageOf(error) };
    }

    const first = await this.attempt(config, session, build);
    if (first.kind !== 'retry') return first;

    // Nothing was created by the first request: a login or range failure
    // here leaves nothing on Minvoice either. The new session must be of the
    // tenant the invoice was locked for: the branch's account may belong to
    // another MST by now, and its cookies never go to this one's host.
    try {
      session = await this.config.relogin(config.branchId, config.taxCode);
      config = await this.config.refreshRange(config, session);
    } catch (error) {
      return { kind: 'failed', message: messageOf(error) };
    }
    const second = await this.attempt(config, session, build);
    return second.kind === 'retry'
      ? { kind: 'failed', message: second.message }
      : second;
  }

  private async attempt(
    config: IssueConfig,
    session: MinvoiceSession,
    build: (config: IssueConfig) => Record<string, unknown>,
  ): Promise<Attempt> {
    try {
      const created = await this.client.createInvoice(
        config.taxCode,
        session,
        build(config),
      );
      return {
        kind: 'issued',
        minvoiceId: created.id,
        invoiceNumber: created.invoiceNumber,
        config,
      };
    } catch (error) {
      const failure = classifySendError(error);
      if (failure.kind === 'date-order') {
        return { kind: 'failed', message: failure.message, dateOrder: true };
      }
      if (failure.kind === 'uncertain') {
        return { kind: 'uncertain', message: failure.message };
      }
      return { kind: 'retry', message: failure.message };
    }
  }
}
