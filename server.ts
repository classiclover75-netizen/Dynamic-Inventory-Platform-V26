import { backfillThumbnails } from './src/server/backfillThumbnails';
import express from 'express';
import mongoose from 'mongoose';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import crypto from 'crypto';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import unzipper from 'unzipper';
import multer from 'multer';
import { getPartnerPageNames } from './src/server/trackerLinkGuard';
import { connectDatabase, syncDatabaseParity, getStorageMode } from './src/server/dbConnection';
import { sendSafeError } from './src/server/errorResponse';


const upload = multer({
  dest: 'temp_uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 2000
  }
});

function cleanupTempFiles(files: any) {
  if (!Array.isArray(files)) return;
  for (const entry of files) {
    if (entry === null || entry === undefined) continue;
    let targetPath: string | undefined;
    if (typeof entry === 'string') {
      targetPath = entry;
    } else if (typeof entry === 'object' && typeof entry.path === 'string') {
      targetPath = entry.path;
    }
    if (targetPath && fs.existsSync(targetPath)) {
      try {
        fs.unlinkSync(targetPath);
      } catch (e) {
      }
    }
  }
}

function purgeTempUploadsOnStartup() {
  try {
    const tempDir = path.join(process.cwd(), 'temp_uploads');
    if (!fs.existsSync(tempDir)) return;
    const entries = fs.readdirSync(tempDir, { withFileTypes: true });
    let removed = 0;
    for (const entry of entries) {
      if (entry.isFile()) {
        try {
          fs.unlinkSync(path.join(tempDir, entry.name));
          removed++;
        } catch (e) {
        }
      }
    }
    if (removed > 0) {
      console.log(`Removed ${removed} leftover temp upload files.`);
    }
  } catch (e) {
  }
}

const app = express();
const PORT = (() => {
  const envPort = process.env.PORT;
  if (envPort && envPort !== '') {
    const num = Number(envPort);
    if (Number.isInteger(num) && num >= 1 && num <= 65535) {
      return num;
    }
  }
  return 3000;
})();

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'tiff', 'svg', 'heic'];

function deleteImageFile(filename: string) {
  try {
    const originalPath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(originalPath)) {
      fs.unlinkSync(originalPath);
    }
    const thumbFilename = `thumb_${filename}`;
    const thumbPath = path.join(UPLOADS_DIR, thumbFilename);
    if (fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath);
    }
  } catch (err) {
    console.error(`Failed to delete image file ${filename}:`, err);
  }
}

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.get('/api/health', (req, res) => {
  const modeInfo = getStorageMode();
  res.json({
    status: 'ok',
    storage: modeInfo.mode,
    mongoConnected: isUsingMongoDB,
    transactionsSupported: (transactionsSupported === null || transactionsSupported === undefined) ? 'unknown' : (transactionsSupported ? 'enabled' : 'disabled'),
    connectedAt: modeInfo.connectedAt
  });
});

app.get('/uploads/thumb/:filename', async (req, res, next) => {
  try {
    const { filename } = req.params;
    const sanitizedFilename = path.basename(filename);
    
    if (!sanitizedFilename || sanitizedFilename !== filename || sanitizedFilename === '.' || sanitizedFilename === '..') {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const originalPath = path.join(UPLOADS_DIR, sanitizedFilename);
    const thumbFilename = `thumb_${sanitizedFilename}`;
    const thumbPath = path.join(UPLOADS_DIR, thumbFilename);

    if (!fs.existsSync(originalPath)) {
      return res.status(404).send('Not found');
    }

    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'inline');

    if (fs.existsSync(thumbPath)) {
      return res.sendFile(thumbPath);
    }

    try {
      await sharp(originalPath)
        .resize({ width: 150, height: 150, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toFile(thumbPath);
      return res.sendFile(thumbPath);
    } catch (sharpErr) {
      console.error('Thumbnail generation failed, serving original:', sharpErr);
      return res.sendFile(originalPath);
    }
  } catch (err) {
    next(err);
  }
});

app.use('/uploads', express.static(UPLOADS_DIR, {
  setHeaders: (res, path, stat) => {
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Disposition', 'inline');
  }
}));

app.get('/api/image-usage', async (req, res) => {
  try {
    const filename = req.query.filename as string;
    const sanitizedFilename = path.basename(filename || '');

    if (!sanitizedFilename || sanitizedFilename !== filename || sanitizedFilename === '.' || sanitizedFilename === '..') {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const referencingRows: any[] = [];
    let count = 0;

    const checkRow = (row: any, pageName: string, rowNumber: number) => {
      let references = false;
      for (const [key, val] of Object.entries(row)) {
        if (key === 'id') continue;
        let s = null;
        if (typeof val === 'string') {
          s = val;
        } else if (val && typeof val === 'object' && typeof (val as any).data === 'string') {
          s = (val as any).data;
        }
        if (s === sanitizedFilename) {
          references = true;
          break;
        }
      }
      if (references) {
        count++;
        referencingRows.push({ pageName, rowId: row.id, rowNumber });
      }
    };

    if (isUsingMongoDB) {
      const sortedRows = await getSortedPageRows({});
      let currentPageName = null;
      let rowNumber = 0;
      for (const row of sortedRows) {
        if (row.pageName !== currentPageName) {
          currentPageName = row.pageName;
          rowNumber = 1;
        } else {
          rowNumber++;
        }
        checkRow(row.data, row.pageName, rowNumber);
      }
    } else {
      const db = await getLocalDB();
      for (const p of db.pages) {
        const rows = p.rows || [];
        rows.forEach((row: any, index: number) => {
          checkRow(row, p.name, index + 1);
        });
      }
    }

    res.json({ ok: true, count, rows: referencingRows });
  } catch (err: any) {
    console.error("GET /api/image-usage Error:", err);
    res.status(500).json({ error: 'Failed to fetch image usage' });
  }
});

let isUsingMongoDB = false;

connectDatabase({
  onConnectionEstablished: () => {
    isUsingMongoDB = true;
  },
  onConnected: async () => {
    await syncDatabaseParity({
      Page,
      PageRow,
      AppSettings,
      getSortedPageRows,
      localDbPath: LOCAL_DB_PATH
    });
  }
}).then(result => {
  isUsingMongoDB = result.usingMongoDB;
}).catch(err => console.error("Database connection failed:", err));

// Local Storage Fallback Logic
const LOCAL_DB_PATH = path.join(process.cwd(), 'db.json');

async function getLocalDB() {
  try {
    const data = await fs.promises.readFile(LOCAL_DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { pages: [], settings: {} };
  }
}

async function saveLocalDB(data: any) {
  const tmpPath = `${LOCAL_DB_PATH}.tmp`;
  await fs.promises.writeFile(tmpPath, JSON.stringify(data));
  await fs.promises.rename(tmpPath, LOCAL_DB_PATH);
}


let localBackupTimeout: NodeJS.Timeout | null = null;
let isBackupRunning = false;
let pendingBackup = false;

async function performLocalBackup() {
  if (!isUsingMongoDB) return;
  if (isBackupRunning) {
    pendingBackup = true;
    return;
  }
  isBackupRunning = true;
  try {
    const pages = await Page.find({});
    const pageRows = await getSortedPageRows({});
    const settings = await AppSettings.findOne({});
    
    const rowsByPage = new Map();
    for (const row of pageRows) {
      const pName = row.pageName;
      let group = rowsByPage.get(pName);
      if (!group) {
        group = [];
        rowsByPage.set(pName, group);
      }
      group.push(row.data);
    }

    const localPagesList = [];
    for (const page of pages) {
      const rowsForPage = rowsByPage.get(page.name) || [];
      localPagesList.push({
        name: page.name,
        config: page.config,
        rows: rowsForPage
      });
    }
    
    const newLocalDb = {
      pages: localPagesList,
      settings: settings ? {
        globalCopyBoxes: settings.globalCopyBoxes,
        globalRowNoWidth: settings.globalRowNoWidth,
        maxSearchHistory: settings.maxSearchHistory,
        sourceSuggestionsEnabled: settings.sourceSuggestionsEnabled
      } : {}
    };
    await fs.promises.writeFile(LOCAL_DB_PATH, JSON.stringify(newLocalDb));
  } catch (err) {
    console.error('Failed to update local db.json backup:', err);
  } finally {
    isBackupRunning = false;
    if (pendingBackup) {
      pendingBackup = false;
      triggerLocalBackup(0);
    }
  }
}

function triggerLocalBackup(delayMs = 3000): Promise<void> {
  if (!isUsingMongoDB) return Promise.resolve();
  if (localBackupTimeout) {
    clearTimeout(localBackupTimeout);
  }
  localBackupTimeout = setTimeout(() => {
    localBackupTimeout = null;
    performLocalBackup();
  }, delayMs);
  return Promise.resolve();
}

// Image Helpers
async function processRowImages(row: any, forceSave = false, providedCache?: Map<string, Promise<string>>) {
  const newRow = { ...row };
  const writePromises: Promise<void>[] = [];
  const safeId = row.id ? String(row.id).replace(/[^a-zA-Z0-9_\-]/g, '') : uuidv4();

  for (const key in newRow) {
    if (key === 'id') continue;
    const value = newRow[key];
    let imgVal = value;
    const isObject = typeof value === 'object' && value !== null && typeof value.data === 'string';
    if (isObject) {
      imgVal = value.data;
    }

    if (typeof imgVal === 'string') {
      // The value is already a local filename reference or regular text.
      // DO NOT re-process, DO NOT rename, DO NOT check if it matches row.id.
      // Allow multiple rows to share this exact filename.
      // Detect "already processed" by checking whether the value is a plain local filename that exists in uploads
      if (!imgVal.startsWith('http') && !imgVal.startsWith('data:') && !imgVal.startsWith('blob:')) {
        // Fast path: if it's already a local filename in UPLOADS_DIR, skip it entirely
        if (fs.existsSync(path.join(UPLOADS_DIR, imgVal))) {
          continue;
        }
        // If it doesn't exist but also isn't a URL, still skip (it might just be regular text)
        continue;
      }

      let isImage = false;
      let shouldProcess = false;

      if (/^https?:\/\//i.test(imgVal)) {
        isImage = true;
        if (imgVal.includes('/uploads/')) {
          const matchedFilename = imgVal.split('/uploads/').pop()?.split('?')[0];
          // If it's a URL to local uploads and the file exists, leave it as is
          if (matchedFilename && fs.existsSync(path.join(UPLOADS_DIR, matchedFilename))) {
            newRow[key] = isObject ? { ...value, data: matchedFilename } : matchedFilename;
            continue;
          } else {
             shouldProcess = true;
          }
        } else {
          shouldProcess = true;
        }
      } else if (imgVal.startsWith('data:image/')) {
        isImage = true;
        shouldProcess = true;
      }

      if (isImage && shouldProcess) {
        let cacheKey = imgVal;
        if (imgVal.startsWith('data:image/')) {
          cacheKey = crypto.createHash('md5').update(imgVal).digest('hex');
        }

        let processPromise: Promise<string>;
        if (providedCache && providedCache.has(cacheKey)) {
          processPromise = providedCache.get(cacheKey)!;
        } else {
          processPromise = (async () => {
            let buffer: Buffer | null = null;
          let ext = 'jpg';

          if (imgVal.startsWith('data:image/')) {
            const parts = imgVal.split(';base64,');
            const mimeType = parts[0].replace('data:image/', '');
            ext = mimeType.split('+')[0];
            if (ext === 'jpeg') ext = 'jpg';
            if (!ext) ext = 'png';
            buffer = Buffer.from(parts[1], 'base64');
          } else if (/^[a-zA-Z0-9_\-\.]+\.(png|jpg|jpeg|webp|gif|avif|tiff)$/i.test(imgVal)) {
            buffer = await fs.promises.readFile(path.join(UPLOADS_DIR, imgVal));
            ext = imgVal.split('.').pop() || 'jpg';
          } else if (/^https?:\/\//i.test(imgVal)) {
            const response = await fetch(imgVal);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            const contentType = response.headers.get('content-type');
            if (contentType) {
               if (contentType.includes('png')) ext = 'png';
               else if (contentType.includes('gif')) ext = 'gif';
               else if (contentType.includes('webp')) ext = 'webp';
            }
          }

          if (!buffer) throw new Error('Could not resolve image buffer');

          let skipSharp = false;
          if (buffer.byteLength <= 100 * 1024 && forceSave) skipSharp = true;

          if (!skipSharp) {
            try {
              const metadata = await sharp(buffer).metadata();
              if (buffer.byteLength > 300 * 1024 || (metadata.width && metadata.width > 1200) || (metadata.height && metadata.height > 1200)) {
                buffer = await sharp(buffer)
                  .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
                  .jpeg({ quality: 80 })
                  .toBuffer();
                ext = 'jpg';
              }
            } catch (sharpError) {
              if (!forceSave) throw new Error('SHARP_UNSUPPORTED_FORMAT');
              console.error("Sharp error", sharpError);
            }
          }

          const filename = `${safeId}_${uuidv4().substring(0,8)}.${ext}`;
          const filepath = path.join(UPLOADS_DIR, filename);
          await fs.promises.writeFile(filepath, buffer);
          
          try {
            const thumbFilename = `thumb_${filename}`;
            const thumbPath = path.join(UPLOADS_DIR, thumbFilename);
            await sharp(buffer)
              .resize({ width: 150, height: 150, fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 70 })
              .toFile(thumbPath);
          } catch (e) {
            console.error("Failed to generate thumb on upload:", e);
          }
          
          return filename;
        })();

          if (providedCache) {
            providedCache.set(cacheKey, processPromise);
          }
        }

        writePromises.push((async () => {
          try {
            const filename = await processPromise;
            newRow[key] = isObject ? { ...value, data: filename } : filename;
          } catch (err: any) {
            throw new Error(`Failed to process image for column "${key}": ${err.message}`);
          }
        })());
      }
    }
  }
  await Promise.all(writePromises);
  return newRow;
}

async function processRowsConcurrently(rows: any[], limit = 50, forceSave = false, providedCache?: Map<string, Promise<string>>) {
  const imageProcessingCache = providedCache || new Map<string, Promise<string>>();
  const results = [];
  for (let i = 0; i < rows.length; i += limit) {
    const chunk = rows.slice(i, i + limit);
    const chunkResults = await Promise.all(chunk.map(r => processRowImages(r, forceSave, imageProcessingCache)));
    results.push(...chunkResults);
    // Yield to event loop to avoid blocking during large batches
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return results;
}

async function cleanupOrphanImages(oldRows: any[], newRows: any[], skipDbCheck = false, excludePageName?: string) {
  const oldFiles = new Set<string>();
  const newFiles = new Set<string>();
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

  const extractFiles = (rows: any[], set: Set<string>) => {
    rows.forEach(row => {
      Object.values(row).forEach(value => {
        let val = value;
        if (typeof value === 'object' && value !== null && typeof (value as any).data === 'string') {
          val = (value as any).data;
        }
        if (typeof val === 'string') {
          if (val.includes('/uploads/')) {
            val = val.split('/uploads/').pop() || val;
          }
          const strVal = val as string;
          if (imageExtensions.some(ext => strVal.toLowerCase().endsWith(ext)) && !/^https?:\/\//i.test(strVal)) {
            set.add(strVal);
          }
        }
      });
    });
  };

  extractFiles(oldRows, oldFiles);
  extractFiles(newRows, newFiles);

  const candidates = new Set<string>();
  oldFiles.forEach(file => {
    if (!newFiles.has(file)) {
      candidates.add(file);
    }
  });

  if (candidates.size === 0) return;

  const oldRowIds = new Set(oldRows.map(r => String(r.id)));

  if (!skipDbCheck) {
    const processRows = (rows: any[]) => {
      for (const row of rows) {
        const tempSet = new Set<string>();
        extractFiles([row], tempSet);
        for (const file of candidates) {
          if (tempSet.has(file)) {
            candidates.delete(file);
          }
        }
        if (candidates.size === 0) return true;
      }
      return false;
    };

    if (isUsingMongoDB) {
      if (excludePageName) {
        const remainingRecords = await getSortedPageRows({ pageName: { $ne: excludePageName } });
        processRows(remainingRecords.map((r: any) => r.data));
      } else {
        const allRecords = await getSortedPageRows({});
        const remainingRecords = allRecords.filter((r: any) => !oldRowIds.has(String(r.data.id)));
        processRows(remainingRecords.map((r: any) => r.data));
      }
    } else {
      const db = await getLocalDB();
      for (const p of db.pages) {
        if (excludePageName && p.name === excludePageName) continue;
        if (p.rows) {
          const remainingRows = excludePageName ? p.rows : p.rows.filter((r: any) => !oldRowIds.has(String(r.id)));
          if (processRows(remainingRows)) break;
        }
      }
    }
  }

  candidates.forEach(file => {
    deleteImageFile(file);
  });
}

async function diskSweepOrphans(allNewRows: any[]) {
  if (!fs.existsSync(UPLOADS_DIR)) return;
  
  const keepSet = new Set<string>();

  const extractFiles = (rows: any[], set: Set<string>) => {
    rows.forEach(row => {
      Object.values(row).forEach(value => {
        let val = value;
        if (typeof value === 'object' && value !== null && typeof (value as any).data === 'string') {
          val = (value as any).data;
        }
        if (typeof val === 'string') {
          if (val.includes('/uploads/')) {
            val = val.split('/uploads/').pop() || val;
          }
          let strVal = val as string;
          strVal = strVal.split('?')[0]; // Remove cache busters if any
          const ext = strVal.split('.').pop()?.toLowerCase() || '';
          if (ALLOWED_IMAGE_EXTENSIONS.includes(ext) && !/^https?:\/\//i.test(strVal)) {
            set.add(strVal);
          }
        }
      });
    });
  };

  extractFiles(allNewRows, keepSet);

  try {
    const filesOnDisk = fs.readdirSync(UPLOADS_DIR);
    for (const file of filesOnDisk) {
      if (file === '.gitkeep' || file === 'dummy.txt') continue;
      
      const ext = file.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext) && ext !== 'blob') {
         continue; 
      }

      let originalName = file;
      if (file.startsWith('thumb_')) {
         originalName = file.substring(6);
      }

      if (!keepSet.has(originalName)) {
        deleteImageFile(originalName);
      }
    }
  } catch (err) {
    console.error("diskSweepOrphans failed:", err);
  }
}

// Mongoose Schema
const pageSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  config: { type: mongoose.Schema.Types.Mixed, default: {} },
  rowsVersion: { type: Number, default: 0 }
});
const Page = mongoose.model('Page', pageSchema);

const pageRowSchema = new mongoose.Schema({
  pageName: { type: String, required: true },
  order: { type: Number, default: () => Date.now() },
  data: { type: mongoose.Schema.Types.Mixed, required: true }
});
pageRowSchema.index({ pageName: 1, order: 1, 'data.id': 1 });
pageRowSchema.index({ pageName: 1, 'data.id': 1 });
pageRowSchema.index({ 'data.id': 1 });
const PageRow = mongoose.model('PageRow', pageRowSchema);

// Helper function to safely get rows sorted, and perform one-time order migration if needed.
async function getSortedPageRows(query: any = {}) {
  const rows = await PageRow.find(query).sort({ pageName: 1, order: 1, _id: 1 }).lean();
  
  const pagesToMigrate = new Set<string>();
  rows.forEach((r: any) => {
    if (typeof r.order !== 'number') {
      pagesToMigrate.add(r.pageName);
    }
  });

  if (pagesToMigrate.size > 0) {
    const bulkOps: any[] = [];
    const pageGroups = new Map<string, any[]>();
    
    rows.forEach((r: any) => {
      if (!pageGroups.has(r.pageName)) pageGroups.set(r.pageName, []);
      pageGroups.get(r.pageName)!.push(r);
    });
    
    for (const pageName of pagesToMigrate) {
      const groupRows = pageGroups.get(pageName)!;
      groupRows.forEach((r, index) => {
        r.order = index;
        bulkOps.push({
          updateOne: {
            filter: { _id: r._id },
            update: { $set: { order: index } }
          }
        });
      });
    }
    
    if (bulkOps.length > 0) {
      try {
        await PageRow.bulkWrite(bulkOps);
        console.log(`Migrated order field for ${bulkOps.length} rows in pages: ${Array.from(pagesToMigrate).join(', ')}`);
      } catch (e) {
        console.error("Migration bulkWrite failed:", e);
      }
    }
  }
  
  return rows;
}


const settingsSchema = new mongoose.Schema({
  globalCopyBoxes: mongoose.Schema.Types.Mixed,
  globalRowNoWidth: Number,
  maxSearchHistory: { type: Number, default: 10 },
  pageOrder: [String],
  sourceSuggestionsEnabled: { type: Boolean, default: false }
});
const AppSettings = mongoose.model('AppSettings', settingsSchema);

// API Routes
function embedImagesInRows(rows: any[]) {
  return rows.map(row => {
    const newRow = { ...row };
    for (const key in newRow) {
      let val = newRow[key];
      let isObject = false;
      if (typeof val === 'object' && val !== null && typeof val.data === 'string') {
        val = val.data;
        isObject = true;
      }

      if (typeof val === 'string') {
        let filename = val;
        let shouldEmbed = false;

        if (filename.includes('/uploads/')) {
          filename = filename.split('/uploads/').pop() || filename;
          filename = filename.split('?')[0]; // remove query string
          shouldEmbed = true;
        } else if (!/^https?:\/\//i.test(filename)) {
          shouldEmbed = true;
        }
        
        if (shouldEmbed && /\.(png|jpe?g|gif|webp|avif|tiff)$/i.test(filename)) {
          try {
            const filepath = path.join(UPLOADS_DIR, filename);
            if (fs.existsSync(filepath)) {
              const ext = path.extname(filename).substring(1).toLowerCase();
              const mimeType = ext === 'jpg' ? 'jpeg' : ext;
              const fileData = fs.readFileSync(filepath, { encoding: 'base64' });
              const result = `data:image/${mimeType};base64,${fileData}`;
              newRow[key] = isObject ? { ...newRow[key], data: result } : result;
            } else {
              newRow[key] = isObject ? { ...newRow[key], data: val } : val;
            }
          } catch (e) {
            console.error(`Failed to convert image ${val} to base64:`, e);
            newRow[key] = isObject ? { ...newRow[key], data: val } : val;
          }
        } else {
           newRow[key] = isObject ? { ...newRow[key], data: val } : val;
        }
      }
    }
    return newRow;
  });
}

const getFormattedDate = () => {
  const now = new Date();
  const day = now.getDate();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[now.getMonth()];
  const year = now.getFullYear();

  // Output format: "4-May-2026"
  return `${day}-${month}-${year}`;
};

app.post('/api/upload-excel-images', upload.array('images', 2000), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    const uploadedPaths: string[] = [];
    const safeId = String(req.body.safeId || 'excel').replace(/[^a-zA-Z0-9_\-]/g, '');

    // First validate ALL files' extensions
    for (const file of files) {
      let ext = (file.originalname.split('.').pop() || 'png').toLowerCase();
      if (ext === 'blob') ext = 'png';
      if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
        // Cleanup temp files
        for (const f of files) {
          if (fs.existsSync(f.path)) {
            try { fs.unlinkSync(f.path); } catch (e) {}
          }
        }
        return res.status(400).json({ error: `Rejected: File "${file.originalname}" is not an allowed image format.` });
      }
    }

    // Now process validated files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let ext = (file.originalname.split('.').pop() || 'png').toLowerCase();
      if (ext === 'blob') ext = 'png';
      const filename = `${safeId}_${uuidv4().substring(0,8)}.${ext}`;
      const filepath = path.join(UPLOADS_DIR, filename);

      await fs.promises.rename(file.path, filepath);
      uploadedPaths.push(filename);
    }

    res.json({ success: true, paths: uploadedPaths });
  } catch (err: any) {
    cleanupTempFiles(req.files as Express.Multer.File[]);
    sendSafeError(res, 500, err, 'Failed to upload images', 'Failed to upload excel images');
  }
});

