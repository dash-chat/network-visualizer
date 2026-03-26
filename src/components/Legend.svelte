<script lang="ts">
</script>

<div class="absolute bottom-14 left-4 bg-[var(--bg-secondary)]/90 backdrop-blur-sm rounded-lg p-3 border border-[var(--border)]">
  <h4 class="text-[10px] font-bold uppercase text-[var(--text-muted)] mb-1.5">Operation Dots</h4>
  <div class="flex items-center gap-1.5 mb-1">
    <span class="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-blue-400 to-purple-400"></span>
    <span class="text-[10px] text-[var(--text-secondary)]">Color = topic ID (deterministic)</span>
  </div>
  <div class="flex items-center gap-1.5">
    <span class="w-2.5 h-2.5 rounded-full border border-blue-400/60 bg-blue-400/20"></span>
    <span class="text-[10px] text-[var(--text-secondary)]">Hollow = envelope only (GC'd)</span>
  </div>

  <h4 class="text-[10px] font-bold uppercase text-[var(--text-muted)] mt-2 mb-1.5">Sync Protocols (border)</h4>
  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-1.5">
      <span class="w-2.5 h-2.5 rounded-full" style="background: #06b6d4"></span>
      <span class="text-[10px] text-[var(--text-secondary)]">Log Height Sync</span>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="w-2.5 h-2.5 rounded-full" style="background: #84cc16"></span>
      <span class="text-[10px] text-[var(--text-secondary)]">KDF Envelope Sync</span>
    </div>
  </div>

  <h4 class="text-[10px] font-bold uppercase text-[var(--text-muted)] mt-2 mb-1.5">Connections</h4>
  <div class="flex flex-col gap-1">
    <div class="flex items-center gap-1.5">
      <span class="w-4 border-t-2 border-[#64748b]"></span>
      <span class="text-[10px] text-[var(--text-secondary)]">Internet</span>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="w-4 border-t-2 border-dashed border-[#3b82f6]"></span>
      <span class="text-[10px] text-[var(--text-secondary)]">LAN</span>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="w-4 border-t-2 border-dotted border-[#8b5cf6]"></span>
      <span class="text-[10px] text-[var(--text-secondary)]">Bluetooth</span>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="w-4 border-t-2 border-dashed border-[#f97316]"></span>
      <span class="text-[10px] text-[var(--text-secondary)]">LoRa</span>
    </div>
  </div>

  <div class="mt-2 flex items-center gap-1.5">
    <span class="text-[10px]">🔒</span>
    <span class="text-[10px] text-[var(--text-secondary)]">= Encrypted operation</span>
  </div>
</div>
