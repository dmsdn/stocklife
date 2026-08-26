package com.storeflow.cart.dto;

import java.util.List;

public class MigrateGuestCartRequest {
    private List<Group> groups;
    public List<Group> getGroups() { return groups; }
    public void setGroups(List<Group> groups) { this.groups = groups; }

    public static class Group {
        private String title;
        private String description;
        private List<Item> products;
        public String getTitle() { return title; }
        public void setTitle(String title) { this.title = title; }
        public String getDescription() { return description; }
        public void setDescription(String description) { this.description = description; }
        public List<Item> getProducts() { return products; }
        public void setProducts(List<Item> products) { this.products = products; }
    }

    public static class Item {
        private Integer id;
        private Integer quantity;
        private Boolean checked;
        public Integer getId() { return id; }
        public void setId(Integer id) { this.id = id; }
        public Integer getQuantity() { return quantity; }
        public void setQuantity(Integer quantity) { this.quantity = quantity; }
        public Boolean getChecked() { return checked; }
        public void setChecked(Boolean checked) { this.checked = checked; }
    }
}
