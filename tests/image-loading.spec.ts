import { test, expect } from '@playwright/test';

test.describe('Image Loading Visual Tests', () => {
  test('Photos page loads images with proper transitions', async ({ page }) => {
    // Go to photos page
    await page.goto('/photos/');
    
    // Take screenshot immediately (should show placeholders)
    await page.screenshot({ path: 'tests/screenshots/photos-initial.png', fullPage: true });
    
    // Wait for the first batch of images to load
    await page.waitForTimeout(1000);
    
    // Take screenshot after initial load
    await page.screenshot({ path: 'tests/screenshots/photos-loaded.png', fullPage: true });
    
    // Get the number of loaded images
    const loadedImageCount = await page.locator('picture img.is-loaded').count();
    
    // Scroll down to trigger more lazy loading
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    
    // Wait for more images to load
    await page.waitForTimeout(2000);
    
    // Take screenshot after scrolling
    await page.screenshot({ path: 'tests/screenshots/photos-after-scroll.png', fullPage: true });
    
    // Verify more images have loaded after scrolling
    const newLoadedImageCount = await page.locator('picture img.is-loaded').count();
    expect(newLoadedImageCount).toBeGreaterThan(loadedImageCount);
  });

  test('Image placeholders show while full images load', async ({ page }) => {
    // Go to an article with images
    await page.goto('/articles/2020-04-23-sustainable-work/');
    
    // Force slow network to better test lazy loading
    await page.route('**/*.{png,jpg,jpeg}', async route => {
      // Wait before fulfilling the request to simulate slow loading
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.continue();
    });
    
    // Take screenshot showing placeholder
    await page.screenshot({ path: 'tests/screenshots/article-image-placeholder.png', fullPage: true });
    
    // Wait for images to load
    await page.waitForSelector('picture img.is-loaded', { timeout: 10000 });
    
    // Take screenshot after full image loaded
    await page.screenshot({ path: 'tests/screenshots/article-image-loaded.png', fullPage: true });
    
    // Visual comparison would be done manually or with the Playwright visual comparison tools
  });
});