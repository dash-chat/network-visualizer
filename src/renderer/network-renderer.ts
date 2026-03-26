import { Application, Container, Graphics, Text, TextStyle, FederatedPointerEvent } from 'pixi.js';
import type { SimulationState, Transport } from '../simulation/types';
import {
  TRANSPORT_STYLES, TRANSPORT_RANGE, getPeerSyncStats,
  setScreenHalfHeight, getCloudTop, getCloudBottom, getISPTop, getISPBottom, getDeviceTop,
} from '../simulation/types';
import { topicColorHex } from '../simulation/crypto';


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

// Use shared layout constants from types

export class NetworkRenderer {
  private app!: Application;
  private worldContainer!: Container; // translated so (0,0) = screen center
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

    this.worldContainer = new Container();
    this.zonesContainer = new Container();
    this.connectionsContainer = new Container();
    this.transitContainer = new Container();
    this.nodesContainer = new Container();

    this.worldContainer.addChild(this.zonesContainer);
    this.worldContainer.addChild(this.connectionsContainer);
    this.worldContainer.addChild(this.transitContainer);
    this.worldContainer.addChild(this.nodesContainer);
    this.app.stage.addChild(this.worldContainer);

    // Center world so (0,0) = screen center
    this.updateWorldOffset();

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
    this.updateWorldOffset();
  }

  /** Translate the world container so (0,0) in world = center of screen */
  private updateWorldOffset() {
    if (!this.app || !this.worldContainer) return;
    this.worldContainer.x = this.app.screen.width / 2;
    this.worldContainer.y = this.app.screen.height / 2;
    setScreenHalfHeight(this.app.screen.height / 2);
  }


  render(state: SimulationState) {
    this.renderZones(state);
    this.renderConnections(state);
    this.renderNodes(state);
    this.renderTransit(state);
  }

  private renderZones(state: SimulationState) {
    this.zonesContainer.removeChildren();

    const halfW = this.app.screen.width / 2;
    const cloudTop = getCloudTop();
    const ispTop = getISPTop();
    const ispBottom = getISPBottom();

    // Cloud zone (dash-servers) — fixed height strip above ISP band
    const cloudBg = new Graphics();
    cloudBg.rect(-halfW, cloudTop, halfW * 2, ispTop - cloudTop);
    cloudBg.fill({ color: 0x1a2744, alpha: 0.6 });
    this.zonesContainer.addChild(cloudBg);

    const cloudLabel = new Text({
      text: '☁ Cloud',
      style: new TextStyle({ fontSize: 11, fill: 0x64748b, fontFamily: 'system-ui' }),
    });
    cloudLabel.x = -halfW + 10;
    cloudLabel.y = cloudTop + 6;
    this.zonesContainer.addChild(cloudLabel);

    // ISP band
    const ispBg = new Graphics();
    ispBg.rect(-halfW, ispTop, halfW * 2, ispBottom - ispTop);
    ispBg.fill({ color: 0x162033, alpha: 0.5 });
    this.zonesContainer.addChild(ispBg);

    const ispBorderTop = new Graphics();
    ispBorderTop.moveTo(-halfW, ispTop);
    ispBorderTop.lineTo(halfW, ispTop);
    ispBorderTop.stroke({ color: 0x334155, width: 1, alpha: 0.3 });
    this.zonesContainer.addChild(ispBorderTop);

    const ispBorderBottom = new Graphics();
    ispBorderBottom.moveTo(-halfW, ispBottom);
    ispBorderBottom.lineTo(halfW, ispBottom);
    ispBorderBottom.stroke({ color: 0x334155, width: 1, alpha: 0.3 });
    this.zonesContainer.addChild(ispBorderBottom);

    const ispLabel = new Text({
      text: 'ISPs',
      style: new TextStyle({ fontSize: 10, fill: 0x475569, fontFamily: 'system-ui' }),
    });
    ispLabel.x = -halfW + 10;
    ispLabel.y = ispTop + 4;
    this.zonesContainer.addChild(ispLabel);

    // Country divisions in the ISP band (based on ISP zones)
    const ispsByZone = new Map<string, { minX: number; maxX: number }>();
    for (const peer of state.peers.values()) {
      if (peer.type !== 'isp') continue;
      const zone = peer.zone;
      if (!ispsByZone.has(zone)) {
        ispsByZone.set(zone, { minX: peer.position.x, maxX: peer.position.x });
      } else {
        const b = ispsByZone.get(zone)!;
        b.minX = Math.min(b.minX, peer.position.x);
        b.maxX = Math.max(b.maxX, peer.position.x);
      }
    }

    // Draw vertical dividers between ISP zones
    const zoneEntries = [...ispsByZone.entries()].sort((a, b) => a[1].minX - b[1].minX);
    for (let i = 1; i < zoneEntries.length; i++) {
      const prevMax = zoneEntries[i - 1][1].maxX;
      const currMin = zoneEntries[i][1].minX;
      const dividerX = (prevMax + currMin) / 2;
      const divider = new Graphics();
      divider.moveTo(dividerX, ispTop);
      divider.lineTo(dividerX, ispBottom);
      divider.stroke({ color: 0x475569, width: 1, alpha: 0.4 });
      this.zonesContainer.addChild(divider);
    }

    // Shutdown zone overlays: show when any ISP has shutdown enabled
    const shutdownISPs = [...state.peers.values()].filter(p => p.type === 'isp' && p.shutdown);
    if (shutdownISPs.length === 0) return;
    const shutdownZones = new Set<string>(shutdownISPs.map(p => p.zone));

    const zones: Record<string, { minX: number; minY: number; maxX: number; maxY: number }> = {};
    for (const peer of state.peers.values()) {
      if (peer.type === 'dash-server' || peer.type === 'isp') continue;
      if (peer.type === 'message-server') continue;
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
      if (!shutdownZones.has(zone)) continue; // only overlay zones with shutdown ISPs
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
      g.stroke({ color: 0xef4444, width: 2, alpha: 0.5 });

      const label = new Text({
        text: 'Internet Shutdown',
        style: new TextStyle({ fontSize: 14, fill: 0xef4444, fontFamily: 'system-ui' }),
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

      // Connection is never "blocked" — ISP shutdown removes connections via engine logic
      const blocked = false;

      const g = new Graphics();
      const isInternet = conn.transport === 'internet';
      const color = blocked ? 0xef4444 : TRANSPORT_COLORS[conn.transport];
      const alpha = blocked ? 0.2 : isInternet ? 0.15 : (from.online && to.online) ? 0.8 : 0.2;

      g.moveTo(from.position.x, from.position.y);
      g.lineTo(to.position.x, to.position.y);
      g.stroke({ color, width: blocked ? 1 : isInternet ? 1 : 2, alpha });

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

      // "Blocked" label for shutdown
      if (blocked) {
        const midX = (from.position.x + to.position.x) / 2;
        const midY = (from.position.y + to.position.y) / 2;
        const label = new Text({
          text: 'BLOCKED',
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

      // Range rings for proximity transports
      // LAN rings on routers and starlink (they provide LAN coverage); BT/LoRa rings on peers
      const providesLan = peer.type === 'router' || peer.type === 'starlink';
      const ringTransports: Transport[] = providesLan
        ? ['lan', 'bluetooth', 'lora']
        : ['bluetooth', 'lora'];
      for (const t of ringTransports) {
        if (peer.transports.includes(t) && peer.online) {
          const range = TRANSPORT_RANGE[t];
          const ring = new Graphics();
          ring.circle(0, 0, range);
          ring.stroke({ color: TRANSPORT_COLORS[t], width: 1, alpha: 0.15 });
          ring.fill({ color: TRANSPORT_COLORS[t], alpha: 0.02 });
          container.addChild(ring);
        }
      }

      // Node circle
      const nodeSize = peer.type === 'isp' ? 18 : peer.type === 'peer' ? 24 : 28;
      const g = new Graphics();

      // Background fill
      g.circle(0, 0, nodeSize);
      g.fill({ color: peer.online ? 0x1e293b : 0x0f172a });

      // Simple border
      g.circle(0, 0, nodeSize);
      g.stroke({ color: peer.online ? 0x475569 : 0x334155, width: 2 });

      container.addChild(g);

      // Icon (simple text representation)
      const icon = new Text({
        text: peer.type === 'isp' ? '\u{1F3E2}' : peer.type === 'router' ? '\u{1F310}' : peer.type === 'starlink' ? '\u{1F4E1}' : peer.type === 'dash-server' ? '\u{2601}' : peer.type === 'message-server' ? '\u{1F5A5}' : '\u{1F4F1}',
        style: new TextStyle({ fontSize: peer.type === 'isp' ? 14 : 18 }),
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

      // Sync status badge
      const stats = getPeerSyncStats(state, peer.id);
      if (stats.expected > 0 || stats.stored > 0) {
        const synced = stats.expected > 0 && stats.received === stats.expected;
        const missing = stats.expected - stats.received;

        // Badge background
        const badgeX = nodeSize + 4;
        const badgeY = -10;
        const badge = new Graphics();

        if (synced) {
          // Green checkmark badge
          badge.roundRect(badgeX, badgeY, 16, 16, 4);
          badge.fill({ color: 0x22c55e, alpha: 0.9 });
          container.addChild(badge);
          const check = new Text({
            text: '✓',
            style: new TextStyle({ fontSize: 10, fill: 0xffffff, fontFamily: 'system-ui', fontWeight: 'bold' }),
          });
          check.anchor.set(0.5);
          check.x = badgeX + 8;
          check.y = badgeY + 8;
          container.addChild(check);
        } else if (missing > 0) {
          // Red badge with missing count
          const badgeW = missing >= 10 ? 22 : 16;
          badge.roundRect(badgeX, badgeY, badgeW, 16, 4);
          badge.fill({ color: 0xef4444, alpha: 0.9 });
          container.addChild(badge);
          const countText = new Text({
            text: `${missing}`,
            style: new TextStyle({ fontSize: 9, fill: 0xffffff, fontFamily: 'system-ui', fontWeight: 'bold' }),
          });
          countText.anchor.set(0.5);
          countText.x = badgeX + badgeW / 2;
          countText.y = badgeY + 8;
          container.addChild(countText);
        }

        // Stored count (small, below badge)
        if (stats.stored > 0) {
          const storedLabel = new Text({
            text: `${stats.stored} ops`,
            style: new TextStyle({ fontSize: 8, fill: 0x64748b, fontFamily: 'system-ui' }),
          });
          storedLabel.anchor.set(0.5, 0);
          storedLabel.x = badgeX + 8;
          storedLabel.y = badgeY + 18;
          container.addChild(storedLabel);
        }
      }

      // Make interactive
      container.eventMode = 'static';
      const isFixed = peer.type === 'dash-server' || peer.type === 'isp';
      container.cursor = isFixed ? 'default' : 'pointer';

      const peerId = peer.id;
      container.on('pointerdown', (e: FederatedPointerEvent) => {
        this.onPeerSelect?.(peerId);
        if (!isFixed) {
          this.dragTarget = {
            peerId,
            offsetX: (e.global.x - this.worldContainer.x) - peer.position.x,
            offsetY: (e.global.y - this.worldContainer.y) - peer.position.y,
          };
        }
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
      const opColor = topicColorHex(transit.operation.topicId || transit.operation.id);
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
    // Convert screen coords to world coords
    const worldX = e.global.x - this.worldContainer.x - this.dragTarget.offsetX;
    const worldY = e.global.y - this.worldContainer.y - this.dragTarget.offsetY;
    this.onPeerMove?.(this.dragTarget.peerId, worldX, Math.max(worldY, getDeviceTop()));
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
