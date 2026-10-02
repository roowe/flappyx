import birdIcon from '../assets/runtime/bird-01.png?url';

const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/png';
favicon.href = birdIcon;
document.head.append(favicon);

export function element<T extends HTMLElement>(id: string, type: { new(): T }): T {
  const node = document.getElementById(id);
  if (!(node instanceof type)) throw new Error(`页面节点无效：#${id}。`);
  return node;
}

export const ui = {
  panel: element('panel', HTMLElement), action: element('action', HTMLButtonElement),
  pause: element('pause', HTMLButtonElement), heading: element('heading', HTMLElement),
  eyebrow: element('eyebrow', HTMLElement), message: element('message', HTMLElement),
  hint: element('hint', HTMLElement), score: element('score', HTMLElement),
  best: element('best', HTMLElement), bestLabel: element('best-label', HTMLElement), edition: element('edition', HTMLElement),
  storageStatus: element('storage-status', HTMLElement), loadError: element('load-error', HTMLElement),
};
