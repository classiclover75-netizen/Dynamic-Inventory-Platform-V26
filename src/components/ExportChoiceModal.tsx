import React from 'react';
import { Modal, Button } from './ui';

export const ExportChoiceModal = React.memo(({
  isOpen,
  onClose,
  onVerifiedExport,
  onUnverifiedExport
}: {
  isOpen: boolean;
  onClose: () => void;
  onVerifiedExport: () => void;
  onUnverifiedExport: () => void;
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export Backup" width="450px">
      <div className="p-4 flex flex-col gap-4">
        <div>
          <Button 
            className="w-full text-left justify-start mb-1" 
            variant="blue" 
            onClick={() => {
              onVerifiedExport();
              onClose();
            }}
          >
            ✅ Verified Export (Safe + Slow)
          </Button>
          <p className="text-xs text-gray-500 mt-1 pl-2">
            Checks the backup before download (needs temp disk space).
          </p>
        </div>
        
        <div>
          <Button 
            className="w-full text-left justify-start mb-1" 
            variant="outline" 
            onClick={() => {
              onUnverifiedExport();
              onClose();
            }}
          >
            ⚡ Unverified Export (Unsafe + Fast)
          </Button>
          <p className="text-xs text-gray-500 mt-1 pl-2">
            Faster download, but skips verification checks.
          </p>
        </div>
      </div>
    </Modal>
  );
});
