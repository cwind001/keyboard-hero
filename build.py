from pathlib import Path
root = Path(__file__).resolve().parent
html = (root / 'index.html').read_text()
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + (root / 'style.css').read_text() + '</style>')
html = html.replace('<script src="game.js"></script>', '<script>' + (root / 'game.js').read_text() + '</script>')
(root / 'keyboard-hero.html').write_text(html)
