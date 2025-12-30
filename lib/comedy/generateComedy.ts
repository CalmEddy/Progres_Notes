/**
 * Comedy Generation Service
 * 
 * Generates comedy jokes using a three-stage pipeline:
 * 1. Generate mechanism-first joke skeletons
 * 2. Score and select valid skeletons
 * 3. Render selected skeletons through voice contracts
 */

import { VOICE_CONTRACTS, HumoristId } from './voiceContracts';
import { generateSkeletons, SkeletonGenerationConstraints } from './skeletonGenerator';
import {
  scoreSkeletonsWithStats,
  selectBestSkeletons,
  getMechanismDistribution,
} from './skeletonScoring';
import { renderJokesFromSkeletons, RendererConstraints } from './skeletonRenderer';

export interface GenerateComedyParams {
  topic: string;
  jokeCount: number;
  humoristId?: HumoristId;
  clean?: boolean; // NEW: optional constraint
}

/**
 * Generate comedy jokes using the specified humorist's voice
 * 
 * Two-stage pipeline:
 * 1. Generate mechanism-first skeletons (Stage A)
 * 2. Score and select skeletons (Stage B)
 * 3. Render skeletons through voice contract (Stage C)
 * 
 * @param params - Generation parameters
 * @returns Plain text output with jokes separated by blank lines
 */
export async function generateComedy({
  topic,
  jokeCount,
  humoristId = 'dave_barry',
  clean = true,
}: GenerateComedyParams): Promise<string> {
  const voiceContract = VOICE_CONTRACTS[humoristId];

  if (!voiceContract) {
    throw new Error(`Voice contract not found for humorist: ${humoristId}`);
  }

  const constraints: SkeletonGenerationConstraints & RendererConstraints = { clean };
  const isDebug = process.env.COMEDY_DEBUG === 'true';

  try {
    // Stage A: Generate skeletons
    const targetSkeletonCount = 36;
    
    if (isDebug) {
      console.log(`[COMEDY_DEBUG] Generating skeletons for topic: "${topic}"`);
      console.log(`[COMEDY_DEBUG] Target skeleton count: ${targetSkeletonCount}`);
    }

    let batch = await generateSkeletons(topic, targetSkeletonCount, constraints);

    if (isDebug) {
      console.log(`[COMEDY_DEBUG] Generated ${batch.candidates.length} skeletons`);
    }

    // Score skeletons
    const scoredStats = scoreSkeletonsWithStats(batch);
    const scored = scoredStats.scored;

    if (isDebug) {
      console.log(`[COMEDY_DEBUG] Scored ${scored.length} skeletons (after hard filters)`);
      console.log(
        `[COMEDY_DEBUG] Rejected ${scoredStats.rejectedTotal} skeletons (out of ${scoredStats.total})`
      );
      if (scoredStats.rejectedTotal > 0) {
        console.log(`[COMEDY_DEBUG] Rejection reasons:`);
        Object.entries(scoredStats.rejectionCounts)
          .sort((a, b) => b[1] - a[1])
          .forEach(([reason, count]) => {
            console.log(`  ${reason}: ${count}`);
          });
      }
      console.log(`[COMEDY_DEBUG] Selected mechanism distribution (pre-selection):`);
      const mechanismCounts = getMechanismDistribution(scored.map(s => s.skeleton));
      Object.entries(mechanismCounts).forEach(([mech, count]) => {
        console.log(`  ${mech}: ${count}`);
      });
    }

    // Select best skeletons
    let selected = selectBestSkeletons(scored, jokeCount);

    // If we don't have enough skeletons, generate a second batch (once)
    if (selected.length < jokeCount) {
      if (isDebug) {
        console.log(`[COMEDY_DEBUG] Only ${selected.length} skeletons selected, generating second batch`);
      }

      const secondBatch = await generateSkeletons(topic, targetSkeletonCount, constraints);
      const secondScoredStats = scoreSkeletonsWithStats(secondBatch);
      const secondScored = secondScoredStats.scored;
      const secondSelected = selectBestSkeletons(secondScored, jokeCount - selected.length);

      if (isDebug) {
        console.log(
          `[COMEDY_DEBUG] Second batch rejected ${secondScoredStats.rejectedTotal} skeletons (out of ${secondScoredStats.total})`
        );
        if (secondScoredStats.rejectedTotal > 0) {
          console.log(`[COMEDY_DEBUG] Second batch rejection reasons:`);
          Object.entries(secondScoredStats.rejectionCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([reason, count]) => {
              console.log(`  ${reason}: ${count}`);
            });
        }
      }

      const selectedIds = new Set(selected.map(s => s.id));
      const additional = secondSelected.filter(s => !selectedIds.has(s.id));
      selected = [...selected, ...additional];

      if (isDebug) {
        console.log(`[COMEDY_DEBUG] After second batch: ${selected.length} skeletons selected`);
      }
    }

    if (selected.length < jokeCount) {
      throw new Error('Insufficient valid skeletons after two generation passes');
    }

    if (selected.length === 0) {
      throw new Error('No valid skeletons generated after filtering');
    }

    if (isDebug) {
      console.log(`[COMEDY_DEBUG] Final selected: ${selected.length} skeletons`);
      console.log('[COMEDY_DEBUG] Selected mechanism distribution:');
      const selectedDistribution = getMechanismDistribution(selected);
      Object.entries(selectedDistribution).forEach(([mech, count]) => {
        console.log(`  ${mech}: ${count}`);
      });
    }

    // Stage C: Render skeletons through voice contract
    const finalText = await renderJokesFromSkeletons(
      selected,
      voiceContract,
      humoristId,
      jokeCount,
      topic,
      constraints
    );

    return finalText;
  } catch (error) {
    console.error('Error generating comedy:', error);
    throw new Error(
      `Failed to generate comedy: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
