import "@fontsource/oswald/latin-500.css";
import "@fontsource/oswald/latin-600.css";
import "@fontsource/outfit/latin-400.css";
import "@fontsource/outfit/latin-500.css";
import "./style.css";
import { Game } from "./game/Game.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#view");
if (!canvas) throw new Error("Missing canvas");

const game = new Game(canvas);
void game.start();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    });
  });
}
