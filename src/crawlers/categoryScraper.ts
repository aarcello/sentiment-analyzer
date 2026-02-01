import axios from 'axios';
import * as cheerio from 'cheerio';

export interface ScrapedProduct {
  name: string;
  brand: string;
  price?: string;
  rating?: number;
  reviewCount?: number;
  url: string;
  imageUrl?: string;
}

export interface CategoryScrapeResult {
  success: boolean;
  categoryUrl: string;
  platform: string;
  products: ScrapedProduct[];
  error?: string;
}

// Platform-specific selectors for category pages
const PLATFORM_SELECTORS: Record<string, {
  productContainer: string;
  name: string;
  brand: string;
  price: string;
  rating: string;
  reviewCount: string;
  link: string;
  image: string;
}> = {
  tesco: {
    productContainer: '[data-auto="product-tile"], .product-tile, .product-list--list-item',
    name: '[data-auto="product-tile--title"], .product-tile--title, .product-details--content h3',
    brand: '[data-auto="product-tile--brand"], .product-tile--brand',
    price: '[data-auto="price-value"], .price-per-sellable-unit .value, .beans-price__text',
    rating: '[data-auto="star-rating"], .star-rating',
    reviewCount: '[data-auto="review-count"], .review-count',
    link: 'a[href*="/products/"]',
    image: 'img[src*="digitalcontent"]',
  },
  amazon: {
    productContainer: '[data-component-type="s-search-result"], .s-result-item',
    name: 'h2 a span, .a-size-medium',
    brand: '.a-size-base-plus, .a-row .a-size-base:first-child',
    price: '.a-price .a-offscreen, .a-price-whole',
    rating: '.a-icon-star-small .a-icon-alt, .a-icon-star .a-icon-alt',
    reviewCount: '.a-size-base.s-underline-text, [aria-label*="reviews"]',
    link: 'h2 a, a.a-link-normal[href*="/dp/"]',
    image: '.s-image',
  },
  walmart: {
    productContainer: '[data-item-id], .search-result-gridview-item',
    name: '[data-automation-id="product-title"], .product-title-link span',
    brand: '.product-brand, .w_V_DM',
    price: '[data-automation-id="product-price"] .f6, .price-main .visuallyhidden',
    rating: '.stars-container, .star-rating',
    reviewCount: '.stars-reviews-count, .f7',
    link: 'a[link-identifier="linkProductCard"]',
    image: 'img[data-testid="productTileImage"]',
  },
  bestbuy: {
    productContainer: '.sku-item, .list-item',
    name: '.sku-title a, .sku-header a',
    brand: '.sku-title a, .sku-header a',
    price: '.priceView-customer-price span, .pricing-price__regular-price',
    rating: '.c-ratings-reviews-v4 .c-stars-v4',
    reviewCount: '.c-ratings-reviews-v4 .c-reviews',
    link: '.sku-title a, .sku-header a',
    image: '.product-image img',
  },
  generic: {
    productContainer: '.product, .product-item, .product-card, [class*="product"]',
    name: '.product-name, .product-title, h2, h3',
    brand: '.brand, .product-brand, [class*="brand"]',
    price: '.price, .product-price, [class*="price"]',
    rating: '.rating, .stars, [class*="rating"]',
    reviewCount: '.review-count, .reviews, [class*="review"]',
    link: 'a[href*="product"], a[href*="item"], a:first-of-type',
    image: 'img',
  },
};

function detectPlatform(url: string): string {
  const hostname = new URL(url).hostname.toLowerCase();

  if (hostname.includes('tesco')) return 'tesco';
  if (hostname.includes('amazon')) return 'amazon';
  if (hostname.includes('walmart')) return 'walmart';
  if (hostname.includes('bestbuy')) return 'bestbuy';
  if (hostname.includes('target')) return 'generic';
  if (hostname.includes('argos')) return 'generic';

  return 'generic';
}

function extractRating(text: string): number | undefined {
  const match = text.match(/(\d+(\.\d+)?)\s*(out of|\/|stars?)/i) || text.match(/(\d+(\.\d+)?)/);
  if (match) {
    const rating = parseFloat(match[1]);
    if (rating <= 5) return rating;
    if (rating <= 100) return rating / 20; // Convert percentage to 5-star
  }
  return undefined;
}

function extractReviewCount(text: string): number | undefined {
  const match = text.match(/(\d+,?\d*)\s*(reviews?|ratings?)/i) || text.match(/\((\d+,?\d*)\)/);
  if (match) {
    return parseInt(match[1].replace(',', ''));
  }
  return undefined;
}

function cleanPrice(text: string): string {
  const match = text.match(/[\$£€]?\s*\d+([.,]\d{2})?/);
  return match ? match[0].trim() : text.trim();
}

function generateProductId(name: string, index: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);
  return `${slug}-${index}`;
}

function extractBrandFromName(name: string): string {
  // Common pattern: brand is first word(s) before product type
  const words = name.split(/\s+/);
  if (words.length >= 2) {
    // Return first 1-2 words as brand if they look like a brand name
    const firstWord = words[0];
    if (firstWord.length > 1 && /^[A-Z]/.test(firstWord)) {
      return firstWord;
    }
  }
  return 'Unknown';
}

