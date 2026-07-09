// ── State ──────────────────────────────────────────────────────────────────
let scanning = false;
let lastCode = null;
let _resizeTimer = null;

// ── Settings ───────────────────────────────────────────────────────────────
const KEYS = {
  usda:            'fs_usda_key',
  nutritionixId:   'fs_nix_id',
  nutritionixKey:  'fs_nix_key',
  edamamId:        'fs_edamam_id',
  edamamKey:       'fs_edamam_key',
};

function getKeys() {
  return {
    usda:           localStorage.getItem(KEYS.usda) || '',
    nutritionixId:  localStorage.getItem(KEYS.nutritionixId) || '',
    nutritionixKey: localStorage.getItem(KEYS.nutritionixKey) || '',
    edamamId:       localStorage.getItem(KEYS.edamamId) || '',
    edamamKey:      localStorage.getItem(KEYS.edamamKey) || '',
  };
}

function openSettings() {
  const k = getKeys();
  document.getElementById('usda-key').value        = k.usda;
  document.getElementById('nutritionix-app-id').value = k.nutritionixId;
  document.getElementById('nutritionix-key').value = k.nutritionixKey;
  document.getElementById('edamam-app-id').value   = k.edamamId;
  document.getElementById('edamam-key').value      = k.edamamKey;
  updateStatusDots(k);
  document.getElementById('settings-backdrop').classList.remove('hidden');
  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-backdrop').classList.add('hidden');
  document.getElementById('settings-modal').classList.add('hidden');
}

function saveSettings() {
  const k = {
    usda:           document.getElementById('usda-key').value.trim(),
    nutritionixId:  document.getElementById('nutritionix-app-id').value.trim(),
    nutritionixKey: document.getElementById('nutritionix-key').value.trim(),
    edamamId:       document.getElementById('edamam-app-id').value.trim(),
    edamamKey:      document.getElementById('edamam-key').value.trim(),
  };
  localStorage.setItem(KEYS.usda,           k.usda);
  localStorage.setItem(KEYS.nutritionixId,  k.nutritionixId);
  localStorage.setItem(KEYS.nutritionixKey, k.nutritionixKey);
  localStorage.setItem(KEYS.edamamId,       k.edamamId);
  localStorage.setItem(KEYS.edamamKey,      k.edamamKey);
  updateStatusDots(k);
  closeSettings();
}

function clearSettings() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  ['usda-key','nutritionix-app-id','nutritionix-key','edamam-app-id','edamam-key']
    .forEach(id => document.getElementById(id).value = '');
  updateStatusDots(getKeys());
}

function updateStatusDots(k) {
  setDot('usda-status',        !!k.usda);
  setDot('nutritionix-status', !!(k.nutritionixId && k.nutritionixKey));
  setDot('edamam-status',      !!(k.edamamId && k.edamamKey));
}

function setDot(id, active) {
  const el = document.getElementById(id);
  el.textContent = active ? '● Active' : '○ Not set';
  el.className   = 'api-status ' + (active ? 'active' : 'inactive');
}

// ── Scanner ────────────────────────────────────────────────────────────────
let _nativeStream = null;
let _nativeRaf    = null;
let _codeHits     = {};
const CONFIRM_HITS = 3; // same code must appear N frames in a row

function startScanner() {
  if (scanning) return;
  scanning = true;
  lastCode = null;
  _codeHits = {};
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled  = false;
  document.getElementById('scanner-hint').textContent = 'Align barcode inside the box';

  if (typeof BarcodeDetector !== 'undefined') {
    _startNativeScanner();
  } else {
    _startQuaggaScanner();
  }
}

// ── Native BarcodeDetector (Chrome 83+, Edge, Android Chrome) ──────────────
async function _startNativeScanner() {
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.setAttribute('autoplay', '');
  video.muted = true;
  video.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';

  const viewport = document.getElementById('interactive');
  viewport.innerHTML = '';
  viewport.appendChild(video);

  try {
    _nativeStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = _nativeStream;
    await video.play();
  } catch (err) {
    showError('Camera error: ' + err.message);
    stopScanner();
    return;
  }

  const detector = new BarcodeDetector({
    formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code']
  });

  const tick = async () => {
    if (!scanning) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      try {
        const codes = await detector.detect(video);
        if (codes.length > 0) {
          const code = codes[0].rawValue;
          _codeHits[code] = (_codeHits[code] || 0) + 1;
          if (_codeHits[code] >= CONFIRM_HITS && code !== lastCode) {
            lastCode = code;
            stopScanner();
            const box = document.getElementById('scanner-box');
            box.classList.add('scan-success');
            setTimeout(() => box.classList.remove('scan-success'), 700);
            lookupBarcode(code);
            return;
          }
        }
      } catch (_) {}
    }
    _nativeRaf = requestAnimationFrame(tick);
  };
  _nativeRaf = requestAnimationFrame(tick);
}

