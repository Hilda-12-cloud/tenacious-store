(function() {
  if (document.getElementById("cartToggle")) return;

  const style = document.createElement("style");
  style.textContent = `
    .tenacious-cart-access {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      min-width: 42px;
      min-height: 42px;
      margin-left: auto;
      padding: 7px 10px;
      border: 1px solid rgba(197, 160, 89, .55);
      background: #0b0b0b;
      color: #f5f3ef;
      text-decoration: none;
      cursor: pointer;
      position: relative;
      z-index: 1001;
    }
    .tenacious-cart-access svg {
      width: 20px;
      height: 20px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.6;
    }
    .tenacious-cart-access-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      border-radius: 50%;
      background: #c5a059;
      color: #0b0b0b;
      font: 700 10px Arial, sans-serif;
    }
    .tenacious-cart-access:hover,
    .tenacious-cart-access:focus-visible {
      border-color: #f2dfb7;
      color: #f2dfb7;
    }
    .tenacious-cart-access-floating {
      position: fixed;
      top: 14px;
      right: 14px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, .45);
    }
    @media (max-width: 480px) {
      .tenacious-cart-access {
        min-width: 40px;
        min-height: 40px;
        padding: 6px 8px;
      }
    }
  `;
  document.head.appendChild(style);

  const access = document.createElement("a");
  access.className = "tenacious-cart-access";
  access.href = new URL(
    window.location.pathname.includes("/stories/") ? "../index.html?openCart=1" : "index.html?openCart=1",
    window.location.href
  ).href;
  access.setAttribute("aria-label", "Open shopping bag");
  access.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 8h14l-1 13H6L5 8Z"></path>
      <path d="M9 9V6a3 3 0 0 1 6 0v3"></path>
    </svg>
    <span class="tenacious-cart-access-count" aria-live="polite">0</span>
  `;

  const header = document.querySelector("header");
  const navigation = header && header.querySelector("nav, .nav, .navbar");
  if (navigation) {
    navigation.appendChild(access);
  } else if (header) {
    header.appendChild(access);
  } else {
    access.classList.add("tenacious-cart-access-floating");
    document.body.appendChild(access);
  }

  function updateCount() {
    let cart = [];
    try {
      const saved = JSON.parse(localStorage.getItem("tenaciousCart") || "[]");
      if (Array.isArray(saved)) cart = saved;
    } catch (error) {
      console.error("Could not read the shared cart:", error);
    }

    const count = cart.reduce((total, item) => {
      const quantity = Number(item && item.quantity);
      return total + (Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0);
    }, 0);
    access.querySelector(".tenacious-cart-access-count").textContent = count;
  }

  updateCount();
  window.addEventListener("storage", event => {
    if (event.key === "tenaciousCart") updateCount();
  });
  window.addEventListener("pageshow", updateCount);
  document.addEventListener("click", () => window.setTimeout(updateCount, 0));

  if (typeof window.addToCart === "function") {
    const addToCart = window.addToCart;
    window.addToCart = function() {
      const result = addToCart.apply(this, arguments);
      updateCount();
      return result;
    };
  }
})();
