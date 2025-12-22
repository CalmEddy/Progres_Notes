'use client';

import { Tag } from '@/lib/tags/types';

interface TagChipProps {
  tag: Tag;
  onClick?: () => void;
  onRemove?: () => void;
  size?: 'sm' | 'md' | 'lg';
  showRemove?: boolean;
  variant?: 'default' | 'outline';
}

export default function TagChip({
  tag,
  onClick,
  onRemove,
  size = 'md',
  showRemove = false,
  variant = 'default',
}: TagChipProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const color = tag.color || '#6B7280'; // Default gray
  const bgColor = variant === 'outline' ? 'transparent' : color;
  const textColor = variant === 'outline' ? color : getContrastColor(color);
  const borderColor = variant === 'outline' ? color : 'transparent';

  return (
    <span
      className={`
        ${sizeClasses[size]}
        inline-flex items-center gap-1.5 rounded-full font-medium
        transition-all duration-150
        ${onClick ? 'cursor-pointer hover:opacity-80' : ''}
        ${variant === 'outline' ? 'border' : ''}
      `}
      style={{
        backgroundColor: variant === 'default' ? bgColor : undefined,
        color: textColor,
        borderColor: variant === 'outline' ? borderColor : undefined,
      }}
      onClick={onClick}
      title={tag.name}
    >
      <span className="truncate max-w-[200px]">{tag.name}</span>
      {showRemove && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 hover:bg-black/10 rounded-full p-0.5 transition-colors"
          aria-label={`Remove ${tag.name}`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

/**
 * Get a contrasting text color (black or white) based on background color brightness
 */
function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Calculate brightness using relative luminance formula
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  
  // Return black for light backgrounds, white for dark backgrounds
  return brightness > 128 ? '#000000' : '#FFFFFF';
}