// ── QuaggaJS fallback ──────────────────────────────────────────────────────
function _startQuaggaScanner() {
  Quagga.init({
    inputStream: {
      type: 'LiveStream',
      target: document.getElementById('interactive'),
      constraints: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    },
    decoder: {
      readers: ['ean_reader','ean_8_reader','upc_reader','upc_e_reader','code_128_reader'],
      multiple: false
    },
    locate: true,
    frequency: 10
  }, err => {
    if (err) { showError('Camera error: ' + err.message); stopScanner(); return; }
    Quagga.start();
    Quagga.onDetected(_onQuaggaDetected);
  });
}

function _onQuaggaDetected(result) {
  const code = result.codeResult.code;
  const err  = result.codeResult.decodedCodes
    .filter(c => c.error !== undefined)
    .reduce((s, c) => s + c.error, 0);
  // Reject low-confidence reads
  if (err > 0.25) return;
  _codeHits[code] = (_codeHits[code] || 0) + 1;
  if (_codeHits[code] >= CONFIRM_HITS && code !== lastCode) {
    lastCode = code;
    stopScanner();
    const box = document.getElementById('scanner-box');
    box.classList.add('scan-success');
    setTimeout(() => box.classList.remove('scan-success'), 700);
    lookupBarcode(code);
  }
}

function stopScanner() {
  if (!scanning) return;
  scanning = false;

  // Stop native
  if (_nativeRaf) { cancelAnimationFrame(_nativeRaf); _nativeRaf = null; }
  if (_nativeStream) { _nativeStream.getTracks().forEach(t => t.stop()); _nativeStream = null; }

  // Stop Quagga if it was used
  try { Quagga.offDetected(_onQuaggaDetected); Quagga.stop(); } catch (_) {}

  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled  = true;
}

function manualLookup() {
  const code = document.getElementById('manualBarcode').value.trim();
  if (!code) { document.getElementById('manualBarcode').focus(); return; }
  stopScanner();
  lookupBarcode(code);
}

// ── Core Lookup ────────────────────────────────────────────────────────────
async function lookupBarcode(code) {
  showLoading(true);
  hideError();

  try {
    // Always fetch Open Food Facts first
    const offRes  = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`);
    const offData = await offRes.json();
    if (offData.status !== 1) throw new Error('Product not found in database.');

    const product = offData.product;
    const keys    = getKeys();

    // Fire extra APIs in parallel — failures are silently ignored
    const [usdaData, nixData, edamamData] = await Promise.allSettled([
      keys.usda                              ? fetchUSDA(product, keys.usda)                              : Promise.resolve(null),
      keys.nutritionixId && keys.nutritionixKey ? fetchNutritionix(code, keys.nutritionixId, keys.nutritionixKey) : Promise.resolve(null),
      keys.edamamId && keys.edamamKey        ? fetchEdamam(code, product, keys.edamamId, keys.edamamKey) : Promise.resolve(null),
    ]);

    showResult(
      product,
      code,
      usdaData.value    || null,
      nixData.value     || null,
      edamamData.value  || null
    );
  } catch (e) {
    showError(e.message || 'Could not fetch product data.');
  } finally {
    showLoading(false);
  }
}

// ── USDA FoodData Central ──────────────────────────────────────────────────
async function fetchUSDA(product, apiKey) {
  const query = product.product_name || product.brands || '';
  if (!query) return null;
  const res = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&dataType=Branded&pageSize=1&api_key=${apiKey}`
  );
  const data = await res.json();
  return data.foods?.[0]?.foodNutrients || null;
}

// ── Nutritionix ────────────────────────────────────────────────────────────
async function fetchNutritionix(barcode, appId, appKey) {
  const res = await fetch(
    `https://trackapi.nutritionix.com/v2/search/item?upc=${barcode}`,
    { headers: { 'x-app-id': appId, 'x-app-key': appKey } }
  );
  const data = await res.json();
  return data.foods?.[0] || null;
}

