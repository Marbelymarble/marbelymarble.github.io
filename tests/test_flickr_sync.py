import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "flickr_sync", Path(__file__).resolve().parents[1] / "scripts/sync-flickr.py"
)
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def album_page(ids, total=None):
    links = ''.join(
        f'<a class="photo-link" href="/photos/123@N06/{photo_id}/in/album-456"></a>'
        for photo_id in ids
    )
    models = {"main": {"set-models": [{"data": {
        "id": "456", "publicPhotosCount": len(ids) if total is None else total
    }}]}}
    return links + '<script>var data = {modelExport: ' + json.dumps(models) + '};</script>'


class FlickrSyncTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / '_config.yml').write_text(
            'flickr:\n  user_id: "123@N06"\n  album_id: "456"\n'
        )
        self.output = self.root / '_data/flickr_order.json'

    def test_reads_display_order_including_pagination(self):
        with patch.object(sync, 'fetch', side_effect=[album_page(['90', '2'], 3), album_page(['7'], 3)]) as fetch:
            sync.sync(self.root)
        data = json.loads(self.output.read_text())
        self.assertEqual(data['photo_ids'], ['90', '2', '7'])
        self.assertEqual(data['album_id'], '456')
        self.assertTrue(fetch.call_args_list[1].args[0].endswith('?page=2'))

    def test_reordering_flickr_changes_output_without_configuration_changes(self):
        with patch.object(sync, 'fetch', return_value=album_page(['2', '7', '90'])):
            sync.sync(self.root)
        with patch.object(sync, 'fetch', return_value=album_page(['90', '2', '7'])):
            sync.sync(self.root)
        self.assertEqual(json.loads(self.output.read_text())['photo_ids'], ['90', '2', '7'])

    def test_failed_or_incomplete_sync_keeps_previous_data(self):
        self.output.parent.mkdir()
        self.output.write_text('previous successful data')
        for responses in [
            [OSError('offline')],
            ['changed markup'],
            [album_page(['2'], 2), album_page(['2'], 2)],
            [album_page(['2'], 2), album_page(['7'], 3)],
        ]:
            with self.subTest(responses=responses):
                with patch.object(sync, 'fetch', side_effect=responses):
                    with self.assertRaises((OSError, ValueError)):
                        sync.sync(self.root)
                self.assertEqual(self.output.read_text(), 'previous successful data')

    def test_empty_public_album(self):
        with patch.object(sync, 'fetch', return_value=album_page([])):
            sync.sync(self.root)
        self.assertEqual(json.loads(self.output.read_text())['photo_ids'], [])

    def test_does_not_collect_unrelated_or_duplicate_links(self):
        page = album_page(['7', '7', '2'], 2)
        page += '<a class="title" href="/photos/123@N06/99/in/album-456"></a>'
        page += '<a class="photo-link" href="/photos/999@N06/10/in/album-456"></a>'
        self.assertEqual(sync.page_order(page, '123@N06', '456'), (['7', '2'], 2))


if __name__ == '__main__':
    unittest.main()
