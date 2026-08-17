import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export async function backfillThumbnails(uploadsDir: string) {
  const summary = { scanned: 0, created: 0, skipped: 0, failed: 0 };

  if (!fs.existsSync(uploadsDir)) {
    return summary;
  }

  const files = await fs.promises.readdir(uploadsDir);
  
  const originals = files.filter(f => !f.startsWith('thumb_') && !f.startsWith('.') && f !== 'data.json');
  
  for (const filename of originals) {
    summary.scanned++;
    const originalPath = path.join(uploadsDir, filename);
    const thumbFilename = `thumb_${filename}`;
    const thumbPath = path.join(uploadsDir, thumbFilename);

    if (fs.existsSync(thumbPath)) {
      summary.skipped++;
      continue;
    }

    try {
      await sharp(originalPath)
        .resize({ width: 150, height: 150, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toFile(thumbPath);
      summary.created++;
    } catch (err) {
      console.error(`Failed to generate thumbnail for ${filename}:`, err);
      summary.failed++;
    }
  }

  return summary;
}
