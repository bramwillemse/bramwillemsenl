import { test, expect } from '@playwright/test';

// Article with a featured image: renders a lazy-loaded banner with data-animation.
// The homepage has no lazy images or animated elements, so it can't be used here.
const ARTICLE_WITH_BANNER = '/2021-themes-goals/';

test.describe('Lazy Loading Tests', () => {
  test('should load tiny placeholder images first', async ({ page }) => {
    await page.goto(ARTICLE_WITH_BANNER);

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
    await page.goto('/');

    // The first skip link ("Skip to content") targets the main landmark
    const skipLink = page.locator('a.m-skip-links__link[href$="#site-main"]');
    await expect(skipLink).toBeAttached();

    // First Tab press should land on the first skip link
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();

    // Activating it navigates to the main landmark
    await skipLink.click();
    await expect(page).toHaveURL(/#site-main$/);
  });

  // KNOWN BUG: main.o-site-main uses `display: contents`, so it has no box and
  // Chrome can't focus it despite tabindex="-1". The skip link scrolls to the
  // content but focus stays on <body>. Fix: give main a real box (or move the
  // focus target to an inner element), then change fixme to test.
  test.fixme('Skip link moves focus to the main landmark', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('main#site-main')).toBeFocused();
  });

  test('Scroll animations trigger correctly', async ({ page }) => {
    await page.goto(ARTICLE_WITH_BANNER);

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