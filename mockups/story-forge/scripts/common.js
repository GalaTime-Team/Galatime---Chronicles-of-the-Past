(function () {
  "use strict";

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function parseYaml(text) {
    return window.jsyaml.load(text, { schema: window.jsyaml.DEFAULT_SCHEMA });
  }

  function dumpYaml(value) {
    return window.jsyaml.dump(value, {
      lineWidth: 120,
      noRefs: true,
      condenseFlow: false,
      quotingType: '"',
    });
  }

  function parseTypedValue(raw) {
    if (raw === null || raw === undefined) return "";
    if (typeof raw !== "string") return raw;
    const value = raw.trim();
    if (value === "") return "";
    if (value === "null") return null;
    if (value === "true") return true;
    if (value === "false") return false;
    if (!Number.isNaN(Number(value)) && value !== "") return Number(value);
    if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
      try {
        return JSON.parse(value);
      } catch (_error) {
        return value;
      }
    }
    return value;
  }

  function parseStructuredText(raw, fallback) {
    const text = String(raw || "").trim();
    if (!text) return deepClone(fallback);
    try {
      return JSON.parse(text);
    } catch (_error) {
      try {
        return parseYaml(text);
      } catch (_yamlError) {
        return deepClone(fallback);
      }
    }
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function readFileText(file) {
    if (!file) return Promise.resolve("");
    return file.text();
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function copyText(value) {
    await navigator.clipboard.writeText(value);
  }

  function safeJsonStringify(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch (_error) {
      return "{}";
    }
  }

  window.StoryForgeCommon = {
    deepClone,
    parseYaml,
    dumpYaml,
    parseTypedValue,
    parseStructuredText,
    ensureArray,
    readFileText,
    downloadText,
    copyText,
    safeJsonStringify,
  };
})();
