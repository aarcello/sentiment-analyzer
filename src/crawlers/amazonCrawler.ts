import { BaseCrawler } from './baseCrawler';
import { ProductConfig, Review } from '../types';

export class AmazonCrawler extends BaseCrawler {
  constructor(config: ProductConfig, settings: { crawlDelay: number; userAgent: string; maxReviews: number }) {
    super(config, settings);
  }

  async crawl(): Promise<Review[]> {
    const reviews: Review[] = [];
    let pageUrl = this.config.url;

    // Convert product URL to reviews URL if needed
    if (pageUrl.includes('/dp/') && !pageUrl.includes('/reviews/')) {
      const asinMatch = pageUrl.match(/\/dp\/([A-Z0-9]+)/i);
      if (asinMatch) {
        pageUrl = `https://www.amazon.com/product-reviews/${asinMatch[1]}/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews`;
      }
    }

    let page = 1;
    const maxPages = Math.ceil(this.maxReviews / 10);

    while (reviews.length < this.maxReviews && page <= maxPages) {
      const currentUrl = page === 1 ? pageUrl : `${pageUrl}&pageNumber=${page}`;
      console.log(`  Fetching page ${page}...`);

      const $ = await this.fetchPage(currentUrl);
      if (!$) break;

      // Amazon review selectors
      const reviewElements = $('[data-hook="review"]');

      if (reviewElements.length === 0) {
        console.log('  No reviews found on this page');
        break;
      }

      reviewElements.each((_, element) => {
        if (reviews.length >= this.maxReviews) return false;

        const $review = $(element);
        const text = $review.find('[data-hook="review-body"] span').text().trim();

        if (text) {
          // Extract rating from star element
          const ratingText = $review.find('[data-hook="review-star-rating"] span').first().text();
          const ratingMatch = ratingText.match(/(\d+(\.\d+)?)/);
          const rating = ratingMatch ? parseFloat(ratingMatch[1]) : undefined;

          // Extract author
          const author = $review.find('.a-profile-name').text().trim() || undefined;

          // Extract date
          const dateText = $review.find('[data-hook="review-date"]').text();
          const dateMatch = dateText.match(/on (.+)$/);
          const date = dateMatch ? dateMatch[1] : undefined;

          // Generate ID from review content hash
          const id = Buffer.from(text.substring(0, 50)).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);

          reviews.push(this.createReview(text, { id, rating, author, date }));
        }
      });

      console.log(`  Found ${reviews.length} reviews so far`);

      // Check for next page
      const nextPage = $('li.a-last a').attr('href');
      if (!nextPage) break;

      page++;
      await this.delay(this.crawlDelay);
    }

    return reviews;
  }
}
