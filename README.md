# FoodScan

A static, zero-build food barcode scanner that tells you exactly what's in your food.

## What it does

Point your camera at any packaged food barcode. FoodScan looks it up instantly and gives you:

- Nutritional grade (A–E) with Nutri-Score or calculated fallback
- Full macro and micronutrient breakdown per 100g
- Good / Bad analysis — fibre, protein, sugar, salt, additives, allergens
- Macronutrient donut chart and nutrient vs daily reference bar chart
- Eco-score, NOVA group, ingredients, diet tags
- Downloadable PDF report

## Live Demo

[https://foodscanner.netlify.app](https://foodscanner.netlify.app)

## Tech Stack

- Vanilla HTML / CSS / JavaScript — no framework, no build step
- [BarcodeDetector API](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector) (Chrome/Edge/Android) with [QuaggaJS](https://github.com/serratus/quaggaJS) fallback
- [Open Food Facts API](https://world.openfoodfacts.org) — free, no key required
- Optional enrichment APIs (keys stored in localStorage, never sent to any server):
  - [USDA FoodData Central](https://fdc.nal.usda.gov) — micronutrients, vitamins, minerals
  - [Nutritionix](https://developer.nutritionix.com) — US branded foods fallback
  - [Edamam Food Database](https://developer.edamam.com) — diet tags (keto, vegan, gluten-free…)

## Getting Started

No install needed. Just open `index.html` in a browser.

```bash
git clone https://github.com/gouravraghuwanshi/FoodScanner.git
cd FoodScanner
# open index.html in Chrome or Edge for best scanner support
```

For camera access to work locally, serve over HTTPS or use localhost:

```bash
npx serve .
```

## Optional API Keys

Open **Settings** in the top-right corner to paste in your API keys. They are saved to `localStorage` in your browser only — never transmitted anywhere.

| API | What it adds | Free tier |
|-----|-------------|-----------|
| USDA FoodData Central | Vitamins, minerals, % daily value | Yes — [get key](https://fdc.nal.usda.gov/api-guide.html) |
| Nutritionix | US branded food fallback + serving sizes | Yes — [get key](https://developer.nutritionix.com) |
| Edamam Food Database | Diet compatibility tags | Yes — [get key](https://developer.edamam.com) |

## Browser Support

| Browser | Scanner method |
|---------|---------------|
| Chrome 83+ / Edge | BarcodeDetector API (native, fast) |
| Android Chrome | BarcodeDetector API |
| Firefox / Safari | QuaggaJS fallback |

## Project Structure

```
FoodScan/
├── index.html   # markup + overlay + settings modal
├── app.js       # scanner, API calls, grading, charts
└── style.css    # all styles, desktop + mobile responsive
```

## Deployment

Connect the GitHub repo to [Netlify](https://netlify.com) for automatic deploys on every push. No build command needed — publish directory is `/`.

## Data Sources

All nutritional data comes from [Open Food Facts](https://world.openfoodfacts.org), a free and open food products database. Data is crowd-sourced and may vary in completeness by product.

## License

MIT
