(function () {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector("#site-nav");
  const navLinks = nav ? nav.querySelectorAll("a") : [];
  const form = document.querySelector(".contact-form");
  const formStatus = document.querySelector(".form-status");

  function setNavOpen(isOpen) {
    if (!toggle || !nav) return;
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
    nav.classList.toggle("is-open", isOpen);
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      const isOpen = toggle.getAttribute("aria-expanded") === "true";
      setNavOpen(!isOpen);
    });

    navLinks.forEach(function (link) {
      link.addEventListener("click", function () {
        setNavOpen(false);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setNavOpen(false);
    });

    document.addEventListener("click", function (event) {
      if (!header.contains(event.target)) setNavOpen(false);
    });
  }

  // Soft-fallback smooth scroll for browsers that ignore CSS scroll-behavior
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener("click", function (event) {
      const id = anchor.getAttribute("href");
      if (!id || id === "#") return;
      const target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.pushState(null, "", id);
    });
  });

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      // Hook up Formspree, Netlify Forms, or another form service here.
      if (formStatus) {
        formStatus.hidden = false;
        formStatus.textContent =
          "Thanks — this demo form isn't connected yet. Please email levi@srqcoding.club instead.";
      }
    });
  }
})();
