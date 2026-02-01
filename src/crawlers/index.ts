import { BaseCrawler } from './baseCrawler';
import { AmazonCrawler } from './amazonCrawler';
import { GenericCrawler } from './genericCrawler';
import { DemoCrawler } from './demoCrawler';
import { ProductConfig, Review, CrawlResult } from '../types';
import { dataStore } from '../storage/dataStore';

export interface CrawlerSettings {
  crawlDelay: number;
  userAgent: string;
  maxReviews: number;
}

export function createCrawler(config: ProductConfig, settings: CrawlerSettings, useDemo: boolean = false): BaseCrawler {
  if (useDemo) {
    return new DemoCrawler(config, settings);
  }

  switch (config.platform) {
    case 'amazon':
      return new AmazonCrawler(config, settings);
    case 'bestbuy':
    case 'walmart':
    case 'generic':
    default:
      return new GenericCrawler(config, settings);
  }
}

export async function crawlProduct(
  config: ProductConfig,
  settings: CrawlerSettings,
  useDemo: boolean = false
): Promise<{ reviews: Review[]; result: CrawlResult }> {
  const crawler = createCrawler(config, settings, useDemo);

  try {
    const reviews = await crawler.crawl();

    // Save reviews to storage
    if (reviews.length > 0) {
      dataStore.saveReviews(config.id, reviews);
    }

    const result: CrawlResult = {
      productId: config.id,
      success: true,
      reviewCount: reviews.length,
      crawledAt: new Date().toISOString(),
    };

    return { reviews, result };
  } catch (error) {
    const result: CrawlResult = {
      productId: config.id,
      success: false,
      reviewCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
      crawledAt: new Date().toISOString(),
    };

    return { reviews: [], result };
  }
}

export async function crawlAllProducts(
  products: ProductConfig[],
  settings: CrawlerSettings,
  useDemo: boolean = false
): Promise<Map<string, { reviews: Review[]; result: CrawlResult }>> {
  const results = new Map<string, { reviews: Review[]; result: CrawlResult }>();

  for (const product of products) {
    if (!product.enabled) {
      console.log(`Skipping disabled product: ${product.name}`);
      continue;
    }

    const result = await crawlProduct(product, settings, useDemo);
    results.set(product.id, result);

    // Delay between products
    await new Promise((resolve) => setTimeout(resolve, settings.crawlDelay));
  }

  return results;
}

export { BaseCrawler, AmazonCrawler, GenericCrawler, DemoCrawler };
export { scrapeCategoryPage, generateDemoProducts, ScrapedProduct, CategoryScrapeResult, ScrapeProgress, ProgressCallback } from './categoryScraper';
