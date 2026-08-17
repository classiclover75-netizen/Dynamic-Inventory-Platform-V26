import React, { useState } from 'react';
import { TrackerLinkHealth } from '../lib/trackerLinkHealth';
import { Link } from 'lucide-react';

export interface PageTabLinkIconProps {
  health?: TrackerLinkHealth;
  isActive?: boolean;
}

export function PageTabLinkIcon({ health, isActive }: PageTabLinkIconProps) {
  const [isHovered, setIsHovered] = useState(false);

  if (!health || health.status === 'not_a_tracker' || health.status === 'loading') {
    return null;
  }

  let iconColor = 'text-gray-500';
  if (health.status === 'healthy') {
    iconColor = isActive ? 'text-green-300' : 'text-green-600';
  } else if (health.status === 'out_of_sync') {
    iconColor = isActive ? 'text-amber-300' : 'text-amber-600';
  } else if (health.status === 'broken') {
    iconColor = isActive ? 'text-red-300' : 'text-red-600';
  }

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      tabIndex={0}
    >
      <Link size={14} className={`${iconColor} shrink-0 cursor-default`} />
      {isHovered && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-max max-w-[260px] rounded-md border border-gray-300 bg-white px-2.5 py-2 text-[11px] leading-relaxed text-gray-700 shadow-lg pointer-events-none text-left font-normal">
          <div>Linked to <strong>{health.sourcePageName || 'Unknown'}</strong></div>
          <div>Source rows: {health.sourceRowCount ?? 0}</div>
          <div>Tracker rows: {health.trackerRowCount ?? 0}</div>
          <div>Matched: {health.matchedRowCount ?? 0}</div>
          {health.status !== 'healthy' && health.issues && health.issues.length > 0 && (
            <div className="mt-1 pt-1 border-t border-gray-200 text-red-600">
              {health.issues.map((issue, i) => (
                <div key={i}>{issue}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
