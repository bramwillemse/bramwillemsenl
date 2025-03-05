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
- Organized by atomic design principles (atoms, molecules, organisms)
- Uses CSS custom properties for colors, spacing, etc.
- Files structured in directories by component type

### JavaScript
- ES modules with named exports
- Component files export default functions
- Functional programming approach

### Naming Conventions
- CSS: kebab-case for classes and variables
- JS: camelCase for variables and functions
- Descriptive, semantic class names