app.post('/api/upload-excel-media-bulk', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const safeId = String(req.body.safeId || 'excel').replace(/[^a-zA-Z0-9_\-]/g, '');
    const mediaMap: Record<string, string> = {};

    const directory = await unzipper.Open.file(req.file.path);
    for (const file of directory.files) {
      if (file.path.startsWith('xl/media/') && file.type === 'File') {
         let ext = (file.path.split('.').pop() || 'png').toLowerCase();
         if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
           continue; // Skip non-images
         }
         const filename = `${safeId}_${uuidv4().substring(0,8)}.${ext}`;
         const filepath = path.join(UPLOADS_DIR, filename);
         
         mediaMap[file.path] = filename;
         const buffer = await file.buffer();
         await fs.promises.writeFile(filepath, buffer);
      }
    }
    
    // Cleanup the uploaded temp file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.json({ success: true, mediaMap });
  } catch (err: any) {
    cleanupTempFiles([req.file]);
    sendSafeError(res, 500, err, 'Failed to extract media', 'Failed to extract media bulk');
  }
});

app.post('/api/admin/migrate-images', async (_req, res) => {
  try {
    let migratedCount = 0;
    const brokenImages: any[] = [];
    
    const migrateRow = async (row: any, pageName: string) => {
      let imageMigratedCount = 0;
      const newRow = { ...row };
      const rowPromises: Promise<void>[] = [];
      
      for (const key in newRow) {
        let val = newRow[key];
        let isObject = false;
        if (typeof val === 'object' && val !== null && typeof val.data === 'string') {
          val = val.data;
          isObject = true;
        }

        if (typeof val === 'string') {
          if (/^https?:\/\//i.test(val)) {
            if (val.includes('/uploads/')) {
              let filename = val.split('/uploads/').pop() || val;
              filename = filename.split('?')[0];
              newRow[key] = isObject ? { ...newRow[key], data: filename } : filename;
              imageMigratedCount++;
              
              if (!fs.existsSync(path.join(UPLOADS_DIR, filename))) {
                brokenImages.push({ page: pageName, rowId: row.id, column: key, filename });
              }
            } else {
              rowPromises.push((async () => {
                const dummyRow = { [key]: newRow[key] };
                try {
                  const processed = await processRowImages(dummyRow, true);
                  if (processed[key] !== newRow[key]) {
                     newRow[key] = processed[key];
                     imageMigratedCount++;
                  }
                } catch (e) {
                  console.error("Migration error for external URL:", e);
                }
              })());
            }
          } else if (!val.startsWith('data:') && /\.(png|jpe?g|gif|webp|avif|tiff)$/i.test(val)) {
            if (!fs.existsSync(path.join(UPLOADS_DIR, val))) {
              brokenImages.push({ page: pageName, rowId: row.id, column: key, filename: val });
            }
          }
        }
      }
      await Promise.all(rowPromises);
      return { newRow, imageMigratedCount };
    };

    const migrateRowsConcurrently = async (rows: any[], pageName: string) => {
       const mapped = [];
       for (let i = 0; i < rows.length; i += 50) {
         const chunk = rows.slice(i, i + 50);
         const chunkResults = await Promise.all(chunk.map(r => migrateRow(r, pageName)));
         mapped.push(...chunkResults);
       }
       return mapped;
    };

    if (isUsingMongoDB) {
      const oldPageRows = await getSortedPageRows({});
      const pagesMap = new Map<string, any[]>();
      
      for (const pr of oldPageRows) {
        if (!pagesMap.has(pr.pageName)) pagesMap.set(pr.pageName, []);
        pagesMap.get(pr.pageName)!.push(pr.data);
      }
      
      for (const [pageName, rows] of pagesMap.entries()) {
        const results = await migrateRowsConcurrently(rows, pageName);
        const newRows = results.map((r: any) => r.newRow);
        const thisPageMigratedCount = results.reduce((sum: number, r: any) => sum + r.imageMigratedCount, 0);
        
        if (thisPageMigratedCount > 0) {
          migratedCount += thisPageMigratedCount;
          await cleanupOrphanImages(rows, newRows);
          
          const baseOrder = Date.now();
          const existingDocs = await PageRow.find({ pageName }, { _id: 1, 'data.id': 1 }).lean();
          
          let deduplicatedRows = newRows;
          const rowMap = new Map();
          deduplicatedRows.forEach((r: any) => {
             if (r.id) rowMap.set(String(r.id), r);
          });
          deduplicatedRows = Array.from(rowMap.values());
          
          const bulkOps: any[] = [];
          const incomingIdsSet = new Set(deduplicatedRows.map((r: any) => String(r.id)));
          
          deduplicatedRows.forEach((row: any, j: number) => {
            bulkOps.push({
              updateOne: {
                filter: { pageName, 'data.id': String(row.id) },
                update: { $set: { pageName, order: baseOrder + j, data: row } },
                upsert: true
              }
            });
          });
          
          existingDocs.forEach((doc: any) => {
            const docId = doc.data?.id ? String(doc.data.id) : null;
            if (!docId || !incomingIdsSet.has(docId)) {
              bulkOps.push({
                deleteOne: {
                  filter: { _id: doc._id }
                }
              });
            }
          });
          
          await executeSafeBulkWrite(bulkOps);
        }
      }
    } else {
      const db = await getLocalDB();
      for (const page of db.pages) {
        if (!page.rows || page.rows.length === 0) continue;
        const results = await migrateRowsConcurrently(page.rows, page.name);
        const newRows = results.map((r: any) => r.newRow);
        const thisPageMigratedCount = results.reduce((sum: number, r: any) => sum + r.imageMigratedCount, 0);
        
        if (thisPageMigratedCount > 0) {
          migratedCount += thisPageMigratedCount;
          await cleanupOrphanImages(page.rows, newRows);
          page.rows = newRows;
        }
      }
      if (migratedCount > 0) {
        await saveLocalDB(db);
      }
    }

    res.json({ success: true, count: migratedCount, brokenImages });
  } catch (err: any) {
    console.error("Migration failed:", err);
    res.status(500).json({ error: 'Migration failed' });
  }
});