// ── Edamam ─────────────────────────────────────────────────────────────────
async function fetchEdamam(barcode, product, appId, appKey) {
  // Try UPC first, fall back to name search
  let url = `https://api.edamam.com/api/food-database/v2/parser?upc=${barcode}&app_id=${appId}&app_key=${appKey}`;
  let res  = await fetch(url);
  let data = await res.json();

  if (!data.hints?.length && product.product_name) {
    url  = `https://api.edamam.com/api/food-database/v2/parser?ingr=${encodeURIComponent(product.product_name)}&app_id=${appId}&app_key=${appKey}`;
    res  = await fetch(url);
    data = await res.json();
  }

  return data.hints?.[0]?.food?.healthLabels || null;
}

// ── Rating & Breakdown Engine ─────────────────────────────────────────────
// Each check returns { label, type: 'good'|'bad'|null }
function analyseNutrients(product) {
  const n   = product.nutriments || {};
  const per = v => (v !== undefined && v !== null) ? parseFloat(v) : null;

  const checks = [
    // ── Bad things (high = bad) ──
    { val: per(n['saturated-fat_100g']), label: 'High saturated fat',  bad: 5,   good: 1.5,  invert: false },
    { val: per(n['sugars_100g']),        label: 'High sugar',           bad: 22.5, good: 5,   invert: false },
    { val: per(n['salt_100g']),          label: 'High salt',            bad: 1.5,  good: 0.3, invert: false },
    { val: per(n['fat_100g']),           label: 'High total fat',       bad: 17.5, good: 5,   invert: false },
    { val: per(n['energy-kcal_100g']),   label: 'High calories',        bad: 400,  good: 200, invert: false },
    // ── Good things (high = good) ──
    { val: per(n['fiber_100g']),         label: 'Good source of fibre', bad: 1.5,  good: 3,   invert: true  },
    { val: per(n['proteins_100g']),      label: 'Good source of protein', bad: 2,  good: 5,   invert: true  },
    // ── Additives / NOVA ──
    { val: per(product.nova_group),      label: 'Ultra-processed (NOVA 4)', bad: 4, good: 2,  invert: false, integer: true },
  ];

  const good = [], bad = [], neutral = [];

  checks.forEach(({ val, label, bad: badThresh, good: goodThresh, invert, integer }) => {
    if (val === null) return;
    if (!invert) {
      if (val >= badThresh)  bad.push(label);
      else if (val <= goodThresh) good.push(label.replace('High ', 'Low '));
      else neutral.push(label);
    } else {
      if (val >= goodThresh) good.push(label);
      else if (val <= badThresh) bad.push(label.replace('Good source of', 'Low'));
      else neutral.push(label);
    }
  });

  // Additives from OFF
  const additives = product.additives_tags || [];
  if (additives.length > 3)  bad.push(`${additives.length} additives detected`);
  else if (additives.length === 0) good.push('No additives');

  // Allergens
  const allergens = product.allergens_tags || [];
  if (allergens.length) bad.push(`Contains allergens: ${allergens.map(a => a.replace('en:','')).join(', ')}`);

  // Organic / labels
  const labels = (product.labels_tags || []).join(' ');
  if (labels.includes('organic')) good.push('Certified organic');
  if (labels.includes('fair-trade')) good.push('Fair trade certified');

  // Overall verdict
  let verdict, icon, cls;
  if (bad.length === 0 && good.length >= 2) {
    verdict = 'Good for you'; icon = '😊'; cls = 'verdict-good';
  } else if (bad.length >= 3 || (bad.length >= 2 && good.length === 0)) {
    verdict = 'Not great';    icon = '😟'; cls = 'verdict-bad';
  } else {
    verdict = 'Neutral';      icon = '😐'; cls = 'verdict-neutral';
  }

  const sub = bad.length === 0
    ? 'No major nutritional concerns found.'
    : `${bad.length} concern${bad.length > 1 ? 's' : ''}, ${good.length} positive${good.length !== 1 ? 's' : ''}.`;

  return { verdict, icon, cls, sub, good, bad };
}

