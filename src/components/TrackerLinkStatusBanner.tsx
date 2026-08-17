import React, { useState } from 'react';
import { TrackerLinkHealth } from '../lib/trackerLinkHealth';
import { CheckCircle2, AlertTriangle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

export interface TrackerLinkStatusBannerProps {
  health: TrackerLinkHealth;
}

export function TrackerLinkStatusBanner({ health }: TrackerLinkStatusBannerProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!health || health.status === 'not_a_tracker' || health.status === 'loading' || health.status === 'healthy') {
    return null;
  }

  const toggleDetails = () => setDetailsOpen(prev => !prev);

  const isBroken = health.status === 'broken';
  const containerClass = isBroken
    ? "w-full mb-2 bg-red-50 border border-red-200 rounded-md p-3"
    : "w-full mb-2 bg-amber-50 border border-amber-200 rounded-md p-3";
    
  const Icon = isBroken ? AlertCircle : AlertTriangle;
  const iconColorClass = isBroken ? "text-red-600" : "text-amber-600";
  const textColorClass = isBroken ? "text-red-800" : "text-amber-900";
  const detailsBgClass = isBroken ? "bg-red-100" : "bg-amber-100/50";

  return (
    <div className={containerClass}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Icon size={18} className={`${iconColorClass} shrink-0 mt-0.5`} />
          <div className={`text-sm ${textColorClass}`}>
            {health.issues.map((issue, idx) => (
              <div key={idx} className="mb-1 last:mb-0 font-medium">{issue}</div>
            ))}
          </div>
        </div>
        <button 
          onClick={toggleDetails}
          className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded hover:bg-black/5 transition-colors ${textColorClass} shrink-0`}
        >
          Details {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {detailsOpen && (
        <div className={`mt-3 p-2 rounded text-xs grid grid-cols-2 gap-2 ${detailsBgClass} ${textColorClass}`}>
          <div><strong>Source rows:</strong> {health.sourceRowCount}</div>
          <div><strong>Tracker rows:</strong> {health.trackerRowCount}</div>
          <div><strong>Matched:</strong> {health.matchedRowCount}</div>
          <div><strong>Missing:</strong> {health.missingInTrackerCount}</div>
          <div><strong>Ghost:</strong> {health.ghostRowCount}</div>
        </div>
      )}
    </div>
  );
}
