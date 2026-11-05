import test from 'node:test';
import assert from 'node:assert/strict';

test('useDebounce logic - delays updating value until timeout expires', async () => {
  let value = 'initial';
  let debounced = 'initial';
  let timeoutId = null;

  const update = (newValue, delay = 300) => {
    value = newValue;
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      debounced = newValue;
    }, delay);
  };

  // Immediate typing sequence
  update('q');
  assert.equal(debounced, 'initial');
  assert.equal(value, 'q');

  update('qu');
  assert.equal(debounced, 'initial');

  update('query');
  assert.equal(debounced, 'initial');

  // Wait 150ms (less than delay of 300ms)
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(debounced, 'initial', 'Should not update before delay has passed');

  // Wait remaining 200ms (total > 300ms)
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(debounced, 'query', 'Should update to the final query once debounce period passes');
});

test('useDebounce logic - clears existing timeout when value changes rapidly', async () => {
  let calls = 0;
  let timeoutId = null;

  const trigger = (val, delay = 100) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      calls += 1;
    }, delay);
  };

  trigger('a');
  trigger('b');
  trigger('c');

  await new Promise((r) => setTimeout(r, 150));
  assert.equal(calls, 1, 'Only the final invocation should fire after rapid consecutive keystrokes');
});