function calcGrade(product) {
  const ns = (product.nutriscore_grade || '').toUpperCase();
  if (['A','B','C','D','E'].includes(ns)) return { grade: ns, source: 'Nutri-Score' };

  const n   = product.nutriments || {};
  const per = v => parseFloat(v) || 0;

  let penalty = 0;
  penalty += Math.min(per(n['energy-kcal_100g'])    / 900, 1) * 30;
  penalty += Math.min(per(n['saturated-fat_100g'])  / 10,  1) * 25;
  penalty += Math.min(per(n['sugars_100g'])          / 45,  1) * 25;
  penalty += Math.min((per(n['sodium_100g']) * 1000) / 600, 1) * 20;
  const bonus = Math.min(per(n['fiber_100g'])   / 6, 1) * 10
              + Math.min(per(n['proteins_100g']) / 8, 1) * 10;
  const score = Math.max(0, Math.round(penalty - bonus));
  const grade = score <= 15 ? 'A' : score <= 30 ? 'B' : score <= 50 ? 'C' : score <= 70 ? 'D' : 'E';
  return { grade, source: 'Calculated' };
}

// ── Display Result ─────────────────────────────────────────────────────────
let _currentProduct = null, _currentCode = null;

function showResult(product, code, usdaNutrients, nixFood, edamamLabels) {
  _currentProduct = product;
  _currentCode    = code;

  // Header
  const img = document.getElementById('ro-img');
  img.src = product.image_front_small_url || product.image_url || '';
  img.onerror = () => { img.src = ''; };
  document.getElementById('ro-name').textContent    = product.product_name || product.product_name_en || 'Unknown Product';
  document.getElementById('ro-brand').textContent   = product.brands || '—';
  document.getElementById('ro-barcode').textContent = code;

  // Verdict
  const analysis = analyseNutrients(product);
  const vb = document.getElementById('ro-verdict-block');
  vb.className = 'verdict-block ' + analysis.cls;
  document.getElementById('ro-verdict-label').textContent = analysis.verdict;
  document.getElementById('ro-verdict-sub').textContent   = analysis.sub;

  // Grade
  const { grade } = calcGrade(product);
  const gb = document.getElementById('ro-grade');
  gb.textContent = grade;
  gb.className   = 'grade-' + grade;

  // Good / Bad lists
  document.getElementById('ro-good-list').innerHTML = analysis.good.length
    ? analysis.good.map(t => `<li>${t}</li>`).join('')
    : '<li class="none">Nothing notable</li>';
  document.getElementById('ro-bad-list').innerHTML = analysis.bad.length
    ? analysis.bad.map(t => `<li>${t}</li>`).join('')
    : '<li class="none">No concerns found</li>';

  // Nutrients tab
  buildMacros(product.nutriments || {}, nixFood);
  buildMicros(usdaNutrients);
  buildDietTags(edamamLabels);

  // Overview tab
  buildOverviewStats(product.nutriments || {});
  buildDetailsGrid(product);

  openResultOverlay(product.nutriments || {});
}