app.get('/api/export/page/:name(*)', async (req, res) => {
  try {
    const { name } = req.params;
    let pageData: any = null;

    if (isUsingMongoDB) {
      const page = await Page.findOne({ name });
      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }
      const oldPageRows = await getSortedPageRows({ pageName: name });
      const rows = oldPageRows.map((r: any) => r.data);
      
      pageData = {
        name: page.name,
        config: page.config,
        rows: embedImagesInRows(rows)
      };
    } else {
      const db = await getLocalDB();
      const page = db.pages.find((p: any) => p.name === name);
      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }
      pageData = {
        name: page.name,
        config: page.config,
        rows: embedImagesInRows(page.rows || [])
      };
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${name}_backup_${Date.now()}.json"`);
    res.send(JSON.stringify(pageData, null, 2));

  } catch (err) {
    console.error("Export page failed:", err);
    res.status(500).json({ error: 'Failed to export page' });
  }
});

app.get('/api/export', async (_req, res) => {
  try {
    let state: any = {};
    if (isUsingMongoDB) {
      const pages = await Page.find({});
      const rows = await getSortedPageRows({});
      const settings: any = await AppSettings.findOne() || {};
      
      const pageConfigs: Record<string, any> = {};
      const pageRows: Record<string, any[]> = {};
      
      pages.forEach(p => {
        pageConfigs[p.name] = p.config;
      });
      
      rows.forEach(r => {
        if (!pageRows[r.pageName]) pageRows[r.pageName] = [];
        pageRows[r.pageName].push(r.data);
      });

      // Embed images
      for (const pageName in pageRows) {
        pageRows[pageName] = embedImagesInRows(pageRows[pageName]);
      }
      
      state = {
        pages: pages.map(p => p.name),
        activePage: pages.length > 0 ? pages[0].name : '',
        pageConfigs,
        pageRows,
        globalCopyBoxes: settings.globalCopyBoxes,
        globalRowNoWidth: settings.globalRowNoWidth,
        maxSearchHistory: settings.maxSearchHistory,
        sourceSuggestionsEnabled: settings.sourceSuggestionsEnabled
      };
    } else {
      state = await getLocalDB();
      if (state.pages) {
        state.pages = state.pages.map((page: any) => ({
          ...page,
          rows: embedImagesInRows(page.rows || [])
        }));
      }
    }

    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    const formattedDate = `${day}-${month}-${year}`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=inventory_backup_${formattedDate}.json`);
    res.send(JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

app.get('/api/export-zip', async (_req, res) => {
  try {
    let state: any = {};
    if (isUsingMongoDB) {
      const pages = await Page.find({});
      const rows = await getSortedPageRows({});
      const settings: any = await AppSettings.findOne() || {};
      
      const pageConfigs: Record<string, any> = {};
      const pageRows: Record<string, any[]> = {};
      
      pages.forEach(p => {
        pageConfigs[p.name] = p.config;
      });
      
      rows.forEach(r => {
        if (!pageRows[r.pageName]) pageRows[r.pageName] = [];
        pageRows[r.pageName].push(r.data);
      });

      // DO NOT EMBED IMAGES. DONT PASS THROUGH embedImagesInRows.
      
      state = {
        pages: pages.map(p => p.name),
        activePage: pages.length > 0 ? pages[0].name : '',
        pageConfigs,
        pageRows,
        globalCopyBoxes: settings.globalCopyBoxes,
        globalRowNoWidth: settings.globalRowNoWidth,
        maxSearchHistory: settings.maxSearchHistory,
        sourceSuggestionsEnabled: settings.sourceSuggestionsEnabled
      };
    } else {
      state = await getLocalDB();
      // DO NOT EMBED IMAGES.
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=Full_Backup_Unverified_${getFormattedDate()}.zip`);
    
    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
    });

    archive.on('error', function(err) {
      throw err;
    });

    archive.pipe(res);

    archive.append(JSON.stringify(state, null, 2), { name: 'data.json' });
    archive.directory(UPLOADS_DIR, 'uploads');

    await archive.finalize();
  } catch (err) {
    console.error('Export zip error:', err);
    res.status(500).json({ error: 'Failed to export data as zip' });
  }
});

app.get('/api/export-zip-verified', async (_req, res) => {
  let tempFilePath = '';
  try {
    function getDirSize(dirPath: string): number {
      let size = 0;
      if (!fs.existsSync(dirPath)) return 0;
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile()) size += stats.size;
        else if (stats.isDirectory()) size += getDirSize(filePath);
      }
      return size;
    }
    const dirSize = getDirSize(UPLOADS_DIR);
    const estimate = dirSize + 50 * 1024 * 1024; // 50MB margin

    try {
      const statfs = fs.statfsSync(UPLOADS_DIR);
      const freeSpace = statfs.bfree * statfs.bsize;
      if (freeSpace < estimate * 1.2) {
        return res.status(507).json({ error: "Not enough disk space for verified export. Use Direct Export instead." });
      }
    } catch (e) {
      // Ignored if statfsSync fails
    }

    const tempDir = path.join(process.cwd(), 'temp_uploads');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    tempFilePath = path.join(tempDir, `verified_export_${Date.now()}_${Math.random().toString(36).substring(7)}.zip`);

    let state: any = {};
    if (isUsingMongoDB) {
      const pages = await Page.find({});
      const rows = await getSortedPageRows({});
      const settings: any = await AppSettings.findOne() || {};
      
      const pageConfigs: Record<string, any> = {};
      const pageRows: Record<string, any[]> = {};
      
      pages.forEach(p => {
        pageConfigs[p.name] = p.config;
      });
      
      rows.forEach(r => {
        if (!pageRows[r.pageName]) pageRows[r.pageName] = [];
        pageRows[r.pageName].push(r.data);
      });
      
      state = {
        pages: pages.map(p => p.name),
        activePage: pages.length > 0 ? pages[0].name : '',
        pageConfigs,
        pageRows,
        globalCopyBoxes: settings.globalCopyBoxes,
        globalRowNoWidth: settings.globalRowNoWidth,
        maxSearchHistory: settings.maxSearchHistory,
        sourceSuggestionsEnabled: settings.sourceSuggestionsEnabled
      };
    } else {
      state = await getLocalDB();
    }

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(tempFilePath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      
      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));
      output.on('error', (err: any) => {
        if (err.code === 'ENOSPC') reject(new Error('ENOSPC'));
        else reject(err);
      });
      
      archive.pipe(output);
      archive.append(JSON.stringify(state, null, 2), { name: 'data.json' });
      if (fs.existsSync(UPLOADS_DIR)) {
        archive.directory(UPLOADS_DIR, 'uploads');
      }
      archive.finalize();
    });

    const zip = new AdmZip(tempFilePath);
    const zipEntries = zip.getEntries();
    
    const dataEntry = zipEntries.find((e: any) => e.entryName === 'data.json');
    if (!dataEntry) throw new Error("Missing data.json in zip");
    
    let parsedData: any;
    try {
      parsedData = JSON.parse(dataEntry.getData().toString('utf8'));
    } catch (e) {
      throw new Error("data.json is not valid JSON");
    }

    const pagesCount = parsedData.pages ? parsedData.pages.length : 0;
    const livePagesCount = state.pages ? state.pages.length : 0;
    if (pagesCount !== livePagesCount) throw new Error(`Page count mismatch`);

    let parsedRowCount = 0;
    if (parsedData.pageRows) {
      Object.values(parsedData.pageRows).forEach((arr: any) => parsedRowCount += arr.length);
    }
    let liveRowCount = 0;
    if (state.pageRows) {
      Object.values(state.pageRows).forEach((arr: any) => liveRowCount += arr.length);
    }
    if (parsedRowCount !== liveRowCount) throw new Error(`Row count mismatch`);

    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.tiff', '.svg', '.heic'];
    const requiredImages = new Set<string>();
    
    const extractImages = (rows: any[]) => {
      rows.forEach(row => {
        Object.values(row).forEach(value => {
          let val = value;
          if (typeof value === 'object' && value !== null && typeof (value as any).data === 'string') {
            val = (value as any).data;
          }
          if (typeof val === 'string') {
            if (val.includes('/uploads/')) {
              val = val.split('/uploads/').pop() || val;
            }
            const strVal = val as string;
            if (imageExtensions.some(ext => strVal.toLowerCase().endsWith(ext)) && !/^https?:\/\//i.test(strVal)) {
              requiredImages.add(strVal);
            }
          }
        });
      });
    };
    
    if (parsedData.pageRows) {
      Object.values(parsedData.pageRows).forEach((arr: any) => extractImages(arr));
    }
    
    const zipUploads = new Set(zipEntries.map((e: any) => e.entryName));
    for (const img of requiredImages) {
      if (!zipUploads.has(`uploads/${img}`)) {
        throw new Error(`Missing image in zip: uploads/${img}`);
      }
    }

    const stats = fs.statSync(tempFilePath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=Full_Backup_verified_${getFormattedDate()}.zip`);
    res.setHeader('Content-Length', stats.size.toString());
    
    const readStream = fs.createReadStream(tempFilePath);
    readStream.pipe(res);
    
    readStream.on('close', () => {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    });
    readStream.on('error', (err) => {
      console.error('Error streaming verified zip:', err);
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    });

  } catch (err: any) {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try { fs.unlinkSync(tempFilePath); } catch (e) {}
    }
    console.error('Verified export zip error:', err);
    if (err.message === 'ENOSPC') {
      return res.status(507).json({ error: "Not enough disk space for verified export. Use Direct Export instead." });
    }
    const msg = err.message || 'Unknown error';
    if (msg.startsWith('Missing') || msg.startsWith('Page count') || msg.startsWith('Row count') || msg.startsWith('data.json')) {
      return res.status(500).json({ error: `Backup verification failed: ${msg}` });
    }
    res.status(500).json({ error: 'Failed to export verified data as zip' });
  }
});

app.get('/api/export-zip/page/:name(*)', async (req, res) => {
  try {
    const { name } = req.params;
    let pageData: any = null;

    if (isUsingMongoDB) {
      const page = await Page.findOne({ name });
      if (!page) return res.status(404).json({ error: 'Page not found' });
      const rows = await getSortedPageRows({ pageName: name });
      const linkedPages = await Page.find({ "config.linkedSourcePage": name });
      
      const pages = [name];
      const pageConfigs: any = { [name]: page.config || {} };
      const pageRows: any = { [name]: rows.map((r: any) => r.data) };

      for (const p of linkedPages) {
        pages.push(p.name);
        pageConfigs[p.name] = p.config || {};
        const pRows = await getSortedPageRows({ pageName: p.name });
        pageRows[p.name] = pRows.map((r: any) => r.data);
      }

      pageData = {
        isBundle: true,
        pages,
        pageConfigs,
        pageRows
      };
    } else {
      const db = await getLocalDB();
      const page = db.pages.find((p: any) => p.name === name);
      if (!page) return res.status(404).json({ error: 'Page not found' });
      
      const pages = [name];
      const pageConfigs: any = { [name]: page.config || {} };
      const pageRows: any = { [name]: page.rows || [] };

      db.pages.forEach((p: any) => {
        if (p.config && p.config.linkedSourcePage === name) {
          pages.push(p.name);
          pageConfigs[p.name] = p.config || {};
          pageRows[p.name] = p.rows || [];
        }
      });

      pageData = {
        isBundle: true,
        pages,
        pageConfigs,
        pageRows
      };
    }

    const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.tiff', '.svg', '.heic'];
    const requiredImages = new Set<string>();
    
    const extractImages = (rows: any[]) => {
      rows.forEach(row => {
        Object.values(row).forEach(value => {
          let val = value;
          if (typeof value === 'object' && value !== null && typeof (value as any).data === 'string') {
            val = (value as any).data;
          }
          if (typeof val === 'string') {
            if (val.includes('/uploads/')) {
              val = val.split('/uploads/').pop() || val;
            }
            const strVal = val as string;
            if (imageExtensions.some(ext => strVal.toLowerCase().endsWith(ext)) && !/^https?:\/\//i.test(strVal)) {
              requiredImages.add(strVal);
            }
          }
        });
      });
    };

    if (pageData && pageData.pageRows) {
      Object.values(pageData.pageRows).forEach((rows: any) => extractImages(rows));
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=page_backup_${name}_${getFormattedDate()}.zip`);
    
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => { throw err; });
    archive.pipe(res);

    archive.append(JSON.stringify(pageData, null, 2), { name: 'data.json' });
    
    for (const img of requiredImages) {
      const imgPath = path.join(UPLOADS_DIR, img);
      if (fs.existsSync(imgPath)) {
        archive.file(imgPath, { name: 'uploads/' + img });
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('Export page zip error:', err);
    res.status(500).json({ error: 'Failed to export page as zip' });
  }
});

