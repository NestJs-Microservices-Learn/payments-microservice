import { Injectable } from '@nestjs/common';
import { envs } from 'src/config';
import Stripe from 'stripe';
import { PaymentSessionDto } from './dto/payment-session.dto';
import { Request, Response } from 'express';

@Injectable()
export class PaymentsService {
  private readonly stripe = new Stripe(envs.stripeSecret);

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
      success_url: 'http://localhost:3003/payments/success',
      cancel_url: 'http://localhost:3003/payments/cancelled',
    });

    return session;
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
    // Testing
    // const endpointSecret =
    //   'whsec_ae603eca7eb62eee633b3bb858b3eef3580335d2857e4194b85b65c18ab08250';

    //Real
    const endpointSecret = 'whsec_OKvINcfuEXvbaNrw2e5Q5SJ7GlUFDaAm';

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
        console.log({
          metadata: chargeSucceeded.metadata,
          orderId: chargeSucceeded.metadata.orderId,
        });
        break;
      default:
        console.log(`Event ${event.type} not handled`);
    }
    return res.status(200).json({ sig });
  }
}
