const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  
  await page.goto('http://localhost:3000/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  
  const results = [];
  
  for (const scrollY of [0, 800, 1600, 2400]) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(400);
    
    const data = await page.evaluate(() => {
      const el = document.querySelector('.fixed.top-1\\/2');
      return {
        scrollY: window.scrollY,
        transform: el ? el.style.transform : 'none'
      };
    });
    results.push(data);
  }
  
  fs.writeFileSync('rolling_results.json', JSON.stringify(results, null, 2));
  console.log('Results written to rolling_results.json:');
  console.log(JSON.stringify(results, null, 2));
  
  await page.screenshot({ path: '/Users/junedelmar/.gemini/antigravity-cli/brain/354dee3a-28d9-4c0c-94ad-1b5c7391b2a9/rolling_verified.png' });
  await browser.close();
})();
