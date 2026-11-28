(function () {
  "use strict";

  const API = "https://tenacious-payments.hildaocran3.workers.dev";
  const SESSION_KEY = "tenaciousCustomerSession";
  const authCard = document.getElementById("auth-card");
  const dashboard = document.getElementById("dashboard");
  const requestForm = document.getElementById("request-form");
  const verifyForm = document.getElementById("verify-form");
  const emailInput = document.getElementById("email");
  const codeInput = document.getElementById("code");
  const sendButton = document.getElementById("send-code");
  const verifyButton = document.getElementById("verify-code");
  const resendButton = document.getElementById("resend-code");
  const authStatus = document.getElementById("auth-status");
  const dashboardStatus = document.getElementById("dashboard-status");
  const content = document.getElementById("account-content");
  let resendTimer = null;
  let cooldownUntil = 0;
  let customer = null;
  let orders = [];
  let ordersError = "";

  function setStatus(element, message, kind) {
    element.textContent = message || "";
    element.className = "status" + (kind ? " " + kind : "");
  }

  async function readResponse(response) {
    let body;
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    if (!response.ok) {
      const error = new Error(
        body.error || body.message || (response.status === 429
          ? "Please wait before requesting another code."
          : "The request could not be completed.")
      );
      error.status = response.status;
      error.retryAfter = Number(body.retry_after || body.retryAfter || body.cooldown_seconds || body.cooldownSeconds);
      throw error;
    }
    return body;
  }

  function payloadData(body) {
    return body && body.data && typeof body.data === "object" ? body.data : body;
  }

  async function api(path, options) {
    const response = await fetch(API + path, options);
    return readResponse(response);
  }

  function startCooldown(seconds) {
    window.clearInterval(resendTimer);
    let remaining = Math.max(1, Math.ceil(seconds || 60));
    cooldownUntil = Date.now() + remaining * 1000;
    resendButton.disabled = true;
    sendButton.disabled = true;
    const update = function () {
      resendButton.textContent = "Resend code in " + remaining + "s";
      if (remaining <= 0) {
        window.clearInterval(resendTimer);
        cooldownUntil = 0;
        resendButton.textContent = "Resend code";
        resendButton.disabled = false;
        sendButton.disabled = false;
        return;
      }
      remaining -= 1;
    };
    update();
    resendTimer = window.setInterval(update, 1000);
  }

  function getToken(data) {
    const candidates = [data, data && data.session, data && data.customer_session];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const token = candidate.session_token || candidate.sessionToken || candidate.token;
      if (typeof token === "string" && token.trim()) return token.trim();
    }
    return "";
  }

  function field(object, keys) {
    for (const key of keys) {
      if (object && object[key] !== undefined && object[key] !== null && object[key] !== "") return object[key];
    }
    return null;
  }

  function displayValue(value) {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Subscribed" : "Not subscribed";
    return String(value);
  }

  function dateValue(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
  }

  function customerName(value) {
    return field(value, ["name", "full_name", "fullName"]) ||
      [value && value.first_name, value && value.last_name].filter(Boolean).join(" ") ||
      "Welcome";
  }

  function orderCollection(body) {
    const data = payloadData(body);
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.orders)) return data.orders;
    if (data && data.result && Array.isArray(data.result.orders)) return data.result.orders;
    return null;
  }

  function formatMoney(order, keys) {
    let raw = null;
    let minor = false;
    for (const key of keys) {
      if (order && order[key] !== undefined && order[key] !== null && order[key] !== "") {
        raw = order[key];
        minor = key.endsWith("_minor") || key.endsWith("_cents");
        break;
      }
    }
    if (raw === null) return "—";
    const amount = Number(raw);
    if (!Number.isFinite(amount)) return String(raw);
    const value = minor ? amount / 100 : amount;
    const currency = field(order, ["currency", "currency_code"]);
    if (currency && /^[A-Z]{3}$/.test(String(currency).toUpperCase())) {
      try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency: String(currency).toUpperCase() }).format(value);
      } catch {
        return value.toFixed(2) + " " + currency;
      }
    }
    return currency ? value.toFixed(2) + " " + currency : value.toFixed(2);
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function addInfo(host, label, value) {
    const item = makeElement("div", "info-item");
    item.append(makeElement("span", "", label), makeElement("strong", "", displayValue(value)));
    host.appendChild(item);
  }

  function makeMetric(host, label, value) {
    const item = makeElement("div", "metric");
    item.append(makeElement("span", "", label), makeElement("strong", "", displayValue(value)));
    host.appendChild(item);
  }

  function orderField(host, label, value) {
    const item = document.createElement("div");
    item.append(makeElement("span", "", label), makeElement("strong", "", displayValue(value)));
    host.appendChild(item);
  }

  function createOrderCard(order) {
    const card = makeElement("article", "order-card");
    const top = makeElement("div", "order-top");
    top.appendChild(makeElement("span", "order-ref", field(order, ["order_reference", "reference", "order_ref", "order_number", "id"]) || "Order"));
    const status = field(order, ["status", "payment_status", "order_status"]);
    if (status) top.appendChild(makeElement("span", "pill", status));
    card.appendChild(top);

    const fields = makeElement("div", "order-fields");
    orderField(fields, "Order date", dateValue(field(order, ["order_date", "created_at", "date"])));
    orderField(fields, "Subtotal", formatMoney(order, ["subtotal", "subtotal_amount", "subtotal_minor", "subtotal_amount_minor", "subtotal_cents"]));
    orderField(fields, "Discount", formatMoney(order, ["discount", "discount_amount", "discount_minor", "discount_amount_minor", "discount_cents"]));
    orderField(fields, "Shipping", formatMoney(order, ["shipping", "shipping_amount", "shipping_minor", "shipping_amount_minor", "shipping_cents"]));
    orderField(fields, "Total", formatMoney(order, ["total", "total_amount", "total_minor", "total_amount_minor", "total_cents", "amount"]));
    orderField(fields, "Currency", field(order, ["currency", "currency_code"]));
    card.appendChild(fields);

    const trackingValues = [
      ["Carrier", field(order, ["carrier", "shipping_carrier"])],
      ["Tracking number", field(order, ["tracking_number", "trackingNumber", "tracking_code"])],
      ["Shipment status", field(order, ["shipment_status", "fulfillment_status"])],
      ["Delivery date", field(order, ["delivery_date", "delivered_at"])]
    ].filter(entry => entry[1] !== null);
    const trackingUrl = field(order, ["tracking_url", "tracking_link", "trackingUrl"]);
    if (trackingValues.length || trackingUrl) {
      const shipment = makeElement("div", "shipment");
      trackingValues.forEach(entry => {
        const part = makeElement("span", "", entry[0] + ": " + displayValue(entry[1]));
        shipment.appendChild(part);
      });
      if (trackingUrl) {
        try {
          const url = new URL(String(trackingUrl));
          if (url.protocol === "https:" || url.protocol === "http:") {
            const link = makeElement("a", "", "Track shipment");
            link.href = url.href;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            shipment.appendChild(link);
          }
        } catch {
          // Ignore malformed tracking URLs returned by the API.
        }
      }
      card.appendChild(shipment);
    }
    return card;
  }

  function renderOrders(host, list, emptyTitle, emptyText) {
    if (!list.length) {
      const empty = makeElement("div", "empty");
      empty.append(makeElement("strong", "", emptyTitle), makeElement("span", "", emptyText));
      host.appendChild(empty);
      return;
    }
    const listHost = makeElement("div", "order-list");
    list.forEach(order => listHost.appendChild(createOrderCard(order)));
    host.appendChild(listHost);
  }

  function renderView(view) {
    content.replaceChildren();
    document.querySelectorAll(".account-nav [role=tab]").forEach(tab => {
      tab.setAttribute("aria-selected", String(tab.dataset.view === view));
    });

    if (view === "overview") {
      const overview = makeElement("section", "panel");
      overview.appendChild(makeElement("h2", "", "Account overview"));
      const metrics = makeElement("div", "metrics");
      makeMetric(metrics, "Total orders", field(customer, ["total_orders", "order_count", "orders_count"]));
      makeMetric(metrics, "Total spent", customer && field(customer, ["total_spent", "total_spending", "total_spent_minor", "total_spending_minor"]) !== null
        ? formatMoney(customer, ["total_spent", "total_spending", "total_spent_minor", "total_spending_minor"])
        : "—");
      makeMetric(metrics, "Loyalty tier", field(customer, ["loyalty_tier", "tier"]));
      makeMetric(metrics, "Member since", dateValue(field(customer, ["created_at", "registered_at", "registration_date"])));
      overview.appendChild(metrics);
      overview.appendChild(makeElement("p", "muted", customer ? "Your account summary is provided by @TENACIOUS." : "Your profile is not available."));
      content.appendChild(overview);
      return;
    }

    if (view === "orders" || view === "tracking") {
      const panel = makeElement("section", "panel");
      panel.appendChild(makeElement("h2", "", view === "orders" ? "My orders" : "Shipment tracking"));
      if (ordersError) {
        const empty = makeElement("div", "empty");
        empty.append(makeElement("strong", "", view === "orders" ? "Order history unavailable" : "Tracking information unavailable"), makeElement("span", "", ordersError));
        panel.appendChild(empty);
        content.appendChild(panel);
        return;
      }
      if (view === "orders") {
        renderOrders(panel, orders, "No orders yet", "Your order history will appear here after a purchase.");
      } else {
        const shippable = orders.filter(order =>
          field(order, ["carrier", "shipping_carrier", "tracking_number", "trackingNumber", "tracking_code", "tracking_url", "tracking_link", "shipment_status", "fulfillment_status"])
        );
        renderOrders(panel, shippable, "No tracking information available", orders.length
          ? "Tracking details will appear here when the backend provides them."
          : "Shipment tracking will appear here when you have an order.");
      }
      content.appendChild(panel);
      return;
    }

    const panel = makeElement("section", "panel");
    panel.appendChild(makeElement("h2", "", "Account information"));
    const details = makeElement("div", "info-grid");
    addInfo(details, "Full name", customerName(customer));
    addInfo(details, "Email address", field(customer, ["email", "email_address"]));
    addInfo(details, "Registration date", dateValue(field(customer, ["created_at", "registered_at", "registration_date"])));
    addInfo(details, "Loyalty tier", field(customer, ["loyalty_tier", "tier"]));
    panel.appendChild(details);
    content.appendChild(panel);
  }

  function showSignIn(message, kind) {
    dashboard.hidden = true;
    authCard.hidden = false;
    setStatus(authStatus, message || "", kind);
    emailInput.focus({ preventScroll: true });
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    customer = null;
    orders = [];
    dashboard.hidden = true;
    authCard.hidden = false;
  }

  async function loadAccount(token) {
    authCard.hidden = true;
    dashboard.hidden = true;
    orders = [];
    ordersError = "";
    setStatus(authStatus, "");
    setStatus(dashboardStatus, "Loading your account…");
    try {
      const profileBody = await api("/customer/me", {
        headers: { Authorization: "Bearer " + token }
      });
      const profile = payloadData(profileBody);
      customer = profile && profile.customer && typeof profile.customer === "object" ? profile.customer : profile;
      if (!customer || typeof customer !== "object") throw new Error("The profile response was invalid.");
      document.getElementById("welcome-name").textContent = customerName(customer);
      document.getElementById("welcome-email").textContent = displayValue(field(customer, ["email", "email_address"]));
      dashboard.hidden = false;
      renderView("overview");
      setStatus(dashboardStatus, "");

      try {
        const orderBody = await api("/customer/orders", {
          headers: { Authorization: "Bearer " + token }
        });
        const result = orderCollection(orderBody);
        if (!result) throw new Error("The order history response was invalid.");
        orders = result;
        renderView(document.querySelector(".account-nav [aria-selected=true]")?.dataset.view || "overview");
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          clearSession();
          showSignIn("Your session has expired. Please sign in again.", "error");
          return;
        }
        ordersError = error.message || "Your order history could not be loaded.";
        setStatus(dashboardStatus, error.message || "Your order history could not be loaded.", "error");
        renderView(document.querySelector(".account-nav [aria-selected=true]")?.dataset.view || "overview");
      }
    } catch (error) {
      clearSession();
      if (error.status === 401 || error.status === 403) {
        showSignIn("Your session has expired. Please sign in again.", "error");
        return;
      }
      showSignIn(error.message || "Your account could not be loaded. Please try again.", "error");
    }
  }

  requestForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!requestForm.reportValidity()) return;
    const email = emailInput.value.trim();
    sendButton.disabled = true;
    setStatus(authStatus, "Sending your verification code…");
    try {
      await api("/customer/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      verifyForm.hidden = false;
      codeInput.value = "";
      setStatus(authStatus, "If this email can receive sign-in codes, a six-digit code has been sent.", "success");
      startCooldown(60);
      codeInput.focus();
    } catch (error) {
      if (error.status === 429) startCooldown(error.retryAfter || 60);
      setStatus(authStatus, error.status === 429
        ? "A code was requested recently. Please wait before trying again."
        : error.message || "We could not send a code. Check your connection and try again.", "error");
    } finally {
      sendButton.disabled = cooldownUntil > Date.now();
    }
  });

  verifyForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!verifyForm.reportValidity()) return;
    verifyButton.disabled = true;
    resendButton.disabled = true;
    setStatus(authStatus, "Verifying your code…");
    try {
      const body = await api("/customer/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput.value.trim(), code: codeInput.value.trim() })
      });
      const token = getToken(payloadData(body));
      if (!token) throw new Error("Sign-in succeeded without a session token. Please request a new code.");
      sessionStorage.setItem(SESSION_KEY, token);
      await loadAccount(token);
    } catch (error) {
      setStatus(authStatus, error.message || "The code could not be verified.", "error");
    } finally {
      verifyButton.disabled = false;
      resendButton.disabled = false;
      if (Number(resendButton.textContent.match(/(\d+)s/)?.[1]) > 0) resendButton.disabled = true;
    }
  });

  resendButton.addEventListener("click", function () {
    requestForm.requestSubmit();
  });

  document.querySelectorAll(".account-nav [role=tab]").forEach(tab => {
    tab.addEventListener("click", function () {
      renderView(tab.dataset.view);
      setStatus(dashboardStatus, "");
    });
  });

  document.getElementById("logout").addEventListener("click", async function () {
    const token = sessionStorage.getItem(SESSION_KEY);
    this.disabled = true;
    setStatus(dashboardStatus, "Signing out…");
    try {
      if (token) {
        await api("/customer/logout", {
          method: "POST",
          headers: { Authorization: "Bearer " + token }
        });
      }
    } catch (error) {
      if (error.status !== 401 && error.status !== 403) {
        setStatus(dashboardStatus, error.message || "The sign-out request failed.", "error");
      }
    } finally {
      clearSession();
      verifyForm.hidden = true;
      setStatus(authStatus, "You have been signed out.", "success");
      this.disabled = false;
    }
  });

  const savedToken = sessionStorage.getItem(SESSION_KEY);
  if (savedToken) loadAccount(savedToken);
})();