// ── Macros (Open Food Facts + Nutritionix fallback) ────────────────────────
function buildMacros(n, nixFood) {
  const fields = [
    { key: 'energy-kcal_100g',   label: 'Energy',   unit: 'kcal', thresholds: [200, 400] },
    { key: 'fat_100g',           label: 'Fat',       unit: 'g',    thresholds: [5, 17.5] },
    { key: 'saturated-fat_100g', label: 'Sat. Fat',  unit: 'g',    thresholds: [1.5, 5] },
    { key: 'sugars_100g',        label: 'Sugars',    unit: 'g',    thresholds: [5, 22.5] },
    { key: 'salt_100g',          label: 'Salt',      unit: 'g',    thresholds: [0.3, 1.5] },
    { key: 'fiber_100g',         label: 'Fiber',     unit: 'g',    thresholds: [3, 6],   invert: true },
    { key: 'proteins_100g',      label: 'Protein',   unit: 'g',    thresholds: [5, 10],  invert: true },
    { key: 'carbohydrates_100g', label: 'Carbs',     unit: 'g',    thresholds: [20, 40] },
  ];

  const nixMap = nixFood ? {
    'energy-kcal_100g':   nixFood.nf_calories,
    'fat_100g':           nixFood.nf_total_fat,
    'saturated-fat_100g': nixFood.nf_saturated_fat,
    'sugars_100g':        nixFood.nf_sugars,
    'proteins_100g':      nixFood.nf_protein,
    'carbohydrates_100g': nixFood.nf_total_carbohydrate,
    'fiber_100g':         nixFood.nf_dietary_fiber,
  } : {};

  const grid = document.getElementById('ro-nutrients-grid');
  grid.innerHTML = '';

  fields.forEach(({ key, label, unit, thresholds, invert }) => {
    let raw = n[key];
    let fromNix = false;
    if ((raw === undefined || raw === null) && nixMap[key] !== undefined) {
      raw = nixMap[key];
      fromNix = true;
    }
    if (raw === undefined || raw === null) return;

    const val = parseFloat(raw);
    let cls = 'good';
    if (!invert) {
      if (val > thresholds[1]) cls = 'bad';
      else if (val > thresholds[0]) cls = 'ok';
    } else {
      if (val < thresholds[0]) cls = 'bad';
      else if (val < thresholds[1]) cls = 'ok';
    }

    const cell = document.createElement('div');
    cell.className = `nutrient-cell ${cls}`;
    cell.innerHTML = `<div class="n-label">${label}${fromNix ? ' <sup>nix</sup>' : ''}</div><div class="n-value">${val.toFixed(1)}<small>${unit}</small></div>`;
    grid.appendChild(cell);
  });

  if (!grid.children.length)
    grid.innerHTML = '<p style="padding:1rem;font-weight:700;font-family:Arial,sans-serif;font-size:0.85rem;">No nutrient data available.</p>';
}

// ── Micronutrients (USDA) ──────────────────────────────────────────────────
function buildMicros(nutrients) {
  const section = document.getElementById('ro-micro-section');
  if (!nutrients?.length) { section.classList.add('hidden'); return; }

  const want = ['Vitamin C','Vitamin D','Vitamin A','Vitamin B-12',
                'Calcium, Ca','Iron, Fe','Potassium, K','Zinc, Zn',
                'Magnesium, Mg','Sodium, Na','Phosphorus, P'];

  const grid = document.getElementById('ro-micro-grid');
  grid.innerHTML = '';

  nutrients
    .filter(n => want.some(w => n.nutrientName?.includes(w.split(',')[0])))
    .slice(0, 12)
    .forEach(n => {
      const cell = document.createElement('div');
      cell.className = 'nutrient-cell';
      cell.innerHTML = `<div class="n-label">${n.nutrientName.replace(/, \w+$/, '')}</div>
                        <div class="n-value">${parseFloat(n.value || 0).toFixed(1)}<small>${n.unitName?.toLowerCase() || ''}</small></div>`;
      grid.appendChild(cell);
    });

  if (grid.children.length) section.classList.remove('hidden');
  else section.classList.add('hidden');
}

// ── Diet Tags (Edamam) ─────────────────────────────────────────────────────
const DIET_FRIENDLY = new Set([
  'VEGAN','VEGETARIAN','PESCATARIAN','PALEO','RED_MEAT_FREE',
  'PORK_FREE','TREE_NUT_FREE','PEANUT_FREE','SOY_FREE','WHEAT_FREE',
  'GLUTEN_FREE','DAIRY_FREE','EGG_FREE','KOSHER','KETO_FRIENDLY',
  'LOW_SUGAR','LOW_FAT_ABS','LOW_SODIUM'
]);

function buildDietTags(labels) {
  const section = document.getElementById('ro-diet-section');
  if (!labels?.length) { section.classList.add('hidden'); return; }

  const container = document.getElementById('ro-diet-tags');
  container.innerHTML = '';

  labels
    .filter(l => DIET_FRIENDLY.has(l))
    .forEach(l => {
      const tag = document.createElement('span');
      tag.className = 'diet-tag';
      tag.textContent = l.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
      container.appendChild(tag);
    });

  if (container.children.length) section.classList.remove('hidden');
  else section.classList.add('hidden');
}

