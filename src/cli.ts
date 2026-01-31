#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { CronJob } from 'cron';
import { ConfigManager } from './config';
import { crawlProduct, crawlAllProducts } from './crawlers';
import { generateProductAnalysis } from './analyzers';
import {
  generateComparisonReport,
  generateTrendReport,
  formatAnalysisReport,
  formatComparisonReport,
} from './reports';
import { dataStore } from './storage/dataStore';
import { ProductConfig } from './types';

const program = new Command();
const configManager = new ConfigManager();

program
  .name('sentiment-analyzer')
  .description('Automated sentiment analysis tool for product reviews')
  .version('1.0.0');

// Add product command
program
  .command('add')
  .description('Add a product to monitor')
  .requiredOption('-i, --id <id>', 'Unique product ID')
  .requiredOption('-n, --name <name>', 'Product name')
  .requiredOption('-b, --brand <brand>', 'Brand name')
  .requiredOption('-u, --url <url>', 'Product review URL')
  .option('-p, --platform <platform>', 'Platform (amazon, bestbuy, walmart, generic)', 'generic')
  .option('-c, --category <category>', 'Product category', 'general')
  .action((options) => {
    const product: ProductConfig = {
      id: options.id,
      name: options.name,
      brand: options.brand,
      category: options.category,
      url: options.url,
      platform: options.platform as ProductConfig['platform'],
      enabled: true,
    };

    configManager.addProduct(product);
    console.log(chalk.green(`✓ Added product: ${product.name}`));
  });

// List products command
program
  .command('list')
  .description('List all configured products')
  .action(() => {
    const products = configManager.getProducts();

    if (products.length === 0) {
      console.log(chalk.yellow('No products configured. Use "add" command to add products.'));
      return;
    }

    const table = new Table({
      head: ['ID', 'Name', 'Brand', 'Platform', 'Enabled'],
      style: { head: ['cyan'] },
    });

    products.forEach((p) => {
      table.push([
        p.id,
        p.name,
        p.brand,
        p.platform,
        p.enabled ? chalk.green('Yes') : chalk.red('No'),
      ]);
    });

    console.log(table.toString());
  });

// Remove product command
program
  .command('remove <id>')
  .description('Remove a product from monitoring')
  .action((id) => {
    if (configManager.removeProduct(id)) {
      console.log(chalk.green(`✓ Removed product: ${id}`));
    } else {
      console.log(chalk.red(`✗ Product not found: ${id}`));
    }
  });

// Crawl command
program
  .command('crawl')
  .description('Crawl reviews for products')
  .option('-p, --product <id>', 'Crawl specific product')
  .option('-d, --demo', 'Use demo mode (generate sample data)')
  .action(async (options) => {
    const settings = configManager.getSettings();
    const crawlerSettings = {
      crawlDelay: settings.crawlDelay,
      userAgent: settings.userAgent,
      maxReviews: settings.maxReviewsPerProduct,
    };

    const useDemo = options.demo || false;

    if (options.product) {
      const product = configManager.getProduct(options.product);
      if (!product) {
        console.log(chalk.red(`Product not found: ${options.product}`));
        return;
      }

      console.log(chalk.blue(`\nCrawling reviews for: ${product.name}`));
      const { reviews, result } = await crawlProduct(product, crawlerSettings, useDemo);

      if (result.success) {
        console.log(chalk.green(`✓ Crawled ${result.reviewCount} reviews`));
      } else {
        console.log(chalk.red(`✗ Crawl failed: ${result.error}`));
      }
    } else {
      const products = configManager.getEnabledProducts();

      if (products.length === 0) {
        console.log(chalk.yellow('No enabled products to crawl.'));
        return;
      }

      console.log(chalk.blue(`\nCrawling ${products.length} products...\n`));
      const results = await crawlAllProducts(products, crawlerSettings, useDemo);

      const table = new Table({
        head: ['Product', 'Status', 'Reviews'],
        style: { head: ['cyan'] },
      });

      results.forEach((result, productId) => {
        const product = configManager.getProduct(productId);
        table.push([
          product?.name || productId,
          result.result.success ? chalk.green('Success') : chalk.red('Failed'),
          result.result.reviewCount.toString(),
        ]);
      });

      console.log(table.toString());
    }
  });

