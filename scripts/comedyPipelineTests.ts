import assert from 'node:assert/strict';
import { validateSkeletonBatch } from '../lib/comedy/skeletonGenerator';
import {
  scoreSkeletonsWithStats,
  selectBestSkeletons,
} from '../lib/comedy/skeletonScoring';
import {
  JokeSkeleton,
  SkeletonBatch,
  ScoredSkeleton,
} from '../lib/comedy/jokeSkeletons';
import { ComedyMechanism } from '../lib/comedy/comedyMechanisms';

function normalizeRenderedJokes(output: string): {
  jokes: string[];
  normalized: string;
} {
  const normalizedNewlines = output.trim().replace(/\r\n/g, '\n');
  const jokes = normalizedNewlines
    .split(/\n\s*\n/)
    .map(joke => joke.trim().replace(/\s*\n\s*/g, ' '))
    .filter(Boolean);

  return {
    jokes,
    normalized: jokes.join('\n\n'),
  };
}

function normalizeForMatch(text: string): string {
  return text.trim().toLowerCase().replace(/[.!?]+$/g, '');
}

function jokeEndsWithPunchLine(joke: string, punchLine: string): boolean {
  const normalizedJoke = normalizeForMatch(joke);
  const normalizedPunch = normalizeForMatch(punchLine);
  return normalizedJoke.endsWith(normalizedPunch);
}

function createSkeleton(overrides: Partial<JokeSkeleton>): JokeSkeleton {
  return {
    id: 'skeleton-1',
    mechanism: 'LITERALISM',
    anchor: 'parking meter',
    assumption: 'Feed the meter means pay once',
    turn: 'It takes the phrase literally',
    punch: 'Now it expects daily snacks',
    setupLine: 'The sign said feed the meter',
    punchLine: 'Now it expects daily snacks',
    ...overrides,
  };
}

function createBatch(candidate: JokeSkeleton): SkeletonBatch {
  return {
    topic: 'parking',
    requestedCount: 1,
    candidates: [candidate],
  };
}

function expectRejection(reason: string, skeleton: JokeSkeleton) {
  const batch = createBatch(skeleton);
  const stats = scoreSkeletonsWithStats(batch);
  assert.equal(stats.scored.length, 0, `Expected rejection for reason "${reason}"`);
  assert.equal(stats.rejectionCounts[reason], 1, `Expected rejection reason "${reason}"`);
}

function testStageAJsonValidation() {
  const batch: SkeletonBatch = {
    topic: 'coffee',
    requestedCount: 2,
    candidates: [
      createSkeleton({
        id: 's1',
        mechanism: 'MISDIRECTION_REVERSAL',
        anchor: 'espresso machine',
        assumption: 'It just makes coffee fast',
        turn: 'It evaluates my worth first',
        punch: 'It denied me a shot for lateness',
        setupLine: 'The espresso machine scans my badge',
        punchLine: 'It denied me a shot for lateness',
      }),
      createSkeleton({
        id: 's2',
        mechanism: 'FAULTY_LOGIC',
        anchor: 'coffee receipt',
        assumption: 'Receipts prove I paid',
        turn: 'The barista uses them as grades',
        punch: 'So I failed my mocha exam',
        setupLine: 'My coffee receipt got a letter grade',
        punchLine: 'So I failed my mocha exam',
      }),
    ],
  };

  assert.doesNotThrow(() => validateSkeletonBatch(batch), 'Expected valid SkeletonBatch');
  const json = JSON.stringify(batch);
  assert.doesNotThrow(
    () => validateSkeletonBatch(JSON.parse(json)),
    'Expected strict JSON parsing to preserve SkeletonBatch'
  );
}

function testHardRejects() {
  expectRejection(
    'rhetorical question',
    createSkeleton({ punchLine: 'So you want me to pay twice?' })
  );

  expectRejection(
    'banned punch phrase',
    createSkeleton({ punchLine: 'Who knew my wallet could sweat' })
  );

  expectRejection(
    'explanatory ending',
    createSkeleton({ punchLine: 'Which means I now owe my toaster rent' })
  );
}

