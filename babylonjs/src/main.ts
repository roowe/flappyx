import { FlightGame } from './game';
import { ui } from '../../shared/web-ts/ui';
import '../../shared/web-ts/style.css';

// Shader chunks import engine symbols from this entry bundle. Top-level await would create an import cycle.
async function start() {
  try {
    const game = await FlightGame.create();
    if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
  } catch (error) {
    ui.loadError.hidden = false;
    ui.loadError.textContent = error instanceof Error ? error.message : '游戏初始化失败，请刷新页面重试。';
    throw error;
  }
}
void start();
