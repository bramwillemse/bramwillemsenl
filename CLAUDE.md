# Project Guide for bramwillemse.nl

## Build Commands
- `yarn dev` - Run development servers (Hugo + Webpack)
- `yarn build` - Create production build

## Testing Commands
- `yarn test` - Run all Playwright tests
- `yarn test:ui` - Run tests with UI mode for debugging
- `yarn test:headed` - Run tests in headed mode (shows browser)
- `yarn test:debug` - Run tests in debug mode
- `yarn test:visual-update` - Update visual snapshots

## Tech Stack
- Hugo (static site generator)
- Webpack 5 (asset bundling)
- PostCSS for CSS processing
- Vanilla JS (ES5-compatible)

## Connectors
### Netlify (MCP)
Use the Netlify connector for hosting, deploys and project configuration instead of the Netlify CLI or dashboard, unless the connector can't do it. Tool names start with `mcp__Netlify__`; they are deferred, so load them first via ToolSearch (`select:mcp__Netlify__<name>`).

- `get-netlify-coding-context` - fetch Netlify coding guidelines before using Netlify features (redirects, headers, functions, forms)
- `netlify-project-services-reader` / `-updater` - read/change project settings (build settings, env vars, domains)
- `netlify-deploy-services-reader` / `-updater` - inspect deploys (status, logs) and manage them (rollback, trigger deploy)
- `netlify-extension-services-reader` / `-updater` - read/manage extensions
- `netlify-team-services-reader`, `netlify-user-services-reader` - team and account info (read-only)

Guidelines:
- Failed deploy: read the deploy logs first, only then change code
- Use reader tools for diagnosis; only use updater tools after explicit confirmation (changes affect the live site)
- Never show or change env var values that contain secrets; mention key names only

## Code Style
### CSS
- Organized by atomic design principles (atoms, molecules, organisms) and BEMIT by Harry Roberts.
- Uses CSS custom properties for colors, spacing, etc.
- Files structured in directories by component type.

### JavaScript
- ES modules with named exports
- Component files export default functions
- Functional programming approach

### Naming Conventions
- CSS: BEMIT, kebab-case for classes and variables
- JS: camelCase for variables and functions
- Descriptive, semantic class names

### Git commit message conventions
- Write concise git message
- Only elaborate in description if really necessary
- Warn me if I combine too many different changes into 1 commit
- Examples:
  - "Now page / update content to reflect current books I am reading"
  - "Build setup / update modules to work with latest package X"
  - "Netlify settings / upgrade node version to match local build"
  - "Homepage / transform grid layout to sub grid layout"