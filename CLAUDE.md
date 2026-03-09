# CLAUDE.md

## Project Overview

Network Visualizer is an interactive simulation tool for visualizing peer-to-peer messaging network topologies. It demonstrates how different sync protocols, log models, and network conditions affect message delivery in decentralized systems like Dash Chat.

**Live demo**: https://dash-chat.github.io/network-visualizer/

## Tech Stack

- **Frontend**: Svelte 5 + TypeScript
- **Rendering**: Pixi.js (canvas-based node/edge visualization)
- **Styling**: Tailwind CSS v4
- **Build**: Vite
- **Deployment**: GitHub Pages (via GitHub Actions on push to `main`)

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Type check
pnpm check

# Build for production
pnpm build

# Preview production build
pnpm preview
```

Alternatively, use `nix develop` for a Nix development shell.

## Architecture

```
src/
├── main.ts                    # Entry point
├── app.css                    # Global styles (dark theme CSS variables)
├── App.svelte                 # Root layout: Toolbar + 3-panel flex layout
├── components/
│   ├── Toolbar.svelte         # Top bar: scenario picker, log model, play/step/reset, speed
│   ├── ProtocolPanel.svelte   # Left panel: log model info, sync protocols, peer/connection config
│   ├── InspectorPanel.svelte  # Right panel: selected peer details, store contents, actions
│   ├── ActionPanel.svelte     # Peer actions: send message, add contact, create group, turn on/off
│   └── Legend.svelte          # Canvas overlay: operation types, SP colors, connection styles
├── renderer/
│   └── network-renderer.ts    # Pixi.js renderer: nodes, connections, zones, transit animations
├── simulation/
│   ├── types.ts               # Core types: Peer, Operation, SimulationState, SP/transport definitions
│   ├── engine.ts              # Pure simulation engine: tick, sendMessage, addContact, createGroup
│   ├── scenarios.ts           # Predefined network topologies (2 peers, group of 5, mixed, etc.)
│   ├── log-models.ts          # Log model logic: follow sets, topic ID computation
│   └── protocols/
│       ├── topic-sync.ts      # Topic Sync: peers discover common topics, sync full logs
│       ├── encrypted-group.ts # Encrypted + Obfuscated Group ID: metadata-limited sync
│       └── encrypted-only.ts  # Encrypted Only: opaque blob sync, maximum privacy
└── stores/
    └── ui-state.ts            # Svelte writable stores: simulationState, selectedPeerId, tick loop
```

### Key Concepts

- **Simulation State**: Immutable state object (`SimulationState`) containing peers, connections, operations, and settings. The engine returns new state on each mutation.
- **Log Models**: Two models — "Topic per Group" (each conversation is its own topic) and "Shared Peer Logs" (peers share a single log, with follow sets determining visibility).
- **Sync Protocols**: Three protocols with different privacy/bandwidth tradeoffs. Each peer can support multiple SPs. Node borders show SP colors (cyan/pink/lime) with segmented arcs for multiple.
- **Scenarios**: Predefined network setups that configure peers, connections, contacts, groups, and log models.
- **Pixi.js Renderer**: Renders nodes as circles with emoji icons, connections as styled lines, zone backgrounds, and transit animations for operations in flight.

### Layout

Three-panel flex layout:
1. **Left** (`w-72`): Protocol panel with network configuration
2. **Center** (`flex-1`): Pixi.js canvas with legend overlay
3. **Right** (`w-80`): Inspector panel, shown when a peer is selected

The Pixi renderer auto-resizes to its container. When the inspector panel appears/disappears, a `requestAnimationFrame` resize is triggered to adjust the canvas.

## Coding Style

- Prefer Tailwind CSS utility classes over custom CSS
- Simulation engine uses pure functions returning new state (immutable updates)
- Types are centralized in `simulation/types.ts`
- CSS variables for theming defined in `app.css` (dark theme only)
- Svelte 5 runes (`$state`, `$derived`) are used in components
