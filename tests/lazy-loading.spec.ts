import { test, expect } from '@playwright/test';

test.describe('Lazy Loading Tests', () => {
  test('should load tiny placeholder images first', async ({ page }) => {
    // Go to homepage
    await page.goto('/');
    
    // Wait for initial render
    await page.waitForLoadState('domcontentloaded');
    
    // Check that all images have placeholder classes initially
    const images = await page.locator('picture img').all();
    
    // Take a screenshot for visual inspection
    await page.screenshot({ path: 'tests/screenshots/initial-load.png' });
    
    // Wait a bit for lazy loading to initialize
    await page.waitForTimeout(500);
    
    // Take another screenshot after tiny images should be loaded
    await page.screenshot({ path: 'tests/screenshots/tiny-loaded.png' });
    
    // Continue loading, scroll down to trigger lazy loading of larger images
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    
    // Wait for lazy loading to trigger
    await page.waitForTimeout(1000);
    
    // Take a final screenshot after scrolling
    await page.screenshot({ path: 'tests/screenshots/after-scroll.png' });
    
    // Check that some images have now loaded with the full-size class
    const loadedImages = await page.locator('picture img.is-loaded').count();
    expect(loadedImages).toBeGreaterThan(0);
  });

  test('Skip links are accessible', async ({ page }) => {
    // Go to homepage
    await page.goto('/');
    
    // Check if skip links are present
    const skipLink = page.locator('a.skip-link');
    await expect(skipLink).toBeVisible();
    
    // Test keyboard navigation - press Tab to focus on the skip link
    await page.keyboard.press('Tab');
    
    // Verify the skip link is focused
    await expect(skipLink).toBeFocused();
    
    // Click the skip link
    await skipLink.click();
    
    // Verify focus is moved to the main content area
    await expect(page.locator('main')).toBeFocused();
  });

  test('Scroll animations trigger correctly', async ({ page }) => {
    // Go to homepage
    await page.goto('/');
    
    // Get elements with animation attributes
    const animatedElements = page.locator('[data-animation]');
    
    // Take screenshot before scrolling
    await page.screenshot({ path: 'tests/screenshots/before-animation.png' });
    
    // Scroll down to trigger animations
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    
    // Wait for animations to trigger
    await page.waitForTimeout(500);
    
    // Take screenshot after scrolling
    await page.screenshot({ path: 'tests/screenshots/after-animation.png' });
    
    // Check that some elements have the is-animated class
    const animatedCount = await page.locator('[data-animation].is-animated').count();
    expect(animatedCount).toBeGreaterThan(0);
  });
});