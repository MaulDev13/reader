// ======================================================
// VIEWER (view-only)
//
// Three states, chosen from globals set before the viewer
// page is swapped in:
//
//   window.__viewFile   -> a loose .txt file in /data
//                          Rendered as a single document.
//
//   window.__viewFolder -> a folder (book) in /data
//                          Loads <folder>/index.json and shows the
//                          chapter list. Clicking a chapter renders
//                          that chapter (title + content only).
//
// Chapter files carry a front-matter block (--- ... ---). Only the
// `title` is shown; the rest of the metadata is stripped.
// ======================================================

// Folder reading state (populated in folder mode).
let folderState = {
    folder: null,
    label: "",
    chapters: []   // [{ file, chapter, title }]
};

// ======================================================
// ENTRY POINT
// ======================================================
async function loadView() {
    const folder = window.__viewFolder;
    const file = window.__viewFile;

    if (folder) {
        await loadFolder(folder);
        return;
    }

    if (file) {
        await loadSingle(file);
        return;
    }

    console.warn("Nothing selected to view.");
}

// ======================================================
// SINGLE DOCUMENT (loose .txt)
// ======================================================
async function loadSingle(file) {
    try {
        const text = await fetchText(`${CONFIG.BASE_PATH}data/${file}`);
        showDoc();
        renderDoc(text);
    } catch (err) {
        console.error("Failed to read file:", err);
        showError("Failed to load document.");
    }
}

// ======================================================
// FOLDER (book) — chapter list + chapter content
// ======================================================
async function loadFolder(folder) {
    try {
        const index = await fetchJson(`${CONFIG.BASE_PATH}data/${folder}/index.json`);
        folderState = {
            folder,
            label: Array.isArray(index.label) ? index.label.join(" ") : folder,
            chapters: Array.isArray(index.chapters) ? index.chapters : []
        };
        renderChapterList();
    } catch (err) {
        console.error("Failed to read folder index:", err);
        showError("Failed to load chapter list.");
    }
}

// ---- Chapter list ----
function renderChapterList() {
    const host = document.getElementById("textView");
    if (!host) return;

    showDoc();

    const { label, chapters } = folderState;

    const items = chapters.map((ch, i) => `
        <li class="chapter-item">
            <button type="button" class="chapter-link" data-index="${i}">
                <span class="chapter-link__no">${ch.chapter != null ? ch.chapter : ""}</span>
                <span class="chapter-link__title">${escapeHtml(stripSeriesPrefix(ch.title, label))}</span>
            </button>
        </li>
    `).join("");

    host.innerHTML = `
        <div class="chapter-list">
            <header class="chapter-list__head">
                <h1>${escapeHtml(label)}</h1>
                <p class="text-meta">${chapters.length} chapter${chapters.length === 1 ? "" : "s"}</p>
            </header>
            <ol class="chapter-list__items">${items}</ol>
        </div>
    `;

    host.querySelectorAll(".chapter-link").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = Number(btn.dataset.index);
            openChapter(idx);
        });
    });
}

// ---- Chapter content ----
async function openChapter(idx) {
    const ch = folderState.chapters[idx];
    if (!ch) return;

    const host = document.getElementById("textView");
    if (host) host.innerHTML = `<p class="text-meta">Loading chapter...</p>`;

    try {
        const raw = await fetchText(
            `${CONFIG.BASE_PATH}data/${folderState.folder}/${ch.file}`
        );

        const { title, body } = splitFrontMatter(raw);
        const displayTitle = title || ch.title || `Chapter ${ch.chapter ?? ""}`;

        showDoc();
        renderChapter(idx, displayTitle, body);
        window.scrollTo({ top: 0, behavior: "auto" });
    } catch (err) {
        console.error("Failed to read chapter:", err);
        showError("Failed to load chapter.");
    }
}

function renderChapter(idx, title, body) {
    const host = document.getElementById("textView");
    if (!host) return;

    const total = folderState.chapters.length;
    const hasPrev = idx > 0;
    const hasNext = idx < total - 1;

    const nav = (position) => `
        <nav class="chapter-nav chapter-nav--${position}">
            <button type="button" class="chapter-nav__btn" data-nav="prev" ${hasPrev ? "" : "disabled"}>
                ← Prev
            </button>
            <button type="button" class="chapter-nav__btn chapter-nav__list" data-nav="list">
                Chapters
            </button>
            <button type="button" class="chapter-nav__btn" data-nav="next" ${hasNext ? "" : "disabled"}>
                Next →
            </button>
        </nav>
    `;

    host.innerHTML = `
        <article class="doc">
            ${nav("top")}
            <h1 class="chapter-title">${escapeHtml(title)}</h1>
            <div class="chapter-body">${markupToHtml(body)}</div>
            ${nav("bottom")}
        </article>
    `;

    host.querySelectorAll("[data-nav]").forEach(btn => {
        btn.addEventListener("click", () => {
            const action = btn.dataset.nav;
            if (action === "prev" && hasPrev) openChapter(idx - 1);
            else if (action === "next" && hasNext) openChapter(idx + 1);
            else if (action === "list") renderChapterList();
        });
    });
}

