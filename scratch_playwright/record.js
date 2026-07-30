const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    recordVideo: {
      dir: 'videos/'
    }
  });
  const page = await context.newPage();
  
  console.log("Navigating...");
  await page.goto('https://premiumanimatedbutton.framer.website/', { waitUntil: 'networkidle' });
  
  console.log("Looking for button...");
  // Wait for the button to appear
  const button = page.locator('div[data-framer-name="Start"]').first();
  await button.waitFor();
  
  console.log("Waiting before hover...");
  await page.waitForTimeout(1000);
  
  console.log("Hovering...");
  await button.hover({ force: true });
  
  console.log("Waiting to record hover animation...");
  await page.waitForTimeout(3000); // 3 seconds hover
  
  console.log("Closing...");
  await context.close();
  await browser.close();
  console.log("Done!");
})();
