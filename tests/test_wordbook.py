import json
import tempfile
import unittest
from pathlib import Path
from server import ROOT, Store
from import_wordbook import import_wordbook

class WordbookTest(unittest.TestCase):
    def test_import_is_idempotent_and_preserves_active_games_and_edits(self):
        with tempfile.TemporaryDirectory() as temp:
            db_path=Path(temp)/'test.db'
            store=Store(db_path)
            player=store.call('POST','/api/players',{'nickname':'测试玩家'})
            session=store.call('POST','/api/sessions',{'player_id':player['id'],'mode':'standard','source':'builtin'})
            path=ROOT/'wordbooks'/'pep-grade5-volume1.json'
            result=import_wordbook(path,db_path)
            self.assertEqual([r['added'] for r in result['lists']],[18,17,20,21,20,23])
            self.assertEqual(sum(r['added'] for r in result['lists']),119)
            playable=store.call('POST','/api/sessions',{'player_id':player['id'],'mode':'standard','source':'custom','list_ids':[row['id'] for row in result['lists']]})
            self.assertEqual(len(playable['words']),119)
            self.assertTrue(all(w['meaning'] for w in playable['words']))
            self.assertIn('take care of',{w['text'] for w in playable['words']})
            again=import_wordbook(path,db_path)
            self.assertEqual(sum(r['added'] for r in again['lists']),0)
            with store.connect() as db:
                self.assertEqual(db.execute('SELECT status FROM game_sessions WHERE id=?',(session['id'],)).fetchone()[0],'running')
                self.assertEqual(db.execute('SELECT count(*) FROM textbooks').fetchone()[0],1)
                self.assertEqual(db.execute('SELECT count(*) FROM word_lists').fetchone()[0],6)
                self.assertEqual(db.execute('SELECT count(*) FROM word_list_items').fetchone()[0],119)
                db.execute("UPDATE word_list_items SET meaning='自定义释义' WHERE list_id=? AND word_id=(SELECT id FROM words WHERE text='team')",(result['lists'][0]['id'],))
            again=import_wordbook(path,db_path)
            self.assertEqual(again['lists'][0]['existing_meaning_kept'],['team'])
            self.assertEqual(store.call('GET',f"/api/lists/{result['lists'][0]['id']}")['entries'][0]['meaning'],'自定义释义')
            self.assertEqual(result['pending'],[])

if __name__=='__main__':
    unittest.main()
