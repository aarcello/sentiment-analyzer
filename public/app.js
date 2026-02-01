// API Base URL
const API = '/api';

// Chart instances
let comparisonChart = null;
let themeComparisonChart = null;
let trendsChart = null;

// Navigation
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const view = item.dataset.view;
    showView(view);
  });
});

function showView(viewName) {
  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // Update views
  document.querySelectorAll('.view').forEach(view => {
    view.classList.toggle('active', view.id === `${viewName}-view`);
  });

  // Load data for view
  switch (viewName) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'products':
      loadProducts();
      break;
    case 'analysis':
      loadProductSelect('analysis-product-select');
      break;
    case 'compare':
      // Comparison loads on button click
      break;
    case 'trends':
      loadProductSelect('trends-product-select');
      break;
  }
}

// Toast notifications
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Loading overlay
function showLoading(show = true) {
  document.getElementById('loading').classList.toggle('show', show);
}

// API calls
async function apiCall(endpoint, options = {}) {
  try {
    const response = await fetch(`${API}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'API error');
    }
    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Dashboard
async function loadDashboard() {
  try {
    const [products, analyses] = await Promise.all([
      apiCall('/products'),
      apiCall('/analysis'),
    ]);

    // Update stats
    document.getElementById('total-products').textContent = products.length;

    let totalReviews = 0;
    let totalSentiment = 0;
    let topProduct = null;

    analyses.forEach(analysis => {
      totalReviews += analysis.totalReviews;
      totalSentiment += analysis.sentimentSummary.averageScore;
      if (!topProduct || analysis.sentimentSummary.averageScore > topProduct.score) {
        topProduct = {
          name: analysis.productName,
          score: analysis.sentimentSummary.averageScore,
        };
      }
    });

    document.getElementById('total-reviews').textContent = totalReviews;
    document.getElementById('avg-sentiment').textContent = analyses.length > 0
      ? `${Math.round((totalSentiment / analyses.length) * 100)}%`
      : '--';
    document.getElementById('top-product').textContent = topProduct?.name || '--';

    // Recent analyses
    const recentDiv = document.getElementById('recent-analyses');
    if (analyses.length === 0) {
      recentDiv.innerHTML = '<p class="empty-state">No analyses yet. Add products and run analysis to get started.</p>';
    } else {
      recentDiv.innerHTML = analyses.slice(0, 5).map(a => `
        <div class="review-item ${getSentimentClass(a.sentimentSummary.averageScore)}">
          <div class="review-text"><strong>${a.productName}</strong> - ${a.brand}</div>
          <div class="review-meta">
            <span>Sentiment: ${Math.round(a.sentimentSummary.averageScore * 100)}%</span>
            <span>Reviews: ${a.totalReviews}</span>
            <span>Analyzed: ${new Date(a.analyzedAt).toLocaleDateString()}</span>
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    showToast('Failed to load dashboard', 'error');
  }
}

// Products
async function loadProducts() {
  try {
    const products = await apiCall('/products');
    const container = document.getElementById('products-list');

    if (products.length === 0) {
      container.innerHTML = '<p class="empty-state">No products added yet. Use the form above to add your first product.</p>';
      return;
    }

    container.innerHTML = products.map(p => `
      <div class="product-card">
        <h4>${p.name}</h4>
        <div class="meta">
          <div>${p.brand} • ${p.category}</div>
          <div>${p.platform}</div>
        </div>
        <div class="actions">
          <button class="btn btn-sm btn-primary" onclick="crawlProduct('${p.id}')">Crawl</button>
          <button class="btn btn-sm btn-secondary" onclick="analyzeProduct('${p.id}')">Analyze</button>
          <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    showToast('Failed to load products', 'error');
  }
}

// Add product form
document.getElementById('add-product-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const product = {
    id: document.getElementById('product-id').value.trim().toLowerCase().replace(/\s+/g, '-'),
    name: document.getElementById('product-name').value,
    brand: document.getElementById('product-brand').value,
    category: document.getElementById('product-category').value || 'general',
    url: document.getElementById('product-url').value,
    platform: document.getElementById('product-platform').value,
  };

  try {
    showLoading();
    await apiCall('/products', {
      method: 'POST',
      body: JSON.stringify(product),
    });
    showToast('Product added successfully!', 'success');
    e.target.reset();
    loadProducts();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    showLoading(false);
  }
});

async function deleteProduct(id) {
  if (!confirm('Are you sure you want to delete this product?')) return;

  try {
    showLoading();
    await apiCall(`/products/${id}`, { method: 'DELETE' });
    showToast('Product deleted', 'success');
    loadProducts();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    showLoading(false);
  }
}

// Crawling
async function crawlProduct(id) {
  try {
    showLoading();
    const result = await apiCall(`/crawl/${id}?demo=true`, { method: 'POST' });
    showToast(`Crawled ${result.reviewCount} reviews!`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function crawlAllProducts() {
  try {
    showLoading();
    const result = await apiCall('/crawl?demo=true', { method: 'POST' });
    const total = result.results.reduce((sum, r) => sum + r.reviewCount, 0);
    showToast(`Crawled ${total} reviews from ${result.results.length} products!`, 'success');
    loadDashboard();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    showLoading(false);
  }
}

// Analysis
async function analyzeProduct(id) {
  try {
    showLoading();
    await apiCall(`/analyze/${id}`, { method: 'POST' });
    showToast('Analysis complete!', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function analyzeAllProducts() {
  try {
    showLoading();
    const products = await apiCall('/products');
    let analyzed = 0;

    for (const product of products) {
      try {
        await apiCall(`/analyze/${product.id}`, { method: 'POST' });
        analyzed++;
      } catch (e) {
        // Skip products without reviews
      }
    }

    showToast(`Analyzed ${analyzed} products!`, 'success');
    loadDashboard();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function loadProductSelect(selectId) {
  try {
    const products = await apiCall('/products');
    const select = document.getElementById(selectId);
    select.innerHTML = '<option value="">-- Select a product --</option>' +
      products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  } catch (error) {
    console.error('Failed to load products for select');
  }
}

async function loadAnalysis() {
  const productId = document.getElementById('analysis-product-select').value;
  if (!productId) {
    showToast('Please select a product', 'error');
    return;
  }

  try {
    showLoading();
    const analysis = await apiCall(`/analysis/${productId}`);
    displayAnalysis(analysis);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    showLoading(false);
  }
}

function displayAnalysis(analysis) {
  document.getElementById('analysis-result').style.display = 'block';

  // Header
  document.getElementById('analysis-product-name').textContent = analysis.productName;
  document.getElementById('analysis-brand').textContent = analysis.brand;

  // Sentiment score
  const score = analysis.sentimentSummary.averageScore;
  const scorePct = Math.round((score + 1) * 50); // Convert -1..1 to 0..100
  const displayScore = Math.round(score * 100);

  document.getElementById('sentiment-score-value').textContent = `${displayScore}%`;
  document.getElementById('sentiment-circle').style.background =
    `conic-gradient(${getScoreColor(score)} ${scorePct * 3.6}deg, var(--bg) 0deg)`;

  // Breakdown
  const total = analysis.sentimentSummary.positive + analysis.sentimentSummary.neutral + analysis.sentimentSummary.negative;
  const positivePct = (analysis.sentimentSummary.positive / total) * 100;
  const neutralPct = (analysis.sentimentSummary.neutral / total) * 100;
  const negativePct = (analysis.sentimentSummary.negative / total) * 100;

  document.getElementById('positive-fill').style.width = `${positivePct}%`;
  document.getElementById('neutral-fill').style.width = `${neutralPct}%`;
  document.getElementById('negative-fill').style.width = `${negativePct}%`;

  document.getElementById('positive-count').textContent = analysis.sentimentSummary.positive;
  document.getElementById('neutral-count').textContent = analysis.sentimentSummary.neutral;
  document.getElementById('negative-count').textContent = analysis.sentimentSummary.negative;

  // Themes
  const themesHtml = analysis.themes.map(theme => {
    const themeClass = theme.averageSentiment > 0.1 ? 'positive' :
                       theme.averageSentiment < -0.1 ? 'negative' : 'neutral';
    return `
      <span class="theme-tag ${themeClass}">
        ${theme.name}
        <span class="theme-count">${theme.count}</span>
      </span>
    `;
  }).join('');
  document.getElementById('themes-list').innerHTML = themesHtml || '<p class="empty-state">No themes detected</p>';

  // Keywords
  document.getElementById('positive-keywords').innerHTML =
    analysis.topPositiveKeywords.map(k => `<span class="keyword positive">${k}</span>`).join('') ||
    '<span class="empty-state">None</span>';

  document.getElementById('negative-keywords').innerHTML =
    analysis.topNegativeKeywords.map(k => `<span class="keyword negative">${k}</span>`).join('') ||
    '<span class="empty-state">None</span>';

  // Sample reviews
  const reviewsHtml = analysis.reviews.slice(0, 10).map(review => `
    <div class="review-item ${review.sentiment.label}">
      <div class="review-text">${review.text.substring(0, 200)}${review.text.length > 200 ? '...' : ''}</div>
      <div class="review-meta">
        <span>Sentiment: ${Math.round(review.sentiment.score * 100)}%</span>
        ${review.rating ? `<span>Rating: ${review.rating.toFixed(1)}/5</span>` : ''}
        ${review.author ? `<span>By: ${review.author}</span>` : ''}
      </div>
    </div>
  `).join('');
  document.getElementById('sample-reviews').innerHTML = reviewsHtml || '<p class="empty-state">No reviews</p>';
}

// Comparison
async function loadComparison() {
  try {
    showLoading();
    const report = await apiCall('/compare');
    displayComparison(report);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    showLoading(false);
  }
}

function displayComparison(report) {
  document.getElementById('comparison-result').style.display = 'block';

  // Sentiment chart
  const ctx = document.getElementById('comparison-chart').getContext('2d');
  if (comparisonChart) comparisonChart.destroy();

  comparisonChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: report.products.map(p => p.productName),
      datasets: [{
        label: 'Sentiment Score',
        data: report.products.map(p => Math.round(p.sentimentScore * 100)),
        backgroundColor: report.products.map(p => getScoreColor(p.sentimentScore)),
        borderRadius: 8,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          min: -100,
          max: 100,
          grid: { color: '#334155' },
          ticks: { color: '#94a3b8' },
        },
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8' },
        }
      }
    }
  });

  // Rankings
  const rankingsHtml = report.products
    .sort((a, b) => b.sentimentScore - a.sentimentScore)
    .map((p, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
      return `
        <div class="ranking-item">
          <div class="ranking-position">${medal}</div>
          <div class="ranking-info">
            <h4>${p.productName}</h4>
            <div class="brand">${p.brand}</div>
            <div class="strengths-weaknesses">
              ${p.topStrengths.length ? `<span class="strengths">✓ ${p.topStrengths.join(', ')}</span>` : ''}
              ${p.topWeaknesses.length ? `<span class="weaknesses">✗ ${p.topWeaknesses.join(', ')}</span>` : ''}
            </div>
          </div>
          <div class="ranking-score">
            <div class="value">${Math.round(p.sentimentScore * 100)}%</div>
            <div class="label">${p.reviewCount} reviews</div>
          </div>
        </div>
      `;
    }).join('');
  document.getElementById('rankings-list').innerHTML = rankingsHtml;

  // Theme comparison chart
  const themes = Object.keys(report.comparison.themeComparison).slice(0, 6);
  const themeCtx = document.getElementById('theme-comparison-chart').getContext('2d');
  if (themeComparisonChart) themeComparisonChart.destroy();

  const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  themeComparisonChart = new Chart(themeCtx, {
    type: 'radar',
    data: {
      labels: themes,
      datasets: report.products.map((p, i) => ({
        label: p.productName,
        data: themes.map(t => Math.round((report.comparison.themeComparison[t][p.productId] || 0) * 100)),
        borderColor: colors[i % colors.length],
        backgroundColor: `${colors[i % colors.length]}33`,
      }))
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8' }
        }
      },
      scales: {
        r: {
          grid: { color: '#334155' },
          angleLines: { color: '#334155' },
          pointLabels: { color: '#94a3b8' },
          ticks: { display: false },
          min: -100,
          max: 100
        }
      }
    }
  });
}

// Trends
async function loadTrends() {
  const productId = document.getElementById('trends-product-select').value;
  const days = document.getElementById('trends-days-select').value;

  if (!productId) {
    showToast('Please select a product', 'error');
    return;
  }

  try {
    showLoading();
    const data = await apiCall(`/trends/${productId}?days=${days}`);
    displayTrends(data);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    showLoading(false);
  }
}

function displayTrends(data) {
  document.getElementById('trends-result').style.display = 'block';

  document.getElementById('trend-product-name').textContent = data.productName;

  const indicator = document.getElementById('trend-indicator');
  indicator.textContent = data.trend.charAt(0).toUpperCase() + data.trend.slice(1);
  indicator.className = `trend-indicator ${data.trend}`;

  // Chart
  const ctx = document.getElementById('trends-chart').getContext('2d');
  if (trendsChart) trendsChart.destroy();

  trendsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.history.map(h => h.date),
      datasets: [{
        label: 'Sentiment Score',
        data: data.history.map(h => Math.round(h.averageSentiment * 100)),
        borderColor: '#6366f1',
        backgroundColor: '#6366f133',
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          min: -100,
          max: 100,
          grid: { color: '#334155' },
          ticks: { color: '#94a3b8' }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8' }
        }
      }
    }
  });

  // Table
  const tbody = document.querySelector('#trends-table tbody');
  tbody.innerHTML = data.history.map(h => `
    <tr>
      <td>${h.date}</td>
      <td>${Math.round(h.averageSentiment * 100)}%</td>
      <td>${h.reviewCount}</td>
      <td>${Math.round(h.positiveRatio * 100)}%</td>
    </tr>
  `).join('');
}

// Helpers
function getSentimentClass(score) {
  if (score > 0.1) return 'positive';
  if (score < -0.1) return 'negative';
  return 'neutral';
}

function getScoreColor(score) {
  if (score > 0.1) return '#22c55e';
  if (score < -0.1) return '#ef4444';
  return '#f59e0b';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard();
});
