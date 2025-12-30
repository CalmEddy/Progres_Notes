'use client';

interface SearchCollectionBadgeProps {
  className?: string;
}

export default function SearchCollectionBadge({ className = '' }: SearchCollectionBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium text-blue-700 bg-blue-100 rounded ${className}`}
      title="Dynamic search collection - results update automatically"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      Search
    </span>
  );
}

