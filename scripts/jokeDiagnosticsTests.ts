import assert from 'node:assert/strict';
import {
  alignJokesWithDiagnostics,
  applyDiagnosticsFilters,
  parseJokeGenResponse,
  sortJokesByDiagnostics,
  summarizeDiagnostics,
  type JokeDiagnostics,
} from '../lib/jokeDiagnostics';

function createDiagnostics(overrides: Partial<JokeDiagnostics> = {}): JokeDiagnostics {
  return {
    resolutionType: 'Consequence',
    punchStrength: 'Medium',
    failureFlags: [],
    irreversibility: 'Medium',
    specificity: 'Mixed',
    ...overrides,
  };
}

function testParseAndValidation() {
  const raw = JSON.stringify({
    jokes: ['Joke one.', 'Joke two.'],
    diagnostics: [
      createDiagnostics({ punchStrength: 'Strong' }),
      createDiagnostics({ punchStrength: 'Soft' }),
    ],
  });

  const parsed = parseJokeGenResponse(raw, 2);
  assert.equal(parsed.jokes.length, 2);
  assert.equal(parsed.diagnostics.length, 2);

  const invalidRaw = JSON.stringify({ jokes: ['Only one'], diagnostics: [] });
  assert.throws(() => parseJokeGenResponse(invalidRaw, 1));
}

function testAlignmentHandlesMissingDiagnostics() {
  const jokes = ['First joke', 'Second joke'];
  const aligned = alignJokesWithDiagnostics(jokes, null);
  assert.equal(aligned.length, 2);
  assert.equal(aligned[0].diagnostics, undefined);
}

function testFilterAndSortLogic() {
  const items = alignJokesWithDiagnostics(['A', 'B', 'C'], [
    createDiagnostics({ punchStrength: 'Soft', irreversibility: 'Low', specificity: 'Vague' }),
    createDiagnostics({ punchStrength: 'Strong', irreversibility: 'High', specificity: 'Concrete' }),
    createDiagnostics({ punchStrength: 'Medium', irreversibility: 'Medium', specificity: 'Mixed' }),
  ]);

  const filtered = applyDiagnosticsFilters(items, { punchStrength: 'Strong' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].joke, 'B');

  const sorted = sortJokesByDiagnostics(items);
  assert.equal(sorted[0].joke, 'B');

  const summary = summarizeDiagnostics(items);
  assert.equal(summary.strong, 1);
  assert.equal(summary.medium, 1);
  assert.equal(summary.soft, 1);
}

function runTests() {
  testParseAndValidation();
  testAlignmentHandlesMissingDiagnostics();
  testFilterAndSortLogic();
  console.log('✓ Joke diagnostics tests passed');
}

runTests();
