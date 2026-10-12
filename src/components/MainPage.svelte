<script lang="ts">
  import { Utils } from "@mmote/niimbluelib";
  import BrowserWarning from "$/components/basic/BrowserWarning.svelte";
  import LabelDesigner from "$/components/LabelDesigner.svelte";
  import PrinterConnector from "$/components/PrinterConnector.svelte";
  import { locale, locales, tr } from "$/utils/i18n";
  import DebugStuff from "$/components/DebugStuff.svelte";
  import MdIcon from "$/components/basic/MdIcon.svelte";

  // eslint-disable-next-line no-undef
  const appCommit = __APP_COMMIT__;
  // eslint-disable-next-line no-undef
  const appVersion = __APP_VERSION__;
  // eslint-disable-next-line no-undef
  const buildDate = __BUILD_DATE__;

  let isStandalone = Utils.getAvailableTransports().capacitorBle || "__TAURI__" in window;

  let debugStuffShow = $state<boolean>(false);
</script>

<div class="page-wrapper d-flex flex-column min-vh-100">
  <header class="app-header">
    <div class="container d-flex flex-wrap align-items-center justify-content-between gap-2 py-2">
      <h1 class="title m-0">
        <span class="niim">Niim</span><span class="blue">Blue{isStandalone ? "s" : ""}</span>
      </h1>
      <PrinterConnector />
    </div>
  </header>

  <main class="container flex-grow-1 py-3 py-md-4">
    <BrowserWarning />
    <LabelDesigner />
  </main>

  <footer class="app-footer">
    <div
      class="container d-flex flex-wrap align-items-center justify-content-between gap-2 py-2 small text-body-secondary">
      <div class="tabular-nums">
        {#if appVersion}
          <a class="link-secondary" href="https://github.com/MultiMote/niimblue/releases/tag/{appVersion}">
            {appVersion}
          </a>
          &middot;
        {:else if appCommit}
          <a class="link-secondary" href="https://github.com/MultiMote/niimblue/commit/{appCommit}">
            {appCommit.slice(0, 6)}
          </a>
          &middot;
        {/if}
        {$tr("main.built")}
        {buildDate}
      </div>
      <div class="d-flex align-items-center gap-3">
        <select class="form-select form-select-sm w-auto" aria-label="Language" bind:value={$locale}>
          {#each Object.entries(locales) as [key, name] (key)}
            <option value={key}>{name}</option>
          {/each}
        </select>
        <a class="link-secondary" href="https://github.com/MultiMote/niimblue">{$tr("main.code")}</a>
        <button
          class="btn btn-link link-secondary p-0"
          title={$tr("debug.title")}
          aria-label={$tr("debug.title")}
          onclick={() => (debugStuffShow = true)}>
          <MdIcon icon="bug_report" />
        </button>
      </div>
    </div>
  </footer>
</div>

{#if debugStuffShow}
  <DebugStuff bind:show={debugStuffShow} />
{/if}

<style>
  .app-header {
    position: sticky;
    top: 0;
    z-index: 1010;
    background: rgba(18, 20, 24, 0.82);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--nb-line);
  }

  .app-footer {
    border-top: 1px solid var(--nb-line);
  }

  .title {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .niim {
    color: #ec5f56;
  }

  .blue {
    color: #5592ea;
  }
</style>
