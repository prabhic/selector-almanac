# Data model

Derived JSON under `data/` (committed). Raw assets under `data/raw/` (gitignored).

## `seminars.json`

Array of seminar records — one per matched deck↔video pair (or deck-only / video-only when unmatched).

```json
{
  "id": "2025-01-03-ai-updates",
  "date": "2025-01-03",
  "title": "AI Updates",
  "series": "ai-weekly",
  "topics": ["open-models", "agents"],
  "video": {
    "id": "abc123",
    "title": "Exciting AI Updates Weekly - January 3, 2025",
    "url": "https://www.youtube.com/watch?v=abc123",
    "thumbnail": "https://i.ytimg.com/vi/abc123/hqdefault.jpg"
  },
  "deck": {
    "path": "2025/2025-01-03-AI-Updates.pptx",
    "githubUrl": "https://github.com/lselector/seminar/blob/master/2025/2025-01-03-AI-Updates.pptx",
    "rawUrl": "https://raw.githubusercontent.com/lselector/seminar/master/2025/2025-01-03-AI-Updates.pptx"
  },
  "match": { "confidence": "date", "method": "iso-date" },
  "chapters": [
    { "title": "Introduction", "startSeconds": 0, "label": "00:00" }
  ],
  "slides": [
    { "index": 1, "title": "Agenda", "text": "..." }
  ],
  "points": [
    {
      "claim": "Crowd-sourced LM Arena Leaderboard",
      "topic": "benchmarks",
      "videoSeconds": 18,
      "videoUrl": "https://www.youtube.com/watch?v=abc123&t=18",
      "slideIndex": 3,
      "source": "chapter"
    }
  ]
}
```

## `topics.json`

Topic index for trend views.

```json
{
  "agents": {
    "label": "Agents",
    "slug": "agents",
    "firstSeen": "2023-04-14",
    "seminarCount": 42,
    "pointCount": 128,
    "seminarIds": ["..."],
    "timeline": [
      {
        "date": "2023-04-14",
        "seminarId": "...",
        "claim": "...",
        "videoUrl": "..."
      }
    ]
  }
}
```

## `meta.json`

Build metadata: `generatedAt`, counts, source URLs, ingest flags.
