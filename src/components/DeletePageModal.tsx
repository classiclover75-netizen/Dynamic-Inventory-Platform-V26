import React, { useState } from "react";
import { Modal } from "./ui";
import { useToast } from "./ToastProvider";

export const DeletePageModal = ({
  isOpen,
  onClose,
  state,
  setState,
  setConfirmationModal,
  onDeletePage,
}: any) => {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();


  if (!isOpen) return null;

  const pages = state.pages || Object.keys(state.pageConfigs);
  const filteredPages = pages.filter((p: string) =>
    p.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = (pageName: string) => {
    if (pages.length <= 1) {
      setConfirmationModal({
        isOpen: true,
        title: "Cannot Delete",
        message: "You must have at least one page in the system.",
        confirmLabel: "Understood",
        onConfirm: () => {},
      });
      return;
    }
    
    onClose();
    onDeletePage(pageName, 2);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Page" width="400px">
      <div className="flex flex-col h-full max-h-[60vh]">
        <input
          type="text"
          placeholder="🔍 Search pages..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full border-2 border-[#d8d8d8] p-2 rounded text-sm mb-3 outline-none focus:border-red-400 font-semibold"
          autoFocus
        />

        <div className="overflow-y-auto flex-1 border border-[#e0e0e0] rounded bg-[#f9fafb] p-1.5">
          {filteredPages.length === 0 ? (
            <div className="text-sm text-gray-500 text-center p-4">
              No pages found.
            </div>
          ) : (
            filteredPages.map((p: string) => (
              <div
                key={p}
                className="flex justify-between items-center p-2 mb-1 border border-gray-200 bg-white rounded shadow-sm hover:bg-red-50 transition-colors group"
              >
                <span className="text-sm font-semibold text-gray-700 truncate mr-2" title={p}>
                  {p}
                </span>
                <button
                  className="px-3 py-1 bg-white text-red-600 border border-red-200 hover:bg-red-600 hover:text-white rounded text-xs font-bold cursor-pointer transition-colors opacity-80 group-hover:opacity-100"
                  onClick={() => handleDelete(p)}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};
