# Cart v3 migration notes

Final ownership model:

- Guest: browser `localStorage` only (`storeflow_cart_groups`)
- Member: DB only (`cart_group` -> `cart_item`)
- Login: frontend calls `POST /api/cart/migrate` after JWT is stored.
- Guest localStorage is removed only after migration succeeds.
- Checkout requires login; guest checkout opens the login-required dialog.

Expected DB relationship:

`consumer (1) -> (N) cart_group (1) -> (N) cart_item`

`cart_item` must have a non-null `cart_group_id`; it no longer needs `consumer_id` or `session_id`.