// ── Overview Stats ─────────────────────────────────────────────────────────
function buildOverviewStats(n) {
  const stats = [
    { label: 'Calories', key: 'energy-kcal_100g', unit: 'kcal', ref: 2000, color: '#b06030' },
    { label: 'Protein',  key: 'proteins_100g',    unit: 'g',    ref: 50,   color: '#3d6b4f' },
    { label: 'Fat',      key: 'fat_100g',          unit: 'g',    ref: 70,   color: '#8f3030' },
    { label: 'Sugar',    key: 'sugars_100g',       unit: 'g',    ref: 90,   color: '#a08c3a' },
  ];
  const container = document.getElementById('overview-stats');
  container.innerHTML = '';
  stats.forEach(({ label, key, unit, ref, color }) => {
    const val = parseFloat(n[key]) || 0;
    const pct = Math.min(val / ref * 100, 100).toFixed(0);
    const box = document.createElement('div');
    box.className = 'stat-box';
    box.innerHTML = `
      <div class="stat-label">${label}</div>
      <div class="stat-value">${val % 1 === 0 ? val : val.toFixed(1)}</div>
      <div class="stat-unit">${unit} per 100g &nbsp;·&nbsp; ${pct}% daily ref</div>
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%;background:${color}"></div></div>`;
    container.appendChild(box);
  });
}

// ── Details Grid ───────────────────────────────────────────────────────────
function buildDetailsGrid(product) {
  const grid = document.getElementById('ro-details-grid');
  grid.innerHTML = '';

  const novaLabels = { 1: 'Unprocessed', 2: 'Processed culinary', 3: 'Processed', 4: 'Ultra-processed' };
  const ecoLabels  = { a: 'A — Very low', b: 'B — Low', c: 'C — Moderate', d: 'D — High', e: 'E — Very high' };

  const items = [
    { title: 'Ingredients',        body: product.ingredients_text || '—' },
    { title: 'Additives',          body: (product.additives_tags || []).map(a => a.replace('en:','').toUpperCase()).join(', ') || 'None detected' },
    { title: 'Allergens',          body: (product.allergens_tags || []).map(a => a.replace('en:','')).join(', ') || 'None listed' },
    { title: 'NOVA Group',         body: product.nova_group ? `${product.nova_group} — ${novaLabels[product.nova_group] || ''}` : '—' },
    { title: 'Eco-Score',          body: product.ecoscore_grade ? ecoLabels[product.ecoscore_grade.toLowerCase()] || product.ecoscore_grade.toUpperCase() : '—' },
    { title: 'Labels',             body: (product.labels_tags || []).map(l => l.replace('en:','').replace(/-/g,' ')).join(', ') || '—' },
    { title: 'Country of Origin',  body: (product.countries_tags || []).map(c => c.replace('en:','')).join(', ') || '—' },
    { title: 'Serving Size',       body: product.serving_size || '—' },
  ];

  items.forEach(({ title, body }) => {
    const card = document.createElement('div');
    card.className = 'detail-card';
    card.innerHTML = `<div class="detail-card-title">${title}</div><div class="detail-card-body">${body}</div>`;
    grid.appendChild(card);
  });
}

// ── Overlay Controls ───────────────────────────────────────────────────────
function openResultOverlay(n) {
  document.getElementById('result-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  switchTab('overview');
  requestAnimationFrame(() => { drawMacroDonut(n); drawBarsChart(n); });
  showToast('Product found');
}

function closeResult() {
  document.getElementById('result-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  resetScanner();
}

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick') === `switchTab('${name}')`);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('hidden', pane.id !== 'tab-' + name);
    pane.classList.toggle('active', pane.id === 'tab-' + name);
  });
}

// ── Donut Chart ────────────────────────────────────────────────────────────
function drawMacroDonut(n) {
  const canvas = document.getElementById('chart-macro');
  if (!canvas) return;
  const protein = parseFloat(n['proteins_100g'])      || 0;
  const fat     = parseFloat(n['fat_100g'])            || 0;
  const carbs   = parseFloat(n['carbohydrates_100g'])  || 0;
  const total   = protein + fat + carbs;

  const dpr = window.devicePixelRatio || 1;
  canvas.width  = canvas.offsetWidth  * dpr || 200 * dpr;
  canvas.height = canvas.offsetWidth  * dpr || 200 * dpr;
  canvas.style.height = canvas.style.width = (canvas.offsetWidth || 200) + 'px';

  const ctx = canvas.getContext('2d');
  const cx  = canvas.width / 2, cy = canvas.height / 2;
  const r   = Math.min(cx, cy) * 0.78;
  const ir  = r * 0.55;

  const segments = [
    { label: 'Protein', val: protein, color: '#6b7f8f' },
    { label: 'Fat',     val: fat,     color: '#b06030' },
    { label: 'Carbs',   val: carbs,   color: '#a08c3a' },
  ];
  if (total === 0) segments.forEach(s => s.val = 1);

  const sum = segments.reduce((a, s) => a + s.val, 0);
  let angle = -Math.PI / 2;
  segments.forEach(s => {
    const sweep = (s.val / sum) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + sweep);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
    angle += sweep;
  });

  // Donut hole
  ctx.beginPath();
  ctx.arc(cx, cy, ir, 0, 2 * Math.PI);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#faf8f5';
  ctx.fill();

  // Legend
  const legend = document.getElementById('chart-macro-legend');
  legend.innerHTML = segments.map(s =>
    `<span class="legend-item"><span class="legend-dot" style="background:${s.color}"></span>${s.label}: ${total ? ((s.val/sum)*100).toFixed(0) : 0}%</span>`
  ).join('');
}