app.get('/api/state', async (_req, res) => {
  try {
    if (isUsingMongoDB) {
      const pages = await Page.find({}, 'name config.linkedSourcePage');
      const settings: any = await AppSettings.findOne() || {};
      
      const pageNames = pages.map(p => p.name);
      if (settings.pageOrder && settings.pageOrder.length > 0) {
        pageNames.sort((a, b) => {
          const aIdx = settings.pageOrder.indexOf(a);
          const bIdx = settings.pageOrder.indexOf(b);
          if (aIdx === -1 && bIdx === -1) return 0;
          if (aIdx === -1) return 1;
          if (bIdx === -1) return -1;
          return aIdx - bIdx;
        });
      }
      
      const state = {
        pages: pageNames,
        globalCopyBoxes: settings.globalCopyBoxes,
        globalRowNoWidth: settings.globalRowNoWidth,
        maxSearchHistory: settings.maxSearchHistory,
        sourceSuggestionsEnabled: settings.sourceSuggestionsEnabled,
        pageOrder: settings.pageOrder || [],
        pageLinks: pages.reduce((acc: Record<string, string>, p: any) => {
          if (p.config && typeof p.config.linkedSourcePage === 'string' && p.config.linkedSourcePage.trim() !== '') {
            acc[p.name] = p.config.linkedSourcePage.trim();
          }
          return acc;
        }, {})
      };
      
      return res.json(state);
    } else {
      const db = await getLocalDB();
      const pageNames = db.pages.map((p: any) => p.name);
      const pageOrder = db.settings?.pageOrder || [];
      if (pageOrder && pageOrder.length > 0) {
        pageNames.sort((a: string, b: string) => {
          const aIdx = pageOrder.indexOf(a);
          const bIdx = pageOrder.indexOf(b);
          if (aIdx === -1 && bIdx === -1) return 0;
          if (aIdx === -1) return 1;
          if (bIdx === -1) return -1;
          return aIdx - bIdx;
        });
      }
      
      const state = {
        pages: pageNames,
        globalCopyBoxes: db.settings?.globalCopyBoxes,
        globalRowNoWidth: db.settings?.globalRowNoWidth,
        maxSearchHistory: db.settings?.maxSearchHistory,
        sourceSuggestionsEnabled: db.settings?.sourceSuggestionsEnabled,
        pageOrder: pageOrder,
        pageLinks: db.pages.reduce((acc: Record<string, string>, p: any) => {
          if (p.config && typeof p.config.linkedSourcePage === 'string' && p.config.linkedSourcePage.trim() !== '') {
            acc[p.name] = p.config.linkedSourcePage.trim();
          }
          return acc;
        }, {})
      };
      return res.json(state);
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch state' });
  }
});

app.get('/api/local-image-size', async (req, res) => {
  try {
    let filename = req.query.filename as string;
    if (!filename) {
      return res.json({ ok: false });
    }

    if (filename.includes('/uploads/')) {
      filename = filename.split('/uploads/').pop() || '';
    }
    filename = filename.split('?')[0];
    filename = path.basename(filename);

    if (filename.includes('/') || filename.includes('\\')) {
      return res.json({ ok: false });
    }

    const filepath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filepath)) {
      return res.json({ ok: false });
    }

    const stats = fs.statSync(filepath);
    return res.json({ ok: true, sizeBytes: stats.size });
  } catch (err) {
    return res.json({ ok: false });
  }
});

app.get('/api/pages/delete-impact', async (req, res) => {
  try {
    const name = typeof req.query.name === 'string' ? req.query.name : '';
    if (!name) return res.status(400).json({ error: 'Missing name' });

    if (isUsingMongoDB) {
      const pageExists = await Page.findOne({ name }).lean();
      if (!pageExists) {
        return res.status(404).json({ error: 'Page not found' });
      }
      
      const rowCount = await PageRow.countDocuments({ pageName: name });
      
      const linkedPages = await Page.find({ "config.linkedSourcePage": name }).lean();
      const linkedNames = linkedPages.map((p: any) => p.name);
      
      let linkedRowCount = 0;
      for (const pName of linkedNames) {
        linkedRowCount += await PageRow.countDocuments({ pageName: pName });
      }
      
      return res.json({
        ok: true,
        pageName: name,
        rowCount,
        linkedPages: linkedNames,
        linkedRowCount
      });
    } else {
      const db = await getLocalDB();
      const page = db.pages.find((p: any) => p.name === name);
      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }
      
      const rowCount = (page.rows || []).length;
      
      const linkedPages = db.pages.filter((p: any) => p.config && p.config.linkedSourcePage === name);
      const linkedNames = linkedPages.map((p: any) => p.name);
      
      let linkedRowCount = 0;
      for (const p of linkedPages) {
        linkedRowCount += (p.rows || []).length;
      }
      
      return res.json({
        ok: true,
        pageName: name,
        rowCount,
        linkedPages: linkedNames,
        linkedRowCount
      });
    }
  } catch (err: any) {
    sendSafeError(res, 500, err, 'Failed to check delete impact', 'Failed to check delete impact');
  }
});

app.get('/api/pages/:name(*)', async (req, res) => {
  try {
    const { name } = req.params;
    if (isUsingMongoDB) {
      const page = await Page.findOne({ name });
      if (!page) return res.status(404).json({ error: 'Page not found' });
      
      const rows = await getSortedPageRows({ pageName: name });
      
      return res.json({
        name: page.name,
        config: page.config,
        rows: rows.map((r: any) => r.data),
        rowsVersion: page.rowsVersion || 0
      });
    } else {
      const db = await getLocalDB();
      const page = db.pages.find((p: any) => p.name === name);
      if (!page) return res.status(404).json({ error: 'Page not found' });
      
      return res.json({
        name: page.name,
        config: page.config,
        rows: page.rows || [],
        rowsVersion: 0
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch page data' });
  }
});

app.post('/api/pages', async (req, res) => {
  try {
    const { name, config } = req.body;
    if (isUsingMongoDB) {
      const newPage = new Page({ name, config });
      await newPage.save();
      await triggerLocalBackup();
    } else {
      const db = await getLocalDB();
      db.pages.push({ name, config, rows: [] });
      await saveLocalDB(db);
    }
    res.json({ success: true });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A page with that name already exists.' });
    }
    sendSafeError(res, 500, err, 'Failed to create page', 'Failed to create page');
  }
});

app.put('/api/pages/:name(*)/rename', async (req, res) => {
  try {
    const { name } = req.params;
    const { newName } = req.body;

    if (!newName || typeof newName !== 'string' || !newName.trim()) {
      return res.status(400).json({ error: 'Invalid new name' });
    }
    const trimmedNewName = newName.trim();

    if (trimmedNewName === name) {
      return res.json({ success: true });
    }

    if (isUsingMongoDB) {
      const existingPage = await Page.findOne({ name });
      if (!existingPage) {
        return res.status(404).json({ error: 'Page not found' });
      }
      const duplicatePage = await Page.findOne({ name: trimmedNewName });
      if (duplicatePage) {
        return res.status(409).json({ error: 'A page with that name already exists.' });
      }

      let session = null;
      if (transactionsSupported !== false) {
        try {
          session = await mongoose.startSession();
          session.startTransaction();
        } catch (e) {
          transactionsSupported = false;
          session = null;
        }
      }

      try {
        const opts = session ? { session } : {};
        await Page.findOneAndUpdate({ name }, { name: trimmedNewName }, opts);
        await PageRow.updateMany({ pageName: name }, { pageName: trimmedNewName }, opts);
        
        const linkedPages = await Page.find({ "config.linkedSourcePage": name }, null, opts);
        for (const p of linkedPages) {
          const newConfig = { ...(p.config || {}) };
          newConfig.linkedSourcePage = trimmedNewName;
          await Page.findByIdAndUpdate(p._id, { config: newConfig }, opts);
        }

        const searchLinkedPages = await Page.find({ "config.secondarySearchPage": name }, null, opts);
        for (const p of searchLinkedPages) {
          const newConfig = { ...(p.config || {}) };
          newConfig.secondarySearchPage = trimmedNewName;
          await Page.findByIdAndUpdate(p._id, { config: newConfig }, opts);
        }

        if (session) {
          await session.commitTransaction();
          transactionsSupported = true;
        }
      } catch (txnErr: any) {
        if (session) {
          await session.abortTransaction().catch(() => {});
        }
        
        const errMsg = (txnErr.message || '').toLowerCase();
        const isUnsupported = errMsg.includes('replica set') || errMsg.includes('transaction') || errMsg.includes('not supported') || txnErr.code === 20 || txnErr.code === 263 || txnErr.name === 'IllegalOperation';
        
        if (session && isUnsupported) {
          console.warn("Transaction not supported on write, falling back to non-transactional bulk write:", txnErr.message);
          transactionsSupported = false;
          await Page.findOneAndUpdate({ name }, { name: trimmedNewName });
          await PageRow.updateMany({ pageName: name }, { pageName: trimmedNewName });
          
          const linkedPages = await Page.find({ "config.linkedSourcePage": name });
          for (const p of linkedPages) {
            const newConfig = { ...(p.config || {}) };
            newConfig.linkedSourcePage = trimmedNewName;
            await Page.findByIdAndUpdate(p._id, { config: newConfig });
          }

          const searchLinkedPages = await Page.find({ "config.secondarySearchPage": name });
          for (const p of searchLinkedPages) {
            const newConfig = { ...(p.config || {}) };
            newConfig.secondarySearchPage = trimmedNewName;
            await Page.findByIdAndUpdate(p._id, { config: newConfig });
          }
        } else {
          throw txnErr;
        }
      } finally {
        if (session) {
          session.endSession();
        }
      }

      await triggerLocalBackup();
    } else {
      const db = await getLocalDB();
      const page = db.pages.find((p: any) => p.name === name);
      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }
      if (db.pages.some((p: any) => p.name === trimmedNewName)) {
        return res.status(409).json({ error: 'A page with that name already exists.' });
      }

      page.name = trimmedNewName;
      
      db.pages.forEach((p: any) => {
        if (p.config && p.config.linkedSourcePage === name) {
          p.config.linkedSourcePage = trimmedNewName;
        }
        if (p.config && p.config.secondarySearchPage === name) {
          p.config.secondarySearchPage = trimmedNewName;
        }
      });
      
      await saveLocalDB(db);
    }

    res.json({ success: true });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A page with that name already exists.' });
    }
    sendSafeError(res, 500, err, 'Failed to rename page', 'Failed to rename page');
  }
});


app.delete('/api/pages/:name(*)', async (req, res) => {
  try {
    const { name } = req.params;
    let deletedRows: any[] = [];
    if (isUsingMongoDB) {
      const pageExists = await Page.findOne({ name });
      if (!pageExists) {
        return res.status(404).json({ error: 'Page not found' });
      }

      let session = null;
      if (transactionsSupported !== false) {
        try {
          session = await mongoose.startSession();
          session.startTransaction();
        } catch (e) {
          transactionsSupported = false;
          session = null;
        }
      }

      try {
        const opts = session ? { session } : {};
        const pageRows = await getSortedPageRows({ pageName: name });
        deletedRows = pageRows.map((r: any) => r.data);
        await Page.findOneAndDelete({ name }, opts);
        await PageRow.deleteMany({ pageName: name }, opts);
        
        const linkedPages = await Page.find({ "config.linkedSourcePage": name }, null, opts);
        const linkedNames = linkedPages.map((p: any) => p.name);
        const allDeletedNames = [name, ...linkedNames];
        
        for (const p of linkedPages) {
          const linkedPageRows = await getSortedPageRows({ pageName: p.name });
          deletedRows.push(...linkedPageRows.map((r: any) => r.data));
          await Page.findOneAndDelete({ name: p.name }, opts);
          await PageRow.deleteMany({ pageName: p.name }, opts);
        }
        
        const searchLinkedPages = await Page.find({ "config.secondarySearchPage": { $in: allDeletedNames } }, null, opts);
        for (const p of searchLinkedPages) {
          const newConfig = { ...(p.config || {}) };
          delete newConfig.secondarySearchPage;
          await Page.findByIdAndUpdate(p._id, { config: newConfig }, opts);
        }
        
        if (session) {
          await session.commitTransaction();
          transactionsSupported = true;
        }
      } catch (txnErr: any) {
        if (session) {
          await session.abortTransaction().catch(() => {});
        }
        const errMsg = (txnErr.message || '').toLowerCase();
        const isUnsupported = errMsg.includes('replica set') || errMsg.includes('transaction') || errMsg.includes('not supported') || txnErr.code === 20 || txnErr.code === 263 || txnErr.name === 'IllegalOperation';
        
        if (session && isUnsupported) {
          console.warn("Transaction not supported on write, falling back to non-transactional bulk write:", txnErr.message);
          transactionsSupported = false;
          const pageRows = await getSortedPageRows({ pageName: name });
          deletedRows = pageRows.map((r: any) => r.data);
          await Page.findOneAndDelete({ name });
          await PageRow.deleteMany({ pageName: name });
          
          const linkedPages = await Page.find({ "config.linkedSourcePage": name });
          const linkedNames = linkedPages.map((p: any) => p.name);
          const allDeletedNames = [name, ...linkedNames];
          
          for (const p of linkedPages) {
            const linkedPageRows = await getSortedPageRows({ pageName: p.name });
            deletedRows.push(...linkedPageRows.map((r: any) => r.data));
            await Page.findOneAndDelete({ name: p.name });
            await PageRow.deleteMany({ pageName: p.name });
          }
          
          const searchLinkedPages = await Page.find({ "config.secondarySearchPage": { $in: allDeletedNames } });
          for (const p of searchLinkedPages) {
            const newConfig = { ...(p.config || {}) };
            delete newConfig.secondarySearchPage;
            await Page.findByIdAndUpdate(p._id, { config: newConfig });
          }
        } else {
          throw txnErr;
        }
      } finally {
        if (session) {
          session.endSession();
        }
      }

      await triggerLocalBackup();
    } else {
      const db = await getLocalDB();
      const page = db.pages.find((p: any) => p.name === name);
      if (!page) {
        return res.status(404).json({ error: 'Page not found' });
      }
      
      deletedRows = page.rows || [];
      db.pages = db.pages.filter((p: any) => p.name !== name);
      
      const linkedPageNames: string[] = [];
      db.pages = db.pages.filter((p: any) => {
        if (p.config && p.config.linkedSourcePage === name) {
          linkedPageNames.push(p.name);
          if (p.rows) deletedRows.push(...p.rows);
          return false;
        }
        return true;
      });
      
      const allDeletedNames = [name, ...linkedPageNames];
      db.pages.forEach((p: any) => {
        if (p.config && p.config.secondarySearchPage && allDeletedNames.includes(p.config.secondarySearchPage)) {
          delete p.config.secondarySearchPage;
        }
      });
      
      await saveLocalDB(db);
    }
    await cleanupOrphanImages(deletedRows, [], false, name);
    res.json({ success: true });
  } catch (err: any) {
    sendSafeError(res, 500, err, 'Failed to delete page', 'Failed to delete page');
  }
});


