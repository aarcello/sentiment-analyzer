import axios, { AxiosInstance } from 'axios';
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
  totalPages?: number;
  error?: string;
}

export interface ScrapeProgress {
  currentPage: number;
  totalPages?: number;
  productsFound: number;
  status: string;
}

export type ProgressCallback = (progress: ScrapeProgress) => void;

// Platform-specific configuration
interface PlatformConfig {
  selectors: {
    productContainer: string;
    name: string;
    brand: string;
    price: string;
    rating: string;
    reviewCount: string;
    link: string;
    image: string;
  };
  pagination: {
    // URL pattern for pagination - use {page} or {offset} as placeholder
    urlPattern?: string;
    // Selector for next page link
    nextPageSelector?: string;
    // Selector to find total count/pages
    totalCountSelector?: string;
    // Items per page (for offset calculation)
    itemsPerPage: number;
    // Max pages to scrape (safety limit)
    maxPages: number;
    // Query param name for page number
    pageParam?: string;
    // Query param name for offset
    offsetParam?: string;
    // Starting page number (usually 1 or 0)
    startPage: number;
  };
}

const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  tesco: {
    selectors: {
      productContainer: '[data-auto="product-tile"], .product-tile, .product-list--list-item, li[class*="product-list"]',
      name: '[data-auto="product-tile--title"], .product-tile--title, .product-details--content h3, a[data-auto="product-tile--title"]',
      brand: '[data-auto="product-tile--brand"], .product-tile--brand',
      price: '[data-auto="price-value"], .price-per-sellable-unit .value, .beans-price__text, [class*="price"] .value',
      rating: '[data-auto="star-rating"], .star-rating',
      reviewCount: '[data-auto="review-count"], .review-count',
      link: 'a[href*="/products/"]',
      image: 'img[src*="digitalcontent"], img[srcset*="digitalcontent"]',
    },
    pagination: {
      pageParam: 'page',
      itemsPerPage: 24,
      maxPages: 100,
      startPage: 1,
      totalCountSelector: '[data-auto="pagination-total"], .pagination-component .total, [class*="results-count"]',
      nextPageSelector: 'a[data-auto="pagination-next"], .pagination-btn-holder--next a, a[rel="next"]',
    },
  },
  amazon: {
    selectors: {
      productContainer: '[data-component-type="s-search-result"], .s-result-item[data-asin]',
      name: 'h2 a span, h2 span.a-text-normal',
      brand: '.a-size-base-plus.a-color-base, .a-row.a-size-base span:first-child',
      price: '.a-price .a-offscreen',
      rating: '.a-icon-star-small .a-icon-alt',
      reviewCount: '.a-size-base.s-underline-text',
      link: 'h2 a.a-link-normal',
      image: '.s-image',
    },
    pagination: {
      pageParam: 'page',
      itemsPerPage: 48,
      maxPages: 20,
      startPage: 1,
      nextPageSelector: '.s-pagination-next:not(.s-pagination-disabled)',
      totalCountSelector: '.s-breadcrumb .a-color-state, [data-component-type="s-result-info-bar"]',
    },
  },
  walmart: {
    selectors: {
      productContainer: '[data-item-id], [data-testid="item-stack"]',
      name: '[data-automation-id="product-title"], span[data-automation-id="product-title"]',
      brand: '.w_V_DM',
      price: '[data-automation-id="product-price"] .f6 .f2, [itemprop="price"]',
      rating: '.stars-container',
      reviewCount: '.stars-reviews-count',
      link: 'a[link-identifier="linkProductCard"], a[href*="/ip/"]',
      image: 'img[data-testid="productTileImage"]',
    },
    pagination: {
      pageParam: 'page',
      itemsPerPage: 40,
      maxPages: 25,
      startPage: 1,
      nextPageSelector: '[data-testid="NextPage"], a[aria-label="Next Page"]',
    },
  },
  bestbuy: {
    selectors: {
      productContainer: '.sku-item, [class*="sku-item"]',
      name: '.sku-title a, h4.sku-title a',
      brand: '.sku-title a',
      price: '.priceView-customer-price span:first-child',
      rating: '.c-ratings-reviews .c-stars-v4',
      reviewCount: '.c-ratings-reviews .c-reviews',
      link: '.sku-title a',
      image: '.product-image img',
    },
    pagination: {
      pageParam: 'cp',
      itemsPerPage: 24,
      maxPages: 50,
      startPage: 1,
      nextPageSelector: '.sku-list-page-next:not(.is-disabled) a',
    },
  },
  generic: {
    selectors: {
      productContainer: '.product, .product-item, .product-card, [class*="product-tile"], [class*="product-list"] > li, [class*="grid"] > [class*="product"]',
      name: '.product-name, .product-title, h2, h3, [class*="title"]',
      brand: '.brand, .product-brand, [class*="brand"]',
      price: '.price, .product-price, [class*="price"]',
      rating: '.rating, .stars, [class*="rating"], [class*="stars"]',
      reviewCount: '.review-count, .reviews, [class*="review"]',
      link: 'a[href*="product"], a[href*="item"], a:first-of-type',
      image: 'img',
    },
    pagination: {
      pageParam: 'page',
      itemsPerPage: 24,
      maxPages: 100,
      startPage: 1,
      nextPageSelector: '.next, .pagination a[rel="next"], a.next-page, [class*="pagination"] a:contains("Next"), [class*="next"]',
    },
  },
};

