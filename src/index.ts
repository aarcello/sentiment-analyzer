// Sentiment Analyzer - Main exports

export { ConfigManager, configManager } from './config';
export { DataStore, dataStore } from './storage/dataStore';
export {
  crawlProduct,
  crawlAllProducts,
  createCrawler,
  BaseCrawler,
  AmazonCrawler,
  GenericCrawler,
  DemoCrawler,
} from './crawlers';
export {
  analyzeSentiment,
  detectThemes,
  analyzeReview,
  analyzeReviews,
  generateProductAnalysis,
} from './analyzers';
export {
  generateComparisonReport,
  generateTrendReport,
  formatAnalysisReport,
  formatComparisonReport,
} from './reports';

export * from './types';