async function validateUrlForSSRF(urlString: string): Promise<boolean> {
  try {
    const dns = await import('dns');
    const net = await import('net');
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname;
    const addresses = await dns.promises.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) return false;
    
    for (const record of addresses) {
      let ip = record.address;
      if (ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
      }
      if (net.isIPv4(ip)) {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 0) return false;
        if (parts[0] === 10) return false;
        if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return false;
        if (parts[0] === 127) return false;
        if (parts[0] === 169 && parts[1] === 254) return false;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
        if (parts[0] === 192 && parts[1] === 168) return false;
      } else if (net.isIPv6(ip)) {
        const lowerIp = ip.toLowerCase();
        if (lowerIp === '::1') return false;
        if (lowerIp === '::') return false;
        if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd')) return false;
        if (lowerIp.startsWith('fe80')) return false;
      }
    }
    return true;
  } catch (err) {
    return false;
  }
}

app.get('/api/url-image-size', async (req, res) => {
  try {
    const url = req.query.url as string;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Invalid URL parameter' });
    }

    const isSafe = await validateUrlForSSRF(url);
    if (!isSafe) {
      return res.status(400).json({ error: 'URL is not allowed' });
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 10000);

    try {
      const headResponse = await fetch(url, {
        method: 'HEAD',
        signal: abortController.signal,
        redirect: 'manual'
      });
      
      if (headResponse.status >= 300 && headResponse.status < 400) {
        clearTimeout(timeoutId);
        return res.status(400).json({ error: 'Redirects are not allowed' });
      }
            
      if (headResponse.ok) {
        const contentLength = headResponse.headers.get('content-length');
        if (contentLength && !isNaN(Number(contentLength))) {
          clearTimeout(timeoutId);
          return res.json({ ok: true, sizeBytes: Number(contentLength) });
        }
      }
    } catch (e) {
      // Ignore HEAD failure
    }

    try {
      const getResponse = await fetch(url, {
        method: 'GET',
        signal: abortController.signal,
        redirect: 'manual'
      });
      
      if (getResponse.status >= 300 && getResponse.status < 400) {
        clearTimeout(timeoutId);
        return res.status(400).json({ error: 'Redirects are not allowed' });
      }

      if (!getResponse.ok || !getResponse.body) {
        clearTimeout(timeoutId);
        return res.status(400).json({ error: 'Failed to fetch image' });
      }

      const reader = getResponse.body.getReader();
      let totalBytes = 0;
      const MAX_BYTES = 10 * 1024 * 1024;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.length;
          if (totalBytes > MAX_BYTES) {
            abortController.abort();
            clearTimeout(timeoutId);
            return res.status(400).json({ error: 'Image exceeds size limit' });
          }
        }
      }
            
      clearTimeout(timeoutId);
      return res.json({ ok: true, sizeBytes: totalBytes });
    } catch (e) {
      clearTimeout(timeoutId);
      return res.status(400).json({ error: 'Failed to fetch image' });
    }
  } catch (err) {
    return res.status(400).json({ error: 'Internal error validating URL' });
  }
});

app.post('/api/pages/update-config', async (req, res) => {
  try {
    const { pageName, name, config } = req.body;
    const finalPageName = name || pageName;
    if (isUsingMongoDB) {
      await Page.findOneAndUpdate({ name: finalPageName }, { config });
      await triggerLocalBackup();
    } else {
      const db = await getLocalDB();
      const page = db.pages.find((p: any) => p.name === finalPageName);
      if (page) page.config = config;
      await saveLocalDB(db);
    }
    res.json({ success: true });
  } catch (err: any) {
    sendSafeError(res, 500, err, 'Failed to update config', 'Failed to update config via update-config route');
  }
});

app.put('/api/pageConfigs/:name(*)', async (req, res) => {
  try {
    const { name } = req.params;
    const { config } = req.body;
    if (isUsingMongoDB) {
      await Page.findOneAndUpdate({ name }, { config });
      await triggerLocalBackup();
    } else {
      const db = await getLocalDB();
      const page = db.pages.find((p: any) => p.name === name);
      if (page) page.config = config;
      await saveLocalDB(db);
    }
    res.json({ success: true });
  } catch (err: any) {
    sendSafeError(res, 500, err, 'Failed to update config', 'Failed to update config via pageConfigs route');
  }
});


let transactionsSupported: boolean | null = null;

async function executeSafeBulkWrite(bulkOps: any[]) {
  if (!bulkOps || bulkOps.length === 0) return;
  let session = null;
  if (transactionsSupported !== false) {
    try {
      session = await mongoose.startSession();
      session.startTransaction();
    } catch (e) {
      transactionsSupported = false;
      session = null;
    }
  }
  try {
    if (session) {
      await PageRow.bulkWrite(bulkOps, { session });
      await session.commitTransaction();
      transactionsSupported = true;
    } else {
      await PageRow.bulkWrite(bulkOps);
    }
  } catch (txnErr: any) {
    if (session) {
      await session.abortTransaction().catch(() => {});
    }
    const errMsg = (txnErr.message || '').toLowerCase();
    const isUnsupported = errMsg.includes('replica set') || errMsg.includes('transaction') || errMsg.includes('not supported') || txnErr.code === 20 || txnErr.code === 263 || txnErr.name === 'IllegalOperation';
    
    if (session && isUnsupported) {
      console.warn("Transaction not supported on write, falling back to non-transactional bulk write:", txnErr.message);
      transactionsSupported = false;
      await PageRow.bulkWrite(bulkOps);
    } else {
      throw txnErr;
    }
  } finally {
    if (session) {
      session.endSession();
    }
  }
}
app.put('/api/pageRows/:name(*)', async (req, res) => {
  try {
    let rowsVersion = 0;
    const { name } = req.params;
    const { rows, expectedVersion } = req.body;
    const forceSave = req.query.force === 'true';
    const skipImageProcessing = req.query.skipImageProcessing === 'true';

    if (expectedVersion !== undefined && expectedVersion !== null) {
      if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
        return res.status(400).json({ error: "Invalid expected version." });
      }
      if (isUsingMongoDB) {
        const pageDoc = await Page.findOne({ name }, { rowsVersion: 1 }).lean();
        if (pageDoc) {
          const currentVersion = (pageDoc as any).rowsVersion || 0;
          if (currentVersion !== expectedVersion) {
            return res.status(409).json({
              error: "This page was changed by someone else. Please reload the page before saving.",
              conflict: true,
              currentVersion,
              expectedVersion
            });
          }
        }
      }
    }
    
    let pageConfig: any = null;
    let allPageConfigs: Record<string, any> = {};
    if (isUsingMongoDB) {
      const pages = await Page.find({}, { name: 1, config: 1 }).lean();
      pages.forEach((p: any) => { allPageConfigs[p.name] = p.config; });
      pageConfig = allPageConfigs[name] || null;
    } else {
      const db = await getLocalDB();
      db.pages.forEach((p: any) => { allPageConfigs[p.name] = p.config; });
      pageConfig = allPageConfigs[name] || null;
    }

    const partnerPages = getPartnerPageNames(name, pageConfig, allPageConfigs);
    const partnerPagesSet = new Set(partnerPages);

    const incomingIds = (rows || []).map((r: any) => String(r.id)).filter((id: string) => id && id !== 'undefined' && id !== 'null');
    let existingOtherIds = new Set<string>();
    
    if (incomingIds.length > 0) {
      if (isUsingMongoDB) {
        const excludedPages = [name, ...partnerPages];
        const otherRows = await PageRow.find({ pageName: { $nin: excludedPages }, 'data.id': { $in: incomingIds } }, { 'data.id': 1, _id: 0 }).lean();
        otherRows.forEach((r: any) => {
          if (r.data?.id) existingOtherIds.add(String(r.data.id));
        });
      } else {
        const db = await getLocalDB();
        db.pages.forEach((p: any) => {
          if (p.name !== name && !partnerPagesSet.has(p.name) && p.rows) {
            p.rows.forEach((r: any) => {
              if (r.id && incomingIds.includes(String(r.id))) existingOtherIds.add(String(r.id));
            });
          }
        });
      }
    }

    let rowsToProcess = rows || [];
    const seenIds = new Set<string>(existingOtherIds);
    rowsToProcess = rowsToProcess.map((row: any) => {
      const originalId = String(row.id);
      const hasValidId = row.id && originalId !== 'undefined' && originalId !== 'null' && originalId.trim() !== '';
      if (!hasValidId || seenIds.has(originalId)) {
        row.id = uuidv4();
      }
      seenIds.add(String(row.id));
      return row;
    });

    const finalIds = new Set<string>();
    for (const r of rowsToProcess) {
      if (finalIds.has(String(r.id))) {
        throw new Error(`Safety Violation: duplicate ID ${r.id} generated or preserved in payload.`);
      }
      finalIds.add(String(r.id));
    }

    if (isUsingMongoDB) {
      const isTrackerDb = pageConfig?.linkedSourcePage; // Can use pageConfig here
      const newRows = (isTrackerDb || skipImageProcessing) ? rowsToProcess : await processRowsConcurrently(rowsToProcess, 50, forceSave);
      

      const baseOrder = Date.now();
      const existingDocs = await PageRow.find({ pageName: name }, { _id: 1, 'data.id': 1 }).lean();
      
      const bulkOps: any[] = [];
      const incomingIdsSet = new Set(newRows.map((r: any) => String(r.id)));
      
      let upsertCount = 0;
      let deleteCount = 0;

      // Upsert incoming rows
      newRows.forEach((row: any, i: number) => {
        upsertCount++;
        bulkOps.push({
          updateOne: {
            filter: { pageName: name, 'data.id': String(row.id) },
            update: { $set: { pageName: name, order: baseOrder + i, data: row } },
            upsert: true
          }
        });
      });
      
      // Delete missing rows
      existingDocs.forEach((doc: any) => {
        const docId = doc.data?.id ? String(doc.data.id) : null;
        if (!docId || !incomingIdsSet.has(docId)) {
          deleteCount++;
          bulkOps.push({
            deleteOne: {
              filter: { _id: doc._id }
            }
          });
        }
      });
      

      let session = null;
      if (transactionsSupported !== false) {
        try {
          session = await mongoose.startSession();
          session.startTransaction();
        } catch (e) {
          transactionsSupported = false;
          session = null;
        }
      }

      if (bulkOps.length > 0) {
        try {
          if (session) {
            await PageRow.bulkWrite(bulkOps, { session });
            await session.commitTransaction();
            transactionsSupported = true;
          } else {
            await PageRow.bulkWrite(bulkOps);
          }
        } catch (txnErr: any) {
          if (session) {
            await session.abortTransaction().catch(() => {});
          }
          const errMsg = (txnErr.message || '').toLowerCase();
          const isUnsupported = errMsg.includes('replica set') || errMsg.includes('transaction') || errMsg.includes('not supported') || txnErr.code === 20 || txnErr.code === 263 || txnErr.name === 'IllegalOperation';
          
          if (session && isUnsupported) {
            console.warn("Transaction not supported on write, falling back to non-transactional bulk write:", txnErr.message);
            transactionsSupported = false;
            await PageRow.bulkWrite(bulkOps);
          } else {
            throw txnErr;
          }
        } finally {
          if (session) {
            session.endSession();
          }
        }
      }
      const updatedPage = await Page.findOneAndUpdate({ name }, { $inc: { rowsVersion: 1 } }, { new: true });
      rowsVersion = updatedPage?.rowsVersion || 0;
      await triggerLocalBackup();
    } else {
      const db = await getLocalDB();
      const page = db.pages.find((p: any) => p.name === name);
      if (page) {
        const isTracker = page.config?.linkedSourcePage;
        const newRows = (isTracker || skipImageProcessing) ? rowsToProcess : await processRowsConcurrently(rowsToProcess, 50, forceSave);
        page.rows = newRows;
      }
      await saveLocalDB(db);
    }
    res.json({ success: true, rowsVersion });
  } catch (err: any) {
    if (err.message === 'SHARP_UNSUPPORTED_FORMAT') {
      return res.status(400).json({ requiresConfirmation: true, error: "Unsupported image format detected. The system can only process standard images (JPG, PNG, WEBP, GIF, AVIF, TIFF). Do you want to force save this file as-is without processing?" });
    }
    sendSafeError(res, 400, err, 'Failed to update rows', 'Failed to update rows');
  }
});

