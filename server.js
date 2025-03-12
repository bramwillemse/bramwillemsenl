const connect = require('connect');
const { createProxyMiddleware } = require('http-proxy-middleware');
const http = require('http');

// Create a connect app
const app = connect();

// Proxy for webpack assets and HMR
app.use(['/assets', '/bundle.js', '/main.css', '/ws'], createProxyMiddleware({
  target: 'http://localhost:8081',
  changeOrigin: true,
  ws: true,
  logLevel: 'warn'
}));

// Proxy all other requests to Hugo
app.use('/', createProxyMiddleware({
  target: 'http://localhost:1313',
  changeOrigin: true,
  logLevel: 'warn'
}));

// Create and start the server
const server = http.createServer(app);
server.listen(8080, () => {
  console.log('Proxy server running at http://localhost:8080');
});