function detectPlatform(url: string): string {
  const hostname = new URL(url).hostname.toLowerCase();

  if (hostname.includes('tesco')) return 'tesco';
  if (hostname.includes('amazon')) return 'amazon';
  if (hostname.includes('walmart')) return 'walmart';
  if (hostname.includes('bestbuy')) return 'bestbuy';

  return 'generic';
}

function extractRating(text: string): number | undefined {
  const match = text.match(/(\d+(\.\d+)?)\s*(out of|\/|stars?)/i) || text.match(/^(\d+(\.\d+)?)/);
  if (match) {
    const rating = parseFloat(match[1]);
    if (rating <= 5) return rating;
    if (rating <= 100) return rating / 20;
  }
  return undefined;
}

function extractReviewCount(text: string): number | undefined {
  const match = text.match(/(\d+,?\d*)\s*(reviews?|ratings?)/i) || text.match(/\((\d+,?\d*)\)/);
  if (match) {
    return parseInt(match[1].replace(/,/g, ''));
  }
  return undefined;
}

function extractTotalCount(text: string): number | undefined {
  // Match patterns like "1434 products", "Showing 1-24 of 1434", "1,434 results"
  const patterns = [
    /(\d+,?\d*)\s*(products?|items?|results?)/i,
    /of\s+(\d+,?\d*)/i,
    /(\d+,?\d*)\s+total/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return parseInt(match[1].replace(/,/g, ''));
    }
  }
  return undefined;
}

function cleanPrice(text: string): string {
  const match = text.match(/[\$£€]?\s*\d+([.,]\d{2})?/);
  return match ? match[0].trim() : text.trim();
}

function extractBrandFromName(name: string): string {
  const words = name.split(/\s+/);
  if (words.length >= 2) {
    const firstWord = words[0];
    if (firstWord.length > 1 && /^[A-Z]/.test(firstWord)) {
      return firstWord;
    }
  }
  return 'Unknown';
}

function buildPageUrl(baseUrl: string, page: number, config: PlatformConfig['pagination']): string {
  const url = new URL(baseUrl);

  if (config.pageParam) {
    url.searchParams.set(config.pageParam, String(page));
  } else if (config.offsetParam) {
    const offset = (page - config.startPage) * config.itemsPerPage;
    url.searchParams.set(config.offsetParam, String(offset));
  }

  return url.toString();
}

function createHttpClient(): AxiosInstance {
  return axios.create({
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9,en-US;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    },
  });
}

function extractProductsFromPage(
  $: ReturnType<typeof cheerio.load>,
  selectors: PlatformConfig['selectors'],
  baseUrl: string
): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];

  $(selectors.productContainer).each((_, element) => {
    const $product = $(element);

    // Extract name
    let name = $product.find(selectors.name).first().text().trim();
    if (!name) {
      name = $product.find('h2, h3, h4, a').first().text().trim();
    }
    if (!name || name.length < 3) return;

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
    const ratingText = ratingEl.attr('aria-label') || ratingEl.attr('title') || ratingEl.text().trim();
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
      url = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
    }

    // Extract image URL
    let imageUrl: string | undefined;
    const imgEl = $product.find(selectors.image).first();
    const src = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('srcset')?.split(' ')[0];
    if (src && !src.startsWith('data:')) {
      try {
        imageUrl = src.startsWith('http') ? src : new URL(src, baseUrl).toString();
      } catch {
        // Invalid URL
      }
    }

    if (name && url) {
      products.push({ name, brand, price, rating, reviewCount, url, imageUrl });
    }
  });

  return products;
}

