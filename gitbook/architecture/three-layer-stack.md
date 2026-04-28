# The Three-Layer Stack

```
┌──────────────┐    ┌───────────────┐    ┌──────────────┐
│  TracePulse  │    │ Chrome DevTools│    │  ViewGraph   │
│              │    │     MCP       │    │              │
│  Backend     │    │   Browser     │    │  Visual UI   │
│  Dev Time    │    │   Dev Time    │    │  Dev Time    │
└──────────────┘    └───────────────┘    └──────────────┘
```

Each tool owns its layer:

- **TracePulse** - backend errors, logs, builds, tests
- **Chrome DevTools MCP** - browser console, network, performance
- **ViewGraph** - DOM state, accessibility, layout, annotations

Together they give the AI agent complete visibility into your application.

## When to Use Which

| I need to see... | Use |
|-------------------|-----|
| Backend exceptions | TracePulse |
| Build errors | TracePulse |
| Browser console errors | Chrome DevTools MCP |
| Failed HTTP requests | Chrome DevTools MCP |
| Request/response body | Chrome DevTools MCP |
| Page content | Chrome DevTools MCP |
| Visual layout | ViewGraph |
| Accessibility issues | ViewGraph |
