import assert from 'node:assert/strict';
import { scoreKernelsWithStats, selectBestKernels } from '../lib/comedy/kernelScoring';
import { normalizeRenderedJokes } from '../lib/comedy/kernelRenderer';
import { JokeKernel, KernelBatch, ScoredKernel } from '../lib/comedy/comedyKernels';
import { ComedyMechanism } from '../lib/comedy/comedyMechanisms';

function createKernel(overrides: Partial<JokeKernel>): JokeKernel {
  return {
    id: 'kernel-1',
    mechanism: 'LITERALISM',
    stance: 'annoyed',
    anchor: 'parking meter',
    setup: 'The parking meter hates my car but loves my wallet',
    punch: 'It charged rent and now expects tips',
    ...overrides,
  };
}

function createBatch(kernel: JokeKernel): KernelBatch {
  return {
    topic: 'parking',
    requestedCount: 1,
    kernels: [kernel],
  };
}

function expectRejection(reason: string, kernel: JokeKernel) {
  const batch = createBatch(kernel);
  const stats = scoreKernelsWithStats(batch);
  assert.equal(stats.scored.length, 0, `Expected rejection for reason "${reason}"`);
  assert.equal(stats.rejectionCounts[reason], 1, `Expected rejection reason "${reason}"`);
}

function testHardRejects() {
  expectRejection(
    'rhetorical question',
    createKernel({ punch: 'So you want me to pay twice?' })
  );

  expectRejection(
    'rhetorical pattern',
    createKernel({ punch: 'Who knew my wallet could sweat' })
  );

  expectRejection(
    'explanatory ending',
    createKernel({ punch: 'Which means I now owe my toaster rent' })
  );
}

function testSelectionDiversity() {
  const baseSetup = 'My smart fridge has opinions about leftovers';
  const basePunch = 'It staged an intervention with the oven';
  const kernels: ScoredKernel[] = [
    {
      kernel: createKernel({
        id: 'k1',
        mechanism: 'LITERALISM',
        setup: baseSetup,
        punch: basePunch,
      }),
      score: 50,
      reasons: [],
    },
    {
      kernel: createKernel({
        id: 'k2',
        mechanism: 'STATUS_FLIP',
        setup: 'The intern started scheduling my meetings',
        punch: 'Now I need approval to use my own desk',
      }),
      score: 45,
      reasons: [],
    },
    {
      kernel: createKernel({
        id: 'k3',
        mechanism: 'RULE_OF_THREE',
        setup: 'I packed snacks, a map, and optimism for the DMV',
        punch: 'Only one of those survived the wait',
      }),
      score: 40,
      reasons: [],
    },
    {
      kernel: createKernel({
        id: 'k4',
        mechanism: 'LITERALISM',
        setup: 'My phone said it needed space',
        punch: 'So it took a weekend trip without me',
      }),
      score: 10,
      reasons: [],
    },
  ];

  const selected = selectBestKernels(kernels, 3);
  const mechanisms = new Set<ComedyMechanism>(selected.map(kernel => kernel.mechanism));
  assert.equal(selected.length, 3, 'Expected three kernels selected');
  assert.equal(mechanisms.size, 3, 'Expected unique mechanisms in selection');
}

function testRendererFormatting() {
  const output = `Joke one line 1
line 2


Joke two final line`;
  const { jokes, normalized } = normalizeRenderedJokes(output);

  assert.equal(jokes.length, 2, 'Expected two jokes parsed');
  assert.equal(
    normalized,
    'Joke one line 1 line 2\n\nJoke two final line',
    'Expected normalized blank lines and merged paragraph lines'
  );
}

function run() {
  testHardRejects();
  testSelectionDiversity();
  testRendererFormatting();
  console.log('Comedy pipeline tests passed.');
}

run();
