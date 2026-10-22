const STORAGE_KEY = "toviuHubLinks";
const tileColorCache = new Map();

const defaultLinks = [
	{ name: "YouTube", url: "https://youtube.com", tag: "Video" },
	{ name: "Cinecalidad", url: "https://cinecalidad.ec", tag: "Cartelera", featured: true },
	{ name: "Twitch", url: "https://twitch.tv", tag: "En vivo" },
	{ name: "Netflix", url: "https://netflix.com", tag: "Streaming" },
	{ name: "Hbo", url: "https://play.max.com", tag: "Streaming" },
	{ name: "Disney+", url: "https://disneyplus.com", tag: "Streaming" },
	{ name: "Prime Video", url: "https://primevideo.com", tag: "Streaming" },
	{ name: "Spotify", url: "https://open.spotify.com", tag: "Musica" }
];

const linksGrid = document.getElementById("links-grid");
const addButton = document.getElementById("btn-add");
const mainAddButton = document.getElementById("btn-add-main");
const searchInput = document.getElementById("link-search");
const countLabel = document.getElementById("links-count");
const modalTitle = document.getElementById("modal-title");
const resetButton = document.getElementById("btn-reset");
const menuButton = document.getElementById("btn-menu");
const closeMenuButton = document.getElementById("btn-close-menu");
const sidebar = document.getElementById("sidebar-menu");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const modal = document.getElementById("modal");
const cancelButton = document.getElementById("btn-cancel");
const form = document.getElementById("link-form");
const nameInput = document.getElementById("link-name");
const urlInput = document.getElementById("link-url");
const tagInput = document.getElementById("link-tag");
const formError = document.getElementById("form-error");

let links = loadLinks();
let activeIndex = 0;
let dragSourceIndex = null;
let launchPending = false;
let editingIndex = null;

renderLinks();
bindEvents();

function bindEvents() {
	addButton.addEventListener("click", openModal);
	mainAddButton.addEventListener("click", openModal);
	searchInput.addEventListener("input", renderLinks);
	cancelButton.addEventListener("click", closeModal);
	resetButton.addEventListener("click", resetLinks);
	menuButton.addEventListener("click", toggleSidebar);
	closeMenuButton.addEventListener("click", closeSidebar);
	sidebarOverlay.addEventListener("click", closeSidebar);

	addButton.addEventListener("click", closeSidebar);
	resetButton.addEventListener("click", closeSidebar);

	modal.addEventListener("click", (event) => {
		if (event.target instanceof HTMLElement && event.target.dataset.closeModal === "true") {
			closeModal();
		}
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && isSidebarOpen()) {
			closeSidebar();
			return;
		}

		if (event.key === "Escape" && !modal.classList.contains("hidden")) {
			closeModal();
			return;
		}

		handleGlobalKeyboard(event);
	});

	form.addEventListener("submit", onSubmitForm);

	linksGrid.addEventListener("dragover", onGridDragOver);
	linksGrid.addEventListener("drop", onGridDrop);
	linksGrid.addEventListener("dragleave", onGridDragLeave);
}

function loadLinks() {
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) {
		return [...defaultLinks];
	}

	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return [...defaultLinks];
		}

		const sanitized = parsed
			.filter(isValidLinkShape)
			.map((link) => ({
				name: String(link.name).trim(),
				url: normalizeUrl(String(link.url).trim()),
				tag: String(link.tag || "Sitio").trim(),
				featured: Boolean(link.featured)
			}))
			.filter((link) => Boolean(link.url));

		return sanitized.length ? sanitized : [...defaultLinks];
	} catch {
		return [...defaultLinks];
	}
}

