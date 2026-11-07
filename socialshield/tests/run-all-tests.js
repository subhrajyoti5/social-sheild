/**
 * SocialShield — Unified Test Runner
 * Runs all test suites and reports results.
 */

import { runDeduplicateTests } from './deduplicate.test.js';
import { runBfsTests } from './bfs.test.js';
import { runImporterTests } from './importer.test.js';
import { runPrivacyTests } from './privacy.test.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

const assert = {
  equal(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },
  notEqual(actual, expected, message) {
    if (actual === expected) {
      throw new Error(message || `Expected values to be different, but both were ${JSON.stringify(actual)}`);
    }
  },
  deepEqual(actual, expected, message) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
      throw new Error(message || `Expected deep equality: ${b} vs ${a}`);
    }
  },
  ok(val, message) {
    if (!val) {
      throw new Error(message || `Expected truthy value, got ${val}`);
    }
  }
};

async function test(description, fn) {
  totalTests++;
  try {
    const res = fn(assert);
    if (res && typeof res.then === 'function') {
      await res;
    }
    passedTests++;
    console.log(`  ✓ ${description}`);
  } catch (err) {
    failedTests++;
    failures.push({ description, error: err });
    console.error(`  ✗ ${description}`);
    console.error(`    ${err.message}`);
  }
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('       SocialShield Test Suite');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('▶ Deduplication & Username Utilities');
  await runDeduplicateTests(test);

  console.log('\n▶ Graph Traversal & BFS Engine');
  await runBfsTests(test);

  console.log('\n▶ CSV & JSON Importers');
  await runImporterTests(test);

  console.log('\n▶ Privacy Actions & History');
  await runPrivacyTests(test);

  console.log('\n───────────────────────────────────────────────────────');
  console.log(`Results: ${passedTests}/${totalTests} tests passed (${failedTests} failed)`);
  console.log('───────────────────────────────────────────────────────\n');

  if (failedTests > 0) {
    console.error('FAILED TESTS:');
    for (const f of failures) {
      console.error(`- ${f.description}: ${f.error.message}`);
    }
    process.exit(1);
  } else {
    console.log('All tests passed successfully!\n');
    process.exit(0);
  }
}

run();
