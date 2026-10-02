import { Button, Color, EventTouch, Graphics, Label, Layers, Node, UITransform } from 'cc';
import { config, type Game } from './shared/core-ts';

const ink = new Color(38, 72, 59), cream = new Color(255, 249, 225), green = new Color(52, 112, 70);
export function stageNode(parent: Node, name: string, x: number, y: number, width: number, height: number) {
  const node = new Node(name); node.layer = Layers.Enum.UI_2D; parent.addChild(node);
  node.setPosition(x - config.canvas.width / 2, config.canvas.height / 2 - y);
  node.addComponent(UITransform).setContentSize(width, height);
  return node;
}
function label(parent: Node, name: string, text: string, x: number, y: number, width: number, size: number, color = ink) {
  const node = stageNode(parent, name, x, y, width, size * 1.5);
  const textView = node.addComponent(Label); textView.string = text; textView.fontSize = size;
  textView.lineHeight = Math.ceil(size * 1.35); textView.color = color;
  textView.horizontalAlign = Label.HorizontalAlign.CENTER; textView.verticalAlign = Label.VerticalAlign.CENTER;
  return textView;
}
function box(parent: Node, name: string, x: number, y: number, width: number, height: number, color: Color) {
  const node = stageNode(parent, name, x, y, width, height), g = node.addComponent(Graphics);
  g.fillColor = color; g.roundRect(-width / 2, -height / 2, width, height, 18); g.fill();
  return node;
}
function button(parent: Node, name: string, text: string, x: number, y: number, width: number, height: number, action: () => void) {
  const node = box(parent, name, x, y, width, height, green);
  const control = node.addComponent(Button); control.transition = Button.Transition.NONE;
  const textView = label(node, `${name}Text`, text, 512, 384, width, 24, cream);
  node.on(Node.EventType.TOUCH_START, (event: EventTouch) => event.propagationStopped = true);
  node.on(Button.EventType.CLICK, action);
  return { node, control, text: textView };
}

export class FlightUI {
  readonly root: Node;
  readonly action;
  readonly pause;
  private readonly panel: Node;
  private readonly score: Label;
  private readonly best: Label;
  private readonly title: Label;
  private readonly message: Label;
  private readonly hint: Label;
  private readonly status: Label;
  private readonly edition: Label;

  constructor(parent: Node, action: () => void, pause: () => void) {
    this.root = stageNode(parent, 'FlightUI', 512, 384, 1024, 768);
    label(this.root, 'Brand', 'FLAPPY BIRD', 156, 36, 270, 28);
    this.edition = label(this.root, 'Edition', 'Cocos Creator · 共享玩法', 156, 68, 280, 18);
    this.score = label(this.root, 'Score', '0', 512, 52, 180, 48);
    this.best = label(this.root, 'Best', '最高 0', 790, 52, 220, 24);
    this.pause = button(this.root, 'Pause', '暂停', 950, 52, 110, 46, pause);
    this.panel = box(this.root, 'Panel', 512, 240, 570, 260, cream);
    // Panel children use coordinates relative to their parent's center.
    this.title = label(this.panel, 'Heading', '', 512, 299, 530, 36);
    this.message = label(this.panel, 'Message', '', 512, 354, 540, 20);
    this.action = button(this.panel, 'Action', '', 512, 422, 260, 62, action);
    this.hint = label(this.panel, 'Hint', '', 512, 477, 530, 18);
    this.status = label(this.root, 'StorageStatus', '', 512, 726, 980, 18);
    label(this.root, 'Controls', '空格 / 点击 / 轻触拍翅膀', 512, 682, 800, 20);
  }
  draw(model: Game, paused: boolean, replay: boolean, fixedReplay: boolean, replayEnd: number, status: string) {
    this.score.string = String(model.score);
    this.best.string = `${replay ? '回放最高' : '最高'} ${model.bestScore}`;
    this.status.string = status;
    this.edition.string = replay ? `基准回放 · tick ${model.tick}` : 'Cocos Creator · 共享玩法';
    this.pause.control.interactable = !paused && !fixedReplay;
    this.pause.node.active = !fixedReplay;
    this.panel.active = model.state === 'ready' || model.state === 'gameOver';
    this.action.control.interactable = true;
    if (paused && !fixedReplay) {
      this.panel.active = true; this.title.string = '游戏已暂停';
      this.message.string = '准备好了，再继续向前飞。'; this.action.text.string = '继续游戏';
      this.hint.string = '恢复后不会自动拍翅膀';
    } else if (replay) {
      this.panel.active = model.tick >= replayEnd && !fixedReplay;
      this.title.string = `${model.score} 分`; this.message.string = '同一套输入与水管，供各引擎对照。';
      this.action.text.string = '返回游戏'; this.hint.string = '回放不写入最高分';
    } else if (model.state === 'gameOver') {
      this.title.string = `${model.score} 分`; this.message.string = `最高纪录 ${model.bestScore} 分，再试一次吧。`;
      this.action.text.string = model.canRestart ? '重新开始' : '稍候…';
      this.action.control.interactable = model.canRestart; this.hint.string = '重新开始后，点击或空格起飞';
    } else if (model.state === 'ready') {
      this.title.string = '向前飞吧'; this.message.string = '穿过水管，每次拍翅都更接近新纪录。';
      this.action.text.string = '开始飞行'; this.hint.string = '空格 / 点击画面 / 轻触起飞';
    }
  }
  snapshot() {
    const point = (node: Node) => ({ x: node.worldPosition.x, y: node.worldPosition.y });
    return { heading: this.title.string, best: this.best.string, message: this.message.string,
      panelVisible: this.panel.active, action: this.action.text.string, actionEnabled: this.action.control.interactable,
      // World coordinates allow browser checks to operate actual Cocos buttons after scaling.
      actionWorld: point(this.action.node), pauseWorld: point(this.pause.node), storageStatus: this.status.string };
  }
}
