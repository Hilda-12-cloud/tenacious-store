(() => {
  const addToCartButton = Array.from(document.querySelectorAll("button"))
    .find(button => button.textContent.trim().toLowerCase() === "add to cart");
  const productHeading = document.querySelector(".product-info h1");

  if (!addToCartButton || !productHeading) {
    console.error("WhatsApp ordering could not find this product's order controls.");
    return;
  }

  const whatsappButton = document.createElement("a");
  const productName = productHeading.textContent.trim().replace(/\s+/g, " ");
  const message =
    `Hello, I am interested in ordering ${productName}: ${window.location.href}`;

  whatsappButton.className = "order-button";
  whatsappButton.textContent = "Order via WhatsApp";
  whatsappButton.href =
    `https://wa.me/233553393529?text=${encodeURIComponent(message)}`;
  whatsappButton.target = "_blank";
  whatsappButton.rel = "noopener noreferrer";
  whatsappButton.style.backgroundColor = "#25d366";
  whatsappButton.style.color = "#111111";
  whatsappButton.style.textDecoration = "none";
  whatsappButton.style.marginTop = "12px";
  whatsappButton.style.display = "block";
  whatsappButton.style.width = "100%";
  whatsappButton.style.padding = "16px";
  whatsappButton.style.textAlign = "center";
  whatsappButton.style.fontWeight = "bold";

  addToCartButton.insertAdjacentElement("afterend", whatsappButton);
})();
