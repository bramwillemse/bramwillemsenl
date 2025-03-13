import { test, expect } from '@playwright/test';

// Define viewport sizes to test
const viewports = [
  { width: 375, height: 667, name: 'mobile' },
  { width: 768, height: 1024, name: 'tablet' },
  { width: 1280, height: 800, name: 'desktop' },
  { width: 1920, height: 1080, name: 'large-desktop' }
];

test.describe('Responsive Design Tests', () => {
  for (const viewport of viewports) {
    test(`Homepage looks correct on ${viewport.name}`, async ({ page }) => {
      // Set viewport size
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Navigate to homepage
      await page.goto('/');
      
      // Wait for page to be fully loaded
      await page.waitForLoadState('networkidle');
      
      // Take screenshot for visual comparison
      await page.screenshot({ 
        path: `tests/screenshots/homepage-${viewport.name}.png`,
        fullPage: true 
      });
      
      // Check specific responsive behaviors as needed
      if (viewport.width < 768) {
        // Mobile specific checks (e.g., hamburger menu)
        // For example: expect(page.locator('.mobile-menu')).toBeVisible();
      } else {
        // Desktop specific checks
        // For example: expect(page.locator('.desktop-menu')).toBeVisible();
      }
    });
  }

  test('Images load with appropriate sizes for viewport', async ({ page }) => {
    for (const viewport of viewports) {
      // Set viewport size
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Navigate to photos page
      await page.goto('/photos/');
      
      // Wait for images to load
      await page.waitForTimeout(2000);
      
      // Take screenshot to check image sizing
      await page.screenshot({ 
        path: `tests/screenshots/photos-${viewport.name}.png`,
        fullPage: false 
      });
      
      // Optional: Check for correct image source based on viewport
      // This depends on how your responsive images are implemented
      // For example, you could check that smaller viewports load smaller images
    }
  });
});