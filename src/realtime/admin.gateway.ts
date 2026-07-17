import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class AdminGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  afterInit() {
    console.log('Realtime Admin Gateway Initialized');
  }

  handleConnection(client: Socket) {
    console.log('Admin connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('Admin disconnected:', client.id);
  }

  // 🔥 EMIT NEW PAYMENT
  emitNewPayment(payment: any) {
    this.server.emit('payment:new', payment);
  }

  emitPaymentUpdate(payment: any) {
    this.server.emit('payment:update', payment);
  }

  // 📊 analytics updates
  emitAnalyticsUpdate(data: any) {
    this.server.emit('analytics:update', data);
  }
}
