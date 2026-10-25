#!/usr/bin/env python3
"""Keyboard Hero local HTTP + SQLite service. Python standard library only."""
import argparse
import hashlib
import json
import re
import sqlite3
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parent
RULESET = '3'
DIFFICULTIES = {'easy':{'full':92,'edges':6,'hidden':2},'medium':{'full':80,'edges':15,'hidden':5},'hard':{'full':60,'edges':30,'hidden':10}}
DEFAULT_HINT_CONFIG = {'0':'full','1':'full','2':'first','3':'first','4':'edges','5':'hidden','6':'edges','7':'hidden'}
HINTS = {'full', 'first', 'edges', 'hidden'}
RANGES = {'asdfjkl', 'qwertyuiop', 'zxcvbnm', 'abcdefghijklmnopqrstuvwxyz'}
STATIC = {'index.html', 'game.js', 'style.css', 'app.js', 'library.html', 'library.js', 'keyboard-hero.html'}
BUILTIN = json.loads((ROOT / 'vocabulary.json').read_text())

class Invalid(ValueError):
    pass

def string(data, key, limit=120, required=False):
    value = data.get(key, '')
    if not isinstance(value, str) or len(value.strip()) > limit:
        raise Invalid(f'{key} 格式错误或过长')
    value = value.strip()
    if required and not value:
        raise Invalid(f'{key} 不能为空')
    return value

def integer(value, low=0, high=100000000):
    if type(value) is not int or not low <= value <= high:
        raise Invalid('数字参数超出范围')
    return value

def clean_entries(entries):
    if not isinstance(entries, list) or not 1 <= len(entries) <= 3000:
        raise Invalid('每张词表需要 1–3000 个词条')
    clean, seen = [], set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise Invalid('词条格式错误')
        text = re.sub(r'\s+', ' ', string(entry, 'text', 40, True).lower())
        meaning = string(entry, 'meaning', 120)
        if not re.fullmatch(r'[a-z]+(?:[ -][a-z]+)*', text):
            raise Invalid(f'{text}：仅支持英文字母、单词间空格和连字符，最长 40 字符')
        if text in seen:
            raise Invalid(f'重复词条：{text}')
        seen.add(text)
        clean.append((text, meaning))
    return clean