function testMechanismValidity() {
  expectRejection(
    'mechanism invalid: misdirection reversal',
    createSkeleton({
      mechanism: 'MISDIRECTION_REVERSAL',
      assumption: 'The flight will be early',
      turn: 'Nothing flips the expectation',
      punch: 'The airline sent a normal schedule',
      punchLine: 'The airline sent a normal schedule',
      setupLine: 'The flight board promised early arrivals',
    })
  );

  expectRejection(
    'mechanism invalid: literalism',
    createSkeleton({
      mechanism: 'LITERALISM',
      assumption: 'The gym offers personal training',
      turn: 'It is still just advice',
      punch: 'They emailed tips and nothing else',
      punchLine: 'They emailed tips and nothing else',
      setupLine: 'My gym offered personal training',
    })
  );

  expectRejection(
    'mechanism invalid: rule of three',
    createSkeleton({
      mechanism: 'RULE_OF_THREE',
      assumption: 'I packed for a long wait',
      turn: 'I brought a map',
      punch: 'Then I brought a map',
      punchLine: 'Then I brought a map',
      setupLine: 'I packed snacks for the DMV',
    })
  );

  expectRejection(
    'mechanism invalid: faulty logic/reductio',
    createSkeleton({
      mechanism: 'FAULTY_LOGIC',
      assumption: 'My phone tracks steps',
      turn: 'It notices I walk less',
      punch: 'It sent me a sad emoji',
      punchLine: 'It sent me a sad emoji',
      setupLine: 'My phone tracks my steps',
    })
  );

  expectRejection(
    'mechanism invalid: status flip',
    createSkeleton({
      mechanism: 'STATUS_FLIP',
      assumption: 'My assistant schedules meetings',
      turn: 'She just reschedules',
      punch: 'She rescheduled again',
      punchLine: 'She rescheduled again',
      setupLine: 'My assistant moved my calendar',
    })
  );

  expectRejection(
    'mechanism invalid: unexpected rule system',
    createSkeleton({
      mechanism: 'UNEXPECTED_RULE_SYSTEM',
      assumption: 'The library lets me check out books',
      turn: 'It just closes early',
      punch: 'Now it closes early',
      punchLine: 'Now it closes early',
      setupLine: 'The library posted new hours',
    })
  );
}

function testSelectionDiversity() {
  const skeletons: ScoredSkeleton[] = [
    {
      skeleton: createSkeleton({
        id: 's1',
        mechanism: 'LITERALISM',
        anchor: 'smart fridge',
        assumption: 'It just keeps food cold',
        turn: 'It takes my words literally',
        punch: 'It filed a complaint about leftovers',
        setupLine: 'My smart fridge took my request literally',
        punchLine: 'It filed a complaint about leftovers',
      }),
      score: 50,
      reasons: [],
    },
    {
      skeleton: createSkeleton({
        id: 's2',
        mechanism: 'STATUS_FLIP',
        anchor: 'intern badge',
        assumption: 'Interns run errands',
        turn: 'They run me instead',
        punch: 'Now I need approval to sit down',
        setupLine: 'The intern schedules my day',
        punchLine: 'Now I need approval to sit down',
      }),
      score: 45,
      reasons: [],
    },
    {
      skeleton: createSkeleton({
        id: 's3',
        mechanism: 'RULE_OF_THREE',
        anchor: 'DMV waiting room',
        assumption: 'I came prepared',
        turn: 'I brought snacks and a book',
        punch: 'I should have packed a cot',
        setupLine: 'I brought snacks, a book, and hope',
        punchLine: 'I should have packed a cot',
      }),
      score: 40,
      reasons: [],
    },
    {
      skeleton: createSkeleton({
        id: 's4',
        mechanism: 'LITERALISM',
        anchor: 'phone storage',
        assumption: 'My phone wants more storage',
        turn: 'It takes it literally',
        punch: 'It rented a storage unit',
        setupLine: 'My phone said it needed space',
        punchLine: 'It rented a storage unit',
      }),
      score: 10,
      reasons: [],
    },
  ];

  const selected = selectBestSkeletons(skeletons, 3);
  const mechanisms = new Set<ComedyMechanism>(selected.map(skeleton => skeleton.mechanism));
  assert.equal(selected.length, 3, 'Expected three skeletons selected');
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

function testPunchLineFinalSentence() {
  const joke = 'My calendar said it needed space. It rented a storage unit.';
  const punchLine = 'It rented a storage unit';
  assert.ok(jokeEndsWithPunchLine(joke, punchLine), 'Expected punchLine to be final sentence');
}

function run() {
  testStageAJsonValidation();
  testHardRejects();
  testMechanismValidity();
  testSelectionDiversity();
  testRendererFormatting();
  testPunchLineFinalSentence();
  console.log('Comedy pipeline tests passed.');
}

run();
