import sqlite3
import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Store, Invalid

class StoreTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'test.db'
        self.store = Store(self.path)
        self.player = self.post('players', nickname='测试玩家')['id']

    def tearDown(self):
        self.temp.cleanup()

    def post(self, path, **data):
        return self.store.call('POST', '/api/' + path, data)

    def get(self, path, **query):
        return self.store.call('GET', '/api/' + path, query={k:[str(v)] for k,v in query.items()})

    def make_list(self, entries=None, **kw):
        return self.post('lists', name='Unit 1', entries=entries or [{'text':'school','meaning':'学校'}], **kw)['id']

    def start(self, **kw):
        config = dict(player_id=self.player,mode='standard',source='builtin',hint_mode='full')
        config.update(kw)
        return self.post('sessions', **config)

    def finish(self, id, **kw):
        data = dict(status='completed',outcome='win',score=200,duration_ms=120000,total_keys=100,correct_keys=90,kills=5,max_combo=4)
        data.update(kw)
        return self.post(f'sessions/{id}/finish', **data)

    def test_random_difficulty_snapshot_and_ranking_scope(self):
        sessions = [self.start(difficulty=level) for level in ('easy','medium','hard')]
        self.assertEqual(len({s['context_key'] for s in sessions}), 3)
        self.assertEqual([s['hint_config']['weights']['full'] for s in sessions], [92,80,60])
        self.assertTrue(all('|4|' in s['context_key'] for s in sessions))
        with self.assertRaises(ValueError):
            self.start(difficulty='invalid')
        self.assertEqual(self.start(mode='practice',difficulty='hard')['hint_config'], {})

    def test_snapshot_and_archive(self):
        book = self.post('textbooks',name='英语',edition='人教版',grade='七年级',volume='上册')['id']
        list_id = self.make_list(textbook_id=book)
        old = self.start(source='custom', list_ids=[list_id],hint_mode='hidden')
        self.post('lists',id=list_id,name='改名',entries=[{'text':'apple','meaning':'苹果'}])
        self.post(f'textbooks/{book}/archive')
        self.finish(old['id'])
        stats = self.get('stats', player_id=self.player)
        self.assertEqual(stats['history'][0]['lists'], '英语 · 人教版 · 七年级 · 上册 / Unit 1')
        self.assertEqual(stats['records'][0]['best_score'], 200)
        with self.store.connect() as db:
            self.assertEqual(db.execute('SELECT text,meaning FROM session_words WHERE session_id=?',(old['id'],)).fetchone()[:], ('school','学校'))
        self.assertEqual(self.get('leaderboard',context_key=old['context_key'])[0]['best_score'],200)

    def test_merge_and_validation(self):
        a=self.make_list()
        b=self.make_list([{'text':'school','meaning':'学校；学派'},{'text':'apple','meaning':''}])
        with self.assertRaisesRegex(Invalid,'补齐中文'):
            self.start(source='custom',list_ids=[a,b],hint_mode='first')
        result=self.start(source='custom',list_ids=[a,b])
        self.assertEqual(len(result['words']),2)
        self.assertIn('学派', next(w for w in result['words'] if w['text']=='school')['meaning'])
        with self.assertRaises(Invalid):
            self.make_list([{'text':"can't",'meaning':'不能'}])
        with self.assertRaises(Invalid):
            self.make_list([{'text':'a','meaning':''},{'text':'A','meaning':''}])
        self.assertEqual(len(self.get('catalog')['lists']),2)

    def test_ranking_isolation_and_idempotency(self):
        a=self.start()
        b=self.start(hint_mode='hidden')
        self.finish(a['id'])
        self.finish(a['id'],score=999)
        self.finish(b['id'],score=100)
        c=self.start()
        self.finish(c['id'],status='interrupted',score=9999)
        stats=self.get('stats',player_id=self.player)
        self.assertEqual(len(stats['records']),2)
        self.assertEqual(self.get('leaderboard',context_key=a['context_key'])[0]['best_score'],200)
        self.assertEqual(self.get('leaderboard',context_key=b['context_key'])[0]['best_score'],100)

    def test_practice_and_recovery(self):
        a=self.start(mode='practice',practice_range='asdfjkl')
        self.finish(a['id'],outcome='practice_complete')
        record=self.get('stats',player_id=self.player)['records'][0]
        self.assertEqual(record['best_speed'],45)
        self.assertEqual(record['best_accuracy'],90)
        b=self.start()
        Store(self.path)
        history=self.get('stats',player_id=self.player)['history']
        self.assertEqual(history[0]['status'],'interrupted')
        self.assertEqual(self.get('leaderboard',context_key=b['context_key']),[])

    def test_fingerprint_tracks_content_not_name(self):
        a=self.make_list()
        one=self.start(source='custom',list_ids=[a])
        self.post('lists',id=a,name='新名字',entries=[{'text':'school','meaning':'学校'}])
        two=self.start(source='custom',list_ids=[a])
        self.assertEqual(one['context_key'],two['context_key'])
        self.post('lists',id=a,name='新名字',entries=[{'text':'school','meaning':'学派'}])
        three=self.start(source='custom',list_ids=[a])
        self.assertNotEqual(two['context_key'],three['context_key'])

    def test_per_monster_config_snapshot_and_ranking(self):
        config = {str(i): 'full' for i in range(8)}
        config['5'] = 'hidden'
        one = self.start(hint_config=config)
        config['5'] = 'first'
        two = self.start(hint_config=config)
        self.assertNotEqual(one['context_key'], two['context_key'])
        self.assertEqual(one['hint_config']['5'], 'hidden')
        self.finish(one['id'])
        stats = self.get('stats', player_id=self.player)
        self.assertEqual(json.loads(stats['history'][1]['hint_config'])['5'], 'hidden')
        self.assertEqual(stats['records'][0]['hint_mode'], 'mixed')
        self.assertEqual(stats['records'][0]['ruleset_version'], '3')
        self.assertEqual(self.get('leaderboard', context_key=two['context_key']), [])
        for invalid in ({'0':'full'}, dict(config, **{'4':'invalid'})):
            with self.assertRaises(Invalid):
                self.start(hint_config=invalid)
        missing = self.make_list([{'text':'school','meaning':''}])
        with self.assertRaisesRegex(Invalid, '补齐中文'):
            self.start(source='custom', list_ids=[missing], hint_config=config)
        practice = self.start(mode='practice', hint_config=config)
        self.assertEqual(practice['hint_config'], {})

    def test_phrases_and_hyphens_preserved(self):
        terms = ['hard-working','ping-pong','take care of','ice cream']
        list_id = self.make_list([dict(text=t,meaning='词条释义') for t in terms])
        result = self.start(source='custom',list_ids=[list_id],hint_mode='hidden')
        self.assertEqual({w['text'] for w in result['words']},set(terms))
        with self.store.connect() as db:
            self.assertEqual({r['text'] for r in db.execute('SELECT text FROM session_words WHERE session_id=?',(result['id'],))},set(terms))
        for invalid in ("can't",'ice--cream','-word','word 123'):
            with self.assertRaises(Invalid):
                self.make_list([dict(text=invalid,meaning='无效')])

    def test_schema_v1_migration_preserves_history(self):
        old_path = Path(self.temp.name) / 'old.db'
        schema = (Path(__file__).resolve().parents[1] / 'schema.sql').read_text()
        schema = schema.replace(" hint_config TEXT NOT NULL DEFAULT '{}',", '')
        with sqlite3.connect(old_path) as db:
            db.executescript(schema)
            db.execute('PRAGMA user_version=1')
            db.execute("INSERT INTO players(id,nickname) VALUES (1,'旧玩家')")
            db.execute("""INSERT INTO game_sessions(player_id,mode,status,outcome,score,vocabulary_source,vocabulary_fingerprint,hint_mode,ruleset_version,context_key)
                VALUES (1,'standard','completed','win',123,'builtin','old','full','2','old-context')""")
        migrated = Store(old_path)
        with migrated.connect() as db:
            self.assertEqual(db.execute('PRAGMA user_version').fetchone()[0], 2)
            row = db.execute('SELECT * FROM game_sessions').fetchone()
            self.assertEqual(row['score'], 123)
            self.assertEqual(row['hint_config'], '{}')
            self.assertEqual(row['ruleset_version'], '2')
            self.assertEqual(row['status'], 'completed')
        # Reopening an already upgraded DB is safe.
        Store(old_path)

if __name__ == '__main__':
    unittest.main()
