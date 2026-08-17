import React from "react";

export const decodeHtmlEntities = (text: string) => {
  if (!text) return text;
  return String(text)
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
};

export const renderHighlightedText = (text: string, highlight: string) => {
  if (!highlight.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${highlight})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <span
            key={i}
            className="bg-yellow-200 text-black px-1 rounded font-bold"
          >
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
};

const parseMultiSourceCache = new Map<any, any[]>();

export const parseMultiSource = (val: any) => {
  if (!val) return [];
  if (parseMultiSourceCache.has(val)) {
    const cached = parseMultiSourceCache.get(val);
    return cached ? cached.map((item: any) => ({ ...item })) : [];
  }

  let result: any[];
  try {
    const parsed = typeof val === "string" ? JSON.parse(val) : val;
    const arr = Array.isArray(parsed) ? parsed : [];
    result = arr;
  } catch (e) {
    // Fallback for legacy flat numbers
    result = [
      {
        source: "Default",
        qty: parseFloat(String(val)) || 0,
        color: "bg-gray-100 text-gray-800 border-gray-200",
      },
    ];
  }
  
  try {
    if (typeof val === 'string' || typeof val === 'number') {
      if (parseMultiSourceCache.size > 5000) {
        parseMultiSourceCache.clear();
      }
      parseMultiSourceCache.set(val, result.map((item: any) => ({ ...item })));
    }
  } catch (e) {
    // Safety fallback
  }
  
  return result.map((item: any) => ({ ...item }));
};
