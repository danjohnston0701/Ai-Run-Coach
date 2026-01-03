// Seed script to create Basic and Pro subscription products in Stripe
import { getUncachableStripeClient, getStripeSync } from './stripeClient';
import { runMigrations } from 'stripe-replit-sync';

interface SubscriptionTier {
  name: string;
  description: string;
  priceMonthly: number; // in cents
  metadata: Record<string, string>;
}

const tiers: SubscriptionTier[] = [
  {
    name: 'Basic',
    description: 'Essential running features with AI route generation and GPS tracking',
    priceMonthly: 499, // $4.99
    metadata: { tier: 'basic' },
  },
  {
    name: 'Pro',
    description: 'Premium features with advanced AI coaching, live sharing, and performance analytics',
    priceMonthly: 999, // $9.99
    metadata: { tier: 'pro' },
  },
];

async function seedProducts() {
  console.log('Starting Stripe product seeding...');
  
  try {
    // Run migrations to ensure stripe schema exists
    console.log('Running Stripe schema migrations...');
    await runMigrations({
      databaseUrl: process.env.DATABASE_URL!,
    });
    
    const stripe = await getUncachableStripeClient();
    const sync = await getStripeSync();
    
    for (const tier of tiers) {
      console.log(`\nCreating ${tier.name} tier...`);
      
      // Check if product already exists by searching
      const existingProducts = await stripe.products.search({
        query: `name:"${tier.name}" AND active:"true"`,
      });
      
      let product;
      if (existingProducts.data.length > 0) {
        product = existingProducts.data[0];
        console.log(`  Product "${tier.name}" already exists (${product.id})`);
      } else {
        product = await stripe.products.create({
          name: tier.name,
          description: tier.description,
          metadata: tier.metadata,
        });
        console.log(`  Created product "${tier.name}" (${product.id})`);
      }
      
      // Check if a monthly price exists for this product
      const existingPrices = await stripe.prices.list({
        product: product.id,
        active: true,
        type: 'recurring',
      });
      
      const hasMatchingPrice = existingPrices.data.some(
        p => p.unit_amount === tier.priceMonthly && p.recurring?.interval === 'month'
      );
      
      if (hasMatchingPrice) {
        console.log(`  Monthly price for "${tier.name}" already exists`);
      } else {
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: tier.priceMonthly,
          currency: 'usd',
          recurring: {
            interval: 'month',
          },
          metadata: tier.metadata,
        });
        console.log(`  Created monthly price $${tier.priceMonthly / 100}/mo (${price.id})`);
      }
    }
    
    // Products created in Stripe - we'll query them directly via API
    console.log('\nProducts created in Stripe successfully!');
    console.log('Products will be fetched directly from Stripe API when needed.');
    
    console.log('\nProduct seeding complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding products:', error);
    process.exit(1);
  }
}

seedProducts();