app.patch('/api/pageRows/:name(*)/bulk', async (req, res) => {
  try {
    const { name } = req.params;
    const { order, updates } = req.body;
    const forceSave = req.query.force === 'true';
    const skipImageProcessing = req.query.skipImageProcessing === 'true';
    if (isUsingMongoDB) {
      if (updates && Object.keys(updates).length > 0) {
        const rowIds = Object.keys(updates).map(String);
        const rowsToUpdate = await PageRow.find({ pageName: name, 'data.id': { $in: rowIds } });
        
        const rowMap = new Map();
        for (const r of rowsToUpdate) {
          if (r.data && r.data.id != null) {
            rowMap.set(String(r.data.id), r);
          }
        }

        const bulkOps = [];
        for (const [rowId, upds] of Object.entries(updates)) {
          const rowToUpdate = rowMap.get(String(rowId));
          if (rowToUpdate) {
            const newRowData = { ...rowToUpdate.data, ...(upds as any) };
            const processedRow = skipImageProcessing ? newRowData : await processRowImages(newRowData, forceSave);
            bulkOps.push({
              updateOne: {
                filter: { _id: rowToUpdate._id },
                update: { $set: { data: processedRow } }
              }
            });
          }
        }
        
        if (bulkOps.length > 0) {
          await PageRow.bulkWrite(bulkOps);
        }
      }
      if (order && Array.isArray(order) && order.length > 0) {
        let session = null;
        try {
          session = await mongoose.startSession();
          session.startTransaction();

          const bulkOps = order.map((id, index) => ({
            updateOne: {
              filter: { pageName: name, 'data.id': String(id) },
              update: { $set: { order: index } }
            }
          }));
          
          await PageRow.bulkWrite(bulkOps, { session });
          
          await session.commitTransaction();
          transactionsSupported = true;
        } catch (txnErr: any) {
          if (session) {
            await session.abortTransaction().catch(() => {});
          }
          console.warn("Transaction failed or not supported, falling back to sequential bulkWrite:", txnErr.message);
          
          const bulkOps = order.map((id, index) => ({
            updateOne: {
              filter: { pageName: name, 'data.id': String(id) },
              update: { $set: { order: index } }
            }
          }));
          await PageRow.bulkWrite(bulkOps);
        } finally {
          if (session) {
            session.endSession();
          }
        }
      }
      await triggerLocalBackup();
    } else {
      const db = await getLocalDB();
      const page = db.pages.find((p: any) => p.name === name);
      if (!page) return res.status(404).json({ error: 'Page not found' });

      if (updates && Object.keys(updates).length > 0) {
        for (const [rowId, upds] of Object.entries(updates)) {
          const idx = page.rows?.findIndex((r: any) => String(r.id) === String(rowId));
          if (idx !== undefined && idx !== -1) {
            const newRowData = { ...page.rows[idx], ...(upds as any) };
            const processedRow = await processRowImages(newRowData, forceSave);
            page.rows[idx] = processedRow;
          }
        }
      }

      if (order && Array.isArray(order)) {
        const rowMap = new Map((page.rows || []).map((r: any) => [String(r.id), r]));
        const newOrderedRows = [];
        for (const id of order) {
          if (rowMap.has(id)) {
            newOrderedRows.push(rowMap.get(id));
            rowMap.delete(id);
          }
        }
        for (const r of rowMap.values()) {
           newOrderedRows.push(r);
        }
        page.rows = newOrderedRows;
      }
      await saveLocalDB(db);
    }

    res.json({ success: true });
  } catch (err: any) {
    if (err.message === 'SHARP_UNSUPPORTED_FORMAT') {
      return res.status(400).json({ requiresConfirmation: true, error: "Unsupported image format detected. Do you want to force save this file as-is without processing?" });
    }
    sendSafeError(res, 400, err, 'Failed to bulk update', 'PATCH Bulk Error');
  }
});

app.patch('/api/pageRows/:name(*)/:rowId', async (req, res) => {
  try {
    const { name, rowId } = req.params;
    const { updates } = req.body;
    const forceSave = req.query.force === 'true';
    const skipImageProcessing = req.query.skipImageProcessing === 'true';
    if (isUsingMongoDB) {
      const rowToUpdate = await PageRow.findOne({ pageName: name, 'data.id': String(rowId) });
      if (!rowToUpdate) {
        return res.status(404).json({ error: 'Row not found' });
      }

      const oldRowData = { ...rowToUpdate.data };
      const newRowData = { ...rowToUpdate.data, ...updates };
      const processedRow = await processRowImages(newRowData, forceSave);

      await PageRow.findByIdAndUpdate(rowToUpdate._id, { data: processedRow });
      await cleanupOrphanImages([oldRowData], [processedRow]);
      await triggerLocalBackup();
    } else {
      const db = await getLocalDB();
      const page = db.pages.find((p: any) => p.name === name);
      if (!page) return res.status(404).json({ error: 'Page not found' });

      const idx = page.rows?.findIndex((r: any) => String(r.id) === String(rowId));
      if (idx === undefined || idx === -1) {
        return res.status(404).json({ error: 'Row not found' });
      }

      const oldRowData = { ...page.rows[idx] };
      const newRowData = { ...page.rows[idx], ...updates };
      const processedRow = await processRowImages(newRowData, forceSave);

      page.rows[idx] = processedRow;
      await saveLocalDB(db);
      await cleanupOrphanImages([oldRowData], [processedRow]);
    }

    res.json({ success: true });
  } catch (err: any) {
    if (err.message === 'SHARP_UNSUPPORTED_FORMAT') {
      return res.status(400).json({ requiresConfirmation: true, error: "Unsupported image format detected. The system can only process standard images (JPG, PNG, WEBP, GIF, AVIF, TIFF). Do you want to force save this file as-is without processing?" });
    }
    sendSafeError(res, 400, err, 'Failed to update row', 'PATCH Row Error');
  }
});

app.post('/api/pageRows/:name(*)/append', async (req, res) => {
  try {
    let rowsVersion = 0;
    const { name } = req.params;
    const { rows } = req.body;
    const forceSave = req.query.force === 'true';

    let pageConfig: any = null;
    let allPageConfigs: Record<string, any> = {};
    if (isUsingMongoDB) {
      const pages = await Page.find({}, { name: 1, config: 1 }).lean();
      pages.forEach((p: any) => { allPageConfigs[p.name] = p.config; });
      pageConfig = allPageConfigs[name] || null;
    } else {
      const db = await getLocalDB();
      db.pages.forEach((p: any) => { allPageConfigs[p.name] = p.config; });
      pageConfig = allPageConfigs[name] || null;
    }

    const partnerPages = getPartnerPageNames(name, pageConfig, allPageConfigs);
    const partnerPagesSet = new Set(partnerPages);

    let existingOtherIds = new Set<string>();
    const incomingIds = (rows || []).map((r: any) => String(r.id)).filter((id: string) => id && id !== 'undefined' && id !== 'null');
    
    if (incomingIds.length > 0) {
      if (isUsingMongoDB) {
        const matchingRows = await PageRow.find({ pageName: { $nin: partnerPages }, 'data.id': { $in: incomingIds } }, { 'data.id': 1, _id: 0 }).lean();
        matchingRows.forEach((r: any) => {
          if (r.data?.id) existingOtherIds.add(String(r.data.id));
        });
      } else {
        const db = await getLocalDB();
        db.pages.forEach((p: any) => {
          if (!partnerPagesSet.has(p.name) && p.rows) {
            p.rows.forEach((r: any) => {
              if (r.id && incomingIds.includes(String(r.id))) existingOtherIds.add(String(r.id));
            });
          }
        });
      }
    }

    let rowsToProcess = rows || [];
    const seenIds = new Set<string>(existingOtherIds);
    rowsToProcess = rowsToProcess.map((row: any) => {
      const originalId = String(row.id);
      const hasValidId = row.id && originalId !== 'undefined' && originalId !== 'null' && originalId.trim() !== '';
      if (!hasValidId || seenIds.has(originalId)) {
        row.id = uuidv4();
      }
      seenIds.add(String(row.id));
      return row;
    });

    const finalIds = new Set<string>();
    for (const r of rowsToProcess) {
      if (finalIds.has(String(r.id))) {
        throw new Error(`Safety Violation: duplicate ID ${r.id} generated or preserved in payload.`);
      }
      finalIds.add(String(r.id));
    }

    const processedRows = await processRowsConcurrently(rowsToProcess, 50, forceSave);

    if (isUsingMongoDB) {
      const recordsToInsert = processedRows.map(data => ({
        pageName: name,
        data
      }));
      if (recordsToInsert.length > 0) {
        await PageRow.insertMany(recordsToInsert);
      }
      const updatedPage = await Page.findOneAndUpdate({ name }, { $inc: { rowsVersion: 1 } }, { new: true });
      rowsVersion = updatedPage?.rowsVersion || 0;
      await triggerLocalBackup();
    } else {
      const db = await getLocalDB();
      const page = db.pages.find((p: any) => p.name === name);
      if (!page) return res.status(404).json({ error: 'Page not found' });
      page.rows = [...(page.rows || []), ...processedRows];
      await saveLocalDB(db);
    }
    
    res.json({ success: true, rowsVersion });
  } catch (err: any) {
    if (err.message === 'SHARP_UNSUPPORTED_FORMAT') {
      return res.status(400).json({ requiresConfirmation: true, error: "Unsupported image format detected. The system can only process standard images (JPG, PNG, WEBP, GIF, AVIF, TIFF). Do you want to force save this file as-is without processing?" });
    }
    sendSafeError(res, 400, err, 'Failed to append rows', 'POST Append Error');
  }
});

app.delete('/api/pageRows/:name(*)/:rowId', async (req, res) => {
  try {
    let rowsVersion = 0;
    const { name, rowId } = req.params;
    let deletedRowData = null;

    if (isUsingMongoDB) {
      const allRows = await PageRow.find({ pageName: name });
      const rowToDelete = allRows.find(r => String(r.data.id) === String(rowId));
      if (!rowToDelete) {
        return res.status(404).json({ error: 'Row not found' });
      }
      deletedRowData = rowToDelete.data;
      await PageRow.findByIdAndDelete(rowToDelete._id);
      
      const updatedPage = await Page.findOneAndUpdate({ name }, { $inc: { rowsVersion: 1 } }, { new: true });
      rowsVersion = updatedPage?.rowsVersion || 0;
      await triggerLocalBackup();
    } else {
      const db = await getLocalDB();
      const page = db.pages.find((p: any) => p.name === name);
      if (!page) return res.status(404).json({ error: 'Page not found' });
      const rowToDelete = page.rows?.find((r: any) => String(r.id) === String(rowId));
      if (rowToDelete) {
        deletedRowData = rowToDelete;
        page.rows = page.rows.filter((r: any) => String(r.id) !== String(rowId));
        await saveLocalDB(db);
      }
    }
    
    if (deletedRowData) {
      await cleanupOrphanImages([deletedRowData], [], false);
    }
    
    res.json({ success: true, rowsVersion });
  } catch (err: any) {
    sendSafeError(res, 400, err, 'Failed to delete row', 'DELETE Row Error');
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const { globalCopyBoxes, globalRowNoWidth, maxSearchHistory, pageOrder, sourceSuggestionsEnabled } = req.body;
    if (isUsingMongoDB) {
      await AppSettings.findOneAndUpdate({}, { globalCopyBoxes, globalRowNoWidth, maxSearchHistory, pageOrder, sourceSuggestionsEnabled }, { upsert: true });
      await triggerLocalBackup();
    } else {
      const db = await getLocalDB();
      db.settings = { globalCopyBoxes, globalRowNoWidth, maxSearchHistory, pageOrder, sourceSuggestionsEnabled };
      await saveLocalDB(db);
    }
    res.json({ success: true });
  } catch (err: any) {
    sendSafeError(res, 400, err, 'Failed to update settings', 'Failed to update settings');
  }
});

function normalizeBackupPayload(payload: any) {
  if (!payload || typeof payload !== 'object') {
    throw new Error("Unrecognized backup format: empty or non-object payload");
  }

  const isBundle = !!payload.isBundle;
  const isSinglePage = !!(payload.name && Array.isArray(payload.rows) && !payload.pages) && !isBundle;

  let newState: any = {};
  let importType: 'merge' | 'replace' = (isBundle || isSinglePage) ? 'merge' : 'replace';
  let pagesToUpdate: string[] = [];

  if (isBundle) {
    newState = {
      pages: Array.isArray(payload.pages) ? payload.pages : [],
      pageConfigs: payload.pageConfigs || {},
      pageRows: payload.pageRows || {},
      globalCopyBoxes: payload.globalCopyBoxes ?? null,
      globalRowNoWidth: payload.globalRowNoWidth ?? 100,
      maxSearchHistory: payload.maxSearchHistory ?? 10,
      sourceSuggestionsEnabled: payload.sourceSuggestionsEnabled ?? false,
      pageOrder: Array.isArray(payload.pageOrder) ? payload.pageOrder : []
    };
    pagesToUpdate = newState.pages;
  } else if (isSinglePage) {
    newState = {
      pages: [payload.name],
      pageConfigs: { [payload.name]: payload.config || {} },
      pageRows: { [payload.name]: Array.isArray(payload.rows) ? payload.rows : [] },
      globalCopyBoxes: null,
      globalRowNoWidth: 100,
      maxSearchHistory: 10,
      sourceSuggestionsEnabled: false,
      pageOrder: []
    };
    pagesToUpdate = [payload.name];
  } else if (Array.isArray(payload.pages) && payload.pages.length > 0 && typeof payload.pages[0] === 'object') {
    // LocalDB legacy full backup format: { pages: [{ name, config, rows }] }
    const pageConfigs: any = {};
    const pageRows: any = {};
    const pageNames: string[] = [];
    payload.pages.forEach((p: any) => {
      if (p && p.name) {
        pageNames.push(p.name);
        pageConfigs[p.name] = p.config || {};
        pageRows[p.name] = p.rows || [];
      }
    });
    newState = {
      pages: pageNames,
      pageConfigs,
      pageRows,
      globalCopyBoxes: payload.settings?.globalCopyBoxes ?? null,
      globalRowNoWidth: payload.settings?.globalRowNoWidth ?? 100,
      maxSearchHistory: payload.settings?.maxSearchHistory ?? 10,
      sourceSuggestionsEnabled: payload.settings?.sourceSuggestionsEnabled ?? false,
      pageOrder: Array.isArray(payload.settings?.pageOrder) ? payload.settings?.pageOrder : []
    };
  } else if (payload.pages && Array.isArray(payload.pages) && (payload.pages.length === 0 || typeof payload.pages[0] === 'string')) {
    // Standard full backup format
    newState = {
      pages: Array.isArray(payload.pages) ? payload.pages : [],
      pageConfigs: payload.pageConfigs || {},
      pageRows: payload.pageRows || {},
      globalCopyBoxes: payload.globalCopyBoxes ?? payload.settings?.globalCopyBoxes ?? null,
      globalRowNoWidth: payload.globalRowNoWidth ?? payload.settings?.globalRowNoWidth ?? 100,
      maxSearchHistory: payload.maxSearchHistory ?? payload.settings?.maxSearchHistory ?? 10,
      sourceSuggestionsEnabled: payload.sourceSuggestionsEnabled ?? payload.settings?.sourceSuggestionsEnabled ?? false,
      pageOrder: Array.isArray(payload.pageOrder) ? payload.pageOrder : Array.isArray(payload.settings?.pageOrder) ? payload.settings?.pageOrder : []
    };
  } else {
    throw new Error("Unrecognized backup format: no pages data found");
  }

  // Ensure fields exist so we don't crash from undefined reads
  newState.pageConfigs = (newState.pageConfigs && typeof newState.pageConfigs === 'object' && !Array.isArray(newState.pageConfigs)) ? newState.pageConfigs : {};
  newState.pageRows = (newState.pageRows && typeof newState.pageRows === 'object' && !Array.isArray(newState.pageRows)) ? newState.pageRows : {};
  newState.pages = Array.isArray(newState.pages) ? newState.pages : [];

  // Fix duplicate IDs across all pages first
  if (newState.pageRows) {
    for (const pageName in newState.pageRows) {
      const seenIds = new Set<string>();
      const rowsArray = Array.isArray(newState.pageRows[pageName]) ? newState.pageRows[pageName] : [];
      newState.pageRows[pageName] = rowsArray
        .filter((row: any) => row && typeof row === 'object')
        .map((row: any) => {
          if (!row.id || seenIds.has(String(row.id))) {
            row.id = uuidv4();
          }
          seenIds.add(String(row.id));
          return row;
        });
    }
  }

  // Repair tracker rows from source pages before processing
  if (newState.pageConfigs && newState.pageRows) {
    for (const [trackerName, trackerConfig] of Object.entries(newState.pageConfigs)) {
      const config = trackerConfig as any;
      if (!config || typeof config !== 'object') {
        console.warn(`Skipping tracker repair for ${trackerName} due to invalid config`);
        continue;
      }
      
      if (config.linkedSourcePage && Array.isArray(newState.pageRows[config.linkedSourcePage])) {
        const sourceRows = newState.pageRows[config.linkedSourcePage].filter((sr: any) => sr && typeof sr === 'object');
        
        if (!Array.isArray(newState.pageRows[trackerName])) {
          newState.pageRows[trackerName] = [];
        }
        
        const trackerRowsMap = new Map();
        for (const tr of newState.pageRows[trackerName]) {
          if (tr && typeof tr === 'object' && tr.id) trackerRowsMap.set(String(tr.id), tr);
        }
        
        const repairedTrackerRows = sourceRows.map((sr: any) => {
          const existingTr = trackerRowsMap.get(String(sr.id));
          if (existingTr) {
            const trackerKeysToKeep = [
              "total_qty",
              "remaining_qty"
            ];
            if (Array.isArray(config.columns)) {
              config.columns.forEach((c: any) => {
                if (c && typeof c === 'object' && c.type === "sale_tracker" && c.key) {
                  trackerKeysToKeep.push(c.key);
                }
              });
            }
            const preservedData: any = {};
            for (const k of trackerKeysToKeep) {
              if (k in existingTr) preservedData[k] = existingTr[k];
            }
            return { ...sr, ...preservedData };
          } else {
            return { ...sr, total_qty: "0" };
          }
        });
        
        newState.pageRows[trackerName] = repairedTrackerRows;
      }
    }
  }

  return { newState, importType, pagesToUpdate, isBundle, isSinglePage };
}