// ── Bars Chart ─────────────────────────────────────────────────────────────
function drawBarsChart(n) {
  const canvas = document.getElementById('chart-bars');
  if (!canvas) return;

  const bars = [
    { label: 'Energy',  val: parseFloat(n['energy-kcal_100g'])   || 0, ref: 2000, invert: false },
    { label: 'Fat',     val: parseFloat(n['fat_100g'])            || 0, ref: 70,   invert: false },
    { label: 'Sat Fat', val: parseFloat(n['saturated-fat_100g']) || 0, ref: 20,   invert: false },
    { label: 'Sugar',   val: parseFloat(n['sugars_100g'])         || 0, ref: 90,   invert: false },
    { label: 'Salt',    val: parseFloat(n['salt_100g'])           || 0, ref: 6,    invert: false },
    { label: 'Fibre',   val: parseFloat(n['fiber_100g'])          || 0, ref: 25,   invert: true  },
    { label: 'Protein', val: parseFloat(n['proteins_100g'])       || 0, ref: 50,   invert: true  },
  ];

  const dpr      = window.devicePixelRatio || 1;
  const cssW     = canvas.offsetWidth  || 300;
  const rowH     = 28;
  const padL     = 58, padR = 12, padT = 10, padB = 10;
  const cssH     = bars.length * rowH + padT + padB;
  canvas.width   = cssW * dpr;
  canvas.height  = cssH * dpr;
  canvas.style.width  = cssW + 'px';
  canvas.style.height = cssH + 'px';

  const ctx  = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const barW = cssW - padL - padR;

  bars.forEach((b, i) => {
    const y   = padT + i * rowH;
    const pct = Math.min(b.val / b.ref, 1);
    let color;
    if (!b.invert) color = pct < 0.5 ? '#3d6b4f' : pct < 0.8 ? '#a08c3a' : '#8f3030';
    else           color = pct > 0.5 ? '#3d6b4f' : pct > 0.2 ? '#a08c3a' : '#8f3030';

    // Track
    ctx.fillStyle = '#d8d3cc';
    ctx.fillRect(padL, y + 8, barW, 10);
    // Fill
    ctx.fillStyle = color;
    ctx.fillRect(padL, y + 8, barW * pct, 10);
    // Label
    ctx.fillStyle = '#6b6560';
    ctx.font = `${10 * dpr / dpr}px Arial`;
    ctx.textAlign = 'right';
    ctx.fillText(b.label, padL - 4, y + 17);
    // Pct text
    ctx.fillStyle = '#1c1c1c';
    ctx.textAlign = 'left';
    ctx.fillText((pct * 100).toFixed(0) + '%', padL + barW * pct + 3, y + 17);
  });
}

