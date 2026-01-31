export interface ProductConfig {
  id: string;
  name: string;
  brand: string;
  category: string;
  url: string;
  platform: 'amazon' | 'bestbuy' | 'walmart' | 'generic';
  selectors?: {
    reviewContainer?: string;
    reviewText?: string;
    reviewRating?: string;
    reviewDate?: string;
    reviewAuthor?: string;
    nextPage?: string;
  };
  enabled: boolean;
  crawlFrequency?: string; // cron expression
}

export interface Review {
  id: string;
  productId: string;
  text: string;
  rating?: number;
  author?: string;
  date?: string;
  crawledAt: string;
}

export interface SentimentResult {
  score: number; // -1 to 1
  comparative: number;
  label: 'positive' | 'negative' | 'neutral';
  confidence: number;
  keywords: {
    positive: string[];
    negative: string[];
  };
}

export interface Theme {
  name: string;
  keywords: string[];
  count: number;
  averageSentiment: number;
}

export interface AnalyzedReview extends Review {
  sentiment: SentimentResult;
  themes: string[];
}

export interface ProductAnalysis {
  productId: string;
  productName: string;
  brand: string;
  analyzedAt: string;
  totalReviews: number;
  averageRating?: number;
  sentimentSummary: {
    positive: number;
    negative: number;
    neutral: number;
    averageScore: number;
  };
  themes: Theme[];
  topPositiveKeywords: string[];
  topNegativeKeywords: string[];
  reviews: AnalyzedReview[];
}

export interface HistoricalDataPoint {
  date: string;
  averageSentiment: number;
  reviewCount: number;
  positiveRatio: number;
  negativeRatio: number;
}

export interface ComparisonReport {
  generatedAt: string;
  products: {
    productId: string;
    productName: string;
    brand: string;
    sentimentScore: number;
    reviewCount: number;
    topStrengths: string[];
    topWeaknesses: string[];
  }[];
  comparison: {
    bestSentiment: string;
    mostReviewed: string;
    themeComparison: Record<string, Record<string, number>>;
  };
}

export interface CrawlResult {
  productId: string;
  success: boolean;
  reviewCount: number;
  error?: string;
  crawledAt: string;
}

export interface Config {
  products: ProductConfig[];
  settings: {
    crawlDelay: number; // ms between requests
    userAgent: string;
    maxReviewsPerProduct: number;
    retryAttempts: number;
    dataDir: string;
  };
}