function saveLinks() {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

function renderLinks() {
  linksGrid.replaceChildren();
  const query = searchInput.value.trim().toLocaleLowerCase();
  const visible = links.map((link, index) => ({link, index})).filter(({link}) =>
    `${link.name} ${link.tag}`.toLocaleLowerCase().includes(query)
  );
  countLabel.textContent = `${links.length} ${links.length === 1 ? "enlace" : "enlaces"}`;
  activeIndex = Math.min(Math.max(activeIndex, 0), Math.max(visible.length - 1, 0));

  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "grid-empty";
    empty.textContent = query ? "No encontramos aplicaciones con ese nombre." : "Todavía no tienes enlaces. Agrega el primero.";
    linksGrid.append(empty);
  }

  visible.forEach(({link, index}, visibleIndex) => {
    const tile = document.createElement("article");
    tile.className = "tile";
    tile.dataset.index = String(index);
    tile.draggable = !query;
    if (visibleIndex === activeIndex) tile.classList.add("is-active");
    applyTileColor(tile, link.url);

    const open = document.createElement("a");
    open.className = "tile-open";
    open.href = link.url;
    open.rel = "noreferrer";
    open.dataset.index = String(index);
    open.tabIndex = visibleIndex === activeIndex ? 0 : -1;
    open.setAttribute("aria-label", `Abrir ${link.name}`);
    open.addEventListener("click", onTileLaunch);

    const favicon = document.createElement("img");
    favicon.className = "tile-favicon";
    favicon.alt = "";
    favicon.loading = "lazy";
    favicon.decoding = "async";
    try {
      const host = new URL(link.url).hostname;
      favicon.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
    } catch { favicon.hidden = true; }
    favicon.addEventListener("error", () => { favicon.hidden = true; });

    const label = document.createElement("span");
    label.className = "tile-label";
    label.textContent = link.name;
    const mark = document.createElement("span");
    mark.className = "tile-mark";
    mark.textContent = link.tag || "Sitio";
    const controls = document.createElement("div");
    controls.className = "tile-controls";
    controls.append(
      controlButton("Editar " + link.name, "✎", () => editLink(index)),
      controlButton("Mover arriba", "↑", () => moveLink(index, -1)),
      controlButton("Mover abajo", "↓", () => moveLink(index, 1)),
      controlButton("Eliminar " + link.name, "×", () => deleteLink(index))
    );
    const actionToggle = document.createElement("button");
    actionToggle.type = "button";
    actionToggle.className = "tile-action-toggle";
    actionToggle.textContent = "···";
    actionToggle.setAttribute("aria-label", `Opciones de ${link.name}`);
    actionToggle.setAttribute("aria-expanded", "false");
    actionToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const openActions = !tile.classList.contains("actions-visible");
      linksGrid.querySelectorAll(".tile.actions-visible").forEach(other => {
        if (other !== tile) other.classList.remove("actions-visible");
      });
      tile.classList.toggle("actions-visible", openActions);
      actionToggle.setAttribute("aria-expanded", String(openActions));
    });
    let hoverTimer;
    tile.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      window.clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(() => tile.classList.add("actions-visible"), 1100);
    });
    tile.addEventListener("pointerleave", () => {
      window.clearTimeout(hoverTimer);
      tile.classList.remove("actions-visible");
      actionToggle.setAttribute("aria-expanded", "false");
    });
    tile.addEventListener("focusout", (event) => {
      if (!tile.contains(event.relatedTarget) && !tile.matches(":hover")) {
        tile.classList.remove("actions-visible");
        actionToggle.setAttribute("aria-expanded", "false");
      }
    });
    open.append(favicon, label, mark);
    tile.append(open, actionToggle, controls);
    if (!query) {
      tile.addEventListener("dragstart", onTileDragStart);
      tile.addEventListener("dragend", onTileDragEnd);
      tile.addEventListener("dragover", onTileDragOver);
      tile.addEventListener("drop", onTileDrop);
      tile.addEventListener("dragleave", onTileDragLeave);
    }
    linksGrid.append(tile);
  });
  focusActiveTile(false);
}

function controlButton(title, icon, onClick) {
	const button = document.createElement("button");
	button.className = "icon-btn";
	button.type = "button";
	button.title = title;
	button.setAttribute("aria-label", title);
	button.textContent = icon;
	button.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		onClick();
	});
	return button;
}

function moveLink(index, delta) {
	const nextIndex = index + delta;
	if (nextIndex < 0 || nextIndex >= links.length) {
		return;
	}

	const item = links[index];
	links[index] = links[nextIndex];
	links[nextIndex] = item;
	saveLinks();
	renderLinks();
}

