(async function () {
  const catalog = await fetch("/api/catalog").then(r => r.json());
  const formCategory = document.getElementById("formCategory");
  const formProduct = document.getElementById("formProduct");
  const selectCategory = formProduct.category;
  const preview = document.getElementById("catalogPreview");
  const saveBtn = document.getElementById("saveBtn");

  function updatePreview() {
    preview.value = JSON.stringify(catalog, null, 2);
  }

  function refreshCategoryOptions() {
    selectCategory.innerHTML = "";
    catalog.categories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.title;
      opt.textContent = cat.title;
      selectCategory.appendChild(opt);
    });
  }

  formCategory.addEventListener("submit", e => {
    e.preventDefault();
    const title = formCategory.title.value.trim();
    if (!title) return;
    catalog.categories.push({ title, items: [] });
    formCategory.reset();
    refreshCategoryOptions();
    updatePreview();
  });

  formProduct.addEventListener("submit", e => {
    e.preventDefault();
    const catTitle = selectCategory.value;
    const title = formProduct.title.value.trim();
    const description = formProduct.description.value.trim();
    const category = catalog.categories.find(c => c.title === catTitle);
    if (category) {
      category.items.push({ id: `prd_${Date.now()}`, title, description });
      formProduct.reset();
      updatePreview();
    }
  });

  saveBtn.addEventListener("click", async () => {
    const res = await fetch("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(catalog)
    });
    const data = await res.json();
    alert(data.ok ? "Catálogo guardado ✅" : "Error al guardar");
  });

  refreshCategoryOptions();
  updatePreview();
})();