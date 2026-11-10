// ============================================================
// SalesCast — Sales Forecasting Dashboard
// ============================================================

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────
  let rawData = [];          // { date: Date, sales: number }[]
  let forecastResult = null; // last computed forecast
  let forecastChart = null;
  let residualsChart = null;
  let monthlyChart = null;

  // ── DOM refs ───────────────────────────────────────────────
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const sidebar        = $('#sidebar');
  const menuToggle     = $('#menuToggle');
  const uploadZone     = $('#uploadZone');
  const fileInput      = $('#fileInput');
  const loadSampleBtn  = $('#loadSampleBtn');
  const welcomeLoadBtn = $('#welcomeLoadBtn');
  const forecastBtn    = $('#forecastBtn');
  const exportBtn      = $('#exportBtn');
  const modelSelect    = $('#modelSelect');
  const windowSize     = $('#windowSize');
  const alpha          = $('#alpha');
  const beta           = $('#beta');
  const forecastPeriods = $('#forecastPeriods');
  const showConfidence = $('#showConfidence');
  const showTrend      = $('#showTrend');
  const showGrid       = $('#showGrid');
  const welcomeScreen  = $('#welcomeScreen');
  const dashboard      = $('#dashboard');
  const dataBadge      = $('#dataBadge');
  const dataInfo       = $('#dataInfo');

  // ── Initialise ─────────────────────────────────────────────
  function init() {
    bindEvents();
    updateParamVisibility();
  }

  function bindEvents() {
    menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));

    // Upload
    uploadZone.addEventListener('click', () => fileInput.click());
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', (e) => { e.preventDefault(); uploadZone.classList.remove('drag-over'); handleFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

    // Sample data
    loadSampleBtn.addEventListener('click', loadSampleData);
    welcomeLoadBtn.addEventListener('click', loadSampleData);

    // Controls
    modelSelect.addEventListener('change', () => { updateParamVisibility(); autoForecast(); });
    windowSize.addEventListener('input', (e) => { $('#windowVal').textContent = e.target.value; autoForecast(); });
    alpha.addEventListener('input', (e) => { $('#alphaVal').textContent = parseFloat(e.target.value).toFixed(2); autoForecast(); });
    beta.addEventListener('input', (e) => { $('#betaVal').textContent = parseFloat(e.target.value).toFixed(2); autoForecast(); });
    forecastPeriods.addEventListener('input', (e) => { $('#forecastVal').textContent = e.target.value; autoForecast(); });

    showConfidence.addEventListener('change', updateChartVisibility);
    showTrend.addEventListener('change', updateChartVisibility);
    showGrid.addEventListener('change', updateChartVisibility);

    forecastBtn.addEventListener('click', runForecast);
    exportBtn.addEventListener('click', exportReport);
  }

  function updateParamVisibility() {
    const model = modelSelect.value;
    const needsWindow = ['moving_avg', 'weighted_ma'].includes(model);
    const needsAlpha  = ['exp_smoothing', 'holt'].includes(model);
    const needsBeta   = model === 'holt';

    $('#windowGroup').style.display = needsWindow ? 'block' : 'none';
    $('#alphaGroup').style.display  = needsAlpha  ? 'block' : 'none';
    $('#betaGroup').style.display   = needsBeta   ? 'block' : 'none';
  }

  // ── CSV Parsing ────────────────────────────────────────────
  function handleFile(file) {
    if (!file) return;
    if (!file.name.endsWith('.csv')) {
      toast('Please upload a .csv file', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        parseCSV(e.target.result);
        toast(`Loaded ${rawData.length} data points from ${file.name}`, 'success');
      } catch (err) {
        toast('Error parsing CSV: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 3) throw new Error('Need at least 2 data rows');

    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const dateIdx  = header.findIndex(h => /date|period|month|time/i.test(h));
    const salesIdx = header.findIndex(h => /sale|revenue|amount|value/i.test(h));

    if (dateIdx === -1 || salesIdx === -1)
      throw new Error('CSV must have Date and Sales columns');

    rawData = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length <= Math.max(dateIdx, salesIdx)) continue;
      const dateStr = cols[dateIdx].trim();
      const salesStr = cols[salesIdx].trim().replace(/[^0-9.\-]/g, '');
      const date = new Date(dateStr);
      const sales = parseFloat(salesStr);
      if (isNaN(date.getTime()) || isNaN(sales)) continue;
      rawData.push({ date, sales });
    }

    rawData.sort((a, b) => a.date - b.date);
    if (rawData.length < 3) throw new Error('Need at least 3 valid data points');

    onDataLoaded();
  }

  function loadSampleData() {
    fetch('sample-data.csv')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(text => { parseCSV(text); toast('Sample data loaded successfully', 'success'); })
      .catch(() => {
        // Generate sample inline as fallback
        generateInlineSample();
        toast('Sample data generated', 'success');
      });
  }

  function generateInlineSample() {
    rawData = [];
    const base = 40000;
    const seasonal = [0, -0.06, 0.04, 0.08, 0.14, 0.10, 0.04, 0.08, 0.18, 0.24, 0.36, 0.52];
    for (let y = 0; y < 3; y++) {
      for (let m = 0; m < 12; m++) {
        if (y === 2 && m > 10) break;
        const trend = base * (1 + 0.015 * (y * 12 + m));
        const noise = (Math.random() - 0.5) * 4000;
        rawData.push({
          date: new Date(2024, m, 1),
          sales: Math.round(trend * (1 + seasonal[m]) + noise)
        });
      }
    }
    rawData[rawData.length - 1].date = new Date(2026, 10, 1);
    rawData.sort((a, b) => a.date - b.date);
    onDataLoaded();
  }

  function onDataLoaded() {
    welcomeScreen.style.display = 'none';
    dashboard.style.display = 'flex';
    dataBadge.style.display = 'inline-flex';
    dataInfo.textContent = `${rawData.length} periods loaded`;
    forecastBtn.disabled = false;
    exportBtn.disabled = false;
    runForecast();
  }

  // ── Forecasting Algorithms ─────────────────────────────────
  function runForecast() {
    const model  = modelSelect.value;
    const sales  = rawData.map(d => d.sales);
    const n      = parseInt(forecastPeriods.value);
    let fitted, forecast;

    switch (model) {
      case 'moving_avg':
        ({ fitted, forecast } = simpleMovingAverage(sales, parseInt(windowSize.value), n));
        break;
      case 'weighted_ma':
        ({ fitted, forecast } = weightedMovingAverage(sales, parseInt(windowSize.value), n));
        break;
      case 'exp_smoothing':
        ({ fitted, forecast } = exponentialSmoothing(sales, parseFloat(alpha.value), n));
        break;
      case 'linear_reg':
        ({ fitted, forecast } = linearRegression(sales, n));
        break;
      case 'holt':
        ({ fitted, forecast } = holtsLinearTrend(sales, parseFloat(alpha.value), parseFloat(beta.value), n));
        break;
    }

    // Compute residuals where we have both actual and fitted
    const residuals = [];
    for (let i = 0; i < sales.length; i++) {
      residuals.push(fitted[i] != null ? sales[i] - fitted[i] : null);
    }

    // Compute confidence interval (±1.96 * σ of residuals)
    const validResiduals = residuals.filter(r => r != null);
    const stdDev = standardDeviation(validResiduals);
    const confidence = [];
    for (let i = 0; i < n; i++) {
      const widening = stdDev * Math.sqrt(1 + i * 0.15);
      confidence.push({
        lower: forecast[i] - 1.96 * widening,
        upper: forecast[i] + 1.96 * widening
      });
    }

    // Error metrics
    const metrics = computeMetrics(sales, fitted);

    forecastResult = { fitted, forecast, residuals, confidence, metrics, model, n };
    updateDashboard();
  }

  function autoForecast() {
    if (rawData.length > 0) runForecast();
  }

  // ── SMA ────────────────────────────────────────────────────
  function simpleMovingAverage(data, w, n) {
    const fitted = new Array(data.length).fill(null);
    for (let i = w; i < data.length; i++) {
      let sum = 0;
      for (let j = i - w; j < i; j++) sum += data[j];
      fitted[i] = sum / w;
    }
    const forecast = [];
    const extended = [...data];
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = extended.length - w; j < extended.length; j++) sum += extended[j];
      const val = sum / w;
      forecast.push(val);
      extended.push(val);
    }
    return { fitted, forecast };
  }

  // ── Weighted MA ────────────────────────────────────────────
  function weightedMovingAverage(data, w, n) {
    const weights = [];
    let wSum = 0;
    for (let i = 1; i <= w; i++) { weights.push(i); wSum += i; }

    const fitted = new Array(data.length).fill(null);
    for (let i = w; i < data.length; i++) {
      let val = 0;
      for (let j = 0; j < w; j++) val += data[i - w + j] * weights[j];
      fitted[i] = val / wSum;
    }
    const forecast = [];
    const extended = [...data];
    for (let i = 0; i < n; i++) {
      let val = 0;
      for (let j = 0; j < w; j++) val += extended[extended.length - w + j] * weights[j];
      const f = val / wSum;
      forecast.push(f);
      extended.push(f);
    }
    return { fitted, forecast };
  }

  // ── Exponential Smoothing ──────────────────────────────────
  function exponentialSmoothing(data, a, n) {
    const fitted = [data[0]];
    for (let i = 1; i < data.length; i++) {
      fitted.push(a * data[i - 1] + (1 - a) * fitted[i - 1]);
    }
    const forecast = [];
    let last = a * data[data.length - 1] + (1 - a) * fitted[fitted.length - 1];
    for (let i = 0; i < n; i++) {
      forecast.push(last);
      // SES gives flat forecast — keep last value
    }
    return { fitted, forecast };
  }

  // ── Linear Regression ──────────────────────────────────────
  function linearRegression(data, n) {
    const len = data.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < len; i++) {
      sumX  += i;
      sumY  += data[i];
      sumXY += i * data[i];
      sumXX += i * i;
    }
    const slope = (len * sumXY - sumX * sumY) / (len * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / len;

    const fitted = data.map((_, i) => intercept + slope * i);
    const forecast = [];
    for (let i = 0; i < n; i++) {
      forecast.push(intercept + slope * (len + i));
    }
    return { fitted, forecast };
  }

  // ── Holt's Linear Trend ────────────────────────────────────
  function holtsLinearTrend(data, a, b, n) {
    let level = data[0];
    let trend = data[1] - data[0];
    const fitted = [level];

    for (let i = 1; i < data.length; i++) {
      const newLevel = a * data[i] + (1 - a) * (level + trend);
      const newTrend = b * (newLevel - level) + (1 - b) * trend;
      level = newLevel;
      trend = newTrend;
      fitted.push(level + trend);
    }

    const forecast = [];
    for (let i = 1; i <= n; i++) {
      forecast.push(level + i * trend);
    }
    return { fitted, forecast };
  }

  // ── Metrics ────────────────────────────────────────────────
  function computeMetrics(actual, fitted) {
    let sumAE = 0, sumSE = 0, sumAPE = 0, count = 0;
    let ssRes = 0, ssTot = 0;
    const mean = actual.reduce((a, b) => a + b, 0) / actual.length;

    for (let i = 0; i < actual.length; i++) {
      if (fitted[i] == null) continue;
      const err = actual[i] - fitted[i];
      sumAE  += Math.abs(err);
      sumSE  += err * err;
      sumAPE += Math.abs(err / actual[i]) * 100;
      ssRes  += err * err;
      ssTot  += (actual[i] - mean) ** 2;
      count++;
    }
    return {
      mae:  count ? sumAE / count : 0,
      rmse: count ? Math.sqrt(sumSE / count) : 0,
      mape: count ? sumAPE / count : 0,
      r2:   ssTot ? 1 - ssRes / ssTot : 0,
      n:    count
    };
  }

  function standardDeviation(arr) {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
  }

  // ── Dashboard Update ───────────────────────────────────────
  function updateDashboard() {
    updateKPIs();
    renderForecastChart();
    renderResidualsChart();
    renderMonthlyChart();
    updateStats();
    updateForecastTable();
  }

  function updateKPIs() {
    const sales = rawData.map(d => d.sales);
    const total = sales.reduce((a, b) => a + b, 0);
    const avg   = total / sales.length;
    const half  = Math.floor(sales.length / 2);
    const firstHalf = sales.slice(0, half);
    const secondHalf = sales.slice(half);
    const avgFirst  = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const growth = ((avgSecond - avgFirst) / avgFirst * 100);

    const { mape } = forecastResult.metrics;
    const accuracy = Math.max(0, 100 - mape);

    $('#kpiRevenue').textContent = formatCurrency(total);
    $('#kpiRevenueChange').textContent = `${sales.length} periods`;
    $('#kpiRevenueChange').className = 'kpi-change positive';

    $('#kpiAvgSales').textContent = formatCurrency(avg);
    const pctChange = ((sales[sales.length - 1] - avg) / avg * 100).toFixed(1);
    $('#kpiAvgChange').textContent = `${pctChange > 0 ? '+' : ''}${pctChange}% vs avg`;
    $('#kpiAvgChange').className = `kpi-change ${pctChange >= 0 ? 'positive' : 'negative'}`;

    $('#kpiGrowth').textContent = `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`;
    $('#kpiGrowthChange').textContent = 'period-over-period';
    $('#kpiGrowthChange').className = `kpi-change ${growth >= 0 ? 'positive' : 'negative'}`;

    $('#kpiAccuracy').textContent = `${accuracy.toFixed(1)}%`;
    $('#kpiAccuracyChange').textContent = `MAPE: ${mape.toFixed(2)}%`;
    $('#kpiAccuracyChange').className = `kpi-change ${accuracy >= 90 ? 'positive' : accuracy >= 75 ? '' : 'negative'}`;
  }

  // ── Forecast Chart ─────────────────────────────────────────
  function renderForecastChart() {
    const ctx = $('#forecastChart');
    if (forecastChart) forecastChart.destroy();

    const labels = rawData.map(d => formatDate(d.date));
    const sales  = rawData.map(d => d.sales);
    const fitted = forecastResult.fitted;

    // Generate future labels
    const lastDate = new Date(rawData[rawData.length - 1].date);
    const futureLabels = [];
    for (let i = 1; i <= forecastResult.n; i++) {
      const d = new Date(lastDate);
      d.setMonth(d.getMonth() + i);
      futureLabels.push(formatDate(d));
    }
    const allLabels = [...labels, ...futureLabels];

    // Datasets
    const datasets = [
      {
        label: 'Actual Sales',
        data: [...sales, ...new Array(forecastResult.n).fill(null)],
        borderColor: '#4f8cff',
        backgroundColor: 'rgba(79, 140, 255, 0.08)',
        borderWidth: 2.5,
        pointRadius: 3,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.3,
        order: 2
      },
      {
        label: 'Fitted',
        data: [...fitted, ...new Array(forecastResult.n).fill(null)],
        borderColor: '#a78bfa',
        borderWidth: 1.5,
        borderDash: [4, 3],
        pointRadius: 0,
        fill: false,
        tension: 0.3,
        order: 3
      },
      {
        label: 'Forecast',
        data: [
          ...new Array(sales.length - 1).fill(null),
          sales[sales.length - 1],
          ...forecastResult.forecast
        ],
        borderColor: '#34d399',
        backgroundColor: 'rgba(52, 211, 153, 0.08)',
        borderWidth: 2.5,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointStyle: 'triangle',
        fill: false,
        tension: 0.3,
        order: 1
      }
    ];

    // Confidence band
    if (showConfidence.checked) {
      const upperData = [
        ...new Array(sales.length).fill(null),
        ...forecastResult.confidence.map(c => c.upper)
      ];
      const lowerData = [
        ...new Array(sales.length).fill(null),
        ...forecastResult.confidence.map(c => c.lower)
      ];
      datasets.push({
        label: 'Upper 95% CI',
        data: upperData,
        borderColor: 'rgba(52, 211, 153, 0.3)',
        backgroundColor: 'rgba(52, 211, 153, 0.08)',
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: '+1',
        tension: 0.3,
        order: 4
      });
      datasets.push({
        label: 'Lower 95% CI',
        data: lowerData,
        borderColor: 'rgba(52, 211, 153, 0.3)',
        borderWidth: 1,
        borderDash: [3, 3],
        pointRadius: 0,
        fill: false,
        tension: 0.3,
        order: 5
      });
    }

    // Trend line
    if (showTrend.checked) {
      const { fitted: trendFitted, forecast: trendForecast } = linearRegression(sales, forecastResult.n);
      datasets.push({
        label: 'Trend',
        data: [...trendFitted, ...trendForecast],
        borderColor: 'rgba(251, 146, 60, 0.5)',
        borderWidth: 1.5,
        borderDash: [8, 4],
        pointRadius: 0,
        fill: false,
        tension: 0,
        order: 6
      });
    }

    forecastChart = new Chart(ctx, {
      type: 'line',
      data: { labels: allLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1c1e2e',
            borderColor: '#2a2d42',
            borderWidth: 1,
            titleColor: '#e8eaf0',
            bodyColor: '#8b8fa7',
            padding: 12,
            callbacks: {
              label: (ctx) => {
                if (ctx.raw == null) return null;
                return `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`;
              }
            }
          },
          annotation: {
            annotations: {
              forecastLine: {
                type: 'line',
                xMin: labels.length - 0.5,
                xMax: labels.length - 0.5,
                borderColor: 'rgba(139, 143, 167, 0.3)',
                borderWidth: 1,
                borderDash: [6, 3],
                label: {
                  display: true,
                  content: 'Forecast →',
                  position: 'start',
                  backgroundColor: 'transparent',
                  color: '#5c607a',
                  font: { size: 11 }
                }
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: showGrid.checked, color: 'rgba(42, 45, 66, 0.5)' },
            ticks: { color: '#5c607a', font: { size: 11 }, maxRotation: 45 }
          },
          y: {
            grid: { display: showGrid.checked, color: 'rgba(42, 45, 66, 0.5)' },
            ticks: {
              color: '#5c607a',
              font: { size: 11 },
              callback: (v) => formatCompact(v)
            }
          }
        }
      }
    });

    // Custom legend
    const legendHtml = datasets
      .filter(ds => !ds.label.includes('CI'))
      .map(ds => {
        const style = ds.borderDash ? 'dashed' : 'solid';
        return `<span class="legend-item"><span class="legend-color" style="background:${ds.borderColor};border-style:${style}"></span>${ds.label}</span>`;
      })
      .join('');
    $('#chartLegend').innerHTML = legendHtml;
  }

  // ── Residuals Chart ────────────────────────────────────────
  function renderResidualsChart() {
    const ctx = $('#residualsChart');
    if (residualsChart) residualsChart.destroy();

    const labels = rawData.map(d => formatDate(d.date));
    const data   = forecastResult.residuals.map(r => r != null ? r : 0);
    const colors = data.map(v => v >= 0 ? 'rgba(52, 211, 153, 0.7)' : 'rgba(248, 113, 113, 0.7)');

    residualsChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Residual',
          data,
          backgroundColor: colors,
          borderRadius: 3,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1c1e2e',
            borderColor: '#2a2d42',
            borderWidth: 1,
            callbacks: {
              label: (ctx) => `Residual: ${formatCurrency(ctx.raw)}`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#5c607a', font: { size: 10 }, maxRotation: 45 } },
          y: {
            grid: { color: 'rgba(42, 45, 66, 0.5)' },
            ticks: { color: '#5c607a', callback: (v) => formatCompact(v) }
          }
        }
      }
    });
  }

  // ── Monthly Breakdown Chart ────────────────────────────────
  function renderMonthlyChart() {
    const ctx = $('#monthlyChart');
    if (monthlyChart) monthlyChart.destroy();

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthData  = new Array(12).fill(0);
    const monthCount = new Array(12).fill(0);

    rawData.forEach(d => {
      const m = d.date.getMonth();
      monthData[m] += d.sales;
      monthCount[m]++;
    });

    const avgByMonth = monthData.map((sum, i) => monthCount[i] ? sum / monthCount[i] : 0);
    const overallAvg = avgByMonth.reduce((a, b) => a + b, 0) / 12;
    const colors = avgByMonth.map(v => v >= overallAvg ? 'rgba(79, 140, 255, 0.7)' : 'rgba(79, 140, 255, 0.35)');

    monthlyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthNames,
        datasets: [{
          label: 'Avg Sales',
          data: avgByMonth,
          backgroundColor: colors,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1c1e2e',
            borderColor: '#2a2d42',
            borderWidth: 1,
            callbacks: {
              label: (ctx) => `Avg: ${formatCurrency(ctx.raw)}`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#5c607a', font: { size: 11 } } },
          y: {
            grid: { color: 'rgba(42, 45, 66, 0.5)' },
            ticks: { color: '#5c607a', callback: (v) => formatCompact(v) }
          }
        }
      }
    });
  }

  function updateChartVisibility() {
    if (forecastResult) renderForecastChart();
  }

  // ── Stats & Table ──────────────────────────────────────────
  function updateStats() {
    const { mae, rmse, mape, r2, n } = forecastResult.metrics;
    $('#statMAE').textContent   = formatCurrency(mae);
    $('#statRMSE').textContent  = formatCurrency(rmse);
    $('#statMAPE').textContent  = mape.toFixed(2) + '%';
    $('#statR2').textContent    = r2.toFixed(4);
    $('#statPoints').textContent = n;
    $('#statHorizon').textContent = forecastResult.n + ' periods';
  }

  function updateForecastTable() {
    const tbody = $('#forecastTableBody');
    const lastDate = new Date(rawData[rawData.length - 1].date);
    tbody.innerHTML = '';

    for (let i = 0; i < forecastResult.n; i++) {
      const d = new Date(lastDate);
      d.setMonth(d.getMonth() + i + 1);
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${formatDate(d)}</td>
        <td>${formatCurrency(forecastResult.forecast[i])}</td>
        <td>${formatCurrency(forecastResult.confidence[i].lower)}</td>
        <td>${formatCurrency(forecastResult.confidence[i].upper)}</td>
      `;
      tbody.appendChild(row);
    }
  }

  // ── Export ─────────────────────────────────────────────────
  function exportReport() {
    if (!forecastResult) return;

    let csv = 'Period,Forecast,Lower_95CI,Upper_95CI\n';
    const lastDate = new Date(rawData[rawData.length - 1].date);
    for (let i = 0; i < forecastResult.n; i++) {
      const d = new Date(lastDate);
      d.setMonth(d.getMonth() + i + 1);
      csv += `${d.toISOString().slice(0, 10)},${forecastResult.forecast[i].toFixed(2)},${forecastResult.confidence[i].lower.toFixed(2)},${forecastResult.confidence[i].upper.toFixed(2)}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `forecast_${modelSelect.value}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Forecast exported as CSV', 'success');
  }

  // ── Formatting ─────────────────────────────────────────────
  function formatCurrency(v) {
    if (v == null || isNaN(v)) return '--';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(v);
  }

  function formatCompact(v) {
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return v.toString();
  }

  function formatDate(d) {
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  }

  // ── Toast ──────────────────────────────────────────────────
  function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('#toastContainer').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
  }

  // ── Add legend styles dynamically ──────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .chart-legend { display: flex; gap: 16px; flex-wrap: wrap; }
    .legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.78rem; color: #8b8fa7; }
    .legend-color { width: 24px; height: 3px; border-radius: 2px; border-width: 0; }
  `;
  document.head.appendChild(style);

  // ── Boot ───────────────────────────────────────────────────
  init();
})();
