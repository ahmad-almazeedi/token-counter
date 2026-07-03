// markdown.js - a tiny, dependency-free Markdown renderer.
// Covers the common subset: headings, bold/italic, inline and fenced code,
// links, blockquotes, ordered/unordered lists, horizontal rules, paragraphs.
// Everything is HTML-escaped before rendering, so pasted text can't inject markup.
(function () {
  // Marks extracted inline-code spans; a NUL byte never appears in real text.
  var SENTINEL = String.fromCharCode(0);

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Apply inline formatting to a chunk of already-escaped text.
  function inline(text) {
    // Pull inline code out first so its contents are left untouched by the rules below.
    var codes = [];
    text = text.replace(/`([^`]+)`/g, function (m, c) {
      codes.push(c);
      return SENTINEL + (codes.length - 1) + SENTINEL;
    });
    // Links: [label](url) - only allow safe URL schemes.
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
      var safe = /^(https?:|mailto:|#|\/)/i.test(url) ? url : "#";
      return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + label + "</a>";
    });
    text = text
      .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+?)__/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, "$1<em>$2</em>")
      .replace(/(^|[^_\w])_([^_\n]+?)_(?!\w)/g, "$1<em>$2</em>");
    // Restore inline code.
    text = text.replace(new RegExp(SENTINEL + "(\\d+)" + SENTINEL, "g"), function (m, i) {
      return "<code>" + codes[+i] + "</code>";
    });
    return text;
  }

  function render(src) {
    src = String(src).replace(/\r\n?/g, "\n");
    var lines = src.split("\n");
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      // Fenced code block
      if (/^\s*```/.test(line)) {
        var codeBody = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) codeBody.push(lines[i++]);
        i++; // skip closing fence
        out.push("<pre><code>" + escapeHtml(codeBody.join("\n")) + "</code></pre>");
        continue;
      }

      // Blank line
      if (/^\s*$/.test(line)) {
        i++;
        continue;
      }

      // Heading
      var h = line.match(/^\s*(#{1,6})\s+(.*)$/);
      if (h) {
        var level = h[1].length;
        out.push("<h" + level + ">" + inline(escapeHtml(h[2].trim())) + "</h" + level + ">");
        i++;
        continue;
      }

      // Horizontal rule
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
        out.push("<hr>");
        i++;
        continue;
      }

      // Blockquote (render its contents recursively)
      if (/^\s*>\s?/.test(line)) {
        var quote = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ""));
          i++;
        }
        out.push("<blockquote>" + render(quote.join("\n")) + "</blockquote>");
        continue;
      }

      // Unordered list
      if (/^\s*[-*+]\s+/.test(line)) {
        var uitems = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          uitems.push(escapeHtml(lines[i].replace(/^\s*[-*+]\s+/, "")));
          i++;
        }
        out.push("<ul>" + uitems.map(function (it) { return "<li>" + inline(it) + "</li>"; }).join("") + "</ul>");
        continue;
      }

      // Ordered list
      if (/^\s*\d+\.\s+/.test(line)) {
        var oitems = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          oitems.push(escapeHtml(lines[i].replace(/^\s*\d+\.\s+/, "")));
          i++;
        }
        out.push("<ol>" + oitems.map(function (it) { return "<li>" + inline(it) + "</li>"; }).join("") + "</ol>");
        continue;
      }

      // Paragraph - gather consecutive lines until a blank line or a block starter.
      var para = [];
      while (
        i < lines.length &&
        !/^\s*$/.test(lines[i]) &&
        !/^\s*```/.test(lines[i]) &&
        !/^\s*#{1,6}\s+/.test(lines[i]) &&
        !/^\s*>\s?/.test(lines[i]) &&
        !/^\s*[-*+]\s+/.test(lines[i]) &&
        !/^\s*\d+\.\s+/.test(lines[i]) &&
        !/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i])
      ) {
        para.push(lines[i]);
        i++;
      }
      out.push("<p>" + inline(escapeHtml(para.join("\n"))).replace(/\n/g, "<br>") + "</p>");
    }

    return out.join("\n");
  }

  // Quick heuristic: does this text use any Markdown-specific syntax?
  function looksLikeMarkdown(text) {
    if (!text || text.length < 2) return false;
    var patterns = [
      /^\s*#{1,6}\s+\S/m,
      /\*\*[^*\n]+\*\*/,
      /__[^_\n]+__/,
      /`[^`\n]+`/,
      /```/,
      /^\s*>\s+\S/m,
      /^\s*[-*+]\s+\S/m,
      /^\s*\d+\.\s+\S/m,
      /\[[^\]\n]+\]\([^)\n]+\)/,
      /^\s*([-*_])(\s*\1){2,}\s*$/m
    ];
    for (var k = 0; k < patterns.length; k++) {
      if (patterns[k].test(text)) return true;
    }
    return false;
  }

  window.renderMarkdown = render;
  window.looksLikeMarkdown = looksLikeMarkdown;
})();