class Store:
    def __init__(self, path, recover_sessions=True):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            if db.execute('PRAGMA user_version').fetchone()[0] > 2:
                raise Invalid('数据库版本高于当前程序支持的版本')
            db.executescript((ROOT / 'schema.sql').read_text())
            if 'hint_config' not in {r['name'] for r in db.execute('PRAGMA table_info(game_sessions)')}:
                db.execute("ALTER TABLE game_sessions ADD COLUMN hint_config TEXT NOT NULL DEFAULT '{}'")
            db.execute('PRAGMA user_version=2')
            if recover_sessions:
                db.execute("UPDATE game_sessions SET status='interrupted', ended_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status='running'")

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    def call(self, method, path, data=None, query=None):
        data, query = data or {}, query or {}
        with self.connect() as db:
            if method == 'GET' and path == '/api/catalog':
                books = [dict(r) for r in db.execute('SELECT * FROM textbooks WHERE archived_at IS NULL ORDER BY id')]
                lists = [dict(r) for r in db.execute('''SELECT l.*, b.name AS textbook_name, count(i.word_id) AS word_count
                    FROM word_lists l LEFT JOIN textbooks b ON b.id=l.textbook_id
                    LEFT JOIN word_list_items i ON i.list_id=l.id WHERE l.archived_at IS NULL
                    AND (b.id IS NULL OR b.archived_at IS NULL) GROUP BY l.id ORDER BY l.id''')]
                return dict(textbooks=books, lists=lists, players=[dict(r) for r in db.execute('SELECT * FROM players ORDER BY nickname')])
            if method == 'POST' and path == '/api/players':
                nickname = string(data, 'nickname', 40, True)
                db.execute('INSERT INTO players(nickname) VALUES (?) ON CONFLICT(nickname) DO NOTHING', (nickname,))
                return dict(db.execute('SELECT * FROM players WHERE nickname=?', (nickname,)).fetchone())
            if method == 'POST' and path == '/api/textbooks':
                vals = [string(data, k, required=(k == 'name')) for k in ('name', 'edition', 'grade', 'volume')]
                book_id = data.get('id')
                if book_id is None:
                    book_id = db.execute('INSERT INTO textbooks(name,edition,grade,volume) VALUES (?,?,?,?)', vals).lastrowid
                else:
                    integer(book_id, 1)
                    if db.execute('UPDATE textbooks SET name=?,edition=?,grade=?,volume=? WHERE id=? AND archived_at IS NULL', (*vals, book_id)).rowcount != 1:
                        raise Invalid('教材不存在或已归档')
                return {'id': book_id}
            if method == 'POST' and path == '/api/lists':
                name, description = string(data, 'name', required=True), string(data, 'description', 500)
                book_id = data.get('textbook_id')
                if book_id is not None:
                    integer(book_id, 1)
                    if not db.execute('SELECT 1 FROM textbooks WHERE id=? AND archived_at IS NULL', (book_id,)).fetchone():
                        raise Invalid('教材不存在或已归档')
                clean = clean_entries(data.get('entries'))
                list_id = data.get('id')
                if list_id is None:
                    list_id = db.execute('INSERT INTO word_lists(textbook_id,name,description) VALUES (?,?,?)', (book_id, name, description)).lastrowid
                else:
                    integer(list_id, 1)
                    if db.execute('UPDATE word_lists SET textbook_id=?,name=?,description=? WHERE id=? AND archived_at IS NULL', (book_id, name, description, list_id)).rowcount != 1:
                        raise Invalid('词表不存在或已归档')
                    db.execute('DELETE FROM word_list_items WHERE list_id=?', (list_id,))
                for pos, (text, meaning) in enumerate(clean):
                    db.execute('INSERT OR IGNORE INTO words(text) VALUES (?)', (text,))
                    db.execute('INSERT INTO word_list_items VALUES (?,(SELECT id FROM words WHERE text=?),?,?)', (list_id, text, meaning, pos))
                return {'id': list_id}
            match = re.fullmatch(r'/api/lists/(\d+)', path)
            if method == 'GET' and match:
                row = db.execute('SELECT * FROM word_lists WHERE id=?', (match[1],)).fetchone()
                if not row:
                    raise Invalid('词表不存在')
                return dict(row) | {'entries': [dict(r) for r in db.execute('SELECT w.text,i.meaning FROM word_list_items i JOIN words w ON w.id=i.word_id WHERE i.list_id=? ORDER BY position', (match[1],))]}
            match = re.fullmatch(r'/api/(lists|textbooks)/(\d+)/archive', path)
            if method == 'POST' and match:
                table = 'word_lists' if match[1] == 'lists' else 'textbooks'
                if db.execute(f"UPDATE {table} SET archived_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", (match[2],)).rowcount != 1:
                    raise Invalid('记录不存在')
                return {'ok': True}
            if method == 'POST' and path == '/api/sessions':
                player = integer(data.get('player_id'), 1)
                if not db.execute('SELECT 1 FROM players WHERE id=?', (player,)).fetchone():
                    raise Invalid('请选择玩家')
                mode, source, hint = data.get('mode'), data.get('source'), data.get('hint_mode')
                if mode not in {'standard', 'practice'}:
                    raise Invalid('模式无效')
                difficulty = data.get('difficulty')
                if difficulty is not None:
                    if not isinstance(difficulty,str) or difficulty not in DIFFICULTIES:
                        raise Invalid('难度无效')
                    config = dict(difficulty=difficulty, weights=DIFFICULTIES[difficulty])
                    hint = 'mixed'
                else:
                    config = data.get('hint_config')
                    if config is None:
                        # Old clients may still send one hint_mode for the entire round.
                        if hint is not None and hint not in HINTS:
                            raise Invalid('提示方式无效')
                        config = {k:hint for k in DEFAULT_HINT_CONFIG} if hint else dict(DEFAULT_HINT_CONFIG)
                    if not isinstance(config, dict) or set(config) != set(DEFAULT_HINT_CONFIG) or any(not isinstance(v,str) or v not in HINTS for v in config.values()):
                        raise Invalid('需要为 8 种怪物分别指定有效的提示方式')
                    config = dict(config)
                    hint = next(iter(config.values())) if len(set(config.values())) == 1 else 'mixed'
                range_ = data.get('practice_range', 'asdfjkl')
                if range_ not in RANGES:
                    raise Invalid('练习范围无效')
                selected, words = [], []
                if mode == 'practice':
                    source, hint, config = 'letters', 'full', {}
                    words = [dict(text=c, meaning='') for c in range_]
                elif source == 'builtin':
                    words = BUILTIN
                elif source == 'custom':
                    ids = data.get('list_ids')
                    if not isinstance(ids, list) or not 1 <= len(ids) <= 100:
                        raise Invalid('请选择 1–100 张词表')
                    ids = sorted(set(integer(i, 1) for i in ids))
                    merged = {}
                    for list_id in ids:
                        row = db.execute('''SELECT l.*,b.name AS book,b.edition,b.grade,b.volume FROM word_lists l LEFT JOIN textbooks b ON b.id=l.textbook_id
                            WHERE l.id=? AND l.archived_at IS NULL AND (b.id IS NULL OR b.archived_at IS NULL)''', (list_id,)).fetchone()
                        if not row:
                            raise Invalid('所选词表已归档或不存在，请刷新')
                        selected.append(row)
                        for item in db.execute('SELECT w.text,i.meaning FROM word_list_items i JOIN words w ON w.id=i.word_id WHERE list_id=? ORDER BY position', (list_id,)):
                            merged.setdefault(item['text'], [])
                            if item['meaning'] and item['meaning'] not in merged[item['text']]:
                                merged[item['text']].append(item['meaning'])
                    words = [dict(text=k, meaning='；'.join(v)) for k, v in sorted(merged.items())]
                else:
                    raise Invalid('词汇来源无效')
                if not words:
                    raise Invalid('所选词表没有单词')
                missing = [w['text'] for w in words if not w['meaning']]
                if mode == 'standard' and any(h != 'full' for h in config.values()) and missing:
                    raise Invalid('请先补齐中文释义：' + '、'.join(missing[:20]))
                fingerprint = hashlib.sha256(json.dumps(sorted(words, key=lambda x: x['text']), ensure_ascii=False, sort_keys=True).encode()).hexdigest()
                config_json = json.dumps(config, sort_keys=True, separators=(',', ':'))
                config_hash = hashlib.sha256(config_json.encode()).hexdigest()
                ruleset = '4' if difficulty is not None and mode == 'standard' else RULESET
                context = '|'.join((mode, source, fingerprint, hint, ruleset, config_hash))
                session_id = db.execute('''INSERT INTO game_sessions(player_id,mode,practice_range,vocabulary_source,vocabulary_fingerprint,hint_mode,hint_config,ruleset_version,context_key)
                    VALUES (?,?,?,?,?,?,?,?,?)''', (player, mode, range_ if mode == 'practice' else None, source, fingerprint, hint, config_json, ruleset, context)).lastrowid
                db.executemany('INSERT INTO session_words VALUES (?,?,?)', [(session_id, w['text'], w['meaning']) for w in words])
                for row in selected:
                    book = ' · '.join(str(row[k] or '') for k in ('book','edition','grade','volume') if row[k])
                    db.execute('INSERT INTO session_word_lists VALUES (?,?,?,?)', (session_id, row['id'], row['name'], book))
                return dict(id=session_id, words=words, context_key=context, hint_config=config)
            match = re.fullmatch(r'/api/sessions/(\d+)/finish', path)
            if method == 'POST' and match:
                row = db.execute('SELECT * FROM game_sessions WHERE id=?', (match[1],)).fetchone()
                if not row:
                    raise Invalid('对局不存在')
                if row['status'] != 'running':
                    return {'ok': True, 'status': row['status']}
                status, outcome = data.get('status'), data.get('outcome')
                if status not in {'completed','interrupted'}:
                    raise Invalid('结算状态无效')
                allowed = {'win','loss'} if row['mode'] == 'standard' else {'practice_complete','loss'}
                if status == 'completed' and outcome not in allowed:
                    raise Invalid('结算结果无效')
                values = [integer(data.get(k, 0)) for k in ('duration_ms','score','kills','max_combo','total_keys','correct_keys')]
                if values[5] > values[4]:
                    raise Invalid('正确次数不能超过输入次数')
                db.execute("UPDATE game_sessions SET status=?,outcome=?,ended_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),duration_ms=?,score=?,kills=?,max_combo=?,total_keys=?,correct_keys=? WHERE id=?", (status, outcome if status == 'completed' else None, *values, row['id']))
                return {'ok': True, 'status': status}
            if method == 'GET' and path == '/api/stats':
                player = integer(int(query.get('player_id', ['0'])[0]), 1)
                history = [dict(r) for r in db.execute('''SELECT s.*,(SELECT group_concat(CASE WHEN textbook_snapshot<>'' THEN textbook_snapshot||' / ' ELSE '' END||name_snapshot,' + ') FROM session_word_lists WHERE session_id=s.id) AS lists
                    FROM game_sessions s WHERE player_id=? ORDER BY id DESC LIMIT 20''', (player,))]
                records = [dict(r) for r in db.execute('''SELECT context_key,mode,vocabulary_source,hint_mode,hint_config,ruleset_version,practice_range,
                    max(score) AS best_score,max(CASE WHEN duration_ms>0 THEN correct_keys*60000.0/duration_ms ELSE 0 END) AS best_speed,
                    max(CASE WHEN total_keys>0 THEN correct_keys*100.0/total_keys ELSE 0 END) AS best_accuracy,count(*) AS games,
                    (SELECT group_concat(CASE WHEN textbook_snapshot<>'' THEN textbook_snapshot||' / ' ELSE '' END||name_snapshot,' + ') FROM session_word_lists WHERE session_id=(SELECT id FROM game_sessions WHERE context_key=s.context_key AND player_id=s.player_id AND status='completed' ORDER BY id LIMIT 1)) AS lists
                    FROM game_sessions s WHERE player_id=? AND status='completed' GROUP BY context_key ORDER BY max(id) DESC''', (player,))]
                return dict(history=history, records=records)
            if method == 'GET' and path == '/api/leaderboard':
                context = query.get('context_key', [''])[0]
                return [dict(r) for r in db.execute('''SELECT p.nickname,max(s.score) AS best_score,
                    max(CASE WHEN duration_ms>0 THEN correct_keys*60000.0/duration_ms ELSE 0 END) AS best_speed
                    FROM game_sessions s JOIN players p ON p.id=s.player_id WHERE s.status='completed' AND s.context_key=?
                    GROUP BY p.id ORDER BY CASE WHEN s.mode='practice' THEN best_speed ELSE best_score END DESC,p.nickname LIMIT 20''', (context,))]
            raise Invalid('接口不存在')

