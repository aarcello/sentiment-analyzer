import { ProductAnalysis, ComparisonReport, HistoricalDataPoint } from '../types';
import { dataStore } from '../storage/dataStore';
import dayjs from 'dayjs';

export function generateComparisonReport(analyses: ProductAnalysis[]): ComparisonReport {
  if (analyses.length === 0) {
    throw new Error('No analyses provided for comparison report');
  }

  const products = analyses.map((analysis) => {
    // Get strengths (themes with positive sentiment)
    const strengths = analysis.themes
      .filter((t) => t.averageSentiment > 0.1)
      .sort((a, b) => b.averageSentiment - a.averageSentiment)
      .slice(0, 3)
      .map((t) => t.name);

    // Get weaknesses (themes with negative sentiment)
    const weaknesses = analysis.themes
      .filter((t) => t.averageSentiment < -0.1)
      .sort((a, b) => a.averageSentiment - b.averageSentiment)
      .slice(0, 3)
      .map((t) => t.name);

    return {
      productId: analysis.productId,
      productName: analysis.productName,
      brand: analysis.brand,
      sentimentScore: analysis.sentimentSummary.averageScore,
      reviewCount: analysis.totalReviews,
      topStrengths: strengths,
      topWeaknesses: weaknesses,
    };
  });

  // Find best sentiment and most reviewed
  const sortedBySentiment = [...products].sort((a, b) => b.sentimentScore - a.sentimentScore);
  const sortedByReviews = [...products].sort((a, b) => b.reviewCount - a.reviewCount);

  // Build theme comparison matrix
  const allThemes = new Set<string>();
  analyses.forEach((a) => a.themes.forEach((t) => allThemes.add(t.name)));

  const themeComparison: Record<string, Record<string, number>> = {};
  allThemes.forEach((theme) => {
    themeComparison[theme] = {};
    analyses.forEach((analysis) => {
      const themeData = analysis.themes.find((t) => t.name === theme);
      themeComparison[theme][analysis.productId] = themeData?.averageSentiment || 0;
    });
  });

  return {
    generatedAt: dayjs().toISOString(),
    products,
    comparison: {
      bestSentiment: sortedBySentiment[0]?.productName || 'N/A',
      mostReviewed: sortedByReviews[0]?.productName || 'N/A',
      themeComparison,
    },
  };
}

export function generateTrendReport(
  productId: string,
  days: number = 30
): { history: HistoricalDataPoint[]; trend: 'improving' | 'declining' | 'stable' } {
  const history = dataStore.getHistory(productId, days);

  if (history.length < 2) {
    return { history, trend: 'stable' };
  }

  // Calculate trend using simple linear regression on sentiment scores
  const n = history.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  history.forEach((point, i) => {
    sumX += i;
    sumY += point.averageSentiment;
    sumXY += i * point.averageSentiment;
    sumX2 += i * i;
  });

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  let trend: 'improving' | 'declining' | 'stable';
  if (slope > 0.01) {
    trend = 'improving';
  } else if (slope < -0.01) {
    trend = 'declining';
  } else {
    trend = 'stable';
  }

  return { history, trend };
}

