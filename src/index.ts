import "$/styles/style.scss";
import "@popperjs/core";
import "toastify-js/src/toastify.css";
import "bootstrap/js/dist/dropdown";
import "bootstrap/js/dist/collapse";
import App from "$/App.svelte";
import { mount } from "svelte";
import { configureFabric } from "$/defaults";
import { userFonts } from "$/stores";
import { FileUtils } from "$/utils/file_utils";

configureFabric();
userFonts.subscribe(FileUtils.loadFonts);

const app = mount(App, {
  target: document.getElementById("app")!,
});

export default app;
