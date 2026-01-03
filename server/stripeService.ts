// Stripe service - handles direct Stripe API operations
import { getUncachableStripeClient } from './stripeClient';

export class StripeService {
  async createCustomer(email: string, userId: string, name?: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({
      email,
      name: name || undefined,
      metadata: { userId },
    });
  }

  async createCheckoutSession(
    customerId: string, 
    priceId: string, 
    successUrl: string, 
    cancelUrl: string,
    userId: string,
    mode: 'subscription' | 'payment' = 'subscription'
  ) {
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { userId },
    });
  }

  async getCheckoutSession(sessionId: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.retrieve(sessionId);
  }

  async createCustomerPortalSession(customerId: string, returnUrl: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  async getProduct(productId: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.products.retrieve(productId);
  }

  async listProducts(active = true, limit = 20) {
    const stripe = await getUncachableStripeClient();
    const products = await stripe.products.list({ active, limit });
    return products.data;
  }

  async listProductsWithPrices(active = true, limit = 20) {
    const stripe = await getUncachableStripeClient();
    const products = await stripe.products.list({ active, limit });
    const prices = await stripe.prices.list({ active: true, limit: 100 });
    
    // Build products with prices
    return products.data.map(product => ({
      id: product.id,
      name: product.name,
      description: product.description,
      active: product.active,
      metadata: product.metadata,
      prices: prices.data
        .filter(price => price.product === product.id)
        .map(price => ({
          id: price.id,
          unitAmount: price.unit_amount,
          currency: price.currency,
          recurring: price.recurring,
          active: price.active,
          metadata: price.metadata,
        }))
        .sort((a, b) => (a.unitAmount || 0) - (b.unitAmount || 0)),
    }));
  }

  async getPrice(priceId: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.prices.retrieve(priceId);
  }

  async listPrices(active = true, limit = 20) {
    const stripe = await getUncachableStripeClient();
    const prices = await stripe.prices.list({ active, limit });
    return prices.data;
  }

  async getPricesForProduct(productId: string) {
    const stripe = await getUncachableStripeClient();
    const prices = await stripe.prices.list({ product: productId, active: true });
    return prices.data;
  }

  async getSubscription(subscriptionId: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.subscriptions.retrieve(subscriptionId);
  }

  async getCustomerSubscriptions(customerId: string) {
    const stripe = await getUncachableStripeClient();
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });
    return subscriptions.data;
  }
}

export const stripeService = new StripeService();
