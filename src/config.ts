import * as fs from 'fs';
import * as path from 'path';
import { Config, ProductConfig } from './types';

const DEFAULT_CONFIG: Config = {
  products: [],
  settings: {
    crawlDelay: 2000,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    maxReviewsPerProduct: 100,
    retryAttempts: 3,
    dataDir: './data',
  },
};

export class ConfigManager {
  private configPath: string;
  private config: Config;

  constructor(configPath?: string) {
    this.configPath = configPath || path.join(process.cwd(), 'config', 'products.json');
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      }
    } catch (error) {
      console.warn(`Warning: Could not load config from ${this.configPath}`);
    }
    return DEFAULT_CONFIG;
  }

  saveConfig(): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  getConfig(): Config {
    return this.config;
  }

  getProducts(): ProductConfig[] {
    return this.config.products;
  }

  getEnabledProducts(): ProductConfig[] {
    return this.config.products.filter((p) => p.enabled);
  }

  getProduct(id: string): ProductConfig | undefined {
    return this.config.products.find((p) => p.id === id);
  }

  addProduct(product: ProductConfig): void {
    const existing = this.config.products.findIndex((p) => p.id === product.id);
    if (existing >= 0) {
      this.config.products[existing] = product;
    } else {
      this.config.products.push(product);
    }
    this.saveConfig();
  }

  removeProduct(id: string): boolean {
    const index = this.config.products.findIndex((p) => p.id === id);
    if (index >= 0) {
      this.config.products.splice(index, 1);
      this.saveConfig();
      return true;
    }
    return false;
  }

  getSettings(): Config['settings'] {
    return this.config.settings;
  }

  updateSettings(settings: Partial<Config['settings']>): void {
    this.config.settings = { ...this.config.settings, ...settings };
    this.saveConfig();
  }
}

export const configManager = new ConfigManager();
