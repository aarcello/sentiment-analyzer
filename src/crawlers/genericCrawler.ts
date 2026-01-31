import { BaseCrawler } from './baseCrawler';
import { ProductConfig, Review } from '../types';

export class GenericCrawler extends BaseCrawler {
  constructor(config: ProductConfig, settings: { crawlDelay: number; userAgent: string; maxReviews: number }) {
    super(config, settings);
  }

  async crawl(): Promise<Review[]> {
    const reviews: Review[] = [];
    const selectors = this.config.selectors || {};

    // Default selectors that work for many sites
    const defaultSelectors = {
      reviewContainer: selectors.reviewContainer || '.review, .review-item, [class*="review"]',
      reviewText: selectors.reviewText || '.review-text, .review-body, .review-content, p',
      reviewRating: selectors.reviewRating || '.rating, .stars, [class*="rating"]',
      reviewDate: selectors.reviewDate || '.review-date, .date, time',
      reviewAuthor: selectors.reviewAuthor || '.author, .reviewer, .user-name',
      nextPage: selectors.nextPage || '.next, .pagination a[rel="next"], a.next-page',
    };

    let pageUrl: string | undefined = this.config.url;
    let page = 1;
    const maxPages = Math.ceil(this.maxReviews / 10);

    while (pageUrl && reviews.length < this.maxReviews && page <= maxPages) {
      console.log(`  Fetching page ${page}: ${pageUrl}`);

      const $ = await this.fetchPage(pageUrl);
      if (!$) break;

      const reviewElements = $(defaultSelectors.reviewContainer);

      if (reviewElements.length === 0) {
        console.log('  No reviews found with current selectors');
        break;
      }

      reviewElements.each((_, element) => {
        if (reviews.length >= this.maxReviews) return false;

        const $review = $(element);
        const text = $review.find(defaultSelectors.reviewText).text().trim();

        if (text && text.length > 10) {
          // Extract rating
          const ratingText = $review.find(defaultSelectors.reviewRating).text();
          const ratingMatch = ratingText.match(/(\d+(\.\d+)?)/);
          const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;

          // Extract author
          const author = $review.find(defaultSelectors.reviewAuthor).text().trim() || undefined;

          // Extract date
          const dateText = $review.find(defaultSelectors.reviewDate).text().trim();
          const date = dateText || undefined;

          // Generate ID
          const id = Buffer.from(text.substring(0, 50)).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);

          reviews.push(this.createReview(text, { id, rating, author, date }));
        }
      });

      console.log(`  Found ${reviews.length} reviews so far`);

      // Find next page
      const nextPageHref = $(defaultSelectors.nextPage).attr('href');
      if (nextPageHref && nextPageHref !== pageUrl) {
        pageUrl = nextPageHref.startsWith('http')
          ? nextPageHref
          : new URL(nextPageHref, this.config.url).toString();
        page++;
        await this.delay(this.crawlDelay);
      } else {
        break;
      }
    }

    return reviews;
  }
}
