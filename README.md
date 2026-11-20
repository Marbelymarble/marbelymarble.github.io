# marbelymarble.github.io
My personal Website built on [dark-poole](https://github.com/andrewhwanpark/dark-poole/tree/master) made by @andrewhwanpark which is a dark theme of the Poole theme by @mdo.

Photography uses the Flickr album in `_config.yml`. Photo descriptions become
captions, and the gallery follows the album's order. Without an API key, Flickr's
feed returns up to 20 photos. Set `api_key` to enable larger albums.

Album order syncs daily at 03:17 UTC. To sync immediately, run **Sync Flickr album
order** from GitHub Actions, or run locally:

```sh
python3 scripts/sync-flickr.py
bundle exec jekyll build
```
