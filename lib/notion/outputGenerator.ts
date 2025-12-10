import { BlogEntry, ExtractionReport } from './types';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Generate JSON output file with all blog entries
 */
export async function generateJsonOutput(
  entries: BlogEntry[],
  outputPath: string
): Promise<void> {
  const output = {
    entries,
    metadata: {
      totalEntries: entries.length,
      generatedAt: new Date().toISOString(),
    },
  };

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
}

/**
 * Generate extraction report
 */
export async function generateReport(
  report: ExtractionReport,
  outputPath: string
): Promise<void> {
  const reportText = [
    'Notion Blog Extraction Report',
    '='.repeat(50),
    '',
    `Total Entries: ${report.totalEntries}`,
    `Successful: ${report.successful}`,
    `Failed: ${report.failed}`,
    `Skipped: ${report.skipped}`,
    '',
    'Errors:',
    '-'.repeat(50),
    ...report.errors.map(
      (error) => `Row ${error.row}: "${error.title}" - ${error.error}`
    ),
  ].join('\n');

  await fs.writeFile(outputPath, reportText, 'utf-8');
}

/**
 * Ensure output directory exists
 */
export async function ensureOutputDirectory(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    // Directory might already exist, that's fine
  }
}