app.post('/api/admin/backfill-thumbnails', async (req, res) => {
  try {
    const summary = await backfillThumbnails(UPLOADS_DIR);
    res.json(summary);
  } catch (err: any) {
    sendSafeError(res, 500, err, 'Failed to backfill thumbnails', 'Error backfilling thumbnails');
  }
});

app.post('/api/admin/hard-clear', async (req, res) => {
  try {
    let pagesDeleted = 0;
    let rowsDeleted = 0;
    let settingsDeleted = 0;

    if (isUsingMongoDB) {
      const pageResult = await Page.deleteMany({});
      const rowResult = await PageRow.deleteMany({});
      const settingsResult = await AppSettings.deleteMany({});
      
      pagesDeleted = pageResult.deletedCount || 0;
      rowsDeleted = rowResult.deletedCount || 0;
      settingsDeleted = settingsResult.deletedCount || 0;
      
      await triggerLocalBackup();
    } else {
      const db = await getLocalDB();
      pagesDeleted = db.pages ? db.pages.length : 0;
      rowsDeleted = db.pages ? db.pages.reduce((acc: number, p: any) => acc + (p.rows ? p.rows.length : 0), 0) : 0;
      
      db.pages = [];
      db.settings = {};
      await saveLocalDB(db);
    }
    
    // Optionally wipe all uploads if we wanted, but not strictly needed unless requested for space.
    // We'll stick to just DB for now to avoid breaking references if someone kept a file somehow,
    // though hard-clear means wipe everything. Let's do it if it's safe.
    // The prompt says "Optionally also clear orphaned uploaded image files, but ONLY within this explicit hard-clear (never elsewhere)."
    // Let's implement that.
    try {
      if (fs.existsSync(UPLOADS_DIR)) {
        const files = fs.readdirSync(UPLOADS_DIR);
        for (const file of files) {
          if (file !== '.gitkeep') {
            fs.unlinkSync(path.join(UPLOADS_DIR, file));
          }
        }
      }
    } catch (e) {
      console.error("Failed to wipe uploads directory:", e);
    }

    res.json({ success: true, pagesDeleted, rowsDeleted, settingsDeleted });
  } catch (err: any) {
    sendSafeError(res, 500, err, 'Failed to hard-clear database', 'Failed to hard-clear database');
  }
});

app.put('/api/state', async (req, res) => {
  try {
    const payload = req.body;
    const { newState, importType, pagesToUpdate, isBundle, isSinglePage } = normalizeBackupPayload(payload);

    // Process all images in the new state
    const processedPageRows: Record<string, any[]> = {};
    const imageProcessingCache = new Map<string, Promise<string>>(); // Deduplication cache across all pages
    if (newState.pageRows) {
      for (const pageName in newState.pageRows) {
        const isTracker = newState.pageConfigs?.[pageName]?.linkedSourcePage;
        if (isTracker) {
          // Shallow copy for Linked Page/Live Tracker to avoid re-processing images
          processedPageRows[pageName] = [...newState.pageRows[pageName]];
        } else {
          processedPageRows[pageName] = await processRowsConcurrently(newState.pageRows[pageName], 50, true, imageProcessingCache);
        }
      }
    }

    if (isUsingMongoDB) {
      if (isSinglePage || isBundle) {
        for (const pageName of pagesToUpdate) {
          await Page.findOneAndUpdate(
            { name: pageName },
            { name: pageName, config: newState.pageConfigs[pageName] || {} },
            { upsert: true }
          );

          const baseOrder = Date.now();
          const existingDocs = await PageRow.find({ pageName }, { _id: 1, 'data.id': 1 }).lean();
          
          let rows = processedPageRows[pageName] || [];
          const rowMap = new Map();
          rows.forEach((r: any) => {
             if (r.id) rowMap.set(String(r.id), r);
          });
          rows = Array.from(rowMap.values());
          
          const bulkOps: any[] = [];
          const incomingIdsSet = new Set(rows.map((r: any) => String(r.id)));
          
          rows.forEach((row: any, i: number) => {
            bulkOps.push({
              updateOne: {
                filter: { pageName, 'data.id': String(row.id) },
                update: { $set: { pageName, order: baseOrder + i, data: row } },
                upsert: true
              }
            });
          });
          
          existingDocs.forEach((doc: any) => {
            const docId = doc.data?.id ? String(doc.data.id) : null;
            if (!docId || !incomingIdsSet.has(docId)) {
              bulkOps.push({
                deleteOne: {
                  filter: { _id: doc._id }
                }
              });
            }
          });
          
          await executeSafeBulkWrite(bulkOps);
        }
        await triggerLocalBackup();
      } else {
        // Fetch all existing rows to cleanup images
        const allOldPageRows = await getSortedPageRows({});
        const allOldRows = allOldPageRows.map((r: any) => r.data);
        
        const allNewRows: any[] = [];
        for (const pageName in processedPageRows) {
          allNewRows.push(...processedPageRows[pageName]);
        }
        
        await cleanupOrphanImages(allOldRows, allNewRows, true);
        await diskSweepOrphans(allNewRows);

        const snapPages = await Page.find({});
        const snapRows = await getSortedPageRows({});
        const snapSettings = await AppSettings.find({});

        try {
          // Clear absent pages from Page collection
          const importedPages = newState.pages || [];
          await Page.deleteMany({ name: { $nin: importedPages } });
          
          // Upsert pages that are present
          for (const pageName of importedPages) {
            await Page.findOneAndUpdate(
              { name: pageName },
              { name: pageName, config: newState.pageConfigs[pageName] || {} },
              { upsert: true }
            );
          }

          // Build bulkOps for rows
          const bulkOps: any[] = [];
          const baseOrder = Date.now();
          
          const existingDocs = await PageRow.find({}, { _id: 1, 'data.id': 1, pageName: 1 }).lean();
          
          const importedRowsByPage = new Map();
          importedPages.forEach((pageName: string) => {
            let rows = processedPageRows[pageName] || [];
            const rowMap = new Map();
            rows.forEach((r: any) => {
              if (r.id) rowMap.set(String(r.id), r);
            });
            rows = Array.from(rowMap.values());
            importedRowsByPage.set(pageName, rows);
            
            rows.forEach((row: any, i: number) => {
              bulkOps.push({
                updateOne: {
                  filter: { pageName, 'data.id': String(row.id) },
                  update: { $set: { pageName, order: baseOrder + i, data: row } },
                  upsert: true
                }
              });
            });
          });
          
          existingDocs.forEach((doc: any) => {
            const pageName = doc.pageName;
            if (!importedPages.includes(pageName)) {
              bulkOps.push({
                deleteOne: { filter: { _id: doc._id } }
              });
            } else {
              const docId = doc.data?.id ? String(doc.data.id) : null;
              const incomingRowsForPage = importedRowsByPage.get(pageName) || [];
              const incomingIds = new Set(incomingRowsForPage.map((r: any) => String(r.id)));
              if (!docId || !incomingIds.has(docId)) {
                bulkOps.push({
                  deleteOne: { filter: { _id: doc._id } }
                });
              }
            }
          });
          
          await executeSafeBulkWrite(bulkOps);
          
          // Update settings
          await AppSettings.findOneAndUpdate({}, {
            globalCopyBoxes: newState.globalCopyBoxes,
            globalRowNoWidth: newState.globalRowNoWidth,
            maxSearchHistory: newState.maxSearchHistory,
            sourceSuggestionsEnabled: newState.sourceSuggestionsEnabled
          }, { upsert: true });

          await triggerLocalBackup();
        } catch (importErr: any) {
          console.error("Import failed, rolling back to snapshot:", importErr);
          await Page.deleteMany({});
          await PageRow.deleteMany({});
          await AppSettings.deleteMany({});

          if (snapPages.length > 0) {
            await Page.insertMany(snapPages.map(p => ({ name: p.name, config: p.config })));
          }
          if (snapRows.length > 0) {
            await PageRow.insertMany(snapRows.map(r => ({ pageName: r.pageName, data: r.data })));
          }
          if (snapSettings.length > 0) {
            await AppSettings.insertMany(snapSettings.map(s => ({
              globalCopyBoxes: s.globalCopyBoxes,
              globalRowNoWidth: s.globalRowNoWidth,
              maxSearchHistory: s.maxSearchHistory,
              sourceSuggestionsEnabled: s.sourceSuggestionsEnabled,
              pageOrder: s.pageOrder
            })));
          }
          throw new Error("Import failed, previous data restored");
        }
      }
    } else {
      const db = await getLocalDB();
      if (isSinglePage || isBundle) {
        for (const pageName of pagesToUpdate) {
          const pageIdx = db.pages.findIndex((p: any) => p.name === pageName);
          const newPageData = {
            name: pageName,
            config: newState.pageConfigs[pageName] || {},
            rows: processedPageRows[pageName] || []
          };

          if (pageIdx >= 0) {
            db.pages[pageIdx] = newPageData;
          } else {
            db.pages.push(newPageData);
          }
        }
        await saveLocalDB(db);
      } else {
        const allOldRows: any[] = [];
        db.pages.forEach((p: any) => {
          if (p.rows) allOldRows.push(...p.rows);
        });

        const allNewRows: any[] = [];
        for (const pageName in processedPageRows) {
          allNewRows.push(...processedPageRows[pageName]);
        }
        await cleanupOrphanImages(allOldRows, allNewRows, true);
        await diskSweepOrphans(allNewRows);

        const oldDbCopy = JSON.parse(JSON.stringify(db));

        try {
          const newDb = {
            pages: newState.pages.map((name: string) => ({
              name,
              config: newState.pageConfigs[name] || {},
              rows: processedPageRows[name] || []
            })),
            settings: {
              globalCopyBoxes: newState.globalCopyBoxes,
              globalRowNoWidth: newState.globalRowNoWidth,
              maxSearchHistory: newState.maxSearchHistory,
            sourceSuggestionsEnabled: newState.sourceSuggestionsEnabled
            }
          };
          await saveLocalDB(newDb);
        } catch (importErr: any) {
          console.error("Import failed, rolling back to snapshot:", importErr);
          await saveLocalDB(oldDbCopy);
          throw new Error("Import failed, previous data restored");
        }
      }
    }
    
    // Clear processing cache to free up memory
    imageProcessingCache.clear();
    
    res.json({ success: true });
  } catch (err: any) {
    sendSafeError(res, 400, err, 'Failed to sync state', 'Bulk sync error');
  }
});

