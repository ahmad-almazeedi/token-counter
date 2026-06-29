# Token Counter

A very minimal, very simple website: a canvas where you paste text and instantly see its **character count**.

No build step, no dependencies — just `index.html`, `style.css`, and `script.js`.

## Features

- 📋 Paste or type text into a large, rounded canvas
- 🔢 Live **character count**
- 🌗 **Light / dark mode** that follows your system setting automatically, and remembers your choice if you toggle it manually
- 🎨 Modern, minimal design with large, bold, rounded type and shapes

## Roadmap

- Token counts for different AI models (GPT, Claude, etc.)
- Estimated input & output price per model

## Run locally

It's a static site — just open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## License

MIT
