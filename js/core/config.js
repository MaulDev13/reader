// js/core/config.js
window.CONFIG = {

    API_BASE: document
        .querySelector('meta[name="api-base"]')
        ?.getAttribute("content") || "",

    // BASE_PATH is the site root. It is ALWAYS either "" or a path that
    // ends with "/", so callers can safely do `${BASE_PATH}data/x.txt`
    // (relative-style) and the router can do `${BASE_PATH}pages/x.html`.
    BASE_PATH: (() => {
        const host = location.hostname;

        // Served from the domain root (local dev, Vercel): no prefix.
        if (
            host === "localhost" ||
            host === "127.0.0.1" ||
            host.endsWith(".vercel.app")
        ) {
            return "";
        }

        // GitHub Pages serves a project site from /<repo>/.
        // Derive the first path segment from the URL instead of hardcoding,
        // so it survives repo renames / case differences.
        if (host.endsWith("github.io")) {
            const seg = location.pathname.split("/").filter(Boolean)[0];
            return seg ? `/${seg}/` : "";
        }

        // Fallback: domain root.
        return "";
    })()
};
