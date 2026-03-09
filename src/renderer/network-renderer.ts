import { Application, Container, Graphics, Text, TextStyle, FederatedPointerEvent } from 'pixi.js';
import type { SimulationState, SPType, Transport } from '../simulation/types';
import { TRANSPORT_STYLES } from '../simulation/types';
import { getCommonSPs } from '../simulation/engine';

const SP_COLORS: Record<SPType, number> = {
  'topic-sync': 0x06b6d4,     // cyan
  'encrypted-group': 0xec4899, // pink
  'encrypted-only': 0x84cc16,  // lime
};

const ZONE_BG: Record<string, number> = {
  'global': 0x1e293b,
  'intranet': 0x2d1b3d,
  'local': 0x1b2d1e,
};

const TRANSPORT_COLORS: Record<Transport, number> = {
  'internet': 0x64748b,
  'lan': 0x3b82f6,
  'bluetooth': 0x8b5cf6,
  'lora': 0xf97316,
};

export class NetworkRenderer {
  private app!: Application;
  private nodesContainer!: Container;
  private connectionsContainer!: Container;
  private transitContainer!: Container;
  private zonesContainer!: Container;
  private dragTarget: { peerId: string; offsetX: number; offsetY: number } | null = null;

  // Callbacks
  onPeerSelect: ((peerId: string) => void) | null = null;
  onPeerMove: ((peerId: string, x: number, y: number) => void) | null = null;
  onPeerConnect: ((peerId: string) => void) | null = null;

  async init(canvas: HTMLCanvasElement) {
    this.app = new Application();
    await this.app.init({
      canvas,
      resizeTo: canvas.parentElement!,
      backgroundColor: 0x0f172a,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });

    this.zonesContainer = new Container();
    this.connectionsContainer = new Container();
    this.transitContainer = new Container();
    this.nodesContainer = new Container();

    this.app.stage.addChild(this.zonesContainer);
    this.app.stage.addChild(this.connectionsContainer);
    this.app.stage.addChild(this.transitContainer);
    this.app.stage.addChild(this.nodesContainer);

    // Global pointer events for dragging
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on('pointermove', this.onDragMove.bind(this));
    this.app.stage.on('pointerup', this.onDragEnd.bind(this));
    this.app.stage.on('pointerupoutside', this.onDragEnd.bind(this));
  }

  destroy() {
    this.app?.destroy(true);
  }

  resize() {
    this.app?.resize();
  }

  render(state: SimulationState) {
    this.renderZones(state);
    this.renderConnections(state);
    this.renderNodes(state);
    this.renderTransit(state);
  }

  private renderZones(state: SimulationState) {
    this.zonesContainer.removeChildren();

    if (!state.intranetShutdown) return;

    // Group peers by zone and draw background regions
    const zones: Record<string, { minX: number; minY: number; maxX: number; maxY: number }> = {};
    for (const peer of state.peers.values()) {
      if (!zones[peer.zone]) {
        zones[peer.zone] = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      }
      const z = zones[peer.zone];
      z.minX = Math.min(z.minX, peer.position.x);
      z.minY = Math.min(z.minY, peer.position.y);
      z.maxX = Math.max(z.maxX, peer.position.x);
      z.maxY = Math.max(z.maxY, peer.position.y);
    }

    for (const [zone, bounds] of Object.entries(zones)) {
      const padding = 80;
      const g = new Graphics();
      g.roundRect(
        bounds.minX - padding,
        bounds.minY - padding,
        bounds.maxX - bounds.minX + padding * 2,
        bounds.maxY - bounds.minY + padding * 2,
        16
      );
      g.fill({ color: ZONE_BG[zone] || 0x1e293b, alpha: 0.5 });
      g.stroke({ color: zone === 'intranet' ? 0xef4444 : 0x475569, width: 2, alpha: 0.5 });

      const label = new Text({
        text: zone === 'global' ? 'Global Internet' : zone === 'intranet' ? 'National Intranet' : 'Local/Off-grid',
        style: new TextStyle({
          fontSize: 14,
          fill: 0x94a3b8,
          fontFamily: 'system-ui',
        }),
      });
      label.x = bounds.minX - padding + 12;
      label.y = bounds.minY - padding + 8;

      this.zonesContainer.addChild(g);
      this.zonesContainer.addChild(label);
    }
  }

