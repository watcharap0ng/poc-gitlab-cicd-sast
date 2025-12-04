import { FullConfig } from '@playwright/test';
import * as fs from 'fs';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting E2E Test Global Teardown...');

  // Generate test summary
  try {
    const resultsPath = 'test-results/results.json';
    if (fs.existsSync(resultsPath)) {
      const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

      console.log('📊 Test Execution Summary:');
      console.log(`   Total Tests: ${results.suites?.[0]?.specs?.[0]?.tests?.length || 0}`);
      console.log(`   Passed: ${results.suites?.[0]?.specs?.[0]?.tests?.filter((t: any) => t.results?.[0]?.status === 'passed')?.length || 0}`);
      console.log(`   Failed: ${results.suites?.[0]?.specs?.[0]?.tests?.filter((t: any) => t.results?.[0]?.status === 'failed')?.length || 0}`);
      console.log(`   Skipped: ${results.suites?.[0]?.specs?.[0]?.tests?.filter((t: any) => t.results?.[0]?.status === 'skipped')?.length || 0}`);
    }
  } catch (error) {
    console.warn('⚠️  Could not generate test summary:', error);
  }

  // Cleanup temporary files
  const tempFiles = [
    'test-config.json'
  ];

  tempFiles.forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      console.log(`🗑️  Cleaned up: ${file}`);
    }
  });

  console.log('✅ Global teardown completed successfully');
}

export default globalTeardown;