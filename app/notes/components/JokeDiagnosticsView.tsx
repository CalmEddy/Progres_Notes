'use client';

import { useMemo, useState } from 'react';
import {
  alignJokesWithDiagnostics,
  applyDiagnosticsFilters,
  getTopFailureFlags,
  PUNCH_STRENGTH_OPTIONS,
  RESOLUTION_TYPE_OPTIONS,
  sortJokesByDiagnostics,
  splitJokesFromText,
  summarizeDiagnostics,
  type JokeDiagnostics,
  type PunchStrength,
  type ResolutionType,
} from '@/lib/jokeDiagnostics';

interface JokeDiagnosticsViewProps {
  body: string;
  diagnostics?: JokeDiagnostics[] | null;
}

const strengthStyles: Record<string, string> = {
  Strong: 'bg-green-100 text-green-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  Soft: 'bg-red-100 text-red-700',
  'N/A': 'bg-gray-100 text-gray-600',
};

function getShortIrreversibility(value?: string) {
  if (!value) return '—';
  return value === 'High' ? 'H' : value === 'Medium' ? 'M' : 'L';
}

function getShortSpecificity(value?: string) {
  if (!value) return '—';
  return value === 'Concrete' ? 'C' : value === 'Mixed' ? 'M' : 'V';
}

function getFailureFlagLabel(count: number) {
  if (count === 0) return '0';
  if (count <= 2) return '1-2';
  return '3+';
}

export default function JokeDiagnosticsView({ body, diagnostics }: JokeDiagnosticsViewProps) {
  const jokes = useMemo(() => splitJokesFromText(body), [body]);
  const aligned = useMemo(() => alignJokesWithDiagnostics(jokes, diagnostics), [jokes, diagnostics]);
  const summary = useMemo(() => summarizeDiagnostics(aligned), [aligned]);
  const topFlags = useMemo(() => getTopFailureFlags(summary), [summary]);

  const [punchStrengthFilter, setPunchStrengthFilter] = useState<PunchStrength | 'All'>('All');
  const [resolutionTypeFilter, setResolutionTypeFilter] = useState<ResolutionType | 'All'>('All');
  const [strongOnly, setStrongOnly] = useState(false);
  const [sortByStrength, setSortByStrength] = useState(true);

  const filtered = useMemo(() => {
    return applyDiagnosticsFilters(aligned, {
      punchStrength: punchStrengthFilter,
      resolutionType: resolutionTypeFilter,
      strongOnly,
    });
  }, [aligned, punchStrengthFilter, resolutionTypeFilter, strongOnly]);

  const visibleJokes = useMemo(() => {
    return sortByStrength ? sortJokesByDiagnostics(filtered) : filtered;
  }, [filtered, sortByStrength]);

  return (
    <div className="space-y-6">
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase">Punch Strength</label>
            <select
              value={punchStrengthFilter}
              onChange={event => setPunchStrengthFilter(event.target.value as PunchStrength | 'All')}
              className="mt-1 text-sm border border-gray-300 rounded-md px-2 py-1 bg-white"
            >
              <option value="All">All</option>
              {PUNCH_STRENGTH_OPTIONS.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase">Resolution Type</label>
            <select
              value={resolutionTypeFilter}
              onChange={event => setResolutionTypeFilter(event.target.value as ResolutionType | 'All')}
              className="mt-1 text-sm border border-gray-300 rounded-md px-2 py-1 bg-white"
            >
              <option value="All">All</option>
              {RESOLUTION_TYPE_OPTIONS.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={strongOnly}
              onChange={event => setStrongOnly(event.target.checked)}
              className="rounded border-gray-300 text-blue-600"
            />
            Show only Strong
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={sortByStrength}
              onChange={event => setSortByStrength(event.target.checked)}
              className="rounded border-gray-300 text-blue-600"
            />
            Sort by Strength
          </label>
          <div className="text-sm text-gray-600">
            Strong: {summary.strong} | Medium: {summary.medium} | Soft: {summary.soft}
          </div>
        </div>
        <details className="mt-3 text-sm text-gray-600">
          <summary className="cursor-pointer font-medium">Diagnostics overview</summary>
          <div className="mt-2 flex flex-wrap gap-3">
            {topFlags.length === 0 ? (
              <span className="text-gray-500">No failure flags detected.</span>
            ) : (
              topFlags.map(flag => (
                <span
                  key={flag.flag}
                  className="px-2 py-1 rounded-full bg-white border border-gray-200 text-xs"
                >
                  {flag.flag}: {flag.count}
                </span>
              ))
            )}
          </div>
        </details>
      </div>

      <div className="space-y-4">
        {visibleJokes.map((item, index) => {
          const diagnosticsItem = item.diagnostics;
          const punchStrength = diagnosticsItem?.punchStrength ?? 'N/A';
          const resolutionType = diagnosticsItem?.resolutionType ?? 'N/A';
          const irreversibility = diagnosticsItem?.irreversibility;
          const specificity = diagnosticsItem?.specificity;
          const failureFlags = diagnosticsItem?.failureFlags ?? [];
          const failureLabel = getFailureFlagLabel(failureFlags.length);
          const failureTitle = failureFlags.length > 0 ? failureFlags.join(', ') : 'No failure flags';

          return (
            <div key={`${index}-${item.joke.substring(0, 12)}`} className="border border-gray-200 rounded-lg p-4 bg-white">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 mb-3">
                <span className={`px-2 py-0.5 rounded-full font-semibold ${strengthStyles[punchStrength] || strengthStyles['N/A']}`}>
                  {punchStrength}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                  {resolutionType}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                  Irrev: {getShortIrreversibility(irreversibility)}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                  Spec: {getShortSpecificity(specificity)}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700"
                  title={failureTitle}
                >
                  Flags: {failureLabel}
                </span>
              </div>
              <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{item.joke}</p>
            </div>
          );
        })}
        {visibleJokes.length === 0 && (
          <div className="text-sm text-gray-500">No jokes match the current filters.</div>
        )}
      </div>
    </div>
  );
}
