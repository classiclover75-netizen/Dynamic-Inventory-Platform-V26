import React from "react";

export function useImportExport(deps: {
  state: any;
  setState: any;
  toast: any;
  maxSearchHistory: any;
  setMaxSearchHistory: any;
  setIsExporting: any;
  setExportProgress: any;
  setIsImporting: any;
  setImportProgress: any;
  fileInputRef: any;
}) {
  const {
    state,
    setState,
    toast,
    maxSearchHistory,
    setMaxSearchHistory,
    setIsExporting,
    setExportProgress,
    setIsImporting,
    setImportProgress,
    fileInputRef,
  } = deps;

  const handleExportData = () => {
    window.open("/api/export-zip");
    toast("Export started. Check your downloads.");
  };
  const handleVerifiedExport = async () => {
    setIsExporting(true);
    setExportProgress({ message: "Verifying and packaging backup, please wait...", percent: null });
    try {
      const response = await fetch('/api/export-zip-verified');
      if (!response.ok) {
        const errorData = await response.json();
        toast(errorData.error || "Verified export failed.");
        return;
      }
      
      const contentLength = response.headers.get('Content-Length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      let receivedBytes = 0;
      
      let blob: Blob;
      if (response.body && totalBytes > 0) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedBytes += value.length;
            setExportProgress({
              message: "Downloading verified backup...",
              percent: Math.round((receivedBytes / totalBytes) * 100)
            });
          }
        }
        blob = new Blob(chunks, { type: response.headers.get('Content-Type') || 'application/zip' });
      } else {
        blob = await response.blob();
      }

      const url = window.URL.createObjectURL(blob);
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'Full_Backup_verified.zip';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch && filenameMatch.length === 2) {
          filename = filenameMatch[1];
        }
      }
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast("Verified backup downloaded.");
    } catch (error) {
      console.error(error);
      toast("Verified export failed.");
    } finally {
      setIsExporting(false);
      setExportProgress({ message: "Verifying and packaging backup, please wait...", percent: null });
    }
  };
  const refetchAndHydrateState = async () => {
    try {
      setImportProgress({ message: "Re-syncing UI state...", percent: 99 , currentFile: null });
      const stateRes = await fetch("/api/state");
      if (!stateRes.ok) throw new Error("Server returned " + stateRes.status);
      const stateText = await stateRes.text();
      let stateData;
      try {
        stateData = JSON.parse(stateText);
      } catch (e) {
        throw new Error("Invalid JSON response for state");
      }
      if (!stateData || stateData.error) throw new Error("Failed to fetch state");

      const newPages = stateData.pages || [];
      const newConfigs: Record<string, any> = {};
      const newRows: Record<string, any[]> = {};

      for (const pageName of newPages) {
        const pageRes = await fetch(`/api/pages/${encodeURIComponent(pageName)}`);
        if (pageRes.ok) {
          const pageText = await pageRes.text();
          try {
            const pageData = JSON.parse(pageText);
            if (pageData && !pageData.error) {
              newConfigs[pageName] = pageData.config;
              newRows[pageName] = pageData.rows;
            }
          } catch (e) {
            console.error("Invalid JSON response for page " + pageName);
          }
        }
      }

      let nextActivePage = state.activePage;
      if (!newPages.includes(nextActivePage)) {
        nextActivePage = newPages.length > 0 ? newPages[0] : "";
      }

      if (!Array.isArray(newPages) || newPages.length === 0 || !nextActivePage) {
        console.error("Hydration: imported pages list is empty");
        toast("Import finished but no pages found. Please verify the backup.");
        setImportProgress({ message: "Import finished but no pages found.", percent: null , currentFile: null });
        setIsImporting(false);
        return;
      }

      setState((prev) => ({
        ...prev,
        pages: newPages,
        activePage: nextActivePage,
        pageConfigs: newConfigs,
        pageRows: newRows,
        globalRowNoWidth: stateData.globalRowNoWidth || prev.globalRowNoWidth,
      }));

      if (stateData.maxSearchHistory) {
        setMaxSearchHistory(stateData.maxSearchHistory);
      }

      if (nextActivePage) {
        window.history.replaceState(null, "", "?page=" + encodeURIComponent(nextActivePage));
      }

      setImportProgress({ message: "Data imported successfully!", percent: 100 , currentFile: null });
      toast("Data imported successfully");
      setIsImporting(false);
    } catch (err) {
      console.error("Hydration failed:", err);
      toast("Data imported but UI refresh failed. Please refresh the page manually.");
      setIsImporting(false);
      setImportProgress({ message: "Processing...", percent: null , currentFile: null });
    }
  };
  const handleImportPageData = async (file: File) => {
    const activePage = state.activePage;
    if (!activePage) return;

    setIsImporting(true);
    const isZip = file.name.toLowerCase().endsWith(".zip");
    setImportProgress({
      message: `Processing ${isZip ? "ZIP" : "JSON"} file...`,
      percent: null, currentFile: null
    });

    try {
      if (isZip) {
        const formData = new FormData();
        formData.append("backup", file);

        const response = await fetch("/api/import-zip?stream=1", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) { let errText = "Failed to upload zip"; try { const errData = await response.json(); errText = errData.error || errText; } catch (e) { console.error(e); } throw new Error(errText); } const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finished = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let evt; try { evt = JSON.parse(line); } catch (e) { if (line.toLowerCase().includes("<!doctype html>")) throw new Error("Server returned HTML page"); throw e; }
            if (evt.type === "progress") {
              setImportProgress({ message: evt.message, percent: evt.percent, currentFile: evt.file || null });
            } else if (evt.type === "done") {
              finished = true;
            } else if (evt.type === "error") {
              throw new Error(evt.error || "Import failed");
            }
          }
        }
        if (finished) {
          setImportProgress({ message: "Finalizing...", percent: 100, currentFile: null });
          await refetchAndHydrateState();
        } else {
          throw new Error("Import stream ended unexpectedly");
        }
      } else {
        // Handle JSON
        const text = await file.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          toast("Invalid file format. Please upload a valid JSON file.");
          setIsImporting(false);
          setImportProgress({ message: "Processing...", percent: null , currentFile: null });
          return;
        }

        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });

        if (response.ok) {
          await refetchAndHydrateState();
        } else {
          const errData = await response.json().catch(() => ({}));
          toast(errData.error || "Failed to sync with server");
          setIsImporting(false);
          setImportProgress({ message: "Processing...", percent: null , currentFile: null });
        }
      }
    } catch (err) {
      console.error("Sync error:", err);
      toast("An error occurred during import");
      setIsImporting(false);
      setImportProgress({ message: "Processing...", percent: null , currentFile: null });
    }
  };
  const handleImportData = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const isZip = file.name.toLowerCase().endsWith(".zip");
    setImportProgress({
      message: `Processing ${isZip ? "ZIP" : "JSON"} file...`,
      percent: null, currentFile: null
    });

    try {
      if (isZip) {
        const formData = new FormData();
        formData.append("backup", file);

        const response = await fetch("/api/import-zip?stream=1", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) { let errText = "Failed to upload zip"; try { const errData = await response.json(); errText = errData.error || errText; } catch (e) { console.error(e); } throw new Error(errText); } const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finished = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let evt; try { evt = JSON.parse(line); } catch (e) { if (line.toLowerCase().includes("<!doctype html>")) throw new Error("Server returned HTML page"); throw e; }
            if (evt.type === "progress") {
              setImportProgress({ message: evt.message, percent: evt.percent, currentFile: evt.file || null });
            } else if (evt.type === "done") {
              finished = true;
            } else if (evt.type === "error") {
              throw new Error(evt.error || "Import failed");
            }
          }
        }
        if (finished) {
          setImportProgress({ message: "Finalizing...", percent: 100, currentFile: null });
          await refetchAndHydrateState();
        } else {
          throw new Error("Import stream ended unexpectedly");
        }
      } else {
        // Handle JSON
        const text = await file.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          toast("Invalid file format. Please upload a valid JSON file.");
          setIsImporting(false);
          return;
        }

        const response = await fetch("/api/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        });

        if (response.ok) {
          await refetchAndHydrateState();
        } else {
          const errData = await response.json().catch(() => ({}));
          toast(errData.error || "Failed to sync with server");
          setIsImporting(false);
        }
      }
    } catch (err) {
      console.error("Sync error:", err);
      toast("Error during server sync");
      setIsImporting(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return { handleExportData, handleVerifiedExport, refetchAndHydrateState, handleImportPageData, handleImportData };
}