// ── Download Report ────────────────────────────────────────────────────────
function downloadReport() {
  if (!_currentProduct) return;
  const p        = _currentProduct;
  const code     = _currentCode;
  const analysis = analyseNutrients(p);
  const { grade } = calcGrade(p);
  const n        = p.nutriments || {};
  const gradeColors = { A:'#3d6b4f', B:'#6a8f5e', C:'#a08c3a', D:'#b06030', E:'#8f3030' };

  const nutrientRows = [
    ['Energy',   n['energy-kcal_100g'], 'kcal'],
    ['Fat',      n['fat_100g'],         'g'],
    ['Sat. Fat', n['saturated-fat_100g'],'g'],
    ['Carbs',    n['carbohydrates_100g'],'g'],
    ['Sugars',   n['sugars_100g'],      'g'],
    ['Fibre',    n['fiber_100g'],       'g'],
    ['Protein',  n['proteins_100g'],    'g'],
    ['Salt',     n['salt_100g'],        'g'],
  ].filter(r => r[1] != null)
   .map(r => `<tr><td>${r[0]}</td><td><strong>${parseFloat(r[1]).toFixed(1)} ${r[2]}</strong></td></tr>`)
   .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>FoodScan Report — ${p.product_name || code}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 700px; margin: 40px auto; color: #1c1c1c; background: #f2efe9; }
  h1   { font-family: 'Arial Black', Arial, sans-serif; font-size: 1.4rem; text-transform: uppercase; border-bottom: 3px solid #1c1c1c; padding-bottom: 8px; }
  .meta { font-size: 0.8rem; color: #6b6560; margin-bottom: 1.5rem; }
  .grade { display: inline-block; width: 48px; height: 48px; line-height: 48px; text-align: center; font-family: 'Arial Black', Arial, sans-serif; font-size: 1.6rem; font-weight: 900; color: #fff; background: ${gradeColors[grade] || '#999'}; margin-right: 12px; vertical-align: middle; }
  .verdict { font-size: 1rem; font-weight: 700; text-transform: uppercase; vertical-align: middle; }
  h2   { font-family: 'Arial Black', Arial, sans-serif; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 2px; margin: 1.5rem 0 0.5rem; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  td    { padding: 5px 8px; border-bottom: 1px solid #ddd; }
  ul    { font-size: 0.85rem; padding-left: 1.2rem; line-height: 1.8; }
  .good { color: #3d6b4f; } .bad { color: #8f3030; }
  @media print { body { background: #fff; } }
</style></head><body>
<h1>FoodScan Report</h1>
<div class="meta">${p.product_name || 'Unknown'} &nbsp;|&nbsp; ${p.brands || ''} &nbsp;|&nbsp; Barcode: ${code}</div>
<span class="grade">${grade}</span><span class="verdict">${analysis.verdict}</span>
<p style="font-size:0.82rem;color:#6b6560;margin-top:8px">${analysis.sub}</p>
<h2>Nutrients per 100g</h2><table>${nutrientRows}</table>
<h2>Positives</h2><ul class="good">${analysis.good.map(t=>`<li>${t}</li>`).join('') || '<li>Nothing notable</li>'}</ul>
<h2>Concerns</h2><ul class="bad">${analysis.bad.map(t=>`<li>${t}</li>`).join('') || '<li>No concerns found</li>'}</ul>
<h2>Ingredients</h2><p style="font-size:0.82rem;line-height:1.6">${p.ingredients_text || '—'}</p>
<p style="font-size:0.7rem;color:#999;margin-top:2rem">Generated by FoodScan &nbsp;·&nbsp; Data: Open Food Facts</p>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

// ── UI Helpers ─────────────────────────────────────────────────────────────
function showLoading(on) { document.getElementById('loading').classList.toggle('hidden', !on); }
function showError(msg)  { document.getElementById('error-msg').textContent = msg; document.getElementById('error-box').classList.remove('hidden'); }
function hideError()     { document.getElementById('error-box').classList.add('hidden'); }
function show(id)        { document.getElementById(id).classList.remove('hidden'); }
function hide(id)        { document.getElementById(id).classList.add('hidden'); }

let _toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden', 'toast-hide');
  t.classList.add('toast-show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    t.classList.replace('toast-show', 'toast-hide');
    setTimeout(() => t.classList.add('hidden'), 320);
  }, 2200);
}

function resetScanner() {
  hide('result-overlay');
  document.body.style.overflow = '';
  hideError();
  lastCode = null;
  document.getElementById('manualBarcode').value = '';
  show('scanner-section');
}

// Init
updateStatusDots(getKeys());

document.getElementById('manualBarcode').addEventListener('keydown', e => {
  if (e.key === 'Enter') manualLookup();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !document.getElementById('result-overlay').classList.contains('hidden'))
    closeResult();
});

window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    if (_currentProduct && !document.getElementById('result-overlay').classList.contains('hidden')) {
      drawMacroDonut(_currentProduct.nutriments || {});
      drawBarsChart(_currentProduct.nutriments || {});
    }
  }, 200);
});
