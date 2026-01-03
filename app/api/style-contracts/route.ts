import { NextRequest, NextResponse } from 'next/server';
import { STYLE_CONTRACTS } from '@/lib/comedy/styleContracts';

/**
 * GET /api/style-contracts
 * 
 * Returns all available style contracts for use in the chat interface.
 */
export async function GET(request: NextRequest) {
  try {
    // Get style contracts from the main library
    const contracts = STYLE_CONTRACTS;

    // Convert to array format with id and name for easier consumption
    const styleContractsList = Object.entries(contracts).map(([id, contract]) => ({
      id,
      name: contract.reference,
      description: contract.voiceDescription,
      contract,
    }));

    return NextResponse.json({
      contracts: styleContractsList,
    });
  } catch (error) {
    console.error('Error fetching style contracts:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch style contracts',
      },
      { status: 500 }
    );
  }
}

