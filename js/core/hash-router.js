// ======================================================
// HASH ROUTER
//
// Gives every view a real URL via the location hash, so refresh,
// bookmark, share, and browser back/forward all work on a static
// host (GitHub Pages / Vercel) with no server rewrites.
//
// Routes:
//   #/                          -> home
//   #/book/<folder>             -> chapter list for a book
//   #/book/<folder>/<chapter>   -> a chapter (1-based chapter number)
//   #/doc/<file>                -> a loose .txt document
//
// The router swaps in the page fragment (home.html / viewer.html)
// and then hands the parsed route to the viewer, which renders it.
// Navigation elsewhere is done by setting location.hash (see the
// Router.go* helpers), which triggers a single hashchange render.
// ======================================================

(function () {
    const CONTENT = "#content";

    // ---- Parse the current hash into a route object ----
    function parseHash() {
        let raw = location.hash || "";
        if (raw.startsWith("#")) raw = raw.slice(1);   // drop leading #
        raw = raw.replace(/^\/+/, "");                 // drop leading slashes

        if (raw === "") return { name: "home" };

        const parts = raw.split("/").filter(Boolean).map(decodeURIComponent);

        if (parts[0] === "book" && parts[1]) {
            const folder = parts[1];
            if (parts[2] != null && parts[2] !== "") {
                const n = parseInt(parts[2], 10);
                if (!isNaN(n)) return { name: "chapter", folder, chapter: n };
            }
            return { name: "book", folder };
        }

        if (parts[0] === "doc" && parts[1]) {
            return { name: "doc", file: parts[1] };
        }

        // Unknown hash -> treat as home.
        return { name: "home" };
    }

    // ---- Build hash strings (used by navigation helpers) ----
    function homeHash() { return "#/"; }
    function bookHash(folder) { return `#/book/${encodeURIComponent(folder)}`; }
    function chapterHash(folder, chapterNo) {
        return `#/book/${encodeURIComponent(folder)}/${chapterNo}`;
    }
    function docHash(file) { return `#/doc/${encodeURIComponent(file)}`; }

    // ---- Swap in a page fragment, then run a callback ----
    // htmx.ajax resolves when the swap settles, so the viewer globals
    // the fragment's inline script reads are already in place.
    function loadFragment(path, after) {
        htmx.ajax("GET", path, { target: CONTENT, swap: "innerHTML" })
            .then(() => { if (typeof after === "function") after(); })
            .catch(err => {
                console.error("Fragment load failed:", path, err);
                if (window.safeLoadError) window.safeLoadError("/pages/errors/general.html");
            });
    }

    // ---- Render the current route ----
    let lastRenderKey = null;

    function render() {
        const route = parseHash();
        syncNavActive(route);

        if (route.name === "home") {
            lastRenderKey = "home";
            loadFragment("/pages/home.html");
            return;
        }

        if (route.name === "doc") {
            lastRenderKey = `doc:${route.file}`;
            loadFragment("/pages/viewer.html", () => {
                if (typeof window.viewerShowDoc === "function") {
                    window.viewerShowDoc(route.file);
                }
            });
            return;
        }

        if (route.name === "book") {
            lastRenderKey = `book:${route.folder}`;
            loadFragment("/pages/viewer.html", () => {
                if (typeof window.viewerShowBook === "function") {
                    window.viewerShowBook(route.folder);
                }
            });
            return;
        }

        if (route.name === "chapter") {
            const key = `chapter:${route.folder}`;
            // If we're already inside the same book, just open the chapter
            // in place (no fragment reload) — this keeps prev/next snappy.
            if (lastRenderKey === key && typeof window.viewerOpenChapterNo === "function") {
                window.viewerOpenChapterNo(route.folder, route.chapter);
                return;
            }
            lastRenderKey = key;
            loadFragment("/pages/viewer.html", () => {
                if (typeof window.viewerShowChapterNo === "function") {
                    window.viewerShowChapterNo(route.folder, route.chapter);
                }
            });
            return;
        }
    }

    // Keep the navbar "Home" active state in sync with the route.
    function syncNavActive(route) {
        const homeBtn = document.querySelector('.nav-btn[href="#/"]');
        if (!homeBtn) return;
        homeBtn.classList.toggle("is-active", route.name === "home");
    }

    // ---- Public navigation API ----
    // Setting the hash triggers one hashchange -> render(). If the hash is
    // unchanged (e.g. re-click), force a render so the view still refreshes.
    function navigate(hash) {
        if (location.hash === hash) {
            render();
        } else {
            location.hash = hash;
        }
    }

    const Router = {
        parse: parseHash,
        goHome: () => navigate(homeHash()),
        goBook: (folder) => navigate(bookHash(folder)),
        goChapter: (folder, chapterNo) => navigate(chapterHash(folder, chapterNo)),
        goDoc: (file) => navigate(docHash(file)),
        // Expose builders for anything that needs an href/string.
        hash: { home: homeHash, book: bookHash, chapter: chapterHash, doc: docHash }
    };
    window.Router = Router;

    // ---- Wire up events ----
    window.addEventListener("hashchange", render);

    // Initial render once the DOM (and htmx) is ready.
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", render);
    } else {
        render();
    }
})();