export function formatAnalysisReport(analysis: ProductAnalysis): string {
  const lines: string[] = [];

  lines.push('═'.repeat(60));
  lines.push(`SENTIMENT ANALYSIS REPORT: ${analysis.productName}`);
  lines.push('═'.repeat(60));
  lines.push('');
  lines.push(`Brand: ${analysis.brand}`);
  lines.push(`Analyzed: ${dayjs(analysis.analyzedAt).format('YYYY-MM-DD HH:mm')}`);
  lines.push(`Total Reviews: ${analysis.totalReviews}`);

  if (analysis.averageRating !== undefined) {
    lines.push(`Average Rating: ${analysis.averageRating.toFixed(1)} / 5`);
  }

  lines.push('');
  lines.push('─'.repeat(40));
  lines.push('SENTIMENT SUMMARY');
  lines.push('─'.repeat(40));

  const { positive, negative, neutral, averageScore } = analysis.sentimentSummary;
  const total = positive + negative + neutral;

  lines.push(`Overall Score: ${(averageScore * 100).toFixed(1)}%`);
  lines.push(`Positive: ${positive} (${((positive / total) * 100).toFixed(1)}%)`);
  lines.push(`Neutral:  ${neutral} (${((neutral / total) * 100).toFixed(1)}%)`);
  lines.push(`Negative: ${negative} (${((negative / total) * 100).toFixed(1)}%)`);

  // Visual bar
  const barWidth = 40;
  const posBar = Math.round((positive / total) * barWidth);
  const neuBar = Math.round((neutral / total) * barWidth);
  const negBar = barWidth - posBar - neuBar;
  lines.push('');
  lines.push(`[${'█'.repeat(posBar)}${'▒'.repeat(neuBar)}${'░'.repeat(negBar)}]`);
  lines.push(' Positive       Neutral       Negative');

  if (analysis.themes.length > 0) {
    lines.push('');
    lines.push('─'.repeat(40));
    lines.push('THEMES DETECTED');
    lines.push('─'.repeat(40));

    analysis.themes.slice(0, 8).forEach((theme) => {
      const sentimentIcon = theme.averageSentiment > 0.1 ? '✓' : theme.averageSentiment < -0.1 ? '✗' : '○';
      const sentimentPct = (theme.averageSentiment * 100).toFixed(0);
      lines.push(`${sentimentIcon} ${theme.name.padEnd(20)} (${theme.count} mentions, ${sentimentPct}% sentiment)`);
    });
  }

  if (analysis.topPositiveKeywords.length > 0) {
    lines.push('');
    lines.push('─'.repeat(40));
    lines.push('TOP POSITIVE KEYWORDS');
    lines.push('─'.repeat(40));
    lines.push(analysis.topPositiveKeywords.slice(0, 10).join(', '));
  }

  if (analysis.topNegativeKeywords.length > 0) {
    lines.push('');
    lines.push('─'.repeat(40));
    lines.push('TOP NEGATIVE KEYWORDS');
    lines.push('─'.repeat(40));
    lines.push(analysis.topNegativeKeywords.slice(0, 10).join(', '));
  }

  lines.push('');
  lines.push('═'.repeat(60));

  return lines.join('\n');
}

export function formatComparisonReport(report: ComparisonReport): string {
  const lines: string[] = [];

  lines.push('═'.repeat(70));
  lines.push('PRODUCT COMPARISON REPORT');
  lines.push('═'.repeat(70));
  lines.push(`Generated: ${dayjs(report.generatedAt).format('YYYY-MM-DD HH:mm')}`);
  lines.push('');

  lines.push('─'.repeat(70));
  lines.push('PRODUCT RANKINGS');
  lines.push('─'.repeat(70));
  lines.push('');

  // Sort by sentiment for ranking
  const ranked = [...report.products].sort((a, b) => b.sentimentScore - a.sentimentScore);

  ranked.forEach((product, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
    const scoreBar = '█'.repeat(Math.round((product.sentimentScore + 1) * 20));
    lines.push(`${medal} ${product.productName} (${product.brand})`);
    lines.push(`   Sentiment: ${(product.sentimentScore * 100).toFixed(1)}% [${scoreBar}]`);
    lines.push(`   Reviews: ${product.reviewCount}`);

    if (product.topStrengths.length > 0) {
      lines.push(`   Strengths: ${product.topStrengths.join(', ')}`);
    }
    if (product.topWeaknesses.length > 0) {
      lines.push(`   Weaknesses: ${product.topWeaknesses.join(', ')}`);
    }
    lines.push('');
  });

  lines.push('─'.repeat(70));
  lines.push('SUMMARY');
  lines.push('─'.repeat(70));
  lines.push(`Best Sentiment: ${report.comparison.bestSentiment}`);
  lines.push(`Most Reviewed: ${report.comparison.mostReviewed}`);

  // Theme comparison
  if (Object.keys(report.comparison.themeComparison).length > 0) {
    lines.push('');
    lines.push('─'.repeat(70));
    lines.push('THEME COMPARISON');
    lines.push('─'.repeat(70));

    const themes = Object.entries(report.comparison.themeComparison);
    themes.slice(0, 6).forEach(([theme, scores]) => {
      lines.push(`${theme}:`);
      Object.entries(scores).forEach(([productId, score]) => {
        const product = report.products.find((p) => p.productId === productId);
        const name = product?.productName || productId;
        const indicator = score > 0.1 ? '✓' : score < -0.1 ? '✗' : '○';
        lines.push(`  ${indicator} ${name}: ${(score * 100).toFixed(0)}%`);
      });
    });
  }

  lines.push('');
  lines.push('═'.repeat(70));

  return lines.join('\n');
}
