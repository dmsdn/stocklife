package com.storeflow.chat.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;

/** Browser-local planning data; never authorizes member reads or writes. */
public record GuestCartContext(Long groupId, @NotNull @Size(max=40) List<@Valid Group> groups) {
    public record Group(@NotNull @Positive Long cartGroupId, @NotBlank @Size(max=120) String title,
                        @NotNull @Size(max=200) List<@Valid Item> items) {}
    public record Item(@NotNull @Positive Long skuId, @Min(1) @Max(999) int quantity) {}
}
