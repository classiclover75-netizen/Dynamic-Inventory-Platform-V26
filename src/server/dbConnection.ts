import mongoose from 'mongoose';
import fs from 'fs';

let currentMode: 'mongodb' | 'local-file' = 'local-file';
let connectedAtTime: string | null = null;

export function getStorageMode() {
  return {
    mode: currentMode,
    connectedAt: connectedAtTime
  };
}

export async function connectDatabase(options?: { onConnected?: () => Promise<void>, onConnectionEstablished?: () => void }): Promise<{ usingMongoDB: boolean, reason: string | null, mode: 'mongodb' | 'local-file' }> {
  // 1. Clean the URI (remove extra quotes or spaces)
  let rawUri = process.env.MONGODB_URI;
  if (rawUri) {
    rawUri = rawUri.replace(/^["']|["']$/g, '').trim();
  }

  // 2. Determine final URI
  const uri = rawUri || (process.env.NODE_ENV === 'production' ? 'mongodb://db:27017/inventory' : '');

  // 3. Fallback check for AI Studio / Local Preview
  if (!uri || (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://'))) {
    const reason = 'No valid MONGODB_URI found (Invalid scheme or empty). Using local file storage fallback for preview.';
    console.warn(reason);
    currentMode = 'local-file';
    return { usingMongoDB: false, reason, mode: 'local-file' };
  }

  // 4. Connection Loop
  const maxRetries = 10;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      console.log('Connected to MongoDB');
      
      currentMode = 'mongodb';
      connectedAtTime = new Date().toISOString();
      
      if (options?.onConnectionEstablished) {
        try {
          options.onConnectionEstablished();
        } catch (err) {
          console.error('Error in onConnectionEstablished:', err);
        }
      }
      
      if (options?.onConnected) {
        await options.onConnected();
      }
      
      return { usingMongoDB: true, reason: null, mode: 'mongodb' };
    } catch (err: any) {
      retries++;
      console.error(`MongoDB connection attempt ${retries} failed. ${err.message}`);
      if (retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
  
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: MongoDB is unreachable. Refusing to start in file-storage mode to prevent data being written to the wrong location.');
    process.exit(1);
  } else {
    const reason = 'Could not connect to MongoDB after retries. Falling back to local file storage for preview.';
    console.warn(reason);
    currentMode = 'local-file';
    return { usingMongoDB: false, reason, mode: 'local-file' };
  }
}

export async function syncDatabaseParity(deps: {
  Page: any,
  PageRow: any,
  AppSettings: any,
  getSortedPageRows: any,
  localDbPath: string
}) {
  const { Page, PageRow, AppSettings, getSortedPageRows, localDbPath } = deps;
  try {
    const mongoPageCount = await Page.countDocuments();
    const localExists = fs.existsSync(localDbPath);
    let localData = { pages: [], settings: {} } as any;
    if (localExists) {
      try {
        const raw = await fs.promises.readFile(localDbPath, 'utf-8');
        localData = JSON.parse(raw);
      } catch (e) {
        // ignore
      }
    }

    if (mongoPageCount === 0 && localData.pages && localData.pages.length > 0) {
      console.log('MongoDB is empty but local db.json has pages. Syncing local to MongoDB...');
      for (const localPage of localData.pages) {
        await Page.create({ name: localPage.name, config: localPage.config || {} });
        const rowsToInsert = (localPage.rows || []).map((row: any) => ({
          pageName: localPage.name,
          data: row
        }));
        if (rowsToInsert.length > 0) {
          await PageRow.insertMany(rowsToInsert);
        }
      }
      
      if (localData.settings) {
        await AppSettings.findOneAndUpdate({}, {
          globalCopyBoxes: localData.settings.globalCopyBoxes,
          globalRowNoWidth: localData.settings.globalRowNoWidth,
          maxSearchHistory: localData.settings.maxSearchHistory,
          sourceSuggestionsEnabled: localData.settings.sourceSuggestionsEnabled
        }, { upsert: true });
      }
      console.log('Local to MongoDB sync complete.');
    } else if (mongoPageCount > 0) {
      console.log('MongoDB has data. Writing/updating a backup copy to local db.json to maintain consistency...');
      const pages = await Page.find({});
      const pageRows = await getSortedPageRows({});
      const settings = await AppSettings.findOne({});
      
      const localPagesList = [];
      for (const page of pages) {
        const rowsForPage = pageRows.filter((r: any) => r.pageName === page.name).map((r: any) => r.data);
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
      await fs.promises.writeFile(localDbPath, JSON.stringify(newLocalDb, null, 2));
      console.log('MongoDB to local db.json backup complete.');
    }
  } catch (err) {
    console.error('Failed to run database parity sync:', err);
  }
}