function deleteLink(index) {
	links.splice(index, 1);
	if (activeIndex >= links.length) {
		activeIndex = Math.max(links.length - 1, 0);
	}
	saveLinks();
	renderLinks();
}

function resetLinks() {
	links = [...defaultLinks];
	saveLinks();
	renderLinks();
}

function openModal() {
	closeSidebar();
	editingIndex = null;
	modalTitle.textContent = "Agregar enlace";
	form.reset();
	formError.textContent = "";
	modal.classList.remove("hidden");
	modal.setAttribute("aria-hidden", "false");
	nameInput.focus();
}

function editLink(index) {
  const link = links[index];
  if (!link) return;
  closeSidebar();
  editingIndex = index;
  modalTitle.textContent = "Editar enlace";
  formError.textContent = "";
  nameInput.value = link.name;
  urlInput.value = link.url;
  tagInput.value = link.tag || "";
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  nameInput.focus();
}

function closeModal() {
	modal.classList.add("hidden");
	modal.setAttribute("aria-hidden", "true");
	editingIndex = null;
}

function onSubmitForm(event) {
	event.preventDefault();
	formError.textContent = "";

	const name = nameInput.value.trim();
	const tag = tagInput.value.trim() || "Sitio";
	const normalizedUrl = normalizeUrl(urlInput.value.trim());

	if (!name) {
		formError.textContent = "El nombre es obligatorio.";
		return;
	}

	if (!normalizedUrl || !isValidHttpUrl(normalizedUrl)) {
		formError.textContent = "Ingresa una URL valida (http:// o https://).";
		return;
	}

	if (editingIndex === null) {
		links.push({ name, url: normalizedUrl, tag });
	} else {
		links[editingIndex] = { ...links[editingIndex], name, url: normalizedUrl, tag };
	}
	saveLinks();
	renderLinks();
	closeModal();
}

function normalizeUrl(url) {
	if (!url) {
		return "";
	}
	if (/^https?:\/\//i.test(url)) {
		return url;
	}
	return `https://${url}`;
}

