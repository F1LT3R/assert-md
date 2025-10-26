# Assert MD

```mjs
assert(123, 123)
```

```mjs {assert:4}
const add = (a, b) => {
	return a + b
}

const value = add(2, 2)
assert(value, 4)
```
