// ======================================================
// CATEGORY LIST (reusable)
// Reads data/manifest.json once and renders the entries that
// match a category into a target element as clickable items.
//
// A category is an ARRAY of label parts (e.g. ["Shadow","Slave"]).
// An item matches when its `label` array contains EVERY part of
// the category (option A matching).
//
// Two kinds of manifest entries are rendered:
//   type "txt"    -> opens a single document in the viewer
//   type "folder" -> opens the book (first chapter) with its sidebar
// ======================================================

(function () {
    // Cache the manifest promise so repeated category expands share one fetch.
    let manifestPromise = null;

    function getManifest() {
        if (!manifestPromise) {
            const base = (window.CONFIG && CONFIG.BASE_PATH) || "";
            manifestPromise = fetch(`${base}data/manifest.json`)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .catch(err => {
                    // Reset so a later attempt can retry after a transient failure.
                    manifestPromise = null;
                    throw err;
                });
        }
        return manifestPromise;
    }

    // Normalize a category into an array of parts.
    function toParts(category) {
        if (Array.isArray(category)) return category;
        if (typeof category === "string") {
            // Accept a JSON array string or a single/space-separated value.
            try {
                const parsed = JSON.parse(category);
                if (Array.isArray(parsed)) return parsed;
            } catch { /* not JSON, fall through */ }
            return category.split(/\s+/).filter(Boolean);
        }
        return [];
    }

    // Option A: item matches when its label contains every category part.
    function matches(item, parts) {
        if (!Array.isArray(item.label)) return false;
        return parts.every(part => item.label.includes(part));
    }

    function openTxt(item) {
        if (window.Router) window.Router.goDoc(item.file);
    }

    function openFolder(item) {
        if (window.Router) window.Router.goBook(item.folder);
    }

    // Open a book folder, optionally jumping to a specific chapter NUMBER.
    // Exposed globally so the home "Continue reading" list can reuse it.
    function openFolderAt(folder, chapterNo) {
        if (!window.Router) return;
        if (typeof chapterNo === "number" && !isNaN(chapterNo)) {
            window.Router.goChapter(folder, chapterNo);
        } else {
            window.Router.goBook(folder);
        }
    }

    /**
     * Render entries for a category into a target element.
     * @param {string|string[]} category  array of label parts (or string form)
     * @param {string|HTMLElement} target  element or its id
     */
    async function renderCategoryList(category, target) {
        const host = typeof target === "string"
            ? document.getElementById(target)
            : target;
        if (!host) return;

        const parts = toParts(category);
        host.innerHTML = `<p class="text-meta">Loading...</p>`;

        try {
            const items = await getManifest();
            const found = items.filter(item => matches(item, parts));

            host.innerHTML = "";

            if (found.length === 0) {
                host.innerHTML = `<p class="text-meta">No data available yet.</p>`;
                return;
            }

            const list = document.createElement("div");
            list.className = "project-list";

            found.forEach(item => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "project-item";

                const name = document.createElement("span");
                name.textContent = item.title || (item.label || []).join(" ");
                btn.appendChild(name);

                if (item.type === "folder") {
                    // badge with chapter count
                    const badge = document.createElement("span");
                    badge.className = "project-item__count";
                    badge.textContent =
                        item.count != null ? `${item.count} ch` : "book";
                    btn.appendChild(badge);
                    btn.addEventListener("click", () => openFolder(item));
                } else {
                    btn.addEventListener("click", () => openTxt(item));
                }

                list.appendChild(btn);
            });

            host.appendChild(list);
        } catch (err) {
            console.error("Failed loading manifest:", err);
            host.innerHTML = `<p class="text-meta">Failed to load list.</p>`;
        }
    }

    // Expose globally for inline use in home.html
    window.renderCategoryList = renderCategoryList;
    window.openFolderAt = openFolderAt;
})();
