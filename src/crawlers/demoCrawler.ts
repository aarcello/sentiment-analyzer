import { BaseCrawler } from './baseCrawler';
import { ProductConfig, Review } from '../types';
import dayjs from 'dayjs';

// Sample review templates for demo purposes
const POSITIVE_TEMPLATES = [
  "Absolutely love this product! {feature} works perfectly and exceeded my expectations.",
  "Best purchase I've made in a while. The {feature} is outstanding and {quality} is excellent.",
  "Five stars! {feature} is amazing and I'd highly recommend this to anyone.",
  "Great value for money. {feature} performs better than expected. Very happy with my purchase.",
  "Impressed by the {quality}. {feature} is exactly what I was looking for.",
  "This product is fantastic! The {feature} really sets it apart from competitors.",
  "Wonderful product. The {feature} and {quality} are both top-notch.",
  "Exceeded all my expectations. {feature} works flawlessly.",
];

const NEUTRAL_TEMPLATES = [
  "Decent product. {feature} is okay but nothing special. Does the job.",
  "It's alright. {feature} works as expected, though {issue} could be improved.",
  "Average quality. {feature} is fine for the price point.",
  "Mixed feelings. {feature} is good but {issue} is a bit disappointing.",
  "Gets the job done. {feature} is adequate for basic needs.",
];

const NEGATIVE_TEMPLATES = [
  "Disappointed with this purchase. {issue} is a major problem.",
  "Not worth the money. {issue} makes it nearly unusable.",
  "Poor quality. {issue} broke after just a few weeks.",
  "Would not recommend. {issue} and the {feature} doesn't work well.",
  "Frustrated with this product. {issue} is unacceptable.",
  "Regret buying this. {issue} and customer support was unhelpful.",
];

const FEATURES = [
  'build quality', 'design', 'performance', 'battery life', 'display',
  'sound quality', 'ease of use', 'durability', 'functionality', 'features',
  'speed', 'reliability', 'comfort', 'portability', 'connectivity',
];

const QUALITIES = [
  'craftsmanship', 'finish', 'material quality', 'attention to detail',
  'overall quality', 'fit and finish', 'construction',
];

const ISSUES = [
  'the battery drains quickly', 'it feels cheaply made', 'setup was difficult',
  'performance is inconsistent', 'quality control issues', 'it runs hot',
  'software bugs', 'connectivity problems', 'customer service',
];

const NAMES = [
  'John D.', 'Sarah M.', 'Mike R.', 'Emily K.', 'David L.', 'Jessica T.',
  'Chris P.', 'Amanda B.', 'Brian H.', 'Lisa W.', 'Kevin S.', 'Nicole F.',
  'Alex G.', 'Rachel N.', 'Matt C.', 'Jennifer A.',
];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillTemplate(template: string): string {
  return template
    .replace('{feature}', randomChoice(FEATURES))
    .replace('{quality}', randomChoice(QUALITIES))
    .replace('{issue}', randomChoice(ISSUES));
}

export class DemoCrawler extends BaseCrawler {
  constructor(config: ProductConfig, settings: { crawlDelay: number; userAgent: string; maxReviews: number }) {
    super(config, settings);
  }

  async crawl(): Promise<Review[]> {
    const reviews: Review[] = [];
    const numReviews = Math.min(this.maxReviews, 25 + Math.floor(Math.random() * 25));

    console.log(`  Generating ${numReviews} demo reviews for "${this.config.name}"`);

    // Distribution: 60% positive, 25% neutral, 15% negative
    const distribution = {
      positive: Math.floor(numReviews * 0.6),
      neutral: Math.floor(numReviews * 0.25),
      negative: numReviews - Math.floor(numReviews * 0.6) - Math.floor(numReviews * 0.25),
    };

    // Generate positive reviews
    for (let i = 0; i < distribution.positive; i++) {
      const text = fillTemplate(randomChoice(POSITIVE_TEMPLATES));
      const rating = 4 + Math.random(); // 4-5 stars
      reviews.push(this.createDemoReview(text, rating));
    }

    // Generate neutral reviews
    for (let i = 0; i < distribution.neutral; i++) {
      const text = fillTemplate(randomChoice(NEUTRAL_TEMPLATES));
      const rating = 2.5 + Math.random() * 1.5; // 2.5-4 stars
      reviews.push(this.createDemoReview(text, rating));
    }

    // Generate negative reviews
    for (let i = 0; i < distribution.negative; i++) {
      const text = fillTemplate(randomChoice(NEGATIVE_TEMPLATES));
      const rating = 1 + Math.random() * 1.5; // 1-2.5 stars
      reviews.push(this.createDemoReview(text, rating));
    }

    // Shuffle reviews
    reviews.sort(() => Math.random() - 0.5);

    // Simulate crawl delay
    await this.delay(500);

    console.log(`  Generated ${reviews.length} demo reviews`);
    return reviews;
  }

  private createDemoReview(text: string, rating: number): Review {
    const daysAgo = Math.floor(Math.random() * 90);
    const date = dayjs().subtract(daysAgo, 'day').format('MMMM D, YYYY');
    const id = Math.random().toString(36).substring(2, 15);

    return this.createReview(text, {
      id,
      rating: Math.round(rating * 10) / 10,
      author: randomChoice(NAMES),
      date,
    });
  }
}
