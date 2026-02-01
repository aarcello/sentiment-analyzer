import { Router, Request, Response } from 'express';
import { ConfigManager } from '../config';
import { crawlProduct, crawlAllProducts } from '../crawlers';
import { generateProductAnalysis } from '../analyzers';
import { generateComparisonReport, generateTrendReport } from '../reports';
import { dataStore } from '../storage/dataStore';
import { ProductConfig } from '../types';

const router = Router();
const configManager = new ConfigManager();

// Helper to safely get string from params/query
function getString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
}

// Get all products
router.get('/products', (_req: Request, res: Response) => {
  const products = configManager.getProducts();
  res.json(products);
});

// Get single product
router.get('/products/:id', (req: Request, res: Response) => {
  const product = configManager.getProduct(getString(req.params.id));
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(product);
});

// Add new product
router.post('/products', (req: Request, res: Response) => {
  try {
    const { id, name, brand, category, url, platform } = req.body;

    if (!id || !name || !brand || !url) {
      return res.status(400).json({ error: 'Missing required fields: id, name, brand, url' });
    }

    const product: ProductConfig = {
      id,
      name,
      brand,
      category: category || 'general',
      url,
      platform: platform || 'generic',
      enabled: true,
    };

    configManager.addProduct(product);
    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Update product
router.put('/products/:id', (req: Request, res: Response) => {
  try {
    const productId = getString(req.params.id);
    const existing = configManager.getProduct(productId);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const updated: ProductConfig = { ...existing, ...req.body, id: productId };
    configManager.addProduct(updated);
    res.json({ success: true, product: updated });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Delete product
router.delete('/products/:id', (req: Request, res: Response) => {
  const success = configManager.removeProduct(getString(req.params.id));
  if (!success) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json({ success: true });
});

// Crawl reviews for a product
router.post('/crawl/:id', async (req: Request, res: Response) => {
  try {
    const productId = getString(req.params.id);
    const product = configManager.getProduct(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const settings = configManager.getSettings();
    const crawlerSettings = {
      crawlDelay: settings.crawlDelay,
      userAgent: settings.userAgent,
      maxReviews: settings.maxReviewsPerProduct,
    };

    // Use demo mode for testing (can be toggled via query param)
    const demoParam = getString(req.query.demo);
    const useDemo = demoParam === 'true' || demoParam === '1';

    const { result } = await crawlProduct(product, crawlerSettings, useDemo);
    res.json({ success: result.success, reviewCount: result.reviewCount, error: result.error });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Crawl all enabled products
router.post('/crawl', async (req: Request, res: Response) => {
  try {
    const products = configManager.getEnabledProducts();
    const settings = configManager.getSettings();
    const crawlerSettings = {
      crawlDelay: settings.crawlDelay,
      userAgent: settings.userAgent,
      maxReviews: settings.maxReviewsPerProduct,
    };

    const demoParam = getString(req.query.demo);
    const useDemo = demoParam === 'true' || demoParam === '1';

    const results = await crawlAllProducts(products, crawlerSettings, useDemo);

    const summary = Array.from(results.entries()).map(([productId, data]) => ({
      productId,
      productName: configManager.getProduct(productId)?.name || productId,
      success: data.result.success,
      reviewCount: data.result.reviewCount,
      error: data.result.error,
    }));

    res.json({ success: true, results: summary });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Analyze a product
router.post('/analyze/:id', async (req: Request, res: Response) => {
  try {
    const productId = getString(req.params.id);
    const product = configManager.getProduct(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const reviews = dataStore.getAllReviewsForProduct(product.id);
    if (reviews.length === 0) {
      return res.status(400).json({ error: 'No reviews found. Crawl reviews first.' });
    }

    const analysis = generateProductAnalysis(product.id, product.name, product.brand, reviews);
    dataStore.saveAnalysis(analysis);

    res.json({ success: true, analysis });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Get latest analysis for a product
router.get('/analysis/:id', (req: Request, res: Response) => {
  const analysis = dataStore.getLatestAnalysis(getString(req.params.id));
  if (!analysis) {
    return res.status(404).json({ error: 'No analysis found. Run analysis first.' });
  }
  res.json(analysis);
});

// Get all latest analyses
router.get('/analysis', (_req: Request, res: Response) => {
  const analyses = dataStore.getAllLatestAnalyses();
  res.json(analyses);
});

// Get comparison report
router.get('/compare', (req: Request, res: Response) => {
  try {
    let productIds: string[];

    const productsParam = getString(req.query.products);
    if (productsParam) {
      productIds = productsParam.split(',');
    } else {
      productIds = configManager.getEnabledProducts().map((p) => p.id);
    }

    const analyses = productIds
      .map((id) => dataStore.getLatestAnalysis(id))
      .filter((a) => a !== null);

    if (analyses.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 analyzed products for comparison.' });
    }

    const report = generateComparisonReport(analyses as any[]);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Get trend data for a product
router.get('/trends/:id', (req: Request, res: Response) => {
  try {
    const productId = getString(req.params.id);
    const product = configManager.getProduct(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const daysParam = getString(req.query.days);
    const days = parseInt(daysParam) || 30;
    const { history, trend } = generateTrendReport(productId, days);

    res.json({ productId, productName: product.name, trend, history });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// Get reviews for a product
router.get('/reviews/:id', (req: Request, res: Response) => {
  const reviews = dataStore.getAllReviewsForProduct(getString(req.params.id));
  res.json(reviews);
});

export default router;
