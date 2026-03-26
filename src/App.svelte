<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { NetworkRenderer } from './renderer/network-renderer';
  import { simulationState, selectedPeerId, showInspector, showSetup } from './stores/ui-state';
  import Toolbar from './components/Toolbar.svelte';
  import InspectorPanel from './components/InspectorPanel.svelte';
  import SetupScreen from './components/SetupScreen.svelte';

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

    });

    return () => {
      unsub?.();
      if (handleResize) window.removeEventListener('resize', handleResize);
      renderer?.destroy();
    };
  });
</script>

{#if $showSetup}
  <SetupScreen />
{/if}

<div class="flex flex-col h-screen w-screen overflow-hidden" class:invisible={$showSetup}>
  <!-- Top toolbar -->
  <Toolbar />

  <!-- Main content -->
  <div class="flex-1 relative overflow-hidden">
    <!-- Canvas (full area) -->
    <canvas bind:this={canvasEl} class="w-full h-full"></canvas>

    <!-- Right panel: overlaid on top -->
    <div class="absolute top-0 right-0 h-full z-10">
      <InspectorPanel />
    </div>
  </div>
</div>