  private renderConnections(state: SimulationState) {
    this.connectionsContainer.removeChildren();

    for (const conn of state.connections) {
      const from = state.peers.get(conn.from);
      const to = state.peers.get(conn.to);
      if (!from || !to) continue;

      const commonSPs = getCommonSPs(from, to);
      const noCommonSP = commonSPs.length === 0;

      // Check if connection is blocked by intranet shutdown
      let blocked = false;
      if (state.intranetShutdown && conn.transport === 'internet') {
        if (from.zone !== to.zone) blocked = true;
        if (from.zone === 'local' || to.zone === 'local') blocked = true;
      }

      const g = new Graphics();
      const color = blocked ? 0xef4444 : noCommonSP ? 0xef4444 : TRANSPORT_COLORS[conn.transport];
      const alpha = blocked ? 0.3 : (from.online && to.online) ? 0.8 : 0.2;

      // Draw line
      g.moveTo(from.position.x, from.position.y);
      g.lineTo(to.position.x, to.position.y);
      g.stroke({ color, width: blocked || noCommonSP ? 1 : 2, alpha });

      this.connectionsContainer.addChild(g);

      // Transport label
      if (conn.transport !== 'internet') {
        const midX = (from.position.x + to.position.x) / 2;
        const midY = (from.position.y + to.position.y) / 2;
        const label = new Text({
          text: TRANSPORT_STYLES[conn.transport].label,
          style: new TextStyle({
            fontSize: 10,
            fill: TRANSPORT_COLORS[conn.transport],
            fontFamily: 'system-ui',
          }),
        });
        label.anchor.set(0.5);
        label.x = midX;
        label.y = midY + 12;
        this.connectionsContainer.addChild(label);
      }

      // "No common SP" or "Blocked" label
      if (noCommonSP || blocked) {
        const midX = (from.position.x + to.position.x) / 2;
        const midY = (from.position.y + to.position.y) / 2;
        const label = new Text({
          text: blocked ? 'BLOCKED' : 'No common SP',
          style: new TextStyle({
            fontSize: 10,
            fill: 0xef4444,
            fontFamily: 'system-ui',
          }),
        });
        label.anchor.set(0.5);
        label.x = midX;
        label.y = midY;
        this.connectionsContainer.addChild(label);
      }
    }
  }

  private renderNodes(state: SimulationState) {
    this.nodesContainer.removeChildren();

    for (const peer of state.peers.values()) {
      const container = new Container();
      container.x = peer.position.x;
      container.y = peer.position.y;

      // Node circle
      const nodeSize = peer.type === 'message-server' ? 28 : 24;
      const g = new Graphics();

      // Background fill
      g.circle(0, 0, nodeSize);
      g.fill({ color: peer.online ? 0x1e293b : 0x0f172a });

      // Segmented border by supported SPs
      const sps = peer.supportedSPs;
      const borderWidth = 8;
      if (!peer.online || sps.length === 0) {
        g.circle(0, 0, nodeSize);
        g.stroke({ color: 0x64748b, width: borderWidth });
      } else if (sps.length === 1) {
        g.circle(0, 0, nodeSize);
        g.stroke({ color: SP_COLORS[sps[0]], width: borderWidth });
      } else {
        const segmentAngle = (Math.PI * 2) / sps.length;
        const startOffset = -Math.PI / 2; // start from top
        for (let i = 0; i < sps.length; i++) {
          const seg = new Graphics();
          seg.arc(0, 0, nodeSize, startOffset + i * segmentAngle, startOffset + (i + 1) * segmentAngle);
          seg.stroke({ color: SP_COLORS[sps[i]], width: borderWidth });
          container.addChild(seg);
        }
      }

      container.addChild(g);

      // Icon (simple text representation)
      const icon = new Text({
        text: peer.type === 'message-server' ? '\u{1F5A5}' : '\u{1F4F1}',
        style: new TextStyle({ fontSize: 18 }),
      });
      icon.anchor.set(0.5);
      icon.y = -1;
      container.addChild(icon);

      // Label
      const label = new Text({
        text: peer.label,
        style: new TextStyle({
          fontSize: 12,
          fill: peer.online ? 0xf1f5f9 : 0x64748b,
          fontFamily: 'system-ui',
          fontWeight: 'bold',
        }),
      });
      label.anchor.set(0.5, 0);
      label.y = nodeSize + 6;
      container.addChild(label);

      // Group membership indicators (colored pills below the label)
      if (peer.groups.length > 0) {
        const groupY = nodeSize + 22;
        const pillWidth = Math.min(40, 120 / peer.groups.length);
        const totalWidth = peer.groups.length * (pillWidth + 3) - 3;
        const startX = -totalWidth / 2;
        for (let i = 0; i < peer.groups.length; i++) {
          const group = peer.groups[i];
          const groupColor = this.getGroupColor(group.id);
          const pill = new Graphics();
          pill.roundRect(startX + i * (pillWidth + 3), groupY, pillWidth, 12, 4);
          pill.fill({ color: groupColor, alpha: 0.7 });
          container.addChild(pill);

          const gLabel = new Text({
            text: group.name.length > 5 ? group.name.slice(0, 4) + '..' : group.name,
            style: new TextStyle({
              fontSize: 8,
              fill: 0xffffff,
              fontFamily: 'system-ui',
            }),
          });
          gLabel.anchor.set(0.5, 0.5);
          gLabel.x = startX + i * (pillWidth + 3) + pillWidth / 2;
          gLabel.y = groupY + 6;
          container.addChild(gLabel);
        }
      }

      // Operation dots (small colored circles around the node)
      const ops = peer.store.operations;
      if (ops.length > 0) {
        const maxDots = 8;
        const displayOps = ops.slice(-maxDots);
        for (let i = 0; i < displayOps.length; i++) {
          const angle = (i / Math.min(ops.length, maxDots)) * Math.PI * 2 - Math.PI / 2;
          const dotRadius = nodeSize + 16;
          const dot = new Graphics();
          dot.circle(
            Math.cos(angle) * dotRadius,
            Math.sin(angle) * dotRadius,
            4
          );
          const opColor = parseInt(displayOps[i].color.replace('#', ''), 16);
          dot.fill({ color: opColor });
          if (displayOps[i].encrypted) {
            dot.stroke({ color: 0xffffff, width: 1, alpha: 0.5 });
          }
          container.addChild(dot);
        }

        // Count badge if more than maxDots
        if (ops.length > maxDots) {
          const badge = new Graphics();
          badge.roundRect(nodeSize + 8, -nodeSize - 4, 20, 14, 7);
          badge.fill({ color: 0x3b82f6 });
          const countText = new Text({
            text: `${ops.length}`,
            style: new TextStyle({ fontSize: 9, fill: 0xffffff, fontFamily: 'system-ui' }),
          });
          countText.anchor.set(0.5);
          countText.x = nodeSize + 18;
          countText.y = -nodeSize + 3;
          container.addChild(badge);
          container.addChild(countText);
        }
      }

      // Make interactive
      container.eventMode = 'static';
      container.cursor = 'pointer';

      const peerId = peer.id;
      container.on('pointerdown', (e: FederatedPointerEvent) => {
        this.dragTarget = {
          peerId,
          offsetX: e.global.x - peer.position.x,
          offsetY: e.global.y - peer.position.y,
        };
        this.onPeerSelect?.(peerId);
        e.stopPropagation();
      });

      this.nodesContainer.addChild(container);
    }
  }