// Analyze command
program
  .command('analyze')
  .description('Analyze reviews and generate sentiment report')
  .option('-p, --product <id>', 'Analyze specific product')
  .action(async (options) => {
    if (options.product) {
      const product = configManager.getProduct(options.product);
      if (!product) {
        console.log(chalk.red(`Product not found: ${options.product}`));
        return;
      }

      const reviews = dataStore.getAllReviewsForProduct(product.id);

      if (reviews.length === 0) {
        console.log(chalk.yellow(`No reviews found for ${product.name}. Run "crawl" first.`));
        return;
      }

      console.log(chalk.blue(`\nAnalyzing ${reviews.length} reviews for: ${product.name}\n`));

      const analysis = generateProductAnalysis(product.id, product.name, product.brand, reviews);
      dataStore.saveAnalysis(analysis);

      console.log(formatAnalysisReport(analysis));
    } else {
      const products = configManager.getEnabledProducts();

      if (products.length === 0) {
        console.log(chalk.yellow('No enabled products to analyze.'));
        return;
      }

      console.log(chalk.blue(`\nAnalyzing ${products.length} products...\n`));

      for (const product of products) {
        const reviews = dataStore.getAllReviewsForProduct(product.id);

        if (reviews.length === 0) {
          console.log(chalk.yellow(`No reviews found for ${product.name}, skipping...`));
          continue;
        }

        const analysis = generateProductAnalysis(product.id, product.name, product.brand, reviews);
        dataStore.saveAnalysis(analysis);

        console.log(formatAnalysisReport(analysis));
        console.log('\n');
      }
    }
  });

// Compare command
program
  .command('compare')
  .description('Generate comparison report between products')
  .option('-p, --products <ids>', 'Comma-separated product IDs to compare')
  .action(async (options) => {
    let productIds: string[];

    if (options.products) {
      productIds = options.products.split(',').map((id: string) => id.trim());
    } else {
      productIds = configManager.getEnabledProducts().map((p) => p.id);
    }

    if (productIds.length < 2) {
      console.log(chalk.yellow('Need at least 2 products to compare.'));
      return;
    }

    const analyses = productIds
      .map((id) => dataStore.getLatestAnalysis(id))
      .filter((a) => a !== null);

    if (analyses.length < 2) {
      console.log(chalk.yellow('Not enough analysis data. Run "analyze" first.'));
      return;
    }

    const report = generateComparisonReport(analyses as any[]);
    console.log(formatComparisonReport(report));
  });

// Trend command
program
  .command('trend <productId>')
  .description('Show sentiment trend for a product')
  .option('-d, --days <days>', 'Number of days to show', '30')
  .action((productId, options) => {
    const product = configManager.getProduct(productId);
    if (!product) {
      console.log(chalk.red(`Product not found: ${productId}`));
      return;
    }

    const { history, trend } = generateTrendReport(productId, parseInt(options.days));

    if (history.length === 0) {
      console.log(chalk.yellow(`No historical data for ${product.name}.`));
      return;
    }

    console.log(chalk.blue(`\nSentiment Trend for: ${product.name}`));
    console.log('─'.repeat(50));

    const trendColor = trend === 'improving' ? chalk.green : trend === 'declining' ? chalk.red : chalk.yellow;
    console.log(`Overall Trend: ${trendColor(trend.toUpperCase())}`);
    console.log('');

    const table = new Table({
      head: ['Date', 'Sentiment', 'Reviews', 'Positive %'],
      style: { head: ['cyan'] },
    });

    history.forEach((point) => {
      const sentimentBar = '█'.repeat(Math.round((point.averageSentiment + 1) * 10));
      table.push([
        point.date,
        `${(point.averageSentiment * 100).toFixed(0)}% ${sentimentBar}`,
        point.reviewCount.toString(),
        `${(point.positiveRatio * 100).toFixed(0)}%`,
      ]);
    });

    console.log(table.toString());
  });

