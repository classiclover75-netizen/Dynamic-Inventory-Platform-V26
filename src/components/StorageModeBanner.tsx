import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export function StorageModeBanner() {
  const [storageMode, setStorageMode] = useState<string | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          setStorageMode(data.storage);
        }
      } catch (e) {
        // silently ignore fetch errors to avoid crashing or breaking UI
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  if (!storageMode || storageMode === 'mongodb') {
    return null;
  }

  return (
    <div className="w-full mb-2 bg-amber-50 border border-amber-200 rounded-md p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900 font-medium">
          Warning: The application is currently running in local file storage mode. Data is not being saved to MongoDB.
        </div>
      </div>
    </div>
  );
}