app.post('/api/import-zip', upload.single('backup'), async (req, res) => {
  const _diag = {
    start: Date.now(),
    zipSize: 0,
    extractStart: 0, extractEnd: 0, extractCount: 0, extractBytes: 0,
    jsonStart: 0, jsonEnd: 0,
    orphanStart: 0, orphanEnd: 0,
    pages: [] as {name: string, duration: number, rows: number}[]
  };

  const isStream = req.query.stream === '1';
  if (isStream) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
  }

  const sendProgress = (percent, message, file = undefined) => {
    if (isStream) {
      res.write(JSON.stringify({ type: 'progress', percent, message, file }) + '\n');
    }
  };

  try {
    if (!req.file) {
      const errorMsg = 'No backup file provided';
      if (isStream) {
        res.end(JSON.stringify({ type: 'error', error: errorMsg }) + '\n');
        return;
      } else {
        return res.status(400).json({ error: errorMsg });
      }
    }

    try { 
      _diag.extractStart = Date.now(); 
      _diag.zipSize = req.file ? req.file.size : 0;
      console.log(`[IMPORT] Received ZIP payload: ${_diag.zipSize} bytes (${(_diag.zipSize / (1024 * 1024)).toFixed(2)} MB)`);
    } catch(e) {}
    sendProgress(5, 'Reading backup archive...');
    
    const zip = new AdmZip(req.file.path);
    const zipEntries = zip.getEntries();
    
    // Extract uploads if existing
    const uploadEntries = zipEntries.filter((entry) => entry.entryName.startsWith('uploads/') && !entry.isDirectory);
    const totalUploadEntries = uploadEntries.length;
    let extractedCount = 0;

    zipEntries.forEach((entry) => {
      if (entry.entryName.startsWith('uploads/') && !entry.isDirectory) {
        extractedCount++;
        try { _diag.extractCount++; _diag.extractBytes += entry.header.size; } catch(e) {}
        if (totalUploadEntries > 0) {
           const pct = 5 + Math.floor((extractedCount / totalUploadEntries) * 55);
           sendProgress(pct, 'Extracting images...', entry.entryName.replace(/^uploads\//, ''));
        }
        zip.extractEntryTo(entry.entryName, UPLOADS_DIR, false, true);
      }
    });

    try { _diag.extractEnd = Date.now(); _diag.jsonStart = Date.now(); } catch(e) {}
    const dataEntry = zipEntries.find((entry) => entry.entryName === 'data.json');
    if (!dataEntry) {
      const errorMsg = 'data.json not found in zip archive';
      if (isStream) {
        res.end(JSON.stringify({ type: 'error', error: errorMsg }) + '\n');
        return;
      } else {
        return res.status(400).json({ error: errorMsg });
      }
    }

    try { _diag.extractCount++; _diag.extractBytes += dataEntry.header.size; } catch(e) {}
    let payload; try { payload = JSON.parse(dataEntry.getData().toString('utf8')); } catch(e) { throw new Error("Invalid or corrupted data.json inside zip archive"); }
    sendProgress(65, 'Reading data.json...');
    const { newState, importType, pagesToUpdate, isBundle, isSinglePage } = normalizeBackupPayload(payload);
    console.log(`Import ZIP detected: ${isBundle ? 'Bundle' : isSinglePage ? 'Single Page' : 'Full Backup'}`);

    try { _diag.jsonEnd = Date.now(); } catch(e) {}
    sendProgress(70, 'Preparing pages and rows...');

    // We do NOT process base64 images here because they are already extracted physical files.
    const processedPageRows = newState.pageRows || {};

    if (isUsingMongoDB) {
      if (isSinglePage || isBundle) {
        for (let i = 0; i < pagesToUpdate.length; i++) {
          const pageName = pagesToUpdate[i];
          let _pgStart = 0; try { _pgStart = Date.now(); } catch(e) {}
          const pct = 70 + Math.floor((i / pagesToUpdate.length) * 25);
          const rows = processedPageRows[pageName] || [];
          sendProgress(pct, `Importing page "${pageName}" (${rows.length} rows)...`);
          
          // Upsert page config
          await Page.findOneAndUpdate(
            { name: pageName },
            { name: pageName, config: newState.pageConfigs[pageName] || {} },
            { upsert: true }
          );

          const baseOrder = Date.now();
          const existingDocs = await PageRow.find({ pageName }, { _id: 1, 'data.id': 1 }).lean();
          
          let deduplicatedRows = rows;
          const rowMap = new Map();
          deduplicatedRows.forEach((r: any) => {
             if (r.id) rowMap.set(String(r.id), r);
          });
          deduplicatedRows = Array.from(rowMap.values());
          
          const bulkOps: any[] = [];
          const incomingIdsSet = new Set(deduplicatedRows.map((r: any) => String(r.id)));
          
          deduplicatedRows.forEach((row: any, j: number) => {
            bulkOps.push({
              updateOne: {
                filter: { pageName, 'data.id': String(row.id) },
                update: { $set: { pageName, order: baseOrder + j, data: row } },
                upsert: true
              }
            });
          });
          
          existingDocs.forEach((doc: any) => {
            const docId = doc.data?.id ? String(doc.data.id) : null;
            if (!docId || !incomingIdsSet.has(docId)) {
              bulkOps.push({
                deleteOne: {
                  filter: { _id: doc._id }
                }
              });
            }
          });
          
          await executeSafeBulkWrite(bulkOps);
          try { _diag.pages.push({ name: pageName, duration: Date.now() - _pgStart, rows: rows.length }); } catch(e) {}
        }
      } else {
        // Fetch all existing rows to cleanup images
        const allOldPageRows = await getSortedPageRows({});
        const allOldRows = allOldPageRows.map((r: any) => r.data);
        
        const allNewRows: any[] = [];
        for (const pageName in processedPageRows) {
          allNewRows.push(...processedPageRows[pageName]);
        }
        
        try { _diag.orphanStart = Date.now(); } catch(e) {}
        sendProgress(96, 'Cleaning up unused images...');
        await cleanupOrphanImages(allOldRows, allNewRows, true);
        await diskSweepOrphans(allNewRows);
        try { _diag.orphanEnd = Date.now(); } catch(e) {}

        // Clear absent pages from Page collection
        const importedPages = newState.pages || [];
        await Page.deleteMany({ name: { $nin: importedPages } });
        
        // Upsert pages that are present
        for (const pageName of importedPages) {
          await Page.findOneAndUpdate(
            { name: pageName },
            { name: pageName, config: newState.pageConfigs[pageName] || {} },
            { upsert: true }
          );
        }

        // Build bulkOps for rows
        const bulkOps: any[] = [];
        const baseOrder = Date.now();
        
        let _dbStart = 0; try { _dbStart = Date.now(); } catch(e) {}
        const existingDocs = await PageRow.find({}, { _id: 1, 'data.id': 1, pageName: 1 }).lean();
        
        const importedRowsByPage = new Map();
        const totalPages = importedPages.length;
        importedPages.forEach((pageName: string, i: number) => {
          let _pgStart = 0; try { _pgStart = Date.now(); } catch(e) {}
          let rows = processedPageRows[pageName] || [];
          const rowMap = new Map();
          rows.forEach((r: any) => {
            if (r.id) rowMap.set(String(r.id), r);
          });
          rows = Array.from(rowMap.values());
          importedRowsByPage.set(pageName, rows);
          
          const pct = 70 + Math.floor((i / Math.max(1, totalPages)) * 23);
          sendProgress(pct, `Importing page "${pageName}" (${rows.length} rows)...`);
          
          rows.forEach((row: any, j: number) => {
            bulkOps.push({
              updateOne: {
                filter: { pageName, 'data.id': String(row.id) },
                update: { $set: { pageName, order: baseOrder + j, data: row } },
                upsert: true
              }
            });
          });
          try { _diag.pages.push({ name: pageName, duration: Date.now() - _pgStart, rows: rows.length }); } catch(e) {}
        });
        
        existingDocs.forEach((doc: any) => {
          const pageName = doc.pageName;
          if (!importedPages.includes(pageName)) {
            bulkOps.push({
              deleteOne: { filter: { _id: doc._id } }
            });
          } else {
            const docId = doc.data?.id ? String(doc.data.id) : null;
            const incomingRowsForPage = importedRowsByPage.get(pageName) || [];
            const incomingIds = new Set(incomingRowsForPage.map((r: any) => String(r.id)));
            if (!docId || !incomingIds.has(docId)) {
              bulkOps.push({
                deleteOne: { filter: { _id: doc._id } }
              });
            }
          }
        });
        
        sendProgress(93, 'Writing to database...');
        await executeSafeBulkWrite(bulkOps);
        try { _diag.pages.push({ name: 'DB Bulk Write', duration: Date.now() - _dbStart, rows: bulkOps.length }); } catch(e) {}
        
        // Update settings
        await AppSettings.findOneAndUpdate({}, {
          globalCopyBoxes: newState.globalCopyBoxes,
          globalRowNoWidth: newState.globalRowNoWidth,
          maxSearchHistory: newState.maxSearchHistory,
            sourceSuggestionsEnabled: newState.sourceSuggestionsEnabled
        }, { upsert: true });
      }
      await triggerLocalBackup();
    } else {
      const db = await getLocalDB();
      if (isSinglePage || isBundle) {
        for (let i = 0; i < pagesToUpdate.length; i++) {
          const pageName = pagesToUpdate[i];
          const pct = 70 + Math.floor((i / pagesToUpdate.length) * 25);
          let _pgStart = 0; try { _pgStart = Date.now(); } catch(e) {}
          const newRows = processedPageRows[pageName] || [];
          sendProgress(pct, `Importing page "${pageName}" (${newRows.length} rows)...`);
          
          const pageIdx = db.pages.findIndex((p: any) => p.name === pageName);
          const newPageData = {
            name: pageName,
            config: newState.pageConfigs[pageName] || {},
            rows: newRows
          };
          if (pageIdx >= 0) {
            db.pages[pageIdx] = newPageData;
          } else {
            db.pages.push(newPageData);
          }
          try { _diag.pages.push({ name: pageName, duration: Date.now() - _pgStart, rows: newRows.length }); } catch(e) {}
        }
        await saveLocalDB(db);
      } else {
        const allOldRows: any[] = [];
        db.pages.forEach((p: any) => {
          if (p.rows) allOldRows.push(...p.rows);
        });
        const allNewRows: any[] = [];
        for (const pageName in processedPageRows) {
          allNewRows.push(...processedPageRows[pageName]);
        }
        
        sendProgress(96, 'Cleaning up unused images...');
        await cleanupOrphanImages(allOldRows, allNewRows, true);
        await diskSweepOrphans(allNewRows);

        const totalPages = newState.pages.length;
        const newDb = {
          pages: newState.pages.map((name: string, i: number) => {
            const pct = 70 + Math.floor((i / Math.max(1, totalPages)) * 25);
            const rows = processedPageRows[name] || [];
            sendProgress(pct, `Importing page "${name}" (${rows.length} rows)...`);
            
            return {
              name,
              config: newState.pageConfigs[name] || {},
              rows: rows
            };
          }),
          settings: {
            globalCopyBoxes: newState.globalCopyBoxes,
            globalRowNoWidth: newState.globalRowNoWidth,
            maxSearchHistory: newState.maxSearchHistory,
            sourceSuggestionsEnabled: newState.sourceSuggestionsEnabled
          }
        };
        await saveLocalDB(newDb);
      }
    }

    // Clean up temp file
    fs.unlinkSync(req.file.path);
    
    // DIAGNOSTIC REPORT
    try {
      const totalTime = Date.now() - _diag.start;
      const imgTime = _diag.extractEnd ? (_diag.extractEnd - _diag.extractStart) / 1000 : 0;
      const jsonTime = _diag.jsonEnd ? (_diag.jsonEnd - _diag.jsonStart) / 1000 : 0;
      const orphanTime = _diag.orphanEnd ? (_diag.orphanEnd - _diag.orphanStart) / 1000 : 0;
      
      let phases: {name: string, time: number}[] = [
        {name: 'ZIP extraction/unzip', time: imgTime},
        {name: 'data.json parse', time: jsonTime},
        {name: 'Orphan cleanup', time: orphanTime}
      ];
      
      console.log('=== IMPORT TIMING SUMMARY ===');
      console.log(`ZIP extraction/unzip: ${imgTime.toFixed(1)}s (${_diag.extractCount} files, ${(_diag.extractBytes / (1024 * 1024)).toFixed(2)} MB written)`);
      console.log(`data.json parse: ${jsonTime.toFixed(1)}s`);
      
      _diag.pages.forEach(p => {
         const pTime = p.duration / 1000;
         phases.push({name: `Page "${p.name}"`, time: pTime});
         console.log(`Page "${p.name}": ${pTime.toFixed(1)}s (${p.rows} rows)`);
      });
      
      if (_diag.orphanEnd) {
         console.log(`Orphan cleanup: ${orphanTime.toFixed(1)}s`);
      } else {
         console.log(`Orphan cleanup: skipped`);
      }
      console.log(`TOTAL IMPORT TIME: ${(totalTime / 1000).toFixed(1)}s`);
      
      phases.sort((a, b) => b.time - a.time);
      if (phases.length > 0) {
         console.log(`Slowest phase: ${phases[0].name} (${phases[0].time.toFixed(1)}s)`);
      }
      console.log('=============================');
    } catch(e) {}

    if (isStream) {
      res.end(JSON.stringify({ type: 'done', percent: 100, message: 'Import complete', success: true }) + '\n');
    } else {
      res.json({ success: true });
    }
  } catch (err: any) {
    console.error('Import zip error:', err);
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    const errorMsg = err.message === 'Invalid or corrupted data.json inside zip archive' ? err.message : 'Failed to import zip state';
    if (isStream) {
      res.end(JSON.stringify({ type: 'error', error: errorMsg }) + '\n');
    } else {
      res.status(400).json({ error: errorMsg });
    }
  }
});

// Vite Middleware for Development
async function startServer() {
  purgeTempUploadsOnStartup();
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum allowed size per file is 50 MB.' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(413).json({ error: 'Too many files uploaded at once. Maximum is 2000 files.' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(413).json({ error: 'Unexpected file field received.' });
      }
      return res.status(413).json({ error: `Upload rejected: ${err.code}` });
    }
    next(err);
  });

  // Global error handler for API routes to prevent HTML error pages (e.g., from multer limits)
  app.use('/api', (err: any, req: any, res: any, next: any) => {
    sendSafeError(res, err.status || 500, err, 'Internal Server Error', 'API Error');
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

async function flushBackupAndExit() {
  if (localBackupTimeout) {
    clearTimeout(localBackupTimeout);
    localBackupTimeout = null;
    await performLocalBackup();
  } else if (pendingBackup) {
    await performLocalBackup();
  }
  process.exit(0);
}

process.on('SIGINT', flushBackupAndExit);
process.on('SIGTERM', flushBackupAndExit);

startServer();
