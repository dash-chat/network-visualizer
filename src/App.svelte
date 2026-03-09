<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { NetworkRenderer } from './renderer/network-renderer';
  import { simulationState, selectedPeerId, showInspector } from './stores/ui-state';
  import Toolbar from './components/Toolbar.svelte';
  import ProtocolPanel from './components/ProtocolPanel.svelte';
  import InspectorPanel from './components/InspectorPanel.svelte';
  import Legend from './components/Legend.svelte';

  let canvasEl: HTMLCanvasElement;
  let renderer: NetworkRenderer;
  let unsub: (() => void) | null = null;
  let handleResize: (() => void) | null = null;

  onMount(() => {
    renderer = new NetworkRenderer();
    renderer.init(canvasEl).then(() => {
      renderer.onPeerSelect = (peerId: string) => {
        selectedPeerId.set(peerId);
        showInspector.set(true);
      };

      renderer.onPeerMove = (peerId: string, x: number, y: number) => {
        simulationState.update(s => {
          const peer = s.peers.get(peerId);
          if (!peer) return s;
          const newPeers = new Map(s.peers);
          newPeers.set(peerId, { ...peer, position: { x, y } });
          return { ...s, peers: newPeers };
        });
      };

      // Render loop
      unsub = simulationState.subscribe(state => {
        renderer?.render(state);
      });

      // Handle window resize
      handleResize = () => renderer?.resize();
      window.addEventListener('resize', handleResize);

      // Resize canvas when inspector panel shows/hides
      const unsubPeer = selectedPeerId.subscribe(() => {
        requestAnimationFrame(() => renderer?.resize());
      });

      return () => {
        unsubPeer();
      };
    });

    return () => {
      unsub?.();
      if (handleResize) window.removeEventListener('resize', handleResize);
      renderer?.destroy();
    };
  });
</script>

<div class="flex flex-col h-screen w-screen overflow-hidden">
  <!-- Top toolbar -->
  <Toolbar />

  <!-- Main content -->
  <div class="flex flex-1 overflow-hidden">
    <!-- Left panel: Protocol & Config -->
    <ProtocolPanel />

    <!-- Center: Canvas -->
    <div class="flex-1 min-w-0 relative">
      <canvas bind:this={canvasEl} class="w-full h-full"></canvas>
      <Legend />
    </div>

    <!-- Right panel: Inspector + Actions -->
    <InspectorPanel />
  </div>
</div>
