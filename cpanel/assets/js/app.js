(function () {
  const storageKey = "xd_sms_theme";

  function getPreferredTheme() {
    const saved = localStorage.getItem(storageKey);
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function updateIcons(theme) {
    document.querySelectorAll("[data-theme-icon-sun]").forEach((el) => {
      el.style.display = theme === "dark" ? "none" : "";
    });
    document.querySelectorAll("[data-theme-icon-moon]").forEach((el) => {
      el.style.display = theme === "dark" ? "" : "none";
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    updateIcons(theme);
  }

  window.XD_SMS = window.XD_SMS || {};
  window.XD_SMS.getTheme = getPreferredTheme;
  window.XD_SMS.setTheme = function (theme) {
    localStorage.setItem(storageKey, theme);
    applyTheme(theme);
  };
  window.XD_SMS.toggleTheme = function () {
    window.XD_SMS.setTheme(getPreferredTheme() === "dark" ? "light" : "dark");
  };

  applyTheme(getPreferredTheme());

  document.addEventListener("DOMContentLoaded", () => {
    updateIcons(getPreferredTheme());
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.addEventListener("click", window.XD_SMS.toggleTheme);
    });
    document.querySelectorAll("[data-mobile-menu]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelector(".sidebar")?.classList.toggle("open");
      });
    });
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", (e) => {
        const target = document.querySelector(anchor.getAttribute("href"));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth" });
        }
      });
    });
  });
})();
