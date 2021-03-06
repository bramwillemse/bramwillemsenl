'use strict';

// Required modules
var gulp = require('gulp'),
	browserSync = require('browser-sync');



// Settings
var	reload = browserSync.reload;



// Task: Static Server + watching scss/html files
gulp.task('watch', function() {
    
    // Watch converted html
    // gulp.watch('./dist/**/*.html', reload);

    // Watch templates & content docs
    gulp.watch([
        './src/templates/**/*.{html,md}'
    ], ['templates:minify', reload]);

	// Watch stylesheets
    gulp.watch('./src/scss/**/*.scss', ['style']);

    // Watch scripts
    gulp.watch('./src/js/**/*', ['scripts', reload]);

    // Watch image files
    gulp.watch('./src/images/raster/*', ['images']);

    // Watch SVG files
    gulp.watch('./src/images/vector/*', ['svgs']);

    // Watch Styleguide
    gulp.watch('./dist/styleguide/*', [reload]);

});