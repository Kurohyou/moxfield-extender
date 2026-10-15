import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let popover;
let anchor;

/**
 * Dispatch a mousedown on an element.
 * @param {Element} target
 */
function mousedown(target) {
  target.dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  );
}

beforeEach(async () => {
  vi.resetModules();
  await import('../src/content/popover.js');
  popover = window.MoxfieldExtended.popover;
  document.head.innerHTML = '';
  document.body.innerHTML = '<button id="anchor">open</button><p id="outside">x</p>';
  anchor = document.getElementById('anchor');
});

afterEach(() => {
  popover.close();
});

describe('popover.open', () => {
  it('appends a fixed div.mox-popover[data-mox] to body and renders into it', () => {
    const handle = popover.open(anchor, (container) => {
      container.textContent = 'hello';
    });
    expect(handle.el.parentElement).toBe(document.body);
    expect(handle.el.matches('div.mox-popover[data-mox]')).toBe(true);
    expect(handle.el.style.position).toBe('fixed');
    expect(handle.el.textContent).toBe('hello');
    expect(popover.isOpen()).toBe(true);
  });

  it('injects its stylesheet once', () => {
    popover.open(anchor, () => {});
    popover.open(anchor, () => {});
    const styles = document.querySelectorAll('style#mox-popover-styles');
    expect(styles).toHaveLength(1);
    expect(styles[0].hasAttribute('data-mox')).toBe(true);
  });

  it('update() re-runs render', () => {
    let calls = 0;
    const handle = popover.open(anchor, (container) => {
      calls += 1;
      container.textContent = `render ${calls}`;
    });
    handle.update();
    expect(calls).toBe(2);
    expect(handle.el.textContent).toBe('render 2');
  });

  it('passes the handle to render, so render can close its own popover', () => {
    const onClose = vi.fn();
    const handle = popover.open(anchor, (_container, self) => self.close(), {
      onClose,
    });
    expect(handle.el.isConnected).toBe(false);
    expect(popover.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('closing', () => {
  it('closes on Esc', () => {
    const onClose = vi.fn();
    const handle = popover.open(anchor, () => {}, { onClose });
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(handle.el.isConnected).toBe(false);
    expect(popover.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys', () => {
    popover.open(anchor, () => {});
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true })
    );
    expect(popover.isOpen()).toBe(true);
  });

  it('closes on an outside mousedown', () => {
    const handle = popover.open(anchor, () => {});
    mousedown(document.getElementById('outside'));
    expect(handle.el.isConnected).toBe(false);
  });

  it('stays open on a mousedown inside the popover or on the anchor', () => {
    const handle = popover.open(anchor, (container) => {
      container.innerHTML = '<button class="inner">+</button>';
    });
    mousedown(handle.el.querySelector('.inner'));
    mousedown(anchor);
    expect(popover.isOpen()).toBe(true);
    expect(handle.el.isConnected).toBe(true);
  });

  it('closes when the anchor leaves the document', async () => {
    const onClose = vi.fn();
    popover.open(anchor, () => {}, { onClose });
    anchor.remove();
    await Promise.resolve();
    await Promise.resolve();
    expect(popover.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opening a second popover closes the first and calls its onClose', () => {
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    const first = popover.open(anchor, () => {}, { onClose: firstClose });
    const second = popover.open(anchor, () => {}, { onClose: secondClose });
    expect(first.el.isConnected).toBe(false);
    expect(second.el.isConnected).toBe(true);
    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(secondClose).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.mox-popover')).toHaveLength(1);
  });

  it('close() is idempotent and calls onClose once', () => {
    const onClose = vi.fn();
    const handle = popover.open(anchor, () => {}, { onClose });
    handle.close();
    handle.close();
    popover.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a stale handle cannot close a newer popover', () => {
    const first = popover.open(anchor, () => {});
    const second = popover.open(anchor, () => {});
    first.close();
    expect(second.el.isConnected).toBe(true);
    expect(popover.isOpen()).toBe(true);
  });

  it('removes its listeners on close', () => {
    const onClose = vi.fn();
    const handle = popover.open(anchor, () => {}, { onClose });
    handle.close();
    // Re-attach the old root: nothing should react to it any more.
    document.body.appendChild(handle.el);
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(handle.el.isConnected).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
