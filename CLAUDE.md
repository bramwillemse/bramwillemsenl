# Project Guide for bramwillemse.nl

## Build Commands
- `yarn dev` - Run development servers (Hugo + Webpack)
- `yarn build` - Create production build

## Tech Stack
- Hugo (static site generator)
- Webpack 5 (asset bundling)
- PostCSS for CSS processing
- Vanilla JS (ES5-compatible)

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