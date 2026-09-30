import { Injectable, Logger } from '@nestjs/common';
import { DiscountRequestStatus } from '@prisma/client';
import { WebSocket } from 'ws';
import { LiveEvent } from './live-events';
import { LiveRegistry } from './live-registry';

// Tells the screens of a branch that something changed (spec §7). Callers
// emit AFTER their transaction has committed, never inside it: an event
// makes a screen call the REST API, and it must see the committed row.
// Sending is fire-and-forget; a failed send is logged, nothing is retried
// (the screen still polls).
@Injectable()
export class LiveEventsService {
  private readonly logger = new Logger(LiveEventsService.name);
  readonly registry = new LiveRegistry<WebSocket>();

  emit(event: LiveEvent) {
    const data = JSON.stringify(event);
    for (const socket of this.registry.recipients(event)) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      try {
        socket.send(data, (err) => {
          if (err) this.logger.error(`send ${event.type}: ${err.message}`);
        });
      } catch (err) {
        this.logger.error(`send ${event.type}: ${(err as Error).message}`);
      }
    }
  }

  roomChanged(branchId: number, roomId: number) {
    this.emit({ type: 'room.changed', branchId, roomId });
  }

  orderChanged(branchId: number, orderId: number) {
    this.emit({ type: 'order.changed', branchId, orderId });
  }

  discountRequested(branchId: number, requestId: number) {
    this.emit({ type: 'discount.requested', branchId, requestId });
  }

  discountDecided(
    branchId: number,
    orderId: number,
    requestId: number,
    status: DiscountRequestStatus,
  ) {
    this.emit({
      type: 'discount.decided',
      branchId,
      orderId,
      requestId,
      status,
    });
  }
}