export async function scrapeCategoryPage(
  categoryUrl: string,
  onProgress?: ProgressCallback,
  maxProducts?: number
): Promise<CategoryScrapeResult> {
  const platform = detectPlatform(categoryUrl);
  const config = PLATFORM_CONFIGS[platform];
  const client = createHttpClient();

  const allProducts: ScrapedProduct[] = [];
  const seenUrls = new Set<string>();
  let currentPage = config.pagination.startPage;
  let totalPages: number | undefined;
  let consecutiveEmptyPages = 0;

  console.log(`Scraping category: ${categoryUrl}`);
  console.log(`Platform: ${platform}`);

  try {
    while (currentPage <= config.pagination.maxPages) {
      const pageUrl = currentPage === config.pagination.startPage
        ? categoryUrl
        : buildPageUrl(categoryUrl, currentPage, config.pagination);

      console.log(`Fetching page ${currentPage}: ${pageUrl}`);

      onProgress?.({
        currentPage,
        totalPages,
        productsFound: allProducts.length,
        status: `Fetching page ${currentPage}${totalPages ? ` of ${totalPages}` : ''}...`,
      });

      let response;
      try {
        response = await client.get(pageUrl);
      } catch (error) {
        console.error(`Failed to fetch page ${currentPage}:`, error instanceof Error ? error.message : error);
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= 2) break;
        currentPage++;
        continue;
      }

      const $ = cheerio.load(response.data);

      // Try to extract total count on first page
      if (currentPage === config.pagination.startPage && config.pagination.totalCountSelector) {
        const totalText = $(config.pagination.totalCountSelector).text();
        const totalCount = extractTotalCount(totalText);
        if (totalCount) {
          totalPages = Math.ceil(totalCount / config.pagination.itemsPerPage);
          console.log(`Total products: ${totalCount}, estimated pages: ${totalPages}`);
        }
      }

      // Extract products from current page
      const pageProducts = extractProductsFromPage($, config.selectors, categoryUrl);

      // Deduplicate by URL
      let newProducts = 0;
      for (const product of pageProducts) {
        if (!seenUrls.has(product.url)) {
          seenUrls.add(product.url);
          allProducts.push(product);
          newProducts++;
        }
      }

      console.log(`Page ${currentPage}: Found ${pageProducts.length} products (${newProducts} new)`);

      // Check if we should stop
      if (newProducts === 0) {
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= 2) {
          console.log('No new products found, stopping pagination');
          break;
        }
      } else {
        consecutiveEmptyPages = 0;
      }

      // Check max products limit
      if (maxProducts && allProducts.length >= maxProducts) {
        console.log(`Reached max products limit: ${maxProducts}`);
        break;
      }

      // Check if there's a next page
      if (config.pagination.nextPageSelector) {
        const nextPageEl = $(config.pagination.nextPageSelector);
        if (!nextPageEl.length || nextPageEl.hasClass('disabled') || nextPageEl.attr('aria-disabled') === 'true') {
          console.log('No next page found');
          break;
        }
      }

      // Check if we've reached the estimated total pages
      if (totalPages && currentPage >= totalPages) {
        console.log('Reached total pages');
        break;
      }

      currentPage++;

      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
    }

    console.log(`Scraping complete. Total products: ${allProducts.length}`);

    onProgress?.({
      currentPage: currentPage - 1,
      totalPages,
      productsFound: allProducts.length,
      status: 'Complete',
    });

    return {
      success: true,
      categoryUrl,
      platform,
      products: allProducts,
      totalPages,
    };
  } catch (error) {
    console.error('Failed to scrape category page:', error);
    return {
      success: false,
      categoryUrl,
      platform,
      products: allProducts,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Demo function to generate sample products for testing
export function generateDemoProducts(categoryUrl: string, count: number = 100): CategoryScrapeResult {
  const platform = detectPlatform(categoryUrl);

  const brands = ['Febreze', 'Air Wick', 'Glade', 'Yankee Candle', 'Renuzit', 'Ozium', 'Poo-Pourri', 'Mrs. Meyer\'s', 'Method', 'Lysol', 'Clorox', 'SC Johnson'];
  const scents = ['Lavender', 'Ocean Breeze', 'Fresh Linen', 'Vanilla', 'Citrus', 'Pine', 'Rose', 'Eucalyptus', 'Jasmine', 'Cotton', 'Spring', 'Mountain Air'];
  const types = ['Air Freshener Spray', 'Plug-In Refill', 'Scented Candle', 'Reed Diffuser', 'Gel Air Freshener', 'Odor Eliminator', 'Wax Melts', 'Room Spray', 'Car Freshener', 'Fabric Spray'];

  const products: ScrapedProduct[] = [];

  for (let i = 0; i < count; i++) {
    const brand = brands[i % brands.length];
    const scent = scents[Math.floor(Math.random() * scents.length)];
    const type = types[Math.floor(Math.random() * types.length)];
    const size = ['Small', 'Medium', 'Large', 'Value Pack', '3-Pack', '6-Pack'][Math.floor(Math.random() * 6)];

    products.push({
      name: `${brand} ${type} ${scent} ${size}`,
      brand,
      price: `£${(1.99 + Math.random() * 12).toFixed(2)}`,
      rating: Math.round((3 + Math.random() * 2) * 10) / 10,
      reviewCount: Math.floor(10 + Math.random() * 500),
      url: `${categoryUrl.replace(/\/$/, '')}/product-${i + 1}`,
      imageUrl: undefined,
    });
  }

  return {
    success: true,
    categoryUrl,
    platform,
    products,
    totalPages: Math.ceil(count / 24),
  };
}