export async function scrapeCategoryPage(categoryUrl: string): Promise<CategoryScrapeResult> {
  try {
    const platform = detectPlatform(categoryUrl);
    const selectors = PLATFORM_SELECTORS[platform];

    console.log(`Scraping category page: ${categoryUrl}`);
    console.log(`Detected platform: ${platform}`);

    const response = await axios.get(categoryUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
      timeout: 30000,
    });

    const $ = cheerio.load(response.data);
    const products: ScrapedProduct[] = [];

    $(selectors.productContainer).each((index, element) => {
      const $product = $(element);

      // Extract name
      let name = $product.find(selectors.name).first().text().trim();
      if (!name) {
        name = $product.find('h2, h3, h4').first().text().trim();
      }
      if (!name || name.length < 3) return; // Skip invalid products

      // Extract brand
      let brand = $product.find(selectors.brand).first().text().trim();
      if (!brand || brand === name) {
        brand = extractBrandFromName(name);
      }

      // Extract price
      let price: string | undefined;
      const priceText = $product.find(selectors.price).first().text().trim();
      if (priceText) {
        price = cleanPrice(priceText);
      }

      // Extract rating
      let rating: number | undefined;
      const ratingEl = $product.find(selectors.rating).first();
      const ratingText = ratingEl.attr('aria-label') || ratingEl.text().trim();
      if (ratingText) {
        rating = extractRating(ratingText);
      }

      // Extract review count
      let reviewCount: number | undefined;
      const reviewText = $product.find(selectors.reviewCount).first().text().trim();
      if (reviewText) {
        reviewCount = extractReviewCount(reviewText);
      }

      // Extract URL
      let url = '';
      const linkEl = $product.find(selectors.link).first();
      const href = linkEl.attr('href');
      if (href) {
        url = href.startsWith('http') ? href : new URL(href, categoryUrl).toString();
      }

      // Extract image URL
      let imageUrl: string | undefined;
      const imgEl = $product.find(selectors.image).first();
      const src = imgEl.attr('src') || imgEl.attr('data-src');
      if (src) {
        imageUrl = src.startsWith('http') ? src : new URL(src, categoryUrl).toString();
      }

      // Only add if we have essential data
      if (name && url) {
        products.push({
          name,
          brand,
          price,
          rating,
          reviewCount,
          url,
          imageUrl,
        });
      }
    });

    console.log(`Found ${products.length} products`);

    return {
      success: true,
      categoryUrl,
      platform,
      products,
    };
  } catch (error) {
    console.error('Failed to scrape category page:', error);
    return {
      success: false,
      categoryUrl,
      platform: detectPlatform(categoryUrl),
      products: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Demo function to generate sample products for testing
export function generateDemoProducts(categoryUrl: string, count: number = 10): CategoryScrapeResult {
  const platform = detectPlatform(categoryUrl);

  const demoProducts: { name: string; brand: string; category: string }[] = [
    { name: 'Premium Air Freshener Spray Lavender', brand: 'Febreze', category: 'Air Fresheners' },
    { name: 'Automatic Room Spray Refill Ocean Breeze', brand: 'Air Wick', category: 'Air Fresheners' },
    { name: 'Scented Candle Vanilla & Coconut 3-Pack', brand: 'Yankee Candle', category: 'Home Fragrance' },
    { name: 'Plug-In Air Freshener Starter Kit', brand: 'Glade', category: 'Air Fresheners' },
    { name: 'Reed Diffuser Set Eucalyptus Mint', brand: 'Chesapeake Bay', category: 'Home Fragrance' },
    { name: 'Odor Eliminator Spray Fresh Linen', brand: 'Ozium', category: 'Air Fresheners' },
    { name: 'Wax Melts Variety Pack 12-Count', brand: 'Scentsy', category: 'Home Fragrance' },
    { name: 'Car Air Freshener Vent Clips 4-Pack', brand: 'Febreze', category: 'Auto Fragrance' },
    { name: 'Essential Oil Diffuser with LED Lights', brand: 'InnoGear', category: 'Home Fragrance' },
    { name: 'Bathroom Spray Before-You-Go Original', brand: 'Poo-Pourri', category: 'Air Fresheners' },
    { name: 'Gel Air Freshener Clean Cotton', brand: 'Renuzit', category: 'Air Fresheners' },
    { name: 'Aromatherapy Candle Stress Relief', brand: 'Bath & Body Works', category: 'Home Fragrance' },
    { name: 'Fabric Refresher Spray Antibacterial', brand: 'Febreze', category: 'Fabric Care' },
    { name: 'Incense Sticks Sandalwood 100-Pack', brand: 'HEM', category: 'Home Fragrance' },
    { name: 'Room Spray Collection Gift Set', brand: 'Caldrea', category: 'Home Fragrance' },
  ];

  const products: ScrapedProduct[] = demoProducts.slice(0, count).map((p, i) => ({
    name: p.name,
    brand: p.brand,
    price: `£${(2.99 + Math.random() * 15).toFixed(2)}`,
    rating: 3.5 + Math.random() * 1.5,
    reviewCount: Math.floor(50 + Math.random() * 500),
    url: `${categoryUrl.replace(/\/$/, '')}/${p.name.toLowerCase().replace(/\s+/g, '-')}`,
    imageUrl: undefined,
  }));

  return {
    success: true,
    categoryUrl,
    platform,
    products,
  };
}
