import React, { useState } from "react";
import { Button, Modal } from "./ui";
import { PageConfig } from "../types";
import { savePageConfig } from "../lib/api";
import { useToast } from "./ToastProvider";
import { AlertCircle } from "lucide-react";

export interface RelinkTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  trackerName: string;
  trackerConfig: PageConfig;
  pageConfigs: Record<string, PageConfig>;
  onRelinkSuccess: (trackerName: string, newSourcePage: string, newConfig: PageConfig) => Promise<void>;
}

export function RelinkTrackerModal({
  isOpen,
  onClose,
  trackerName,
  trackerConfig,
  pageConfigs,
  onRelinkSuccess,
}: RelinkTrackerModalProps) {
  const { toast } = useToast();
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  // Eligible sources: not a tracker
  const eligibleSources = Object.keys(pageConfigs).filter((name) => {
    const conf = pageConfigs[name];
    if (name === trackerName) return false;
    if (conf?.linkedSourcePage && conf.linkedSourcePage.trim() !== "") return false;
    return true;
  });

  const handleConfirm = async () => {
    if (!selectedSource) return;
    if (selectedSource === trackerConfig.linkedSourcePage) {
      toast("Tracker is already linked to this page.");
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      const newConfig: PageConfig = {
        ...trackerConfig,
        linkedSourcePage: selectedSource,
      };

      const res = await savePageConfig(trackerName, newConfig);
      if (!res.ok) {
        throw new Error("Failed to save tracker configuration");
      }

      await onRelinkSuccess(trackerName, selectedSource, newConfig);
      toast("Tracker re-linked successfully!");
      onClose();
    } catch (err: any) {
      console.error(err);
      toast(err.message || "Failed to re-link tracker.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`🔗 Re-link Tracker: ${trackerName}`}
      width="min(500px, 95vw)"
    >
      <div className="flex flex-col gap-4 text-sm text-gray-800">
        <div className="bg-blue-50 text-blue-800 p-3 rounded text-xs border border-blue-100">
          <strong>Current Source:</strong> {trackerConfig.linkedSourcePage || "None"}
        </div>
        
        {eligibleSources.length === 0 ? (
          <div className="text-red-600 bg-red-50 p-3 rounded border border-red-200">
            No eligible source pages found. Create a standard main page first before linking.
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Select New Source Page:
            </label>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={isSaving}
            >
              <option value="" disabled>-- Select a source page --</option>
              {eligibleSources.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        )}

        {selectedSource && (
          <div className="bg-amber-50 text-amber-900 p-3 rounded border border-amber-200 text-xs flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Warning:</strong> Re-linking this tracker to <strong>{selectedSource}</strong> will rebuild its rows from the new source page immediately. 
              Any tracking data for rows that do not exist in the new source page will be <strong>permanently lost</strong>.
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleConfirm} 
            disabled={!selectedSource || isSaving || eligibleSources.length === 0}
          >
            {isSaving ? "Re-linking..." : "Confirm Re-link"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
