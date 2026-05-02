# The Three-Layer Stack

<figure><img src="../.gitbook/assets/tracepulse-three-layer-stack.svg" alt="The Three-Layer Debugging Stack" width="960"></figure>

The complete agentic debugging stack has three layers. Each tool owns its layer.

## When to Use Which

<figure><img src="../.gitbook/assets/tracepulse-decision-flowchart.svg" alt="When to use TracePulse vs Chrome DevTools MCP vs ViewGraph" width="720"></figure>

## Data Flow Across Layers

<figure><img src="../.gitbook/assets/tracepulse-data-flow.svg" alt="Data flow: debugging 'the export page is broken' across three layers" width="800"></figure>

## Responsibility Matrix

| Capability | TracePulse | Chrome DevTools MCP | ViewGraph |
|------------|:---------:|:-------------------:|:---------:|
| Backend exceptions | **Yes** | | |
| Build/compile errors | **Yes** | | |
| Test failures | **Yes** | | |
| Browser console | | **Yes** | |
| Network requests | | **Yes** | |
| Request/response bodies | | **Yes** | |
| Screenshots | | **Yes** | |
| DOM inspection | | **Yes** | **Yes** |
| Accessibility audit | | **Yes** | **Yes** |
| User annotations | | | **Yes** |
| Visual regression | | | **Yes** |
