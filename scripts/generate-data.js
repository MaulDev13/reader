/*
 * Data generator for the TXT reader.
 *
 * Builds two kinds of files inside /data:
 *
 *   manifest.json            Top-level listing. Contains every loose .txt file
 *                            (sitting directly in /data) plus every folder
 *                            (each folder = a "book" with chapters).
 *
 *   <folder>/index.json      Per-folder chapter listing, sorted by chapter
 *                            number, with the title pulled from each chapter's
 *                            front-matter (title only).
 *
 * Usage:
 *   node scripts/generate-data.js
 *       -> rebuild manifest.json AND every folder's index.json  (full build)
 *
 *   node scripts/generate-data.js <folder>
 *       -> rebuild only that one folder's index.json            (fast)
 *
 *   node scripts/generate-data.js --manifest-only
 *       -> rebuild only manifest.json                           (no indexes)
 *
 *   node scripts/generate-data.js --library-only
 *       -> seed library.json if missing (home page cards)       (preserves yours)
 *
 *   node scripts/generate-data.js --library-example
 *       -> (re)generate library-example.json from the folders   (disposable)
 *
 *   node scripts/generate-data.js --help
 *       -> show usage and examples
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const MANIFEST_PATH = path.join(DATA_DIR, "manifest.json");
const LIBRARY_PATH = path.join(DATA_DIR, "library.json");
const LIBRARY_EXAMPLE_PATH = path.join(DATA_DIR, "library-example.json");

const TXT_EXT = ".txt";
const INDEX_FILE = "index.json";

// Starter cards written to library.json when it does not exist yet.
// Each entry drives one card on the home page. `category` is matched against
// the `label` of manifest / folder entries to decide what a card shows.
const LIBRARY_SEED = [
    {
        category: ["Shadow", "Slave"],
        icon: "📚",
        title: "Shadow Slave",
        description: "Long-form story with chapters"
    },
    {
        category: ["Guide"],
        icon: "📖",
        title: "Guides",
        description: "How-to and reference documents"
    }
];

// ------------------------------------------------------
// Help
// ------------------------------------------------------

const HELP = `
Data generator for the TXT reader.

Builds files inside /data:
  manifest.json          Top-level listing: every loose .txt file plus every
                         folder (each folder = a "book" with chapters).
  <folder>/index.json    Per-folder chapter listing, sorted by chapter number,
                         with the title pulled from each chapter's front-matter.
  library.json           Home page cards (category/icon/title/description).
                         Seeded once, then hand-edited and preserved.
  library-example.json   Disposable reference: one card per folder.

USAGE:
  node scripts/generate-data.js [options] [folder]

OPTIONS:
  (no argument)          Full build: every folder's index.json, manifest.json,
                         and seed library.json if missing.
  <folder>               Rebuild only that one folder's index.json, then
                         refresh manifest.json. Fast when you add chapters to
                         a single book.
  --manifest-only        Rebuild only manifest.json (skips scanning chapters).
  --library-only         Seed library.json if missing. Never overwrites an
                         existing library.json (your edits are safe).
  --library-example      (Re)generate library-example.json from the folders.
                         Always overwritten; it is just a reference to copy from.
  -h, --help             Show this help and exit.

EXAMPLES:
  node scripts/generate-data.js
      Rebuild everything. Use on first run or after adding/removing a folder.

  node scripts/generate-data.js shadow-slave
      Rebuild just the shadow-slave book after adding new chapters to it.

  node scripts/generate-data.js --manifest-only
      Refresh the top-level listing only (e.g. after adding a loose .txt).

  node scripts/generate-data.js --library-only
      Create a starter library.json without touching an existing one.

  node scripts/generate-data.js --library-example
      Regenerate library-example.json so you can copy folder cards into
      library.json.

NPM SHORTCUTS:
  npm run manifest          -> node scripts/generate-data.js
  npm run manifest:only     -> node scripts/generate-data.js --manifest-only
  npm run library           -> node scripts/generate-data.js --library-only
  npm run library:example   -> node scripts/generate-data.js --library-example
`;

function printHelp() {
    console.log(HELP.trimStart());
}

// ------------------------------------------------------
// Helpers
// ------------------------------------------------------

function isTxt(file) {
    return path.extname(file).toLowerCase() === TXT_EXT;
}

// Turn a file/folder name into a Title Case label array.
function toLabel(name) {
    return name
        .split(/[_\-\s]+/)
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// Numeric-aware sort for "chapter-10.txt" vs "chapter-2.txt".
function naturalCompare(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

// Read only the front-matter block (--- ... ---) at the top of a chapter and
// return the fields we care about. Only the first ~40 lines are scanned so we
// never read an entire large chapter just to grab the title.
function readFrontMatter(filePath) {
    let raw = "";
    try {
        raw = fs.readFileSync(filePath, "utf8");
    } catch {
        return {};
    }

    const lines = raw.replace(/\r\n?/g, "\n").split("\n");

    // Find the opening fence (allow leading blank lines).
    let i = 0;
    while (i < lines.length && lines[i].trim() === "") i++;
    if (lines[i] === undefined || lines[i].trim() !== "---") return {};

    i++; // move past opening ---
    const meta = {};
    const MAX = i + 40; // safety bound

    for (; i < lines.length && i < MAX; i++) {
        const line = lines[i];
        if (line.trim() === "---") break; // closing fence

        const m = line.match(/^\s*([A-Za-z0-9_]+)\s*:\s*(.*)$/);
        if (!m) continue;

        const key = m[1];
        let value = m[2].trim().replace(/^["']|["']$/g, ""); // strip surrounding quotes
        meta[key] = value;
    }

    return meta;
}

// Extract a chapter number: prefer front-matter `chapter`, fall back to the
// digits in the filename (chapter-12.txt -> 12).
function chapterNumber(fileName, meta) {
    const fromMeta = parseInt(meta.chapter, 10);
    if (!isNaN(fromMeta)) return fromMeta;

    const m = path.parse(fileName).name.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

// ------------------------------------------------------
// Per-folder index.json
// ------------------------------------------------------

function buildFolderIndex(folderName) {
    const folderPath = path.join(DATA_DIR, folderName);

    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
        console.error(`Not a folder: ${folderPath}`);
        return null;
    }

    const files = fs
        .readdirSync(folderPath)
        .filter(isTxt)
        .sort(naturalCompare);

    const chapters = files.map(file => {
        const meta = readFrontMatter(path.join(folderPath, file));
        return {
            file,
            chapter: chapterNumber(file, meta),
            title: meta.title || path.parse(file).name
        };
    });

    // Sort by chapter number (nulls last), keeping natural order as tiebreak.
    chapters.sort((a, b) => {
        if (a.chapter == null && b.chapter == null) return naturalCompare(a.file, b.file);
        if (a.chapter == null) return 1;
        if (b.chapter == null) return -1;
        return a.chapter - b.chapter;
    });

    const index = {
        folder: folderName,
        label: toLabel(folderName),
        count: chapters.length,
        chapters
    };

    fs.writeFileSync(
        path.join(folderPath, INDEX_FILE),
        JSON.stringify(index, null, 2)
    );

    console.log(`${folderName}/index.json  (${chapters.length} chapters)`);
    return index;
}

// ------------------------------------------------------
// Top-level manifest.json
// ------------------------------------------------------

function buildManifest() {
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });

    const manifest = [];

    // Loose .txt files -> single documents.
    entries
        .filter(e => e.isFile() && isTxt(e.name))
        .map(e => e.name)
        .sort(naturalCompare)
        .forEach(file => {
            const label = toLabel(path.parse(file).name);
            manifest.push({
                type: "txt",
                file,
                label,
                title: label.join(" ")
            });
        });

    // Folders -> books with chapters.
    entries
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort(naturalCompare)
        .forEach(folder => {
            let count = null;
            const idxPath = path.join(DATA_DIR, folder, INDEX_FILE);
            if (fs.existsSync(idxPath)) {
                try {
                    count = JSON.parse(fs.readFileSync(idxPath, "utf8")).count ?? null;
                } catch { /* ignore malformed index */ }
            }

            const label = toLabel(folder);
            manifest.push({
                type: "folder",
                folder,
                index: `${folder}/${INDEX_FILE}`,
                label,
                title: label.join(" "),
                count
            });
        });

    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 4));

    const folders = manifest.filter(m => m.type === "folder").length;
    const loose = manifest.filter(m => m.type === "txt").length;
    console.log(`manifest.json  (${loose} file(s), ${folders} folder(s))`);
}

