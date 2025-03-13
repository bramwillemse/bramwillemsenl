# Playwright Tests for bramwillemse.nl

This directory contains automated tests for the bramwillemse.nl website using Playwright.

## Test Structure

- `lazy-loading.spec.ts`: Tests for the lazy loading functionality of images
- `image-loading.spec.ts`: Visual tests for image loading behavior
- `responsive.spec.ts`: Tests for responsive design across different viewport sizes

## Running Tests

You can run the tests using the following commands:

```bash
# Run all tests
yarn test

# Run tests with UI mode (for debugging and development)
yarn test:ui

# Run tests in headed mode (shows browser)
yarn test:headed

# Run tests in debug mode
yarn test:debug

# Update visual snapshots
yarn test:visual-update
```

## Screenshots

Tests automatically capture screenshots in the `tests/screenshots` directory for visual comparison and debugging.

## Adding New Tests

When adding new tests, follow these guidelines:

1. Create a new `.spec.ts` file for each test category
2. Use descriptive test names that explain what's being tested
3. For visual tests, include screenshots at appropriate stages
4. Test across different viewports for responsive behavior
5. Focus on testing the core user experience

## CI/CD Integration

To add these tests to your CI/CD pipeline, update your workflow configuration to include:

```yaml
- name: Install dependencies
  run: yarn install

- name: Install Playwright browsers
  run: yarn playwright install --with-deps chromium

- name: Run Playwright tests
  run: yarn test
```