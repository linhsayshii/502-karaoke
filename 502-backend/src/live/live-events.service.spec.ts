import { Role } from '@prisma/client';
import { LiveEventsService } from './live-events.service';

// A stand-in for ws.WebSocket: only what the service touches.
class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  send(data: string, cb?: (err?: Error) => void) {
    this.sent.push(data);
    cb?.();
  }
}

describe('LiveEventsService', () => {
  const setup = () => {
    const service = new LiveEventsService();
    const reg = service.registry;
    const c1 = new FakeSocket();
    const m1 = new FakeSocket();
    const c2 = new FakeSocket();
    for (const s of [c1, m1, c2]) reg.open(s as never);
    reg.authenticate(
      c1 as never,
      { id: 1, role: Role.CASHIER, branchId: 1 },
      9e12,
    );
    reg.authenticate(
      m1 as never,
      { id: 2, role: Role.BRANCH_MANAGER, branchId: 1 },
      9e12,
    );
    reg.authenticate(
      c2 as never,
      { id: 3, role: Role.CASHIER, branchId: 2 },
      9e12,
    );
    return { service, c1, m1, c2 };
  };

  it('sends the flat JSON event to the recipients only', () => {
    const { service, c1, m1, c2 } = setup();
    service.orderChanged(1, 42);
    expect(c1.sent).toEqual([
      '{"type":"order.changed","branchId":1,"orderId":42}',
    ]);
    expect(m1.sent).toHaveLength(1);
    expect(c2.sent).toEqual([]);
  });

  it('skips sockets that are not open and never throws', () => {
    const { service, c1, m1 } = setup();
    c1.readyState = 3; // CLOSED
    m1.send = () => {
      throw new Error('boom');
    };
    expect(() => service.roomChanged(1, 7)).not.toThrow();
    expect(c1.sent).toEqual([]);
  });

  it('shapes the discount events as the spec lists them', () => {
    const { service, m1, c1 } = setup();
    service.discountRequested(1, 5);
    service.discountDecided(1, 42, 5, 'REJECTED');
    expect(m1.sent).toEqual([
      '{"type":"discount.requested","branchId":1,"requestId":5}',
      '{"type":"discount.decided","branchId":1,"orderId":42,"requestId":5,"status":"REJECTED"}',
    ]);
    expect(c1.sent).toEqual([
      '{"type":"discount.decided","branchId":1,"orderId":42,"requestId":5,"status":"REJECTED"}',
    ]);
  });
});
