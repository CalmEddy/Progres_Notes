/**
 * Comedy Generation Service
 * 
 * Generates comedy jokes using a two-stage pipeline:
 * 1. Generate diverse joke kernels using comedy mechanisms
 * 2. Score and select best kernels
 * 3. Render selected kernels through voice contracts
 */

import { VOICE_CONTRACTS, HumoristId } from './voiceContracts';
import { generateKernels, KernelGenerationConstraints } from './kernelGenerator';
import { scoreKernels, selectBestKernels, calculateStringSimilarity } from './kernelScoring';
import { renderJokesFromKernels, RendererConstraints } from './kernelRenderer';

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
 * 1. Generate diverse joke kernels (Stage A)
 * 2. Score, select, and render through voice contract (Stage B)
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

  const constraints: KernelGenerationConstraints & RendererConstraints = { clean };
  const isDebug = process.env.COMEDY_DEBUG === 'true';

  try {
    // Stage A: Generate kernels
    // Request more kernels than needed to ensure we have enough after filtering
    const targetKernelCount = jokeCount * 3;
    
    if (isDebug) {
      console.log(`[COMEDY_DEBUG] Generating kernels for topic: "${topic}"`);
      console.log(`[COMEDY_DEBUG] Target kernel count: ${targetKernelCount}`);
    }

    let batch = await generateKernels(topic, targetKernelCount, constraints);

    if (isDebug) {
      console.log(`[COMEDY_DEBUG] Generated ${batch.kernels.length} kernels`);
    }

    // Score kernels
    const scored = scoreKernels(batch);

    if (isDebug) {
      console.log(`[COMEDY_DEBUG] Scored ${scored.length} kernels (after hard filters)`);
      const top5 = scored.slice(0, 5);
      console.log(`[COMEDY_DEBUG] Top 5 scores:`);
      top5.forEach((s, i) => {
        console.log(`  ${i + 1}. Score: ${s.score}, Reasons: ${s.reasons.join(', ')}`);
      });

      // Count rejection reasons
      const rejectionReasons: Record<string, number> = {};
      // This is approximate since we don't track rejections in detail
      console.log(`[COMEDY_DEBUG] Mechanism distribution:`);
      const mechanismCounts: Record<string, number> = {};
      scored.forEach(s => {
        mechanismCounts[s.kernel.mechanism] = (mechanismCounts[s.kernel.mechanism] || 0) + 1;
      });
      Object.entries(mechanismCounts).forEach(([mech, count]) => {
        console.log(`  ${mech}: ${count}`);
      });
    }

    // Select best kernels
    let selected = selectBestKernels(scored, jokeCount);

    // If we don't have enough kernels, generate a second batch
    if (selected.length < jokeCount) {
      if (isDebug) {
        console.log(`[COMEDY_DEBUG] Only ${selected.length} kernels selected, generating second batch`);
      }

      const secondBatch = await generateKernels(topic, targetKernelCount, constraints);
      const secondScored = scoreKernels(secondBatch);
      const secondSelected = selectBestKernels(secondScored, jokeCount - selected.length);

      // Merge, avoiding duplicates
      const selectedIds = new Set(selected.map(k => k.id));
      const additional = secondSelected.filter(k => !selectedIds.has(k.id));
      selected = [...selected, ...additional];

      if (isDebug) {
        console.log(`[COMEDY_DEBUG] After second batch: ${selected.length} kernels selected`);
      }
    }

    // If still insufficient, relax diversity (allow repeats)
    if (selected.length < jokeCount) {
      if (isDebug) {
        console.log(`[COMEDY_DEBUG] Still insufficient (${selected.length}), relaxing diversity`);
      }

      const sorted = [...scored].sort((a, b) => b.score - a.score);
      const selectedIds = new Set(selected.map(k => k.id));
      const usedTexts = new Set(
        selected.map(k => `${k.setup || ''} ${k.punch || ''}`.toLowerCase().trim())
      );

      for (const scoredKernel of sorted) {
        if (selected.length >= jokeCount) break;
        if (selectedIds.has(scoredKernel.kernel.id)) continue;

        const normalizedText = `${scoredKernel.kernel.setup || ''} ${scoredKernel.kernel.punch || ''}`
          .toLowerCase()
          .trim();

        // Still avoid exact duplicates
        let isDuplicate = false;
        for (const usedText of usedTexts) {
          const similarity =
            usedTexts.size > 0
              ? calculateStringSimilarity(normalizedText, usedText)
              : 0;
          if (similarity > 0.9) {
            isDuplicate = true;
            break;
          }
        }

        if (!isDuplicate) {
          selected.push(scoredKernel.kernel);
          selectedIds.add(scoredKernel.kernel.id);
          usedTexts.add(normalizedText);
        }
      }
    }

    if (selected.length === 0) {
      throw new Error('No valid kernels generated after filtering');
    }

    if (isDebug) {
      console.log(`[COMEDY_DEBUG] Final selected: ${selected.length} kernels`);
    }

    // Stage B: Render kernels through voice contract
    const finalText = await renderJokesFromKernels(
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

