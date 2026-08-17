import { Button } from "./ui";
import { Plus, Settings } from "lucide-react";
import { useToast } from "./ToastProvider";

export const TopHeaderBar = ({
  activePage,
  showTopSettings,
  setShowTopSettings,
  settingsRef,
  fileInputRef,
  toggleModal,
  maxSearchHistory,
  setTempHistoryLimit,
  setShowHistoryLimitModal,
  setConfirmationModal,
  setClearDBModal,
  localSettings,
  handleUpdateLocalSetting,
  handleImportData,
  setIsDeletePageModalOpen,
}: any) => {
  const { toast } = useToast();
  return (
      <div className="flex justify-between items-center bg-white border border-[#d8d8d8] rounded-md p-2 px-2.5">
        <div className="text-[19px] font-bold text-[#2c3e50]">
          📦 Dynamic Inventory Platform{" "}
          <span className="text-[#217346] text-sm">(Pro Classic Visual)</span>
        </div>
        <div className="flex gap-1.5 flex-wrap items-center relative">
          <Button
            variant="dark"
            onClick={() => toggleModal("createPage", true)}
          >
            <Plus size={14} /> Add Page
          </Button>
          <div className="relative inline-block" ref={settingsRef}>
            <Button
              variant="dark"
              onClick={() => setShowTopSettings(!showTopSettings)}
            >
              <Settings size={14} /> Settings
            </Button>
            {showTopSettings && (
              <div className="absolute right-0 top-[calc(100%+6px)] w-[260px] bg-white border border-[#d7dde1] rounded-md shadow-xl p-2 z-50">
                <div className="text-[11px] font-bold text-[#607d8b] border-b border-[#eceff1] mb-2 pb-1.5 uppercase tracking-wide">
                  Settings
                </div>
                <div className="text-xs text-[#607d8b] px-1 pb-2 font-bold">
                  Active Page:{" "}
                  <span className="text-gray-800">
                    {activePage || "No page selected"}
                  </span>
                </div>
                <button
                  className="w-full text-left border-0 rounded bg-[#f4f6f8] text-[#263238] text-xs font-bold p-2 cursor-pointer hover:bg-[#e8edf2] disabled:opacity-55 disabled:cursor-not-allowed"
                  disabled={!activePage}
                  onClick={() => {
                    setShowTopSettings(false);
                    toggleModal("activePageSettings", true);
                  }}
                >
                  ⚙️ Active Page Settings{" "}
                  {activePage ? `(${activePage})` : ""}
                </button>

                <div className="text-[11px] font-bold text-[#607d8b] border-b border-[#eceff1] mb-2 mt-3 pb-1.5 uppercase tracking-wide">
                  Global Settings
                </div>
                <button
                  className="w-full text-left border-0 rounded bg-[#f4f6f8] text-[#263238] text-xs font-bold p-2 cursor-pointer hover:bg-[#e8edf2] mb-1"
                  onClick={() => {
                    setShowTopSettings(false);
                    setTempHistoryLimit(maxSearchHistory);
                    setShowHistoryLimitModal(true);
                  }}
                >
                  🕒 Search History Limit
                </button>

                <div className="text-[11px] font-bold text-[#607d8b] border-b border-[#eceff1] mb-2 mt-3 pb-1.5 uppercase tracking-wide">
                  Pages Reorder
                </div>
                <button
                  className="w-full text-left border-0 rounded bg-[#f4f6f8] text-[#263238] text-xs font-bold p-2 cursor-pointer hover:bg-[#e8edf2] mb-1"
                  onClick={() => {
                    setShowTopSettings(false);
                    toggleModal("reorderPages", true);
                  }}
                >
                  🔄 Pages Reorder
                </button>

                <div className="text-[11px] font-bold text-[#607d8b] border-b border-[#eceff1] mb-2 mt-3 pb-1.5 uppercase tracking-wide">
                  DATA BACKUP:
                </div>
                <button
                  className="w-full text-left border-0 rounded bg-[#f4f6f8] text-[#263238] text-xs font-bold p-2 cursor-pointer hover:bg-[#e8edf2] mb-1"
                  onClick={() => {
                    setShowTopSettings(false);
                    toggleModal("exportChoice", true);
                  }}
                >
                  💾 Export Backup
                </button>
                <button
                  className="w-full text-left border-0 rounded bg-[#f4f6f8] text-[#263238] text-xs font-bold p-2 cursor-pointer hover:bg-[#e8edf2]"
                  onClick={() => {
                    setShowTopSettings(false);
                    setTimeout(() => {
                      fileInputRef.current?.click();
                    }, 50);
                  }}
                >
                  📂 Import Backup (JSON/ZIP)
                </button>

                <div className="text-[11px] font-bold text-blue-600 border-b border-blue-100 mb-2 mt-3 pb-1.5 uppercase tracking-wide">
                  Device Specific (This PC Only)
                </div>
                <div className="flex items-center justify-between p-2 bg-[#f4f6f8] rounded mb-1">
                  <span className="text-xs font-bold text-[#263238]">
                    Highlight Scroll Position
                  </span>
                  <button
                    className={`px-3 py-1 rounded text-[10px] font-bold border-0 cursor-pointer ${localSettings.ghostHighlight ? "bg-green-600 text-white" : "bg-gray-400 text-white"}`}
                    onClick={() =>
                      handleUpdateLocalSetting(
                        "ghostHighlight",
                        !localSettings.ghostHighlight,
                      )
                    }
                  >
                    {localSettings.ghostHighlight ? "ON" : "OFF"}
                  </button>
                </div>

                <div className="text-[11px] font-bold text-red-600 border-b border-red-100 mb-2 mt-3 pb-1.5 uppercase tracking-wide">
                  DANGER ZONE
                </div>
                <button
                  className="w-full text-left border-0 rounded bg-orange-50 text-orange-700 text-xs font-bold p-2 cursor-pointer hover:bg-orange-100 mb-1 mt-1"
                  onClick={() => {
                    setShowTopSettings(false);
                    setIsDeletePageModalOpen(true);
                  }}
                >
                  🗑️ Delete Page
                </button>

                <button
                  className="w-full text-left border-0 rounded bg-blue-50 text-blue-700 text-xs font-bold p-2 cursor-pointer hover:bg-blue-100 mb-2"
                  onClick={async () => {
                    setShowTopSettings(false);
                    try {
                      toast("Migration started. Please wait...");
                      const response = await fetch(
                        "/api/admin/migrate-images",
                        { method: "POST" },
                      );
                      let data: any = {}; try { data = await response.json(); } catch(e) {}
                      if (data.success) {
                        toast(`Migrated ${data.count} images successfully!`);

                        if (data.brokenImages && data.brokenImages.length > 0) {
                          const message =
                            `Found ${data.brokenImages.length} broken images. Please check these rows:\n\n` +
                            data.brokenImages
                              .map(
                                (b: any) =>
                                  `[${b.page}] -> Row ID [${b.rowId}] -> Column [${b.column}]`,
                              )
                              .join("\n");

                          setTimeout(() => {
                            setConfirmationModal({
                              isOpen: true,
                              title: "Missing Files Detected",
                              message: message,
                              confirmLabel: "Understood",
                              onConfirm: () => {
                                if (data.count > 0) window.location.reload();
                              },
                            });
                          }, 500);
                        } else if (data.count > 0) {
                          setTimeout(() => window.location.reload(), 2000);
                        }
                      } else {
                        toast("Migration failed");
                      }
                    } catch (err) {
                      console.error(err);
                      toast("Migration failed");
                    }
                  }}
                >
                  🚀 Migrate All Images
                </button>

                <button
                  className="w-full text-left border-0 rounded bg-green-50 text-green-700 text-xs font-bold p-2 cursor-pointer hover:bg-green-100 mb-2"
                  onClick={async () => {
                    setShowTopSettings(false);
                    try {
                      toast("Backfilling thumbnails. Please wait...");
                      const response = await fetch("/api/admin/backfill-thumbnails", { method: "POST" });
                      const data = await response.json();
                      if (response.ok) {
                        toast(`Backfill complete! Scanned: ${data.scanned}, Created: ${data.created}, Skipped: ${data.skipped}, Failed: ${data.failed}`);
                      } else {
                        toast("Backfill failed: " + (data.error || 'Unknown error'));
                      }
                    } catch (err) {
                      console.error(err);
                      toast("Backfill failed");
                    }
                  }}
                >
                  🖼️ Backfill Thumbnails
                </button>
                <button
                  className="w-full text-left border-0 rounded bg-red-50 text-red-700 text-xs font-bold p-2 cursor-pointer hover:bg-red-100 mb-1"
                  onClick={() => {
                    setShowTopSettings(false);
                    setClearDBModal({
                      isOpen: true,
                      step: 1,
                      yesLeft: Math.random() > 0.5,
                    });
                  }}
                >
                  🗑️ Clear DB (Zero State)
                </button>
              </div>
            )}
            <input
              type="file"
              accept=".json,.zip"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleImportData}
            />
          </div>
        </div>
      </div>
  );
};
