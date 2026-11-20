#!/usr/bin/env python3

import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]


def fetch(url):
    request = Request(url, headers={"User-Agent": "PersonalJekyllGallery/1.0"})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


class AlbumPhotos(HTMLParser):
    def __init__(self, user_id, album_id):
        super().__init__()
        self.pattern = re.compile(
            r"^/photos/" + re.escape(user_id) + r"/(\d+)/in/album-"
            + re.escape(album_id) + r"/?$"
        )
        self.ids = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag != "a" or "photo-link" not in attrs.get("class", "").split():
            return
        match = self.pattern.fullmatch(attrs.get("href", ""))
        if match and match[1] not in self.ids:
            self.ids.append(match[1])


def page_order(source, user_id, album_id):
    parser = AlbumPhotos(user_id, album_id)
    parser.feed(source)
    marker = re.search(r"\bmodelExport:\s*", source)
    if not marker:
        raise ValueError("Flickr album metadata was not found; previous order retained")
    models, _ = json.JSONDecoder().raw_decode(source[marker.end():])
    albums = models["main"]["set-models"]
    album = next(model["data"] for model in albums
                 if isinstance(model["data"], dict) and str(model["data"].get("id")) == album_id)
    count = int(album["publicPhotosCount"])
    if count and not parser.ids:
        raise ValueError("Flickr photo tiles were not found; previous order retained")
    return parser.ids, count


def sync(root=ROOT):
    config = (root / "_config.yml").read_text()
    block = re.search(r"^flickr:\n((?:[ \t].*\n|\n)+)", config, re.MULTILINE)
    if not block:
        raise ValueError("Missing flickr configuration")
    def setting(name, pattern):
        match = re.search(r"^  " + name + r":\s*[\"']?(" + pattern + r")[\"']?\s*$",
                          block[1], re.MULTILINE)
        if not match:
            raise ValueError("Missing or invalid flickr." + name)
        return match[1]

    user_id = setting("user_id", r"\d+@N\d+")
    album_id = setting("album_id", r"\d+")
    album_url = f"https://www.flickr.com/photos/{user_id}/albums/{album_id}/"
    ids, total = page_order(fetch(album_url), user_id, album_id)
    page = 2
    while len(ids) < total:
        extra, current_total = page_order(fetch(album_url + "?" + urlencode({"page": page})),
                                          user_id, album_id)
        if current_total != total:
            raise ValueError("Flickr album changed during sync; retry the build")
        new_ids = [photo_id for photo_id in extra if photo_id not in ids]
        if not new_ids:
            raise ValueError("Incomplete Flickr album pagination; previous order retained")
        ids.extend(new_ids)
        page += 1
    if len(ids) != total:
        raise ValueError("Flickr public photo count does not match its album tiles")
    target = root / "_data" / "flickr_order.json"
    target.parent.mkdir(exist_ok=True)
    output = json.dumps({"user_id": user_id, "album_id": album_id, "photo_ids": ids}, indent=2) + "\n"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(output)
    temporary.replace(target)
    print(f"Synced {len(ids)} photos in Flickr album order")


if __name__ == "__main__":
    sync()
