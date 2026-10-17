"use strict";

// Tab switching shared by every section. A tab is a button `.tab[data-tab="name"]` plus a panel
// `[role="tabpanel"]#nameTab`. Sections register an onShow callback to render lazily.
const Tabs = (() => {
  const handlers = new Map();
  let current = "sheet";
  let previous = null;
  let bound = false;

  function register(name, callbacks = {}) {
    handlers.set(name, callbacks);
  }

  function tabButtons() {
    return Array.from(document.querySelectorAll(".tab"));
  }

  function show(name) {
    if (!tabButtons().some((tab) => tab.dataset.tab === name)) {
      name = "sheet";
    }
    if (name !== current) {
      previous = current;
    }
    current = name;
    tabButtons().forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('[role="tabpanel"]').forEach((panel) => {
      panel.hidden = panel.id !== `${name}Tab`;
    });
    document.body.dataset.tab = name;
    if (location.hash !== `#${name}`) {
      history.replaceState(null, "", `#${name}`);
    }
    const callbacks = handlers.get(name);
    if (callbacks && callbacks.onShow) {
      callbacks.onShow();
    }
    window.scrollTo(0, 0);
  }

  function nameFromHash() {
    return location.hash.replace("#", "") || "sheet";
  }

  function bind() {
    if (bound) {
      return;
    }
    bound = true;
    tabButtons().forEach((tab) => {
      tab.addEventListener("click", () => show(tab.dataset.tab));
      tab.addEventListener("keydown", (event) => {
        const buttons = tabButtons();
        const index = buttons.indexOf(tab);
        let next = null;
        if (event.key === "ArrowRight") {
          next = buttons[(index + 1) % buttons.length];
        } else if (event.key === "ArrowLeft") {
          next = buttons[(index - 1 + buttons.length) % buttons.length];
        } else if (event.key === "Home") {
          next = buttons[0];
        } else if (event.key === "End") {
          next = buttons[buttons.length - 1];
        }
        if (next) {
          event.preventDefault();
          show(next.dataset.tab);
          next.focus();
        }
      });
    });
    window.addEventListener("hashchange", () => {
      const wanted = nameFromHash();
      if (wanted !== current) {
        show(wanted);
      }
    });
  }

  // Called once saved data has loaded so each section's first render sees real data.
  function start() {
    bind();
    show(nameFromHash());
  }

  return { register, show, start, current: () => current, previous: () => previous };
})();
