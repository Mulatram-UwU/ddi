export function html(markup: string): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const node = template.content.firstElementChild;
  if (!node) throw new Error('html(): markup produced no element');
  return node as HTMLElement;
}

export function mustFind<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`mustFind(): no element for ${selector}`);
  return node;
}