  private renderTransit(state: SimulationState) {
    this.transitContainer.removeChildren();

    for (const transit of state.inTransit) {
      const from = state.peers.get(transit.fromPeer);
      const to = state.peers.get(transit.toPeer);
      if (!from || !to) continue;

      const x = from.position.x + (to.position.x - from.position.x) * transit.progress;
      const y = from.position.y + (to.position.y - from.position.y) * transit.progress;

      const dot = new Graphics();
      const opColor = parseInt(transit.operation.color.replace('#', ''), 16);
      dot.circle(0, 0, 6);
      dot.fill({ color: opColor });
      if (transit.operation.encrypted) {
        dot.stroke({ color: 0xffffff, width: 1.5 });
      }
      dot.x = x;
      dot.y = y;

      // Glow effect
      const glow = new Graphics();
      glow.circle(0, 0, 10);
      glow.fill({ color: opColor, alpha: 0.3 });
      glow.x = x;
      glow.y = y;

      this.transitContainer.addChild(glow);
      this.transitContainer.addChild(dot);
    }
  }

  private onDragMove(e: FederatedPointerEvent) {
    if (!this.dragTarget) return;
    const newX = e.global.x - this.dragTarget.offsetX;
    const newY = e.global.y - this.dragTarget.offsetY;
    this.onPeerMove?.(this.dragTarget.peerId, newX, newY);
  }

  private onDragEnd() {
    this.dragTarget = null;
  }

  private groupColorMap = new Map<string, number>();
  private groupColorPalette = [
    0xe879f9, 0x38bdf8, 0x34d399, 0xfb923c, 0xf87171,
    0xa78bfa, 0x22d3ee, 0x4ade80, 0xfbbf24, 0xf472b6,
  ];

  private getGroupColor(groupId: string): number {
    if (!this.groupColorMap.has(groupId)) {
      const idx = this.groupColorMap.size % this.groupColorPalette.length;
      this.groupColorMap.set(groupId, this.groupColorPalette[idx]);
    }
    return this.groupColorMap.get(groupId)!;
  }
}
