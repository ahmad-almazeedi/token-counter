# Token Counter

A very minimal, very simple website: a canvas where you paste text and instantly see its **character, word, token, and estimated speech-time counts**.

No build step, no dependencies: just `index.html`, `style.css`, and `script.js`.

## Features

- 📋 Paste or type text into a large, rounded canvas
- ↔️ Open a second, side-by-side canvas to compare two texts, with signed differences shown on both sides
- 🔢 Live counts: **characters**, **words**, **lines**, **paragraphs**, **tokens**, and **estimated speech time**. Pick which ones to show from the filter menu
- 🧮 The token count is a fast heuristic, not a real tokenizer: ~4 characters per token for Latin text (with a word-based floor), with denser ratios for CJK and Arabic-script text. Expect it to be in the right ballpark, not exact.
- 🎙️ Speech time uses the trimmed character count, assuming 6 characters per word and 150 spoken words per minute. Durations adapt from seconds to minutes and hours.
- 📝 Markdown detection with a one-click rendered preview
- 💾 Your text sticks around across reloads (stored locally in your browser)
- ↕️ Drag the canvas edge to adjust its height; your preferred size is remembered too
- 🌗 **Light / dark mode** that follows your system setting automatically, and remembers your choice if you toggle it manually
- 🎨 Modern, minimal design with large, bold, rounded type and shapes

The default **characters** count is trimmed, excluding leading and trailing whitespace. If you're checking against a character limit or form validator, enable the **characters (raw)** stat in the filter menu; it counts the raw text length, whitespace and all.

## Roadmap

- **Per-model token counts** (GPT, Claude, etc.) using real tokenizers
- **Estimated input & output price per model**: paste a prompt, see what it costs where

## Run locally

It's a static site. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

For live reload during development there's a zero-dependency dev server:

```sh
node dev-server.mjs
# then visit http://localhost:8080
```

## License

MIT