// Schedule command
program
  .command('schedule')
  .description('Start scheduled crawling')
  .option('-c, --cron <expression>', 'Cron expression', '0 0 * * *')
  .option('-d, --demo', 'Use demo mode')
  .action((options) => {
    console.log(chalk.blue(`\nStarting scheduled crawler with cron: ${options.cron}`));
    console.log(chalk.gray('Press Ctrl+C to stop\n'));

    const job = new CronJob(options.cron, async () => {
      console.log(chalk.blue(`\n[${new Date().toISOString()}] Running scheduled crawl...`));

      const products = configManager.getEnabledProducts();
      const settings = configManager.getSettings();
      const crawlerSettings = {
        crawlDelay: settings.crawlDelay,
        userAgent: settings.userAgent,
        maxReviews: settings.maxReviewsPerProduct,
      };

      const results = await crawlAllProducts(products, crawlerSettings, options.demo);

      // Auto-analyze after crawl
      for (const [productId, { reviews }] of results) {
        if (reviews.length > 0) {
          const product = configManager.getProduct(productId);
          if (product) {
            const analysis = generateProductAnalysis(product.id, product.name, product.brand, reviews);
            dataStore.saveAnalysis(analysis);
            console.log(chalk.green(`✓ Analyzed ${product.name}: ${reviews.length} reviews`));
          }
        }
      }
    });

    job.start();

    // Run immediately once
    console.log(chalk.gray('Running initial crawl...\n'));
    job.fireOnTick();
  });

// Demo command - quick setup with sample data
program
  .command('demo')
  .description('Run demo with sample products and data')
  .action(async () => {
    console.log(chalk.blue('\n🚀 Running Sentiment Analyzer Demo\n'));

    // Add sample products
    const sampleProducts: ProductConfig[] = [
      {
        id: 'wireless-headphones-a',
        name: 'ProSound Wireless Headphones',
        brand: 'ProSound',
        category: 'Electronics',
        url: 'https://example.com/headphones-a',
        platform: 'generic',
        enabled: true,
      },
      {
        id: 'wireless-headphones-b',
        name: 'AudioMax Elite Headphones',
        brand: 'AudioMax',
        category: 'Electronics',
        url: 'https://example.com/headphones-b',
        platform: 'generic',
        enabled: true,
      },
      {
        id: 'wireless-headphones-c',
        name: 'SoundWave Premium Headphones',
        brand: 'SoundWave',
        category: 'Electronics',
        url: 'https://example.com/headphones-c',
        platform: 'generic',
        enabled: true,
      },
    ];

    console.log(chalk.cyan('1. Adding sample products...'));
    sampleProducts.forEach((p) => {
      configManager.addProduct(p);
      console.log(`   ✓ ${p.name}`);
    });

    // Crawl with demo data
    console.log(chalk.cyan('\n2. Crawling reviews (demo mode)...'));
    const settings = configManager.getSettings();
    const crawlerSettings = {
      crawlDelay: settings.crawlDelay,
      userAgent: settings.userAgent,
      maxReviews: 30,
    };

    const crawlResults = await crawlAllProducts(sampleProducts, crawlerSettings, true);

    crawlResults.forEach((result, productId) => {
      const product = sampleProducts.find((p) => p.id === productId);
      console.log(`   ✓ ${product?.name}: ${result.result.reviewCount} reviews`);
    });

    // Analyze
    console.log(chalk.cyan('\n3. Analyzing sentiment...'));
    const analyses = [];

    for (const product of sampleProducts) {
      const reviews = dataStore.getAllReviewsForProduct(product.id);
      const analysis = generateProductAnalysis(product.id, product.name, product.brand, reviews);
      dataStore.saveAnalysis(analysis);
      analyses.push(analysis);
      console.log(`   ✓ ${product.name}: Score ${(analysis.sentimentSummary.averageScore * 100).toFixed(0)}%`);
    }

    // Show individual analysis for first product
    console.log(chalk.cyan('\n4. Sample Analysis Report:'));
    console.log(formatAnalysisReport(analyses[0]));

    // Generate comparison
    console.log(chalk.cyan('\n5. Comparison Report:'));
    const comparison = generateComparisonReport(analyses);
    console.log(formatComparisonReport(comparison));

    console.log(chalk.green('\n✅ Demo complete! Your data is saved in the ./data directory.'));
    console.log(chalk.gray('\nTry these commands:'));
    console.log(chalk.gray('  npm run dev -- list              # List products'));
    console.log(chalk.gray('  npm run dev -- analyze           # Re-analyze products'));
    console.log(chalk.gray('  npm run dev -- compare           # Compare products'));
    console.log(chalk.gray('  npm run dev -- trend <productId> # View trends'));
  });

program.parse(process.argv);