function isValidHttpUrl(url) {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

function isValidLinkShape(item) {
	return item && typeof item.name === "string" && typeof item.url === "string";
}

function toggleSidebar() {
	if (isSidebarOpen()) {
		closeSidebar();
		return;
	}

	openSidebar();
}

function openSidebar() {
	sidebar.classList.remove("hidden");
	sidebarOverlay.classList.remove("hidden");
	sidebar.setAttribute("aria-hidden", "false");
	menuButton.setAttribute("aria-expanded", "true");
}

function closeSidebar() {
	sidebar.classList.add("hidden");
	sidebarOverlay.classList.add("hidden");
	sidebar.setAttribute("aria-hidden", "true");
	menuButton.setAttribute("aria-expanded", "false");
}

function isSidebarOpen() {
	return !sidebar.classList.contains("hidden");
}

function handleGlobalKeyboard(event) {
	if (isTypingContext(event.target)) {
		return;
	}

	const modalOpen = !modal.classList.contains("hidden");
	if (!modalOpen && (event.key === "n" || event.key === "N")) {
		event.preventDefault();
		openModal();
		return;
	}

	if (modalOpen) {
		return;
	}

	if (!linksGrid.querySelector(".tile-open")) {
		return;
	}

	const columns = getGridColumns();

	if (event.key === "ArrowLeft") {
		event.preventDefault();
		setActiveIndex(activeIndex - 1);
		return;
	}

	if (event.key === "ArrowRight") {
		event.preventDefault();
		setActiveIndex(activeIndex + 1);
		return;
	}

	if (event.key === "ArrowUp") {
		event.preventDefault();
		setActiveIndex(activeIndex - columns);
		return;
	}

	if (event.key === "ArrowDown") {
		event.preventDefault();
		setActiveIndex(activeIndex + columns);
		return;
	}

	if (event.key === "Enter" || event.key === " ") {
		event.preventDefault();
		activateActiveTile();
	}
}

function isTypingContext(target) {
	if (!(target instanceof HTMLElement)) {
		return false;
	}

	return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function getGridColumns() {
	const style = window.getComputedStyle(linksGrid);
	const template = style.gridTemplateColumns;
	if (!template) {
		return 1;
	}

	const columns = template.split(" ").filter(Boolean).length;
	return Math.max(columns, 1);
}

function setActiveIndex(nextIndex) {
	const clampedIndex = Math.min(Math.max(nextIndex, 0), linksGrid.querySelectorAll(".tile-open").length - 1);
	if (clampedIndex === activeIndex) {
		return;
	}

	activeIndex = clampedIndex;
	focusActiveTile(true);
}

function focusActiveTile(shouldFocus) {
	const tiles = linksGrid.querySelectorAll(".tile-open");
	if (!tiles.length) {
		return;
	}

	tiles.forEach((tile, index) => {
		tile.parentElement.classList.toggle("is-active", index === activeIndex);
		tile.tabIndex = index === activeIndex ? 0 : -1;
	});

	if (shouldFocus) {
		const activeTile = tiles[activeIndex];
		if (activeTile instanceof HTMLElement) {
			activeTile.focus({ preventScroll: true });
			activeTile.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
		}
	}
}

function activateActiveTile() {
	const tiles = linksGrid.querySelectorAll(".tile-open");
	const activeTile = tiles[activeIndex];
	if (activeTile instanceof HTMLElement) {
		activeTile.click();
	}
}

function onTileDragStart(event) {
	const tile = event.currentTarget;
	if (!(tile instanceof HTMLElement)) {
		return;
	}

	const index = Number(tile.dataset.index);
	if (Number.isNaN(index)) {
		return;
	}

	dragSourceIndex = index;
	tile.classList.add("is-dragging");

	if (event.dataTransfer) {
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", String(index));
	}
}

function onTileDragEnd() {
	clearDragVisualState();
	dragSourceIndex = null;
}

function onTileDragOver(event) {
	event.preventDefault();
	const tile = event.currentTarget;
	if (!(tile instanceof HTMLElement)) {
		return;
	}

	if (event.dataTransfer) {
		event.dataTransfer.dropEffect = "move";
	}

	markDropTarget(tile);
}

function onTileDrop(event) {
	event.preventDefault();
	event.stopPropagation();

	const tile = event.currentTarget;
	if (!(tile instanceof HTMLElement)) {
		return;
	}

	const targetIndex = Number(tile.dataset.index);
	if (Number.isNaN(targetIndex)) {
		return;
	}

	moveLinkByDrag(targetIndex);
}

function onTileDragLeave(event) {
	const tile = event.currentTarget;
	if (!(tile instanceof HTMLElement)) {
		return;
	}

	const related = event.relatedTarget;
	if (related instanceof Node && tile.contains(related)) {
		return;
	}

	tile.classList.remove("is-drop-target");
}

function onGridDragOver(event) {
	event.preventDefault();
	if (event.dataTransfer) {
		event.dataTransfer.dropEffect = "move";
	}

	const targetTile = event.target instanceof HTMLElement ? event.target.closest(".tile") : null;
	if (!targetTile) {
		clearDropTargets();
	}
}

function onGridDrop(event) {
	event.preventDefault();

	const targetTile = event.target instanceof HTMLElement ? event.target.closest(".tile") : null;
	if (targetTile instanceof HTMLElement) {
		return;
	}

	moveLinkByDrag(links.length);
}

function onGridDragLeave(event) {
	const related = event.relatedTarget;
	if (related instanceof Node && linksGrid.contains(related)) {
		return;
	}

	clearDropTargets();
}

function moveLinkByDrag(targetIndex) {
	if (dragSourceIndex === null || !Number.isInteger(targetIndex)) {
		clearDragVisualState();
		dragSourceIndex = null;
		return;
	}

	if (targetIndex < 0) {
		targetIndex = 0;
	}
	if (targetIndex > links.length) {
		targetIndex = links.length;
	}

	let insertionIndex = targetIndex;
	if (dragSourceIndex < targetIndex) {
		insertionIndex = targetIndex - 1;
	}

	if (insertionIndex === dragSourceIndex) {
		clearDragVisualState();
		dragSourceIndex = null;
		return;
	}

	const [moved] = links.splice(dragSourceIndex, 1);
	if (!moved) {
		clearDragVisualState();
		dragSourceIndex = null;
		return;
	}

	links.splice(insertionIndex, 0, moved);
	activeIndex = insertionIndex;
	saveLinks();
	clearDragVisualState();
	dragSourceIndex = null;
	renderLinks();
}

function markDropTarget(targetTile) {
	clearDropTargets();
	targetTile.classList.add("is-drop-target");
}

function clearDropTargets() {
	const targets = linksGrid.querySelectorAll(".tile.is-drop-target");
	targets.forEach((tile) => tile.classList.remove("is-drop-target"));
}

function clearDragVisualState() {
	const draggingTiles = linksGrid.querySelectorAll(".tile.is-dragging");
	draggingTiles.forEach((tile) => tile.classList.remove("is-dragging"));
	clearDropTargets();
}

// Los favicons pueden ser de terceros: si el canvas queda bloqueado por CORS,
// conservamos un tono de respaldo estable, sin afectar la navegación.
function fallbackTileColor(url) {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return "#423039"; }
  const branded = [
    [/youtube/i, "#9F1735"], [/netflix/i, "#921E32"],
    [/twitch/i, "#6547A0"], [/spotify/i, "#147A51"],
    [/disney/i, "#255F8D"], [/primevideo|amazon/i, "#146A90"],
    [/max\.com|hbo/i, "#62538E"]
  ];
  for (const [pattern, color] of branded) if (pattern.test(host)) return color;
  let hash = 0;
  for (const char of host) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 35% 28%)`;
}

function applyTileColor(tile, url) {
  const fallback = fallbackTileColor(url);
  tile.style.setProperty("--tile-color", tileColorCache.get(url) || fallback);
  if (tileColorCache.has(url)) return;
  let host;
  try { host = new URL(url).hostname; } catch { return; }
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => {
    try {
      const sample = document.createElement("canvas");
      sample.width = sample.height = 40;
      const context = sample.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, 40, 40);
      const pixels = context.getImageData(0, 0, 40, 40).data;
      const bins = new Map();
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 150) continue;
        const [r,g,b] = [pixels[i],pixels[i+1],pixels[i+2]];
        const max = Math.max(r,g,b), min = Math.min(r,g,b);
        if (max < 45 || min > 215 || max-min < 35) continue;
        const key = [r,g,b].map(n => Math.min(255, Math.round(n/32)*32)).join(",");
        bins.set(key, (bins.get(key) || 0) + (max-min));
      }
      const best = [...bins].sort((a,b) => b[1]-a[1])[0];
      if (!best) return;
      const [r,g,b] = best[0].split(",").map(Number);
      const color = `rgb(${Math.round(r*.67)} ${Math.round(g*.67)} ${Math.round(b*.67)})`;
      tileColorCache.set(url, color);
      // Evitar afectar tarjetas ya reemplazadas por una nueva búsqueda.
      if (tile.isConnected) tile.style.setProperty("--tile-color", color);
    } catch { /* CORS: queda el color de respaldo. */ }
  };
  image.onerror = () => {};
  image.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

function getTileBackground(url) {
	try {
		const parsed = new URL(url);
		const host = parsed.hostname;
		const fallback = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
		return `url("${fallback}")`;
	} catch {
		return "linear-gradient(180deg, #181a22 0%, #111218 100%)";
	}
}

// La transición solo intercepta aperturas normales; no afecta clics modificados ni controles.
function onTileLaunch(event) {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (launchPending) { event.preventDefault(); return; }
  const tile = event.currentTarget;
  if (!(tile instanceof HTMLAnchorElement)) return;
  event.preventDefault();
  launchPending = true;
  const overlay = document.getElementById("launch-overlay");
  document.getElementById("launch-label").textContent = `Abriendo ${links[Number(tile.dataset.index)]?.name || "enlace"}…`;
  overlay.classList.add("visible");
  overlay.setAttribute("aria-hidden", "false");
  window.setTimeout(() => { window.location.assign(tile.href); }, 520);
}
window.addEventListener("pageshow", () => {
  launchPending = false;
  const overlay = document.getElementById("launch-overlay");
  overlay?.classList.remove("visible");
  overlay?.setAttribute("aria-hidden", "true");
});
