# devxkapoor — Mastery Track

A structured, learn-by-building track through the full-stack + applied-AI engineering landscape — from the command line up through LLM tool-use, RAG, and MCP.

**Live site:** https://devxkapoor.github.io/devxkapoor-learning/

## What this is

Each topic in the track (~130, spanning foundations, languages, frontend, backend, data, DevOps, AI/LLM, architecture, security, and DSA) gets:

- An exhaustive landscape of the topic — origin, core concepts, how it fits with everything around it
- A buildable project that exercises the topic in real, integrated use (not toy exercises)
- A recall deck for active-recall revision
- Section-by-section elaboration, written as the project is built

Buildable project code for each topic lives in its own standalone repo, linked from that topic's pack here. This repo is the navigation and study layer; the linked repos are the actual shipped work.

## Design

Boot-log / process-table aesthetic — topics render as processes with status, not dashboard cards. IBM Plex Mono for structure and status, Inter for reading prose. Deliberately not another dark-mode SaaS template.

## Structure

```
devxkapoor-learning/
├── index.html          # global topic index, grouped by section, with status
├── recall.html          # global recall deck (unions every topic's recall.json)
├── search.html          # full-text search across every topic's elaboration.json
├── tracker.json          # machine-readable status for all topics
├── journal.md            # running log, one entry per topic conversation
├── assets/                # shared styles + JS
└── topics/
    └── <topic-slug>/
        ├── pack.html          # the topic's study pack (landscape, recall, elaboration tabs)
        ├── recall.json        # this topic's recall questions
        ├── elaboration.json   # this topic's section-by-section elaboration
        └── journal.md         # (optional) topic-local notes
```

## Why this exists

Built as part of an active job search — full-stack / backend / DevOps / applied-AI engineering roles. This track exists to close the gap between "has built things" and "can explain and extend them fluently under interview pressure," while producing genuine, visible portfolio evidence along the way.

Two flagship projects that predate this track:
- [qbank](https://github.com/devxkapoor/qbank) — AI-powered question bank generator (Fastify, TypeScript, Drizzle, Postgres, BullMQ, Redis, Anthropic API with forced tool-use, MCP server)
- [infralens](https://github.com/devxkapoor/infralens) — infrastructure visualization and management tool
- Faraday — an x86 bare-metal OS built from scratch
