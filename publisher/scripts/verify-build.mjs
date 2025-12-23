#!/usr/bin/env node

/**
 * Verification script to ensure production build preserves all critical properties
 * Run after `npm run build` to validate output
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(msg, color = 'reset') {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

function check(condition, pass, fail) {
  if (condition) {
    log(`✅ ${pass}`, 'green');
    return true;
  } else {
    log(`❌ ${fail}`, 'red');
    return false;
  }
}

async function verifyBuild() {
  log('\n🔍 Verifying production build...\n', 'blue');

  let allChecks = true;

  // Detect build output directory (build.mjs outputs to autofold/; dist/ kept for legacy)
  const outputCandidates = ['autofold', 'dist'];
  const outputDirName = outputCandidates.find((d) => fs.existsSync(path.join(rootDir, d))) || null;
  const outputExists = Boolean(outputDirName);
  allChecks &= check(
    outputExists,
    `${outputDirName || 'autofold/'}/ folder exists`,
    'Build output folder not found (expected autofold/). Run npm run build'
  );
  if (!outputExists) return false;
  const out = (p) => path.join(rootDir, outputDirName, p);

  // Check critical files exist
  const files = [
    'manifest.json',
    'js/background.js',
    'js/content.js',
    'js/scripts/pokernow.js',
  ];

  log('📁 Checking required files:', 'blue');
  for (const file of files) {
    const exists = fs.existsSync(out(file));
    allChecks &= check(exists, `${outputDirName}/${file}`, `${outputDirName}/${file} missing`);
  }

  // Read built files
  const bg = fs.readFileSync(out('js/background.js'), 'utf8');
  const ct = fs.readFileSync(out('js/content.js'), 'utf8');
  const pn = fs.readFileSync(out('js/scripts/pokernow.js'), 'utf8');

  // Verify background.js (service worker)
  log('\n📡 Verifying background.js (WebSocket hub connection):', 'blue');
  allChecks &= check(
    bg.includes('wss://') && bg.includes('dom-hub.onrender.com'),
    'WS host preserved',
    'WS host missing or modified'
  );
  allChecks &= check(
    bg.includes('room=') && bg.includes('role=') && bg.includes('token='),
    'WS query params (room, role, token) preserved',
    'WS query params missing'
  );
  allChecks &= check(
    bg.includes('role=pub'),
    'Publisher role value "pub" preserved',
    'Publisher role value missing'
  );
  allChecks &= check(
    bg.includes('type') && bg.includes('publisherId') && bg.includes('data') && bg.includes('timestamp'),
    'Message routing fields preserved',
    'Message routing fields missing'
  );
  allChecks &= check(
    bg.includes('playerName'),
    'Player name field in message preserved',
    'Player name field in message missing'
  );
  allChecks &= check(
    bg.includes('HAND_DATA'),
    'HAND_DATA message type preserved',
    'HAND_DATA message type missing'
  );

  // Verify content.js
  log('\n📨 Verifying content.js (message passing):', 'blue');
  allChecks &= check(
    ct.includes('FROM_PAGE') && ct.includes('FROM_EXTENSION'),
    'postMessage types preserved',
    'postMessage types missing'
  );
  allChecks &= check(
    ct.includes('value1') && ct.includes('suit1') && ct.includes('value2') && ct.includes('suit2'),
    'Hand field names preserved',
    'Hand field names missing'
  );
  allChecks &= check(
    ct.includes('url') && ct.includes('timestamp'),
    'Metadata fields preserved',
    'Metadata fields missing'
  );
  allChecks &= check(
    ct.includes('playerId') && ct.includes('playerName'),
    'Player ID and name fields preserved',
    'Player ID and name fields missing'
  );
  allChecks &= check(
    ct.includes('HAND_DATA'),
    'HAND_DATA type preserved',
    'HAND_DATA type missing'
  );

  // Verify pokernow.js
  log('\n🃏 Verifying pokernow.js (page script):', 'blue');
  allChecks &= check(
    pn.includes('FROM_PAGE'),
    'FROM_PAGE type preserved',
    'FROM_PAGE type missing'
  );
  allChecks &= check(
    pn.includes('value1') && pn.includes('suit1') && pn.includes('value2') && pn.includes('suit2'),
    'Hand class properties preserved',
    'Hand class properties missing'
  );
  allChecks &= check(
    pn.includes('url'),
    'URL field preserved',
    'URL field missing'
  );
  allChecks &= check(
    pn.includes('playerId') && pn.includes('.href'),
    'Player ID extraction preserved',
    'Player ID extraction missing'
  );
  allChecks &= check(
    pn.includes('playerName'),
    'Player name extraction preserved',
    'Player name extraction missing'
  );
  allChecks &= check(
    pn.includes('table-player-name'),
    'DOM selector for player info preserved',
    'DOM selector for player info missing'
  );

  // Check file sizes
  log('\n📊 File size analysis:', 'blue');
  const bgSize = (bg.length / 1024).toFixed(1);
  const ctSize = (ct.length / 1024).toFixed(1);
  const pnSize = (pn.length / 1024).toFixed(1);
  
  log(`   background.js: ${bgSize} KB`);
  log(`   content.js: ${ctSize} KB`);
  log(`   pokernow.js: ${pnSize} KB`);

  // Minification checks are informative only; don't fail verification on size heuristics
  check(
    bg.length < 15000,
    'background.js appears minified (heuristic)',
    'background.js may not be minified (heuristic)'
  );
  check(
    ct.length < 8000,
    'content.js appears minified (heuristic)',
    'content.js may not be minified (heuristic)'
  );

  // Summary
  log('\n' + '='.repeat(60), 'blue');
  if (allChecks) {
    log('✅ BUILD VERIFICATION PASSED', 'green');
    log('All critical properties preserved. Extension ready for testing!\n', 'green');
    log('Next steps:', 'blue');
    log('  1. Open chrome://extensions');
    log(`  2. Load unpacked from ${outputDirName}/ folder`);
    log('  3. Test on PokerNow game');
    log('  4. Verify WS connection in service worker console\n');
    return true;
  } else {
    log('❌ BUILD VERIFICATION FAILED', 'red');
    log('Some critical properties may be missing. Check errors above.\n', 'red');
    return false;
  }
}

verifyBuild().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  log(`\n❌ Verification error: ${error.message}`, 'red');
  process.exit(1);
});