// ------------------------------------------------------
// library.json  (home page cards — seed + preserve)
// ------------------------------------------------------

// Write a starter library.json only if one does not exist. If it already
// exists it is left untouched, so hand-edited icons/titles/descriptions are
// never overwritten.
function buildLibrary() {
    if (fs.existsSync(LIBRARY_PATH)) {
        let count = null;
        try {
            const arr = JSON.parse(fs.readFileSync(LIBRARY_PATH, "utf8"));
            if (Array.isArray(arr)) count = arr.length;
        } catch { /* leave malformed file alone */ }

        console.log(
            count === null
                ? "library.json  (kept existing file)"
                : `library.json  (kept existing, ${count} card(s))`
        );
        return;
    }

    fs.writeFileSync(LIBRARY_PATH, JSON.stringify(LIBRARY_SEED, null, 4));
    console.log(`library.json  (seeded with ${LIBRARY_SEED.length} card(s))`);
}

// ------------------------------------------------------
// library-example.json  (auto from folders — always regenerated)
// ------------------------------------------------------

// Disposable reference: one card per folder in /data, so you can see the
// shape and copy entries you want into library.json.
function buildLibraryExample() {
    const folders = fs
        .readdirSync(DATA_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort(naturalCompare);

    const cards = folders.map(folder => {
        const label = toLabel(folder);
        return {
            category: label,            // array: matches a manifest label that contains every part
            icon: "📁",
            title: label.join(" "),
            description: `Chapters from ${folder}`
        };
    });

    fs.writeFileSync(LIBRARY_EXAMPLE_PATH, JSON.stringify(cards, null, 4));
    console.log(`library-example.json  (${cards.length} card(s) from folders)`);
}

// ------------------------------------------------------
// Entry point
// ------------------------------------------------------

function main() {
    if (!fs.existsSync(DATA_DIR)) {
        console.error(`Folder not found: ${DATA_DIR}`);
        process.exit(1);
    }

    const arg = process.argv[2];

    // Help.
    if (arg === "--help" || arg === "-h") {
        printHelp();
        return;
    }

    // Rebuild only the manifest.
    if (arg === "--manifest-only") {
        buildManifest();
        return;
    }

    // Seed library.json if missing (never overwrites an existing one).
    if (arg === "--library-only") {
        buildLibrary();
        return;
    }

    // Regenerate the disposable library-example.json from the folders.
    if (arg === "--library-example") {
        buildLibraryExample();
        return;
    }

    // Rebuild only one folder's index, then refresh the manifest count.
    if (arg && !arg.startsWith("--")) {
        const index = buildFolderIndex(arg);
        if (index) buildManifest();
        return;
    }

    // Full build: every folder's index, then the manifest + library.
    fs.readdirSync(DATA_DIR, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .forEach(e => buildFolderIndex(e.name));

    buildManifest();
    buildLibrary();
}

main();
