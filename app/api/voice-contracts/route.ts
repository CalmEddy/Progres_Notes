import { NextRequest, NextResponse } from 'next/server';
import { VOICE_CONTRACTS } from '@/lib/comedy/voiceContracts';

/**
 * GET /api/voice-contracts
 * 
 * Returns all available voice contracts for use in the chat interface.
 * This endpoint checks for voice contracts on each request, allowing
 * new contracts to be discovered dynamically.
 */
export async function GET(request: NextRequest) {
  try {
    // Get voice contracts from the main library
    // In the future, this could be extended to check multiple sources
    const contracts = VOICE_CONTRACTS;

    // Convert to array format with id and name for easier consumption
    const voiceContractsList = Object.entries(contracts).map(([id, contract]) => ({
      id,
      name: contract.humorist,
      contract,
    }));

    return NextResponse.json({
      contracts: voiceContractsList,
    });
  } catch (error) {
    console.error('Error fetching voice contracts:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch voice contracts',
      },
      { status: 500 }
    );
  }
}

