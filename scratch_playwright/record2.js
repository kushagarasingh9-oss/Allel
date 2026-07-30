const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  // clear old videos
  fs.readdirSync('videos/').forEach(f => fs.rmSync(path.join('videos/', f)));

  const browser = await chromium.launch();
  const context = await browser.newContext({
    recordVideo: {
      dir: 'videos/'
    }
  });
  const page = await context.newPage();
  
  console.log("Navigating...");
  await page.goto('https://premiumanimatedbutton.framer.website/', { waitUntil: 'networkidle' });
  
  console.log("Looking for Button 2...");
  const button = page.locator('text="Book a Discovery Call"').nth(1);
  
  console.log("Scrolling into view...");
  await button.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1000);
  
  console.log("Hovering...");
  await button.hover({ force: true });
  
  console.log("Recording hover animation...");
  await page.waitForTimeout(3500); // Wait 3.5s to capture the animation
  
  console.log("Closing...");
  await context.close();
  await browser.close();
  console.log("Done!");
})();
