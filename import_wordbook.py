#!/usr/bin/env python3
"""Import a reviewed textbook JSON into local SQLite without interrupting active games."""
import argparse
import json
from pathlib import Path
from server import ROOT, Store, Invalid, clean_entries, string


def import_wordbook(path, db_path=ROOT / 'data' / 'keyboard-hero.db'):
    payload = json.loads(Path(path).read_text())
    if not isinstance(payload, dict) or not isinstance(payload.get('textbook'), dict):
        raise Invalid('需要 textbook 对象')
    book = payload['textbook']
    metadata = [string(book, key, required=(key == 'name')) for key in ('name','edition','grade','volume')]
    lists = payload.get('lists')
    if not isinstance(lists, list) or not lists:
        raise Invalid('没有可导入的词表')
    reviewed, names = [], set()
    for item in lists:
        name = string(item, 'name', required=True)
        if name in names:
            raise Invalid('重复单元名称：'+name)
        names.add(name)
        reviewed.append((name, string(item, 'description', 500), clean_entries(item.get('entries'))))
    # Initializing the schema must not recover/terminate games in the running HTTP service.
    store = Store(db_path, recover_sessions=False)
    result = []
    with store.connect() as db:
        matches = db.execute('SELECT id FROM textbooks WHERE name=? AND edition=? AND grade=? AND volume=? AND archived_at IS NULL', metadata).fetchall()
        if len(matches) > 1:
            raise Invalid('同名教材不唯一，请先整理教材')
        book_id = matches[0]['id'] if matches else db.execute('INSERT INTO textbooks(name,edition,grade,volume) VALUES (?,?,?,?)', metadata).lastrowid
        for name, description, entries in reviewed:
            matches = db.execute('SELECT id FROM word_lists WHERE textbook_id=? AND name=? AND archived_at IS NULL', (book_id,name)).fetchall()
            if len(matches) > 1:
                raise Invalid('同名单元不唯一：'+name)
            list_id = matches[0]['id'] if matches else db.execute('INSERT INTO word_lists(textbook_id,name,description) VALUES (?,?,?)', (book_id,name,description)).lastrowid
            position = db.execute('SELECT coalesce(max(position),-1)+1 FROM word_list_items WHERE list_id=?', (list_id,)).fetchone()[0]
            added, conflicts = 0, []
            for text, meaning in entries:
                existing = db.execute('SELECT i.meaning FROM word_list_items i JOIN words w ON w.id=i.word_id WHERE i.list_id=? AND w.text=?',(list_id,text)).fetchone()
                if existing:
                    if existing['meaning'] != meaning:
                        conflicts.append(text)
                    continue
                db.execute('INSERT OR IGNORE INTO words(text) VALUES (?)', (text,))
                db.execute('INSERT INTO word_list_items VALUES (?,(SELECT id FROM words WHERE text=?),?,?)', (list_id,text,meaning,position))
                position += 1
                added += 1
            total = db.execute('SELECT count(*) FROM word_list_items WHERE list_id=?',(list_id,)).fetchone()[0]
            result.append(dict(name=name, id=list_id, added=added, total=total, existing_meaning_kept=conflicts))
    return dict(textbook_id=book_id, lists=result, pending=payload.get('pending',[]))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--db', type=Path, default=ROOT / 'data' / 'keyboard-hero.db')
    args = parser.parse_args()
    try:
        print(json.dumps(import_wordbook(args.source,args.db), ensure_ascii=False,indent=2))
    except (ValueError, OSError) as exc:
        parser.exit(1,str(exc)+'\n')