// ======================================================
// FRONT-MATTER
// ======================================================
// Split a chapter into its front-matter title and the body that
// follows the closing `---`. Only `title` is extracted; everything
// else in the metadata block is discarded.
function splitFrontMatter(raw) {
    const text = String(raw).replace(/\r\n?/g, "\n");
    const lines = text.split("\n");

    let i = 0;
    while (i < lines.length && lines[i].trim() === "") i++;

    // No opening fence -> no front-matter; whole thing is the body.
    if (lines[i] === undefined || lines[i].trim() !== "---") {
        return { title: "", body: text.trim() };
    }

    i++; // past opening ---
    let title = "";

    for (; i < lines.length; i++) {
        if (lines[i].trim() === "---") { i++; break; } // closing fence
        const m = lines[i].match(/^\s*title\s*:\s*(.*)$/i);
        if (m) {
            title = m[1].trim().replace(/^["']|["']$/g, "");
        }
    }

    const body = lines.slice(i).join("\n").trim();
    return { title, body };
}

// Chapter titles often repeat the series name, e.g.
// "Shadow Slave - Chapter 1 - 1: Nightmare Begins". Trim a leading
// "<series> - " so the list/heading reads cleanly. Falls back to the
// full title if nothing matches.
function stripSeriesPrefix(title, seriesLabel) {
    if (!title) return "";
    if (!seriesLabel) return title;
    const re = new RegExp(`^\\s*${escapeRegExp(seriesLabel)}\\s*[-–:]\\s*`, "i");
    return title.replace(re, "").trim() || title;
}

function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ======================================================
// VIEW HELPERS
// ======================================================
function showDoc() {
    const host = document.getElementById("textView");
    if (host) host.classList.remove("hidden");
}

function renderDoc(text) {
    const host = document.getElementById("textView");
    if (!host) return;
    host.innerHTML = `<article class="doc">${markupToHtml(text)}</article>`;
}

function showError(message) {
    const host = document.getElementById("textView");
    if (host) host.innerHTML = `<p class="text-meta">${escapeHtml(message)}</p>`;
}

async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// ------------------------------------------------------
// Lightweight markup -> HTML (safe subset of Markdown)
// The source file stays plain, readable .txt. We escape ALL
// text first, then introduce only a fixed set of tags.
// Supported: # headings, **bold**, *italic*, `code`,
// ![alt](src) images, [text](url) links, - lists, > quotes,
// --- rules, ``` fenced code, blank-line paragraphs.
// ------------------------------------------------------

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Allow http(s), root-relative, and relative paths (e.g. assets/pic.jpg).
// Block javascript:, data:, and other schemes. Relative paths get BASE_PATH.
function safeUrl(raw) {
    const url = raw.trim();
    const base = (window.CONFIG && CONFIG.BASE_PATH) || "";

    if (/^https?:\/\//i.test(url)) return url;      // absolute http(s)
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return ""; // any other scheme -> reject
    if (url.startsWith("/")) return url;             // root-relative
    return base + url;                               // relative -> prefix base
}

// Inline formatting applied to already-escaped text.
function formatInline(escaped) {
    let s = escaped;

    // images: ![alt](src)
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) => {
        const url = safeUrl(src);
        if (!url) return escapeHtml(m);
        return `<img class="doc-img" src="${encodeURI(url)}" alt="${alt}" loading="lazy">`;
    });

    // links: [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, href) => {
        const url = safeUrl(href);
        if (!url) return escapeHtml(m);
        return `<a href="${encodeURI(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    // bold, italic, inline code
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

    return s;
}

function markupToHtml(src) {
    const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
    const out = [];

    let i = 0;
    let paragraph = [];
    let listItems = [];

    function flushParagraph() {
        if (paragraph.length) {
            out.push(`<p>${paragraph.join("<br>")}</p>`);
            paragraph = [];
        }
    }
    function flushList() {
        if (listItems.length) {
            out.push(`<ul>${listItems.map(li => `<li>${li}</li>`).join("")}</ul>`);
            listItems = [];
        }
    }
    function flushAll() { flushParagraph(); flushList(); }

    while (i < lines.length) {
        const line = lines[i];

        // fenced code block: ``` ... ```
        if (/^```/.test(line.trim())) {
            flushAll();
            const code = [];
            i++;
            while (i < lines.length && !/^```/.test(lines[i].trim())) {
                code.push(escapeHtml(lines[i]));
                i++;
            }
            i++; // skip closing fence
            out.push(`<pre class="doc-pre"><code>${code.join("\n")}</code></pre>`);
            continue;
        }

        // blank line -> break current block
        if (line.trim() === "") {
            flushAll();
            i++;
            continue;
        }

        // horizontal rule
        if (/^\s*---+\s*$/.test(line)) {
            flushAll();
            out.push("<hr>");
            i++;
            continue;
        }

        // heading: #..###### text
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            flushAll();
            const level = heading[1].length;
            out.push(`<h${level}>${formatInline(escapeHtml(heading[2]))}</h${level}>`);
            i++;
            continue;
        }

        // blockquote: > text
        const quote = line.match(/^\s*>\s?(.*)$/);
        if (quote) {
            flushParagraph();
            flushList();
            const buf = [];
            let q = quote;
            while (q) {
                buf.push(formatInline(escapeHtml(q[1])));
                i++;
                q = i < lines.length ? lines[i].match(/^\s*>\s?(.*)$/) : null;
            }
            out.push(`<blockquote>${buf.join("<br>")}</blockquote>`);
            continue;
        }

        // list item: - text  or  * text
        const item = line.match(/^\s*[-*]\s+(.*)$/);
        if (item) {
            flushParagraph();
            listItems.push(formatInline(escapeHtml(item[1])));
            i++;
            continue;
        }

        // standalone image line -> treat as block (centered via CSS)
        if (/^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(line)) {
            flushAll();
            out.push(`<p class="doc-figure">${formatInline(escapeHtml(line.trim()))}</p>`);
            i++;
            continue;
        }

        // default: paragraph text
        flushList();
        paragraph.push(formatInline(escapeHtml(line)));
        i++;
    }

    flushAll();
    return out.join("\n");
}
