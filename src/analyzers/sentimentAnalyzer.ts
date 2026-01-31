import Sentiment from 'sentiment';
import { Review, SentimentResult, AnalyzedReview, Theme, ProductAnalysis } from '../types';
import { ConfigManager } from '../config';
import dayjs from 'dayjs';

const sentiment = new Sentiment();

// Common product-related theme keywords
const THEME_DEFINITIONS: Record<string, string[]> = {
  'Quality': ['quality', 'build', 'construction', 'craftsmanship', 'durable', 'sturdy', 'solid', 'flimsy', 'cheap'],
  'Performance': ['performance', 'fast', 'slow', 'speed', 'powerful', 'efficient', 'lag', 'smooth'],
  'Value': ['price', 'value', 'worth', 'expensive', 'affordable', 'cheap', 'money', 'cost', 'budget'],
  'Design': ['design', 'look', 'aesthetic', 'beautiful', 'ugly', 'sleek', 'style', 'appearance', 'color'],
  'Ease of Use': ['easy', 'simple', 'intuitive', 'complicated', 'confusing', 'user-friendly', 'setup', 'install'],
  'Reliability': ['reliable', 'consistent', 'stable', 'broke', 'failed', 'defective', 'problem', 'issue', 'bug'],
  'Customer Service': ['support', 'service', 'customer', 'warranty', 'return', 'refund', 'helpful', 'response'],
  'Battery': ['battery', 'charge', 'charging', 'power', 'drain', 'life', 'hours'],
  'Features': ['feature', 'function', 'option', 'capability', 'setting', 'mode'],
  'Comfort': ['comfort', 'comfortable', 'ergonomic', 'fit', 'size', 'weight', 'portable'],
};

export function analyzeSentiment(text: string): SentimentResult {
  const result = sentiment.analyze(text);

  // Normalize score to -1 to 1 range (original is unbounded)
  const normalizedScore = Math.max(-1, Math.min(1, result.comparative));

  // Determine label based on score
  let label: 'positive' | 'negative' | 'neutral';
  if (normalizedScore > 0.1) {
    label = 'positive';
  } else if (normalizedScore < -0.1) {
    label = 'negative';
  } else {
    label = 'neutral';
  }

  // Calculate confidence based on word count and score magnitude
  const wordCount = text.split(/\s+/).length;
  const scoreMagnitude = Math.abs(normalizedScore);
  const confidence = Math.min(1, (scoreMagnitude * 2 + Math.min(wordCount / 50, 0.5)));

  return {
    score: normalizedScore,
    comparative: result.comparative,
    label,
    confidence,
    keywords: {
      positive: result.positive || [],
      negative: result.negative || [],
    },
  };
}

export function detectThemes(text: string): string[] {
  const lowerText = text.toLowerCase();
  const detectedThemes: string[] = [];

  for (const [theme, keywords] of Object.entries(THEME_DEFINITIONS)) {
    const hasKeyword = keywords.some((keyword) => lowerText.includes(keyword));
    if (hasKeyword) {
      detectedThemes.push(theme);
    }
  }

  return detectedThemes;
}

export function analyzeReview(review: Review): AnalyzedReview {
  const sentimentResult = analyzeSentiment(review.text);
  const themes = detectThemes(review.text);

  return {
    ...review,
    sentiment: sentimentResult,
    themes,
  };
}

export function analyzeReviews(reviews: Review[]): AnalyzedReview[] {
  return reviews.map(analyzeReview);
}

export function generateProductAnalysis(
  productId: string,
  productName: string,
  brand: string,
  reviews: Review[]
): ProductAnalysis {
  const analyzedReviews = analyzeReviews(reviews);

  // Calculate sentiment summary
  const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
  let totalScore = 0;

  analyzedReviews.forEach((review) => {
    sentimentCounts[review.sentiment.label]++;
    totalScore += review.sentiment.score;
  });

  const averageScore = analyzedReviews.length > 0 ? totalScore / analyzedReviews.length : 0;

  // Calculate average rating if available
  const ratingsWithValues = analyzedReviews.filter((r) => r.rating !== undefined);
  const averageRating = ratingsWithValues.length > 0
    ? ratingsWithValues.reduce((sum, r) => sum + (r.rating || 0), 0) / ratingsWithValues.length
    : undefined;

  // Aggregate themes
  const themeCounts = new Map<string, { count: number; totalSentiment: number }>();

  analyzedReviews.forEach((review) => {
    review.themes.forEach((theme) => {
      const existing = themeCounts.get(theme) || { count: 0, totalSentiment: 0 };
      existing.count++;
      existing.totalSentiment += review.sentiment.score;
      themeCounts.set(theme, existing);
    });
  });

  const themes: Theme[] = Array.from(themeCounts.entries())
    .map(([name, data]) => ({
      name,
      keywords: THEME_DEFINITIONS[name] || [],
      count: data.count,
      averageSentiment: data.totalSentiment / data.count,
    }))
    .sort((a, b) => b.count - a.count);

  // Get top keywords
  const allPositiveKeywords: string[] = [];
  const allNegativeKeywords: string[] = [];

  analyzedReviews.forEach((review) => {
    allPositiveKeywords.push(...review.sentiment.keywords.positive);
    allNegativeKeywords.push(...review.sentiment.keywords.negative);
  });

  const topPositiveKeywords = getTopKeywords(allPositiveKeywords, 10);
  const topNegativeKeywords = getTopKeywords(allNegativeKeywords, 10);

  return {
    productId,
    productName,
    brand,
    analyzedAt: dayjs().toISOString(),
    totalReviews: analyzedReviews.length,
    averageRating,
    sentimentSummary: {
      positive: sentimentCounts.positive,
      negative: sentimentCounts.negative,
      neutral: sentimentCounts.neutral,
      averageScore,
    },
    themes,
    topPositiveKeywords,
    topNegativeKeywords,
    reviews: analyzedReviews,
  };
}

function getTopKeywords(keywords: string[], limit: number): string[] {
  const counts = new Map<string, number>();

  keywords.forEach((keyword) => {
    counts.set(keyword, (counts.get(keyword) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword]) => keyword);
}
