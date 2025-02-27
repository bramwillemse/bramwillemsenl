const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const path = require('path');

module.exports = {
  mode: 'development',
  target: ['web', 'es5'], // Add target to specify environment
  devtool: 'source-map', // Enable source maps
  devServer: {
    static: {
      directory: path.resolve(__dirname, 'public'), // Changed to Hugo's public directory
      publicPath: '/', // Changed to root
      watch: true,
    },
    hot: true,
    devMiddleware: {
      writeToDisk: true // Add this to write files to disk
    }
  },
  entry: {
    main: [
      path.resolve(__dirname, 'themes/bw-monochrome/src/js/main.js'),
      path.resolve(__dirname, 'themes/bw-monochrome/src/css/main.css')
    ]
  },
  output: {
    path: path.resolve(__dirname, 'themes/bw-monochrome/assets'),
    filename: 'bundle.js',
    publicPath: '/assets/' // Changed to match devServer
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: "defaults" // This will use .browserslistrc
              }]
            ]
          }
        }
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: { sourceMap: true } // Enable source maps for CSS
          },
          {
            loader: 'postcss-loader',
            options: { sourceMap: true } // Enable source maps for PostCSS
          },
        ],
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: 'main.css'  // Specify output filename for CSS
    }),
    new CleanWebpackPlugin({
      cleanStaleWebpackAssets: true, // Changed to true to clean stale assets
      cleanOnceBeforeBuildPatterns: [], // Keep empty to not clean everything before build
      protectWebpackAssets: true, // Protect main assets
      cleanAfterEveryBuildPatterns: ['*.hot-update.js', '*.hot-update.json'] // Clean only hot-update files
    }),
  ],
};