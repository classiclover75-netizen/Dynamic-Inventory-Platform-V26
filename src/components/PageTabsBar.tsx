import { useToast } from "./ToastProvider";
import { PageTabLinkIcon } from "./PageTabLinkIcon";

export const PageTabsBar = ({ pages, activePage, setState, healthByPage }: any) => {
  const { toast } = useToast();
  return (
      <div className="flex gap-1.5 flex-wrap items-center bg-white border border-[#d8d8d8] rounded-md p-2 min-h-[44px]">
        <div className="flex gap-1.5 flex-wrap items-center flex-1 min-w-0">
          {pages.length === 0 ? (
            <span className="text-xs text-[#90a4ae] font-bold">
              No pages yet. Click Add Page to create one.
            </span>
          ) : (
            pages.map((page: string) => (
              <button
                key={page}
                className={`flex items-center gap-1.5 border border-[#cfd8dc] rounded-full px-2.5 py-1 text-xs font-bold cursor-pointer transition-colors ${page === activePage ? "bg-[#2b579a] text-white border-[#2b579a]" : "bg-[#eceff1] text-[#37474f] hover:bg-gray-200"}`}
                onClick={() => {
                  setState((prev: any) => ({ ...prev, activePage: page }));
                  toast(`Active page: ${page}`);
                }}
              >
                <span>{page}</span>
                <PageTabLinkIcon health={healthByPage?.[page]} isActive={page === activePage} />
              </button>
            ))
          )}
        </div>
      </div>
  );
};
