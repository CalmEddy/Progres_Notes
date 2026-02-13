'use client';

import { STYLE_CONTRACTS, StyleContract } from '@/lib/comedy/styleContracts';

interface StyleContractSelectorProps {
  selectedStyleId?: string;
  onSelect: (styleContract: StyleContract) => void;
  usedStyleIds?: string[]; // IDs of style contracts that have already been used
  disabled?: boolean;
}

export default function StyleContractSelector({
  selectedStyleId,
  onSelect,
  usedStyleIds = [],
  disabled = false,
}: StyleContractSelectorProps) {
  const styleContracts = Object.values(STYLE_CONTRACTS);

  const handleSelect = (styleId: string) => {
    const contract = STYLE_CONTRACTS[styleId];
    if (contract) {
      onSelect(contract);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Style Contract
      </label>
      <div className="space-y-2">
        {styleContracts.map((contract) => {
          const isUsed = usedStyleIds.includes(contract.styleId);
          const isSelected = selectedStyleId === contract.styleId;

          return (
            <button
              key={contract.styleId}
              onClick={() => handleSelect(contract.styleId)}
              disabled={disabled}
              className={`
                w-full text-left px-4 py-3 rounded-lg border-2 transition-all
                ${isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : isUsed
                  ? 'border-gray-200 bg-gray-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">
                      {contract.reference}
                    </span>
                    {isUsed && (
                      <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                        Used
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {contract.voiceDescription}
                  </p>
                </div>
                {isSelected && (
                  <svg
                    className="w-5 h-5 text-blue-500 flex-shrink-0 ml-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

