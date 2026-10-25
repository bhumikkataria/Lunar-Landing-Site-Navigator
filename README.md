# Lunar Landing Site Navigator

Decision support for lunar south-polar landing sites: terrain line-of-sight,
solar power, direct-to-Earth communications, and mission-window ranking.

This repository is being built up in reviewable steps. The numerical core,
API, and mission-control interface will land in the commits that follow.

## Run the tests

```bash
python -m pytest -q
```

## Run the app

```bash
python -m uvicorn backend.api.server:app --port 8000
```

Not an official NASA product.
