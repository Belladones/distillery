// Native horizontal scrolling supplies swipe, trackpad and scroll-snap behavior.
export function initProductGallery(root) {
  const gallery = root.querySelector("[data-product-gallery]");
  if (!gallery) return () => {};
  const track = gallery.querySelector("[data-gallery-track]");
  const slides = [...track.children],
    dots = [...gallery.querySelectorAll("[data-gallery-go]")];
  const previous = gallery.querySelector("[data-gallery-previous]"),
    next = gallery.querySelector("[data-gallery-next]"),
    counter = gallery.querySelector("[data-gallery-count]");
  let index = 0,
    width = track.clientWidth,
    frame,
    resizeFrame,
    resizeFrame2,
    resizing = false;
  function update() {
    frame = undefined;
    // Browsers may snap during a resize before ResizeObserver runs. Keep the
    // current selection until the new slide width has been applied.
    if (resizing || !width || track.clientWidth !== width) return;
    index = Math.max(
      0,
      Math.min(slides.length - 1, Math.round(track.scrollLeft / width)),
    );
    slides.forEach((slide, i) =>
      slide.setAttribute("aria-hidden", String(i !== index)),
    );
    dots.forEach((dot, i) => {
      dot.classList.toggle("is-active", i === index);
      dot.setAttribute("aria-current", String(i === index));
    });
    if (previous) previous.disabled = index === 0;
    if (next) next.disabled = index === slides.length - 1;
    if (counter)
      counter.textContent = `${String(index + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
  }
  function goTo(value) {
    const target = Math.max(0, Math.min(slides.length - 1, value));
    track.scrollTo({
      left: target * width,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }
  function onScroll() {
    if (frame === undefined) frame = requestAnimationFrame(update);
  }
  function onClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-gallery-previous")) goTo(index - 1);
    if (button.hasAttribute("data-gallery-next")) goTo(index + 1);
    if (button.hasAttribute("data-gallery-go"))
      goTo(Number(button.dataset.galleryGo));
  }
  function onKey(event) {
    const keys = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: slides.length - 1,
    };
    if (!(event.key in keys) || event.altKey || event.ctrlKey || event.metaKey)
      return;
    event.preventDefault();
    goTo(keys[event.key]);
  }
  function onResize() {
    const nextWidth = track.clientWidth;
    if (!nextWidth) return;
    resizing = true;
    width = nextWidth;
    if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    if (resizeFrame2 !== undefined) cancelAnimationFrame(resizeFrame2);
    track.scrollTo({ left: index * width, behavior: "auto" });
    // Reapply after responsive layout and native scroll snapping have settled.
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame2 = requestAnimationFrame(() => {
        width = track.clientWidth || width;
        track.scrollTo({ left: index * width, behavior: "auto" });
        resizing = false;
        update();
      });
    });
  }
  const resize = new ResizeObserver(() => {
    if (track.clientWidth !== width) onResize();
  });
  window.addEventListener("resize", onResize);
  track.addEventListener("scroll", onScroll, { passive: true });
  gallery.addEventListener("click", onClick);
  gallery.addEventListener("keydown", onKey);
  resize.observe(track);
  update();
  return () => {
    resize.disconnect();
    window.removeEventListener("resize", onResize);
    if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
    if (resizeFrame2 !== undefined) cancelAnimationFrame(resizeFrame2);
    track.removeEventListener("scroll", onScroll);
    gallery.removeEventListener("click", onClick);
    gallery.removeEventListener("keydown", onKey);
    if (frame !== undefined) cancelAnimationFrame(frame);
  };
}
