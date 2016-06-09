var gulp = require('gulp');
var plugins = require('gulp-load-plugins')({
	rename: {
		'gulp-if': 'gulpif',
		'gulp-tag-version': 'tag_version'
	}
});

var argv = require('yargs')
.default('env', 'local')
.argv;

var del = require('del');
var merge = require('merge-stream');
var semver = require('semver');

// Define some variables
var prod = argv.env == 'prod' ? true : false;
var local = argv.env == 'local' ? true : false;
// allow to force prod-like behavior (minifying mostly)
prod = argv.prod ? true : prod;

// Get the current version for zimlet
var p = require('./package.json');
var git = require('git-rev-sync');
var zimlet_version = local === true ? 'local' : p.version;
var zimlet_commit = git.short();
var sentry_dsn = 'https://ed60ef07a8de41989ef31e2886abf9c9@sentry.owk.cc/8';
var dist = 'dist/' + argv.env + '/zimlet/';
var zip_name = 'com_crunchmail_zimlet.zip';
var zip_dest = 'dist/' + argv.env + '/' + zimlet_version + '/';


// Validate JS
gulp.task('jshint', function() {
	return gulp.src('src/**/*.js')
	.pipe(plugins.jshint())
	.pipe(plugins.jshint.reporter('default'));
});

// Cleanup
gulp.task('clean', function() {
	return del([
		dist+'**/*',
		zip_dest + zip_name
	]);
});

// Build
gulp.task('dist', ['clean', 'jshint'], function() {

	var bundle = gulp.src([
		'bower_components/humps/humps.js',
		'bower_components/raven-js/dist/raven.js'
	])
	// we minify our dependencies otherwise Zimbra might have
	// problems compiling them
	.pipe(plugins.sourcemaps.init())
		.pipe(plugins.concat('bundle.js'))
		.pipe(plugins.uglify({mangle: true}))
	.pipe(plugins.sourcemaps.write())
	.pipe(gulp.dest(dist));

	var xml = gulp.src('src/com_crunchmail_zimlet.xml')
	.pipe(plugins.replace('VERSION', zimlet_version))
	.pipe(gulp.dest(dist));

	var js = gulp.src([
		'src/js/logger.module.js',
		'src/js/main.js',
		'src/js/soap.js',
		'src/js/*',
	])
	.pipe(plugins.sourcemaps.init())
		.pipe(plugins.concat('crunchmail_zimlet.js'))
		// only minify for production (a lot faster)
		.pipe(plugins.gulpif(prod, plugins.uglify({mangle: true})))
	.pipe(plugins.sourcemaps.write())
	.pipe(gulp.dest(dist));

	gulp.src('src/' + argv.env + '-config_template.xml')
	.pipe(plugins.rename('config_template.xml'))
	.pipe(plugins.replace('VERSION', zimlet_version))
	.pipe(plugins.replace('COMMIT', zimlet_commit))
	.pipe(plugins.replace('ENVIRONMENT', argv.env))
	.pipe(plugins.replace('SENTRY_DSN', sentry_dsn))
	.pipe(gulp.dest(dist));

	var properties = gulp.src('src/*.properties')
	// Zimbra wants ISO-8859 files, but we write in UTF-8
	.pipe(plugins.iconv({encoding: 'ISO-8859-1'}))
	.pipe(gulp.dest(dist));

	var other = gulp.src([
		'src/**',
		'!src/*.properties',
		'!src/com_crunchmail_zimlet.xml',
		'!src/*-config_template.xml',
		'!src/js/', '!src/js/**',
		'crunchmail.png',
		'crunchmail_logo.png'
	])
	.pipe(gulp.dest(dist));

	// we need to merge so we can return and correctly wait for
	// completion before building the zip (next task)
	return merge(xml, js, properties, other);
});

// Zip
gulp.task('zip', ['dist'], function() {
	return gulp.src(dist + '**')
	.pipe(plugins.zip(zip_name))
	.pipe(gulp.dest(zip_dest))
    .pipe(plugins.notify({ message: 'Zimlet ZIP available at: ' + zip_dest + zip_name }));
});

gulp.task('default', function() {
	gulp.start('zip');
});

function bump(importance) {
	var version = semver.inc(require('./package.json').version, importance);

    // get all the files to bump version in
    return gulp.src(['./package.json', './bower.json'])
        .pipe(plugins.bump({type: importance}))
        .pipe(gulp.dest('./'))
        .pipe(plugins.git.commit('bump version v'+version))
		.pipe(plugins.filter('package.json'))
        .pipe(plugins.tag_version());
}

gulp.task('patch', function() { return bump('patch'); });
gulp.task('minor', function() { return bump('minor'); });
gulp.task('major', function() { return bump('major'); });
