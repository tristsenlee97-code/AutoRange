import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isDev = process.argv.includes('--dev');

console.log(`Building extension in ${isDev ? 'development' : 'production'} mode...`);

// Clean and create autofold directory (production build output)
const distDir = path.join(rootDir, 'autofold');
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Common esbuild options
const baseConfig = {
  bundle: false, // Don't bundle since we want to keep file structure
  minify: !isDev,
  sourcemap: isDev ? 'inline' : false,
  platform: 'browser',
  target: ['chrome114'],
  logLevel: 'info',
  // Strip console.* calls in production builds
  drop: isDev ? [] : ['console'],
};

async function build() {
  try {
    // Build background service worker
    // No format specified - keeps code as-is but minified
    await esbuild.build({
      ...baseConfig,
      entryPoints: ['src/js/background.js'],
      outfile: 'autofold/js/background.js',
    });
    console.log('✓ Built background.js');

    // Build content script
    // No format specified - prevents IIFE wrapper that breaks window.postMessage
    await esbuild.build({
      ...baseConfig,
      entryPoints: ['src/js/content.js'],
      outfile: 'autofold/js/content.js',
    });
    console.log('✓ Built content.js');

    // Build pokernow page script
    await esbuild.build({
      ...baseConfig,
      entryPoints: ['src/js/scripts/pokernow.js'],
      outfile: 'autofold/js/scripts/pokernow.js',
      format: 'iife', // Page scripts need IIFE
    });
    console.log('✓ Built pokernow.js');

    // Check if ignition.js exists and build it
    const ignitionPath = path.join(rootDir, 'src/js/scripts/ignition.js');
    if (fs.existsSync(ignitionPath)) {
      await esbuild.build({
        ...baseConfig,
        entryPoints: ['src/js/scripts/ignition.js'],
        outfile: 'autofold/js/scripts/ignition.js',
        format: 'iife',
      });
      console.log('✓ Built ignition.js');
    }

    // Copy non-JS assets
    copyAssets();

    // Create production manifest
    createManifest();

    console.log('\n✅ Build complete! Extension ready in autofold/');
    console.log('\nTo test:');
    console.log('1. Open chrome://extensions');
    console.log('2. Enable Developer mode');
    console.log('3. Click "Load unpacked"');
    console.log('4. Select the autofold/ folder');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

function copyAssets() {
  // Copy directories that don't need processing
  const assetDirs = [
    { src: 'src/images', dest: 'autofold/images' },
    { src: 'src/media', dest: 'autofold/media' },
    { src: 'src/popup', dest: 'autofold/popup' },
    { src: 'src/css', dest: 'autofold/css' },
  ];

  assetDirs.forEach(({ src, dest }) => {
    const srcPath = path.join(rootDir, src);
    const destPath = path.join(rootDir, dest);
    if (fs.existsSync(srcPath)) {
      fs.cpSync(srcPath, destPath, { recursive: true });
      console.log(`✓ Copied ${src} → ${dest}`);
    }
  });

  // Copy jQuery (already minified, no need to process)
  const jqueryFiles = [
    'src/js/jquery-3.6.0.min.js',
    'src/js/jquery-ui.min.js',
  ];

  jqueryFiles.forEach((file) => {
    const srcPath = path.join(rootDir, file);
    const destPath = path.join(rootDir, file.replace('src/', 'autofold/'));
    if (fs.existsSync(srcPath)) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
      console.log(`✓ Copied ${file}`);
    }
  });
}

function createManifest() {
  const manifestPath = path.join(rootDir, 'src/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // No changes needed - manifest already uses correct paths
  // Just copy it to autofold
  fs.writeFileSync(
    path.join(rootDir, 'autofold/manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  console.log('✓ Created manifest.json');
}

build();

