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

/**
 * A DOMRect-shaped object.
 * @param {number} top
 * @param {number} left
 * @param {number} width
 * @param {number} height
 * @returns {Object}
 */
function rect(top, left, width, height) {
  return {
    top,
    left,
    width,
    height,
    bottom: top + height,
    right: left + width,
    x: left,
    y: top,
  };
}

beforeEach(async () => {
  vi.resetModules();
  await import('../src/content/popover.js');
  popover = window.MoxfieldExtended.popover;
  document.head.innerHTML = '';
  document.body.innerHTML =
    '<button id="anchor">open</button><p id="outside">x</p>';
  anchor = document.getElementById('anchor');
  // jsdom has no layout; give the anchor a visible box by default.
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(
    rect(100, 500, 100, 20)
  );
});

afterEach(() => {
  popover.close();
  vi.restoreAllMocks();
});

describe('positioning', () => {
  const VIEWPORT = { innerWidth: 1000, innerHeight: 800 };
  let saved;

  /**
   * Fake the layout jsdom lacks: the viewport, the popover's size and the
   * anchor's rect.
   * @param {{width: number, height: number}} size - Popover size
   * @param {{top: number, bottom: number, left: number, right: number}} rect
   */
  function layout(size, rect) {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(
      size.width
    );
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
      size.height
    );
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
      ...rect,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      x: rect.left,
      y: rect.top,
    });
  }

  /**
   * Open a popover and return its placement.
   * @returns {{left: string, top: string}}
   */
  function place() {
    const { el } = popover.open(anchor, () => {});
    return { left: el.style.left, top: el.style.top };
  }

  beforeEach(() => {
    saved = {};
    Object.entries(VIEWPORT).forEach(([key, value]) => {
      saved[key] = Object.getOwnPropertyDescriptor(window, key);
      Object.defineProperty(window, key, { value, configurable: true });
    });
  });

  afterEach(() => {
    Object.entries(saved).forEach(([key, descriptor]) => {
      if (descriptor) Object.defineProperty(window, key, descriptor);
      else delete window[key];
    });
  });

  it('sits below the anchor, right-aligned to it', () => {
    layout(
      { width: 200, height: 100 },
      { top: 100, bottom: 120, left: 500, right: 600 }
    );
    expect(place()).toEqual({ left: '400px', top: '124px' });
  });

  it('clamps to the right edge with an 8 px margin', () => {
    layout(
      { width: 200, height: 100 },
      { top: 100, bottom: 120, left: 900, right: 1100 }
    );
    expect(place()).toEqual({ left: '792px', top: '124px' });
  });

  it('clamps to the left edge with an 8 px margin', () => {
    layout(
      { width: 200, height: 100 },
      { top: 100, bottom: 120, left: 0, right: 150 }
    );
    expect(place()).toEqual({ left: '8px', top: '124px' });
  });

  it('flips above the anchor when there is no room below', () => {
    layout(
      { width: 200, height: 100 },
      { top: 730, bottom: 750, left: 500, right: 600 }
    );
    expect(place()).toEqual({ left: '400px', top: '626px' });
  });

  it('pins a popover taller than the viewport to the top margin', () => {
    layout(
      { width: 200, height: 900 },
      { top: 100, bottom: 120, left: 500, right: 600 }
    );
    expect(place()).toEqual({ left: '400px', top: '8px' });
  });

  it('re-positions on update()', () => {
    layout(
      { width: 200, height: 100 },
      { top: 100, bottom: 120, left: 500, right: 600 }
    );
    const handle = popover.open(anchor, () => {});
    anchor.getBoundingClientRect.mockReturnValue({
      top: 200,
      bottom: 220,
      left: 300,
      right: 400,
      width: 100,
      height: 20,
      x: 300,
      y: 200,
    });
    handle.update();
    expect(handle.el.style.left).toBe('200px');
    expect(handle.el.style.top).toBe('224px');
  });

  it('follows the anchor on window scroll', () => {
    layout({ width: 200, height: 100 }, rect(100, 500, 100, 20));
    const { el } = popover.open(anchor, () => {});
    anchor.getBoundingClientRect.mockReturnValue(rect(40, 300, 100, 20));
    window.dispatchEvent(new Event('scroll'));
    expect(el.style.left).toBe('200px');
    expect(el.style.top).toBe('64px');
  });

  it('follows the anchor when an inner element scrolls', () => {
    layout({ width: 200, height: 100 }, rect(100, 500, 100, 20));
    const { el } = popover.open(anchor, () => {});
    anchor.getBoundingClientRect.mockReturnValue(rect(40, 300, 100, 20));
    // scroll does not bubble; the capture listener still sees it.
    document.getElementById('outside').dispatchEvent(new Event('scroll'));
    expect(el.style.top).toBe('64px');
  });

  it('re-positions on window resize', () => {
    layout({ width: 200, height: 100 }, rect(100, 500, 100, 20));
    const { el } = popover.open(anchor, () => {});
    Object.defineProperty(window, 'innerWidth', {
      value: 500,
      configurable: true,
    });
    window.dispatchEvent(new Event('resize'));
    expect(el.style.left).toBe('292px');
  });

  it('stops following once closed', () => {
    layout({ width: 200, height: 100 }, rect(100, 500, 100, 20));
    const handle = popover.open(anchor, () => {});
    handle.close();
    anchor.getBoundingClientRect.mockReturnValue(rect(40, 300, 100, 20));
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    expect(handle.el.style.top).toBe('124px');
  });

  it('closes when the anchor is hidden on update()', () => {
    layout({ width: 200, height: 100 }, rect(100, 500, 100, 20));
    const onClose = vi.fn();
    const handle = popover.open(anchor, () => {}, { onClose });
    anchor.getBoundingClientRect.mockReturnValue(rect(0, 0, 0, 0));
    handle.update();
    expect(popover.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the anchor is hidden on scroll', () => {
    layout({ width: 200, height: 100 }, rect(100, 500, 100, 20));
    popover.open(anchor, () => {});
    anchor.getBoundingClientRect.mockReturnValue(rect(0, 0, 0, 0));
    window.dispatchEvent(new Event('scroll'));
    expect(popover.isOpen()).toBe(false);
  });

  it('opens even when the anchor has an empty rect', () => {
    layout({ width: 200, height: 100 }, rect(0, 0, 0, 0));
    popover.open(anchor, () => {});
    expect(popover.isOpen()).toBe(true);
  });
});

describe('popover.open', () => {
  it('is a dialog with a default aria-label', () => {
    const { el } = popover.open(anchor, () => {});
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-label')).toBeTruthy();
  });

  it('takes its aria-label from the label option', () => {
    const { el } = popover.open(anchor, () => {}, { label: 'Odds for X' });
    expect(el.getAttribute('aria-label')).toBe('Odds for X');
  });

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
  it('Esc stops propagation when it closes a popover', () => {
    const seen = vi.fn();
    document.body.addEventListener('keydown', seen);
    popover.open(anchor, () => {});
    const outside = document.getElementById('outside');
    outside.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(seen).not.toHaveBeenCalled();

    outside.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(seen).toHaveBeenCalledTimes(1);
    document.body.removeEventListener('keydown', seen);
  });

  it('stays open when the anchor is removed and re-appended synchronously', async () => {
    popover.open(anchor, () => {});
    const parent = anchor.parentElement;
    anchor.remove();
    parent.appendChild(anchor);
    await Promise.resolve();
    await Promise.resolve();
    expect(popover.isOpen()).toBe(true);
  });

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
