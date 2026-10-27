// ======================================================
// READING HISTORY (device-local, localStorage)
//
// Remembers, per novel folder, the last chapter you opened so
// you can resume where you left off and show a "Continue reading"
// list on the home page.
//
// Shape stored under one key:
//   {
//     "shadow-slave": {
//        index, file, chapter, title, at   // at = epoch ms
//     },
//     ...
//   }
//
// This layer is deliberately small and isolated: if history ever
// moves to a cloud/account backend, only this file changes.
// ======================================================

(function () {
    const KEY = "reader:history:v1";

    function safeParse(raw) {
        if (!raw) return {};
        try {
            const obj = JSON.parse(raw);
            return obj && typeof obj === "object" ? obj : {};
        } catch {
            return {};
        }
    }

    // Read the whole history object. Never throws (private mode, quota, etc.).
    function readAll() {
        try {
            return safeParse(localStorage.getItem(KEY));
        } catch {
            return {};
        }
    }

    function writeAll(obj) {
        try {
            localStorage.setItem(KEY, JSON.stringify(obj));
            return true;
        } catch {
            // Storage unavailable/full — history simply won't persist.
            return false;
        }
    }

    const History = {
        // Entry for one novel, or null if none recorded.
        get(folder) {
            if (!folder) return null;
            const all = readAll();
            return all[folder] || null;
        },

        // Record the chapter currently being read.
        set(folder, entry) {
            if (!folder || !entry) return false;
            const all = readAll();
            all[folder] = {
                index: entry.index,
                file: entry.file || null,
                chapter: entry.chapter ?? null,
                title: entry.title || "",
                at: Date.now()
            };
            return writeAll(all);
        },

        // All entries as an array, most-recently-read first.
        list() {
            const all = readAll();
            return Object.keys(all)
                .map(folder => ({ folder, ...all[folder] }))
                .sort((a, b) => (b.at || 0) - (a.at || 0));
        },

        // Forget one novel's progress.
        remove(folder) {
            const all = readAll();
            if (folder in all) {
                delete all[folder];
                return writeAll(all);
            }
            return false;
        },

        // Forget everything.
        clear() {
            try {
                localStorage.removeItem(KEY);
                return true;
            } catch {
                return false;
            }
        }
    };

    window.History = History;
})();
