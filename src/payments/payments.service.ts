import { Inject, Injectable, Logger } from '@nestjs/common';
import { envs, NATS_SERVICE } from 'src/config';
import Stripe from 'stripe';
import { PaymentSessionDto } from './dto/payment-session.dto';
import { Request, Response } from 'express';
import { ClientProxy } from '@nestjs/microservices';

@Injectable()
export class PaymentsService {
  private readonly stripe = new Stripe(envs.stripeSecret);
  private readonly logger = new Logger('Payment-MS Service');

  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy) {}

  async createPaymentSession(paymentSessionDto: PaymentSessionDto) {
    const { currency, items, orderId } = paymentSessionDto;
    const lineItems = items.map((lineItem) => ({
      price_data: {
        currency: currency,
        product_data: {
          name: lineItem.name,
        },
        unit_amount: Math.round(lineItem.price * 100), // x100 para quitar decimales
      },
      quantity: lineItem.quantity,
    }));

    const session = await this.stripe.checkout.sessions.create({
      // Colocar aquí el ID de la orden
      payment_intent_data: {
        metadata: {
          orderId: orderId,
        },
      },

      line_items: lineItems,
      mode: 'payment',
      success_url: envs.stripeSuccessUrl,
      cancel_url: envs.stripeCancelledUrl,
    });

    return {
      successUrl: session.success_url,
      cancelledUrl: session.cancel_url,
      url: session.url,
    };
  }

  success() {
    return {
      ok: true,
      message: 'Payment successful',
    };
  }

  cancelled() {
    return {
      ok: false,
      message: 'Payment cancelled',
    };
  }

  async stripeWebhook(req: Request, res: Response) {
    const sig = req.headers['stripe-signature'];

    let event: Stripe.Event;

    const endpointSecret = envs.stripeEndpointSecret;

    try {
      event = this.stripe.webhooks.constructEvent(
        req['rawBody'],
        sig,
        endpointSecret,
      );
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    switch (event.type) {
      case 'charge.succeeded':
        const chargeSucceeded = event.data.object;
        const payload = {
          stripePaymentId: chargeSucceeded.id,
          orderId: chargeSucceeded.metadata.orderId,
          receiptUrl: chargeSucceeded.receipt_url,
        };

        this.client.emit('payment.succeeded', payload);
        break;
      default:
        console.log(`Event ${event.type} not handled`);
    }
    return res.status(200).json({ sig });
  }
}
