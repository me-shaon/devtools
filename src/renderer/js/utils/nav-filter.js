class NavFilter {
  /**
   * @param {string} inputSelector - Selector for search input
   * @param {string} itemsSelector - Selector for items to filter
   */
  constructor(inputSelector, itemsSelector) {
    this.input = document.querySelector(inputSelector);
    this.items = document.querySelectorAll(itemsSelector);
  }

  init() {
    if (!this.input || this.items.length === 0) return;
    this.input.addEventListener("input", () => this.filterItems());
  }

  filterItems() {
    const query = this.input.value.toLowerCase();
    this.items.forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(query) ? "" : "none";
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const filter = new NavFilter("#toolSearch", ".nav-menu li");
  filter.init();
});