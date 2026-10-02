import { FlightGame } from './game';
import { ui } from '../../shared/web-ts/ui';
import '../../shared/web-ts/style.css';

const game = await FlightGame.create().catch((error: unknown) => {
  ui.loadError.hidden = false;
  ui.loadError.textContent = error instanceof Error ? error.message : '游戏初始化失败，请刷新页面重试。';
  throw error;
});
if (import.meta.hot) import.meta.hot.dispose(() => game.dispose());
