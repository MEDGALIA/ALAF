// Shared UI primitives: escaping, async region states, toasts, drawer a11y. (#36)

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

// Every async region renders one of these four states, never a bare blank. (#36)
export function renderLoading(el, label = "Loading…") {
  el.innerHTML = `<div class="state state--loading" role="status">
    <span class="spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span>
  </div>`;
}

export function renderEmpty(el, { title, hint = "" } = {}) {
  el.innerHTML = `<div class="state state--empty">
    <p class="state__title">${escapeHtml(title)}</p>
    ${hint ? `<p class="state__hint">${escapeHtml(hint)}</p>` : ""}
  </div>`;
}

export function renderError(el, message, onRetry) {
  el.innerHTML = `<div class="state state--error" role="alert">
    <p class="state__title">Something went wrong</p>
    <p class="state__hint">${escapeHtml(message)}</p>
    ${onRetry ? `<button type="button" class="btn btn--secondary" data-retry>Try again</button>` : ""}
  </div>`;
  if (onRetry) $("[data-retry]", el)?.addEventListener("click", onRetry);
}

// ---- Toasts --------------------------------------------------------------

export function toast(message, { type = "info", action } = {}) {
  const host = $("#toasts");
  if (!host) return;
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");
  el.innerHTML = `<span class="toast__msg">${escapeHtml(message)}</span>`;
  if (action) {
    const link = document.createElement("a");
    link.className = "toast__action";
    link.href = action.href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = action.label;
    el.appendChild(link);
  }
  const close = document.createElement("button");
  close.className = "toast__close";
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";
  close.addEventListener("click", () => el.remove());
  el.appendChild(close);
  host.appendChild(el);
  // Errors stay until dismissed; they usually need an action.
  if (type !== "error") setTimeout(() => el.remove(), 6000);
}

// ---- Button busy state -----------------------------------------------------

export async function withBusy(button, label, fn) {
  const original = button.textContent;
  button.disabled = true;
  button.dataset.busy = "true";
  button.textContent = label;
  try {
    return await fn();
  } finally {
    button.disabled = false;
    delete button.dataset.busy;
    button.textContent = original;
  }
}

// ---- Drawer ----------------------------------------------------------------

let lastFocused = null;

export function openDrawer() {
  lastFocused = document.activeElement;
  const drawer = $("#drawer");
  const overlay = $("#overlay");
  drawer.hidden = false;
  overlay.hidden = false;
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
  $("input, select, textarea, button", drawer)?.focus();
  document.addEventListener("keydown", onDrawerKeydown);
}

export function closeDrawer() {
  const drawer = $("#drawer");
  const overlay = $("#overlay");
  drawer.hidden = true;
  overlay.hidden = true;
  drawer.setAttribute("aria-hidden", "true");
  drawer.innerHTML = "";
  document.body.classList.remove("drawer-open");
  document.removeEventListener("keydown", onDrawerKeydown);
  lastFocused?.focus();
}

function onDrawerKeydown(event) {
  if (event.key === "Escape") {
    closeDrawer();
    return;
  }
  if (event.key !== "Tab") return;
  const focusables = $$(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    $("#drawer")
  );
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function debounce(fn, ms = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
