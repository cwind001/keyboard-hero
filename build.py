from pathlib import Path
import json
import re
root = Path(__file__).resolve().parent
game = (root / 'game.js').read_text()
vocabulary = json.dumps(json.loads((root / 'vocabulary.json').read_text()), ensure_ascii=False, separators=(',', ':'))
game = re.sub(r'const builtinVocabulary=.*?;\n', lambda _: 'const builtinVocabulary=' + vocabulary + ';\n', game, count=1)
(root / 'game.js').write_text(game)
html = (root / 'index.html').read_text()
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + (root / 'style.css').read_text() + '</style>')
html = html.replace('<script src="game.js"></script>', '<script>' + (root / 'game.js').read_text() + '</script>')
html = html.replace('<script src="app.js"></script>', '<script>' + (root / 'app.js').read_text() + '</script>')
(root / 'keyboard-hero.html').write_text(html)
