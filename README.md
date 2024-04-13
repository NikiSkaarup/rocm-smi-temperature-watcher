# rocm-smi-temperature-watcher

Using localai with a radeon instinct mi25.

While utilizing the fan header on the mi25 to cool it, will not work great by default.

So I wrote a temperature watching script to check temps with the `rocm-smi` utility and
then change the fan speed based on the temperature, and spinning the fan down when the temps are low.

If you want to use this, I highly recommend you fork it as I am hard coding file paths and gpu id.

TODO:

- Setup guide
- Implement proper fan curves, that can be adjusted from a json file
- Spin up fast, and spin down slow when temps drop, slowly reduce fan speed

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run dev
```