class Handler(BaseHTTPRequestHandler):
    def reply(self, status, value):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def handle_request(self):
        # Serve loopback only; reject cross-origin writes and DNS-rebinding hosts.
        host = self.headers.get('Host', '')
        if host not in {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}:
            return self.reply(403, {'error': '仅允许本机访问'})
        parsed = urlsplit(self.path)
        if parsed.path.startswith('/api/'):
            try:
                data = None
                if self.command == 'POST':
                    origin = self.headers.get('Origin')
                    if origin and origin not in {f'http://{host}'}:
                        return self.reply(403, {'error': '不允许跨站请求'})
                    if self.headers.get_content_type() != 'application/json':
                        raise Invalid('需要 JSON 请求')
                    size = int(self.headers.get('Content-Length', 0))
                    if not 0 < size <= 2_000_000:
                        raise Invalid('请求过大或为空')
                    data = json.loads(self.rfile.read(size))
                    if not isinstance(data, dict):
                        raise Invalid('需要 JSON 对象')
                return self.reply(200, self.server.store.call(self.command, parsed.path, data, parse_qs(parsed.query)))
            except (ValueError, TypeError, sqlite3.IntegrityError) as exc:
                return self.reply(400, {'error': str(exc)})
            except Exception:
                import traceback
                traceback.print_exc()
                return self.reply(500, {'error': '本地数据库操作失败，请查看服务终端'})
        name = parsed.path.lstrip('/') or 'index.html'
        if self.command != 'GET' or name not in STATIC:
            return self.reply(404, {'error': '页面不存在'})
        path = ROOT / name
        body = path.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', {'.html':'text/html', '.js':'text/javascript', '.css':'text/css'}[path.suffix] + '; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(body)

    do_GET = handle_request
    do_POST = handle_request

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--db', type=Path, default=ROOT / 'data' / 'keyboard-hero.db')
    args = parser.parse_args()
    store = Store(args.db)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    server.store = store
    print(f'键盘勇者：http://127.0.0.1:{args.port}  数据库：{args.db}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
