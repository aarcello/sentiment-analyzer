import * as fs from 'fs';
import * as path from 'path';
import { Review, AnalyzedReview, ProductAnalysis, HistoricalDataPoint } from '../types';
import dayjs from 'dayjs';

export class DataStore {
  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir || path.join(process.cwd(), 'data');
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    const dirs = ['reviews', 'analysis', 'history'].map((d) =>
      path.join(this.dataDir, d)
    );
    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  private getFilePath(type: string, productId: string, date?: string): string {
    const dateStr = date || dayjs().format('YYYY-MM-DD');
    return path.join(this.dataDir, type, `${productId}_${dateStr}.json`);
  }

  saveReviews(productId: string, reviews: Review[]): void {
    const filePath = this.getFilePath('reviews', productId);
    fs.writeFileSync(filePath, JSON.stringify(reviews, null, 2));
  }

  getReviews(productId: string, date?: string): Review[] {
    const filePath = this.getFilePath('reviews', productId, date);
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch (error) {
      console.warn(`Could not load reviews for ${productId}`);
    }
    return [];
  }

  getAllReviewsForProduct(productId: string): Review[] {
    const reviewsDir = path.join(this.dataDir, 'reviews');
    const allReviews: Review[] = [];

    try {
      const files = fs.readdirSync(reviewsDir).filter((f) =>
        f.startsWith(`${productId}_`) && f.endsWith('.json')
      );

      files.forEach((file) => {
        const data = JSON.parse(
          fs.readFileSync(path.join(reviewsDir, file), 'utf-8')
        );
        allReviews.push(...data);
      });
    } catch (error) {
      console.warn(`Could not load reviews for ${productId}`);
    }

    // Deduplicate by review ID
    const uniqueReviews = new Map<string, Review>();
    allReviews.forEach((r) => uniqueReviews.set(r.id, r));
    return Array.from(uniqueReviews.values());
  }

  saveAnalysis(analysis: ProductAnalysis): void {
    const filePath = path.join(
      this.dataDir,
      'analysis',
      `${analysis.productId}_${dayjs().format('YYYY-MM-DD')}.json`
    );
    fs.writeFileSync(filePath, JSON.stringify(analysis, null, 2));

    // Also update historical data
    this.addHistoricalPoint(analysis.productId, {
      date: dayjs().format('YYYY-MM-DD'),
      averageSentiment: analysis.sentimentSummary.averageScore,
      reviewCount: analysis.totalReviews,
      positiveRatio: analysis.sentimentSummary.positive / analysis.totalReviews,
      negativeRatio: analysis.sentimentSummary.negative / analysis.totalReviews,
    });
  }

  getLatestAnalysis(productId: string): ProductAnalysis | null {
    const analysisDir = path.join(this.dataDir, 'analysis');

    try {
      const files = fs.readdirSync(analysisDir)
        .filter((f) => f.startsWith(`${productId}_`) && f.endsWith('.json'))
        .sort()
        .reverse();

      if (files.length > 0) {
        return JSON.parse(
          fs.readFileSync(path.join(analysisDir, files[0]), 'utf-8')
        );
      }
    } catch (error) {
      console.warn(`Could not load analysis for ${productId}`);
    }

    return null;
  }

  getAllLatestAnalyses(): ProductAnalysis[] {
    const analysisDir = path.join(this.dataDir, 'analysis');
    const analyses: ProductAnalysis[] = [];
    const seenProducts = new Set<string>();

    try {
      const files = fs.readdirSync(analysisDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .reverse();

      files.forEach((file) => {
        const productId = file.split('_')[0];
        if (!seenProducts.has(productId)) {
          seenProducts.add(productId);
          analyses.push(
            JSON.parse(fs.readFileSync(path.join(analysisDir, file), 'utf-8'))
          );
        }
      });
    } catch (error) {
      console.warn('Could not load analyses');
    }

    return analyses;
  }

  private getHistoryPath(productId: string): string {
    return path.join(this.dataDir, 'history', `${productId}_history.json`);
  }

  addHistoricalPoint(productId: string, point: HistoricalDataPoint): void {
    const historyPath = this.getHistoryPath(productId);
    let history: HistoricalDataPoint[] = [];

    try {
      if (fs.existsSync(historyPath)) {
        history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
      }
    } catch (error) {
      // Start fresh
    }

    // Update or add point for today
    const existingIndex = history.findIndex((h) => h.date === point.date);
    if (existingIndex >= 0) {
      history[existingIndex] = point;
    } else {
      history.push(point);
    }

    // Sort by date
    history.sort((a, b) => a.date.localeCompare(b.date));

    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  }

  getHistory(productId: string, days?: number): HistoricalDataPoint[] {
    const historyPath = this.getHistoryPath(productId);

    try {
      if (fs.existsSync(historyPath)) {
        let history: HistoricalDataPoint[] = JSON.parse(
          fs.readFileSync(historyPath, 'utf-8')
        );

        if (days) {
          const cutoff = dayjs().subtract(days, 'day').format('YYYY-MM-DD');
          history = history.filter((h) => h.date >= cutoff);
        }

        return history;
      }
    } catch (error) {
      console.warn(`Could not load history for ${productId}`);
    }

    return [];
  }
}

export const dataStore = new DataStore();
