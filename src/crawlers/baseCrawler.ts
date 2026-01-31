import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import { ProductConfig, Review, CrawlResult } from '../types';
import dayjs from 'dayjs';

function generateId(): string {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

export abstract class BaseCrawler {
  protected client: AxiosInstance;
  protected config: ProductConfig;
  protected crawlDelay: number;
  protected maxReviews: number;

  constructor(config: ProductConfig, settings: { crawlDelay: number; userAgent: string; maxReviews: number }) {
    this.config = config;
    this.crawlDelay = settings.crawlDelay;
    this.maxReviews = settings.maxReviews;

    this.client = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': settings.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
    });
  }

  protected async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected async fetchPage(url: string): Promise<ReturnType<typeof cheerio.load> | null> {
    try {
      const response = await this.client.get(url);
      return cheerio.load(response.data);
    } catch (error) {
      console.error(`Failed to fetch ${url}:`, error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  protected createReview(text: string, options: Partial<Review> = {}): Review {
    return {
      id: options.id || generateId(),
      productId: this.config.id,
      text: text.trim(),
      rating: options.rating,
      author: options.author,
      date: options.date,
      crawledAt: dayjs().toISOString(),
    };
  }

  abstract crawl(): Promise<Review[]>;

  async execute(): Promise<CrawlResult> {
    const startTime = Date.now();

    try {
      console.log(`Crawling reviews for: ${this.config.name}`);
      const reviews = await this.crawl();

      return {
        productId: this.config.id,
        success: true,
        reviewCount: reviews.length,
        crawledAt: dayjs().toISOString(),
      };
    } catch (error) {
      return {
        productId: this.config.id,
        success: false,
        reviewCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        crawledAt: dayjs().toISOString(),
      };
    }
  }
}
